import type { PaymentPayload } from "@x402/core/types";

/**
 * Derives the replay-protection key for a verified payment payload.
 *
 * The key is taken from the payload itself — never from a client-supplied header
 * or extension. A header-derived key would let a caller replay one settled
 * payment forever by re-signing fresh payloads under the same key, and a
 * client-chosen key would let one caller squat on another's identifier.
 *
 * For EIP-3009 the nonce is a random bytes32 that the token contract consumes on
 * settlement, so it identifies the payment exactly. Permit2 nonces are only
 * unique per owner, so the payer, scheme and network are folded in as well.
 *
 * Returns `null` for a payload shape we do not recognise, so the caller can fail
 * closed instead of guessing.
 */
export function derivePaymentKey(payload: PaymentPayload): string | null {
  const authorization = extractAuthorization(payload.payload);
  if (!authorization) {
    return null;
  }

  const { scheme, network } = payload.accepted;
  return [
    network,
    scheme,
    authorization.from.toLowerCase(),
    authorization.nonce.toLowerCase(),
  ].join(":");
}

type Authorization = { from: string; nonce: string };

function extractAuthorization(
  schemePayload: Record<string, unknown>
): Authorization | null {
  // EIP-3009 (`transferWithAuthorization`) and Permit2 differ only in where the
  // signed authorization sits.
  return (
    readAuthorization(schemePayload.authorization) ??
    readAuthorization(schemePayload.permit2Authorization)
  );
}

function readAuthorization(value: unknown): Authorization | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { from, nonce } = value as Record<string, unknown>;

  return typeof from === "string" &&
    from.length > 0 &&
    typeof nonce === "string" &&
    nonce.length > 0
    ? { from, nonce }
    : null;
}
