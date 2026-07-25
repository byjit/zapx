import { randomUUID } from "node:crypto";
import { toPriceAmount } from "@turborepo-boilerplate/api/pricing";
import type { x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import express, { type Request, type Response, type Router } from "express";
import { creditProvider } from "../../services/ledger";
import {
  getInitializedResourceServer,
  getNetwork,
  getPayTo,
  getPlatformFeePercent,
} from "../../services/payment-verification";
import { logger } from "../../utils/logger";
import { getApiWithEndpoints } from "./api-cache";
import { atomicToDecimalString } from "./money";
import { derivePaymentKey } from "./payment-key";
import { fetchUpstream, readUpstreamBody, sendUpstreamResponse } from "./proxy";
import {
  markPaymentUnsettled,
  releasePayment,
  reservePayment,
} from "./reservation";
import {
  buildRoutesConfig,
  findMatchingEndpoint,
  resolveProxyPath,
} from "./routing";

/** Reason codes accepted by x402's verified-payment cancellation dispatcher. */
type CancelReason = "handler_threw" | "handler_failed" | "after_verify_aborted";

type CancellationDispatcher = {
  cancel(options: { reason: CancelReason }): Promise<void>;
};

export const gatewayRouter: Router = express.Router();

// Edge case #11: parse the raw body for gateway routes so binary/multipart
// bodies are forwarded without corruption from express.json().
gatewayRouter.use(express.raw({ type: "*/*", limit: "10mb" }));

function logGatewayError(
  req: Request,
  requestId: string,
  message: string,
  statusCode: number,
  stack?: string
) {
  logger.error({
    type: "error",
    message,
    stack,
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
  });
}

/**
 * Tells x402 a verified payment will not be settled. Best-effort: a failure here
 * must not change what the caller sees, since the money outcome is already decided.
 */
async function cancelVerifiedPayment(
  dispatcher: CancellationDispatcher,
  reason: CancelReason
) {
  try {
    await dispatcher.cancel({ reason });
  } catch {
    // Nothing actionable — no payment was settled either way.
  }
}

function buildRequestContext(req: Request, proxyPath: string) {
  return {
    adapter: {
      getHeader: (name: string) => {
        const key = name.toLowerCase();
        const value = req.headers[key];
        if (typeof value === "string") {
          return value;
        }
        if (Array.isArray(value)) {
          return value[0];
        }
        // x402 only reads `PAYMENT-SIGNATURE`; alias the v1 `X-PAYMENT` header so
        // older clients at least reach verification instead of 402-looping.
        if (key === "payment-signature") {
          const legacy = req.headers["x-payment"];
          return typeof legacy === "string" ? legacy : undefined;
        }
      },
      getMethod: () => req.method,
      getPath: () => proxyPath,
      getUrl: () => `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      getAcceptHeader: () => (req.headers.accept as string) || "",
      getUserAgent: () => (req.headers["user-agent"] as string) || "",
      getQueryParams: () => req.query as Record<string, string | string[]>,
      getQueryParam: (name: string) =>
        req.query[name] as string | string[] | undefined,
      getBody: () => req.body,
    },
    path: proxyPath,
    method: req.method,
  };
}

/**
 * Converts an x402 atomic amount into the decimal string the ledger stores.
 * `settledAmount` wins when the facilitator reports one (schemes where the
 * settled amount can differ from the authorized maximum).
 */
function toDecimalAmount(
  resourceServer: x402ResourceServer,
  requirements: PaymentRequirements,
  settledAmount?: string
): string | null {
  const atomic = settledAmount ?? requirements.amount;
  if (typeof atomic !== "string") {
    return null;
  }

  return atomicToDecimalString(
    atomic,
    resourceServer.getAssetDecimalsForRequirements(requirements)
  );
}

/**
 * Edge case #1: retry the ledger credit with backoff.
 *
 * Safe to retry because `creditProvider` claims the payment's reservation inside
 * the crediting transaction: an attempt whose commit succeeded but whose response
 * was lost reports `already-settled` on the next try rather than double-crediting.
 */
async function creditWithRetry(
  input: Parameters<typeof creditProvider>[0],
  requestId: string,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await creditProvider(input);
      return true;
    } catch (err) {
      logger.error({
        type: "error",
        message: `Ledger credit attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : "Unknown"}`,
        requestId,
        method: "POST",
        url: "ledger.creditProvider",
        statusCode: 500,
      });
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gateway handler: /gateway/:apiId/{*path}
// ---------------------------------------------------------------------------

gatewayRouter.all("/:apiId/{*path}", async (req: Request, res: Response) => {
  const apiId = req.params.apiId as string;
  const proxyPath = resolveProxyPath(req.params.path);
  const requestId = randomUUID();

  try {
    // 1. Resolve the API and its endpoints.
    const data = await getApiWithEndpoints(apiId);
    if (!data) {
      res.status(404).json({ error: "API not found" });
      return;
    }

    const { api, endpoints } = data;

    // Edge case #6: reject if the API owner is banned.
    if (api.ownerBanned) {
      res.status(403).json({ error: "This API is currently unavailable" });
      return;
    }

    // 2. Find the endpoint that should serve this request.
    const matchedEndpoint = findMatchingEndpoint(
      endpoints,
      req.method,
      proxyPath
    );

    if (!matchedEndpoint) {
      res.status(404).json({ error: "Endpoint not found" });
      return;
    }

    if (!matchedEndpoint.priceUsdc) {
      res.status(400).json({ error: "Endpoint has no pricing configured" });
      return;
    }

    // 3. Ask x402 whether this request carries a valid payment.
    const network = getNetwork();
    const routesConfig = buildRoutesConfig(
      [matchedEndpoint],
      getPayTo(),
      network
    );

    // Edge case #13: reuse the singleton resource server, initialized once so the
    // facilitator's supported payment kinds are loaded.
    const resourceServer = await getInitializedResourceServer();
    const httpServer = new x402HTTPResourceServer(resourceServer, routesConfig);
    const processResult = await httpServer.processHTTPRequest(
      buildRequestContext(req, proxyPath)
    );

    // 4. Missing or invalid payment — return the 402 challenge.
    if (processResult.type === "payment-error") {
      const { status, headers, body, isHtml } = processResult.response;
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      if (isHtml) {
        res.status(status).type("html").send(body);
      } else {
        res.status(status).json(body);
      }
      return;
    }

    // 5. Fail closed. A priced endpoint that x402 reports as free means our route
    // key does not match the path we just matched ourselves — a configuration bug,
    // not a free endpoint. Serving it would give the response away for nothing.
    if (processResult.type === "no-payment-required") {
      logGatewayError(
        req,
        requestId,
        `Route config mismatch: ${matchedEndpoint.method} ${matchedEndpoint.path} is priced at ${matchedEndpoint.priceUsdc} but x402 did not require payment for ${proxyPath}`,
        500
      );
      res.status(500).json({ error: "Endpoint pricing is misconfigured" });
      return;
    }

    const { paymentPayload, paymentRequirements, cancellationDispatcher } =
      processResult;

    // 6. Reserve the payment before any upstream work. This is what stops one
    // signature from serving unlimited requests.
    const paymentKey = derivePaymentKey(paymentPayload as PaymentPayload);
    if (!paymentKey) {
      await cancelVerifiedPayment(cancellationDispatcher, "handler_failed");
      logGatewayError(
        req,
        requestId,
        `Unrecognized payment payload shape for scheme ${paymentRequirements.scheme} on ${paymentRequirements.network}`,
        500
      );
      res.status(500).json({ error: "Unsupported payment payload" });
      return;
    }

    const requiredAmount =
      toDecimalAmount(resourceServer, paymentRequirements) ??
      toPriceAmount(matchedEndpoint.priceUsdc);

    const reserved = await reservePayment({
      paymentId: paymentKey,
      userId: api.userId,
      apiId: api.id,
      endpointId: matchedEndpoint.id,
      amount: requiredAmount,
      networkId: network,
    });

    if (!reserved) {
      await cancelVerifiedPayment(
        cancellationDispatcher,
        "after_verify_aborted"
      );
      res.status(409).json({
        error:
          "This payment has already been used. Sign a new payment to retry this request.",
      });
      return;
    }

    // 7. Call the upstream and read it fully. Edge case #2: settle only on a 2xx —
    // and only once the whole body is in hand, so a connection that dies mid-body
    // costs the caller nothing.
    let upstreamResponse: globalThis.Response;
    let upstreamBody: Buffer;
    try {
      upstreamResponse = await fetchUpstream(req, api.baseUrl, proxyPath);
      upstreamBody = await readUpstreamBody(upstreamResponse);
    } catch (err) {
      // Nothing was delivered, so the payload is safe to hand back for a retry.
      await releasePayment(paymentKey);
      await cancelVerifiedPayment(cancellationDispatcher, "handler_failed");
      logGatewayError(
        req,
        requestId,
        `Upstream failed: ${err instanceof Error ? err.message : "Unknown"}`,
        502
      );
      res.status(502).json({
        error: "Upstream unavailable. Payment was NOT settled — you can retry.",
      });
      return;
    }

    if (!upstreamResponse.ok) {
      // The caller receives the upstream body, so the payload is spent even though
      // nothing settled — otherwise an endpoint whose useful content sits behind a
      // non-2xx status could be replayed forever from one signature.
      await markPaymentUnsettled(paymentKey);
      await cancelVerifiedPayment(cancellationDispatcher, "handler_failed");
      sendUpstreamResponse(res, upstreamResponse, upstreamBody);
      return;
    }

    // 8. Settle on-chain.
    let settleResult: Awaited<ReturnType<typeof httpServer.processSettlement>>;
    try {
      settleResult = await httpServer.processSettlement(
        paymentPayload,
        paymentRequirements
      );
    } catch (err) {
      // The facilitator itself errored, so whether the transfer landed is
      // unknown. The reservation stays `pending` on purpose: marking it failed
      // would assert something we cannot verify, and the caller receives no
      // content, so nothing is given away either way.
      logGatewayError(
        req,
        requestId,
        `RECONCILIATION NEEDED: settlement outcome unknown — the facilitator errored for paymentId=${paymentKey}: ${err instanceof Error ? err.message : "Unknown"}`,
        502
      );
      res.status(502).json({
        error:
          "Settlement could not be confirmed. Do not retry this payment — contact support if you were charged.",
      });
      return;
    }

    if (!settleResult.success) {
      await markPaymentUnsettled(paymentKey);
      for (const [key, value] of Object.entries(settleResult.headers)) {
        res.setHeader(key, value);
      }
      const failureResponse = settleResult.response;
      res.status(failureResponse.status).json(failureResponse.body);
      return;
    }

    // 9. Credit the provider for what was actually settled, not for the price we
    // happened to have cached.
    const settledAmount =
      toDecimalAmount(
        resourceServer,
        paymentRequirements,
        settleResult.amount
      ) ?? requiredAmount;

    const credited = await creditWithRetry(
      {
        paymentId: paymentKey,
        userId: api.userId,
        apiId: api.id,
        endpointId: matchedEndpoint.id,
        amount: settledAmount,
        platformFeePercent: getPlatformFeePercent(),
        txHash: settleResult.transaction || "",
        networkId: settleResult.network || network,
      },
      requestId
    );

    if (!credited) {
      // The receipt stays `pending`, which is the reconciliation queue: money is
      // on-chain in the platform wallet but not yet attributed to the provider.
      logGatewayError(
        req,
        requestId,
        `RECONCILIATION NEEDED: payment settled (txHash=${settleResult.transaction}) but the ledger credit failed after retries. userId=${api.userId}, amount=${settledAmount}, paymentId=${paymentKey}`,
        500
      );
    }

    // 10. Return the upstream response with the settlement headers.
    for (const [key, value] of Object.entries(settleResult.headers)) {
      res.setHeader(key, value);
    }
    sendUpstreamResponse(res, upstreamResponse, upstreamBody);
  } catch (error) {
    logGatewayError(
      req,
      requestId,
      `Gateway error: ${error instanceof Error ? error.message : "Unknown error"}`,
      502,
      error instanceof Error ? error.stack : undefined
    );
    if (!res.headersSent) {
      res.status(502).json({ error: "Gateway error" });
    }
  }
});
