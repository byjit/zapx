import { eq } from "drizzle-orm";
import { db } from "@turborepo-boilerplate/db";
import { providerApi } from "@turborepo-boilerplate/db/schema/provider-api";
import { providerEndpoint } from "@turborepo-boilerplate/db/schema/provider-endpoint";
import { paymentReceipt } from "@turborepo-boilerplate/db/schema/payment-receipt";
import { user } from "@turborepo-boilerplate/db/schema/auth";
import type { RouteConfig } from "@x402/core/server";
import { x402HTTPResourceServer } from "@x402/core/server";
import express, { type Request, type Response, type Router } from "express";
import { creditProvider } from "../../services/ledger";
import {
  getPayTo,
  getPlatformFeePercent,
  getNetwork,
  getResourceServer,
} from "../../services/payment-verification";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Edge case #8: LRU cache with bounded size
// ---------------------------------------------------------------------------
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 60_000; // 1 minute

type CachedApiData = {
  api: NonNullable<Awaited<ReturnType<typeof lookupApi>>>;
  endpoints: Awaited<ReturnType<typeof lookupEndpoints>>;
  ownerBanned: boolean;
  cachedAt: number;
};

const apiCache = new Map<string, CachedApiData>();

function evictLRU() {
  if (apiCache.size <= MAX_CACHE_SIZE) return;
  // Map iterates in insertion order — delete the oldest entry
  const oldest = apiCache.keys().next().value;
  if (oldest) apiCache.delete(oldest);
}

// Edge case #14: Export cache invalidation for use by tRPC routers
export function invalidateApiCache(apiId: string) {
  apiCache.delete(apiId);
}

// ---------------------------------------------------------------------------
// Edge case #9: Configurable upstream timeout
// ---------------------------------------------------------------------------
const UPSTREAM_TIMEOUT_MS = 30_000;

export const gatewayRouter: Router = express.Router();

// Edge case #11: Parse raw body for gateway routes so we can forward
// binary/multipart bodies without corruption from express.json()
gatewayRouter.use(
  express.raw({ type: "*/*", limit: "10mb" })
);

// ---------------------------------------------------------------------------
// Database lookups
// ---------------------------------------------------------------------------

async function lookupApi(apiId: string) {
  // Edge case #6: Join user table to check banned status
  const [result] = await db
    .select({
      id: providerApi.id,
      userId: providerApi.userId,
      projectId: providerApi.projectId,
      name: providerApi.name,
      baseUrl: providerApi.baseUrl,
      openapiSpec: providerApi.openapiSpec,
      specVersion: providerApi.specVersion,
      createdAt: providerApi.createdAt,
      updatedAt: providerApi.updatedAt,
      ownerBanned: user.banned,
    })
    .from(providerApi)
    .innerJoin(user, eq(providerApi.userId, user.id))
    .where(eq(providerApi.id, apiId))
    .limit(1);
  return result ?? null;
}

async function lookupEndpoints(apiId: string) {
  return db
    .select()
    .from(providerEndpoint)
    .where(eq(providerEndpoint.apiId, apiId));
}

async function getCachedApiData(apiId: string) {
  const cached = apiCache.get(apiId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    // Move to end to mark as recently used (LRU)
    apiCache.delete(apiId);
    apiCache.set(apiId, cached);
    return cached;
  }

  const api = await lookupApi(apiId);
  if (!api) return null;

  const endpoints = await lookupEndpoints(apiId);
  const data: CachedApiData = {
    api,
    endpoints,
    ownerBanned: api.ownerBanned ?? false,
    cachedAt: Date.now(),
  };
  apiCache.set(apiId, data);
  evictLRU();
  return data;
}

// ---------------------------------------------------------------------------
// Route config builder
// ---------------------------------------------------------------------------

function buildRoutesConfig(
  endpoints: Awaited<ReturnType<typeof lookupEndpoints>>,
  payTo: string,
  network: `${string}:${string}`
): Record<string, RouteConfig> {
  const routes: Record<string, RouteConfig> = {};

  for (const endpoint of endpoints) {
    if (!endpoint.priceUsdc) continue;

    const price = endpoint.priceUsdc.replace(/^\$/, "");
    const routeKey = `${endpoint.method.toUpperCase()} ${endpoint.path}`;

    routes[routeKey] = {
      accepts: [
        {
          scheme: "exact",
          price,
          network,
          payTo,
        },
      ],
      description: endpoint.summary || endpoint.description || undefined,
      mimeType: "application/json",
    };
  }

  return routes;
}

function generateRequestId(): string {
  return `gw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Edge case #5: Idempotency — check if payment already settled
// ---------------------------------------------------------------------------

async function findExistingReceipt(paymentId: string) {
  const [existing] = await db
    .select()
    .from(paymentReceipt)
    .where(eq(paymentReceipt.paymentId, paymentId))
    .limit(1);
  return existing ?? null;
}

// ---------------------------------------------------------------------------
// Edge case #1: Retry ledger credit with backoff on failure
// ---------------------------------------------------------------------------

async function creditWithRetry(
  input: Parameters<typeof creditProvider>[0],
  maxRetries = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await creditProvider(input);
      return true;
    } catch (err) {
      logger.error({
        type: "error",
        message: `Ledger credit attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : "Unknown"}`,
        requestId: input.requestId,
        method: "POST",
        url: "ledger.creditProvider",
        statusCode: 500,
      });
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
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
  const wildcardParam = (req.params as Record<string, string>).path || "";
  const proxyPath = `/${wildcardParam}`;

  try {
    // 1. Lookup API and endpoints
    const data = await getCachedApiData(apiId);
    if (!data) {
      res.status(404).json({ error: "API not found" });
      return;
    }

    const { api, endpoints, ownerBanned } = data;

    // Edge case #6: Reject if API owner is banned
    if (ownerBanned) {
      res.status(403).json({ error: "This API is currently unavailable" });
      return;
    }

    // 2. Find matching endpoint
    const method = req.method.toUpperCase();
    const matchedEndpoint = endpoints.find(
      (ep) =>
        ep.method.toUpperCase() === method && matchPath(ep.path, proxyPath)
    );

    if (!matchedEndpoint) {
      res.status(404).json({ error: "Endpoint not found" });
      return;
    }

    if (!matchedEndpoint.priceUsdc) {
      res.status(400).json({ error: "Endpoint has no pricing configured" });
      return;
    }

    // 3. Build x402 route config and check payment
    const payTo = getPayTo();
    // Edge case #12: Use configurable network
    const network = getNetwork();
    const routesConfig = buildRoutesConfig([matchedEndpoint], payTo, network);

    // Edge case #13: Reuse singleton resource server
    const resourceServer = getResourceServer();

    const httpServer = new x402HTTPResourceServer(
      resourceServer,
      routesConfig
    );

    // Process the payment request
    const requestContext = {
      adapter: {
        getHeader: (name: string) =>
          req.headers[name.toLowerCase()] as string | undefined,
        getMethod: () => req.method,
        getPath: () => proxyPath,
        getUrl: () =>
          `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        getAcceptHeader: () => (req.headers.accept as string) || "",
        getUserAgent: () => (req.headers["user-agent"] as string) || "",
        getQueryParams: () =>
          req.query as Record<string, string | string[]>,
        getQueryParam: (name: string) =>
          req.query[name] as string | string[] | undefined,
        getBody: () => req.body,
      },
      path: proxyPath,
      method: req.method,
      paymentHeader:
        (req.headers["payment-signature"] as string) ||
        (req.headers["x-payment"] as string),
    };

    const processResult = await httpServer.processHTTPRequest(requestContext);

    // 4. No payment provided — return 402
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

    // 5. No payment required
    if (processResult.type === "no-payment-required") {
      await proxyToUpstream(req, res, api.baseUrl, proxyPath);
      return;
    }

    // 6. Payment verified — proxy to upstream FIRST
    const { paymentPayload, paymentRequirements } = processResult;

    // Edge case #2: Proxy FIRST, only settle if upstream returns 2xx
    let upstreamResponse: globalThis.Response;
    try {
      upstreamResponse = await fetchUpstream(req, api.baseUrl, proxyPath);
    } catch (err) {
      // Upstream failed — do NOT settle payment, let client retry
      logger.error({
        type: "error",
        message: `Upstream failed: ${err instanceof Error ? err.message : "Unknown"}`,
        requestId: "unknown",
        method: req.method,
        url: req.originalUrl,
        statusCode: 502,
      });
      res.status(502).json({
        error: "Upstream unavailable. Payment was NOT settled — you can retry.",
      });
      return;
    }

    if (!upstreamResponse.ok) {
      // Upstream returned non-2xx — do NOT settle, return upstream error
      const upstreamBody = await upstreamResponse.arrayBuffer();
      forwardUpstreamHeaders(res, upstreamResponse);
      res.status(upstreamResponse.status);
      res.send(Buffer.from(upstreamBody));
      return;
    }

    // Edge case #5: Check for existing payment receipt (idempotency)
    const paymentId =
      (req.headers["payment-identifier"] as string) || generateRequestId();
    const existingReceipt = await findExistingReceipt(paymentId);
    if (existingReceipt) {
      // Already settled — return the upstream response without re-settling
      const upstreamBody = await upstreamResponse.arrayBuffer();
      forwardUpstreamHeaders(res, upstreamResponse);
      res.status(upstreamResponse.status);
      res.send(Buffer.from(upstreamBody));
      return;
    }

    // 7. Settle payment after successful upstream response
    const settleResult = await httpServer.processSettlement(
      paymentPayload,
      paymentRequirements
    );

    if (!settleResult.success) {
      for (const [key, value] of Object.entries(settleResult.headers)) {
        res.setHeader(key, value);
      }
      const failureResponse = settleResult.response;
      res.status(failureResponse.status).json(failureResponse.body);
      return;
    }

    // 8. Settlement succeeded — credit provider ledger
    const requestId = paymentId;
    const txHash = settleResult.transaction || "";

    // Edge case #1: Retry ledger credit on failure
    const creditSuccess = await creditWithRetry({
      userId: api.userId,
      apiId: api.id,
      endpointId: matchedEndpoint.id,
      amount: matchedEndpoint.priceUsdc.replace(/^\$/, ""),
      platformFeePercent: getPlatformFeePercent(),
      requestId,
      txHash,
    });

    // Record payment receipt (for idempotency and reconciliation)
    try {
      await db.insert(paymentReceipt).values({
        paymentId: requestId,
        requestId,
        txHash: txHash || null,
        networkId: settleResult.network || network,
        amount: matchedEndpoint.priceUsdc.replace(/^\$/, ""),
        status: creditSuccess ? "settled" : "pending",
      });
    } catch (receiptError) {
      logger.error({
        type: "error",
        message: `Payment receipt insert failed: ${receiptError instanceof Error ? receiptError.message : "Unknown"}`,
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: 500,
      });
    }

    if (!creditSuccess) {
      // Log for manual reconciliation — payment settled on-chain but ledger not credited
      logger.error({
        type: "error",
        message: `RECONCILIATION NEEDED: Payment settled (txHash=${txHash}) but ledger credit failed after retries. userId=${api.userId}, amount=${matchedEndpoint.priceUsdc}, requestId=${requestId}`,
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: 500,
      });
    }

    // 9. Return upstream response with payment response headers
    for (const [key, value] of Object.entries(settleResult.headers)) {
      res.setHeader(key, value);
    }

    // Edge case #21: Forward all upstream response headers
    forwardUpstreamHeaders(res, upstreamResponse);

    res.status(upstreamResponse.status);
    const upstreamBody = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(upstreamBody));
  } catch (error) {
    logger.error({
      type: "error",
      message: `Gateway error: ${error instanceof Error ? error.message : "Unknown error"}`,
      stack: error instanceof Error ? error.stack : undefined,
      requestId: "unknown",
      method: req.method,
      url: req.originalUrl,
      statusCode: 502,
    });
    res.status(502).json({ error: "Gateway error" });
  }
});

// ---------------------------------------------------------------------------
// Edge case #21: Forward upstream response headers (except hop-by-hop)
// ---------------------------------------------------------------------------

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Also skip payment headers (we set our own)
  "payment-required",
  "payment-response",
  "payment-signature",
  "x-payment",
  "x-payment-response",
]);

function forwardUpstreamHeaders(
  res: Response,
  upstream: globalThis.Response
) {
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
}

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

async function proxyToUpstream(
  req: Request,
  res: Response,
  baseUrl: string,
  path: string
) {
  try {
    const upstream = await fetchUpstream(req, baseUrl, path);
    forwardUpstreamHeaders(res, upstream);
    res.status(upstream.status);
    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));
  } catch {
    res.status(502).json({ error: "Upstream unavailable" });
  }
}

async function fetchUpstream(
  req: Request,
  baseUrl: string,
  path: string
): Promise<globalThis.Response> {
  // Build upstream URL
  const url = new URL(path, baseUrl);

  // Edge case #24: Use req.query directly instead of re-parsing originalUrl
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      url.searchParams.append(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === "string") url.searchParams.append(key, v);
      }
    }
  }

  // Build headers — strip payment and hop-by-hop headers
  const forwardHeaders = new Headers();
  const skipHeaders = new Set([
    "host",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "payment-signature",
    "payment-required",
    "x-payment",
    "x-payment-response",
  ]);

  for (const [key, value] of Object.entries(req.headers)) {
    if (!skipHeaders.has(key.toLowerCase()) && typeof value === "string") {
      forwardHeaders.set(key, value);
    }
  }

  // Build request options
  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders,
    // Edge case #9: Abort if upstream doesn't respond within timeout
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };

  // Edge case #11: Forward raw body without re-serializing
  if (
    ["POST", "PUT", "PATCH"].includes(req.method.toUpperCase()) &&
    req.body
  ) {
    if (Buffer.isBuffer(req.body)) {
      init.body = req.body;
    } else if (typeof req.body === "string") {
      init.body = req.body;
    } else {
      // Fallback for parsed JSON bodies
      init.body = JSON.stringify(req.body);
    }
  }

  return fetch(url.toString(), init);
}

// ---------------------------------------------------------------------------
// Edge case #10: Path matching with wildcard support
// ---------------------------------------------------------------------------

function matchPath(pattern: string, actual: string): boolean {
  const normalizedPattern = pattern.replace(/\/+$/, "") || "/";
  const normalizedActual = actual.replace(/\/+$/, "") || "/";

  // Exact match
  if (normalizedPattern === normalizedActual) return true;

  // Wildcard: /files/** or /files/*
  if (normalizedPattern.endsWith("/**") || normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.replace(/\/\*\*?$/, "");
    return normalizedActual.startsWith(prefix + "/") || normalizedActual === prefix;
  }

  // Path parameter matching: /users/{id} or /users/:id or /users/{id?}
  const patternParts = normalizedPattern.split("/");
  const actualParts = normalizedActual.split("/");

  // Handle optional trailing segments: /users/{id?}
  if (patternParts.length > actualParts.length) {
    // Check if remaining pattern parts are all optional
    const extraParts = patternParts.slice(actualParts.length);
    const allOptional = extraParts.every(
      (p) => p.startsWith("{") && p.endsWith("?}")
    );
    if (!allOptional) return false;
    // Truncate pattern to match actual length
    patternParts.length = actualParts.length;
  }

  if (patternParts.length !== actualParts.length) return false;

  return patternParts.every((part, i) => {
    if (part.startsWith("{") && part.endsWith("}")) return true;
    if (part.startsWith("{") && part.endsWith("?}")) return true;
    if (part.startsWith(":")) return true;
    return part === actualParts[i];
  });
}
