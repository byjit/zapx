import { randomBytes } from "node:crypto";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";
import { firstRow } from "./rows";

/** Header the x402 v2 challenge travels in; the JSON body is empty by design. */
export const PAYMENT_REQUIRED_HEADER = "payment-required";
export const PAYMENT_SIGNATURE_HEADER = "payment-signature";

/** Mirrors `decodePaymentSignatureHeader` in `@x402/core/http`. */
export function encodePaymentSignature(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePaymentRequired(headerValue: string): PaymentRequired {
  return JSON.parse(
    Buffer.from(headerValue, "base64").toString("utf8")
  ) as PaymentRequired;
}

/** Reads the 402 challenge out of a gateway response. */
export function readChallenge(
  headers: Record<string, unknown>
): PaymentRequired {
  const header = headers[PAYMENT_REQUIRED_HEADER];
  if (typeof header !== "string") {
    throw new Error(
      `Response carries no ${PAYMENT_REQUIRED_HEADER} header; got ${JSON.stringify(headers)}`
    );
  }
  return decodePaymentRequired(header);
}

/** The single requirement the gateway advertises for a priced endpoint. */
export function readAcceptedRequirement(
  headers: Record<string, unknown>
): PaymentRequirements {
  return firstRow(
    readChallenge(headers).accepts,
    "advertised payment requirement"
  );
}

export function randomNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

export type Eip3009Overrides = {
  /** Payer address — also the stable half of the replay key. */
  from: string;
  /** EIP-3009 bytes32 nonce; the token contract consumes it on settlement. */
  nonce: string;
  signature?: string;
  validAfter?: string;
  validBefore?: string;
  value?: string;
};

/**
 * Builds the `PaymentPayload` an x402 client would sign.
 *
 * `accepted` must be the requirement the server advertised verbatim —
 * `findMatchingRequirements` deep-compares it — so tests take it straight from
 * the 402 challenge rather than reconstructing it.
 */
export function buildEip3009Payload(
  accepted: PaymentRequirements,
  overrides: Eip3009Overrides
): PaymentPayload {
  return {
    x402Version: 2,
    accepted,
    payload: {
      signature: overrides.signature ?? `0x${randomBytes(65).toString("hex")}`,
      authorization: {
        from: overrides.from,
        to: accepted.payTo,
        value: overrides.value ?? accepted.amount,
        validAfter: overrides.validAfter ?? "0",
        validBefore: overrides.validBefore ?? "99999999999",
        nonce: overrides.nonce,
      },
    },
  };
}
