import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  readRequestBody,
  type StubServer,
  sendJson,
  startStubServer,
} from "./stub-server";

/** Body shape `HTTPFacilitatorClient` posts to `/verify` and `/settle`. */
export type FacilitatorRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
};

export type SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  transaction: string;
  network: string;
  payer?: string;
  amount?: string;
};

export type FacilitatorStub = StubServer & {
  /** Call counts, so a test can prove settlement happened exactly once. */
  readonly calls: { supported: number; verify: number; settle: number };
  readonly verifyRequests: FacilitatorRequest[];
  readonly settleRequests: FacilitatorRequest[];
  /** Swap either responder to exercise verification or settlement failures. */
  verify: (request: FacilitatorRequest) => VerifyResponse;
  settle: (request: FacilitatorRequest) => SettleResponse;
  reset(): void;
};

export const TEST_NETWORK = "eip155:84532";
export const TEST_PAY_TO = `0x${"1".repeat(40)}`;
export const TEST_TX_HASH = `0x${"ab".repeat(32)}`;
export const TEST_PAYER = `0x${"2".repeat(40)}`;

/**
 * A local stand-in for an x402 facilitator.
 *
 * `initialize()` on the resource server is driven entirely by `GET /supported`;
 * without a kind for `exact` on the configured network, `buildPaymentRequirements`
 * throws and the gateway can never issue a 402 (P0-1). The verify/settle
 * responders are mutable so one stub serves both the happy path and failures.
 */
export async function startFacilitatorStub(): Promise<FacilitatorStub> {
  const calls = { supported: 0, verify: 0, settle: 0 };
  const verifyRequests: FacilitatorRequest[] = [];
  const settleRequests: FacilitatorRequest[] = [];

  const stub = {
    calls,
    verifyRequests,
    settleRequests,
    verify: (_request: FacilitatorRequest): VerifyResponse => ({
      isValid: true,
      payer: TEST_PAYER,
    }),
    settle: (request: FacilitatorRequest): SettleResponse => ({
      success: true,
      transaction: TEST_TX_HASH,
      network: request.paymentRequirements.network,
      payer: TEST_PAYER,
    }),
    reset() {
      calls.supported = 0;
      calls.verify = 0;
      calls.settle = 0;
      verifyRequests.length = 0;
      settleRequests.length = 0;
      stub.verify = () => ({ isValid: true, payer: TEST_PAYER });
      stub.settle = (request) => ({
        success: true,
        transaction: TEST_TX_HASH,
        network: request.paymentRequirements.network,
        payer: TEST_PAYER,
      });
    },
  };

  const server = await startStubServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];

    if (req.method === "GET" && path === "/supported") {
      calls.supported++;
      sendJson(res, 200, {
        kinds: [
          { x402Version: 2, scheme: "exact", network: TEST_NETWORK, extra: {} },
        ],
        extensions: [],
        signers: {},
      });
      return;
    }

    if (req.method === "POST" && (path === "/verify" || path === "/settle")) {
      const body = JSON.parse(
        (await readRequestBody(req)).toString("utf8")
      ) as FacilitatorRequest;

      if (path === "/verify") {
        calls.verify++;
        verifyRequests.push(body);
        sendJson(res, 200, stub.verify(body));
        return;
      }

      calls.settle++;
      settleRequests.push(body);
      sendJson(res, 200, stub.settle(body));
      return;
    }

    sendJson(res, 404, { error: `unexpected facilitator call ${path}` });
  });

  return Object.assign(stub, server);
}
