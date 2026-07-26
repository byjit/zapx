import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { derivePaymentKey } from "../routes/gateway/payment-key";

const ACCEPTED: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: `0x${"a".repeat(40)}`,
  amount: "1000",
  payTo: `0x${"1".repeat(40)}`,
  maxTimeoutSeconds: 300,
  extra: {},
};

const FROM = `0x${"3".repeat(40)}`;
const NONCE = `0x${"7".repeat(64)}`;

function eip3009(payload: Record<string, unknown>): PaymentPayload {
  return { x402Version: 2, accepted: ACCEPTED, payload };
}

/**
 * P0-5: the replay key must come from the payment payload and nothing else.
 *
 * The old gateway keyed replay protection off a client-supplied
 * `payment-identifier` header, which let a caller pay once and then re-sign
 * fresh payloads under the same key forever. These cases pin the two properties
 * that close that hole: the key is stable for one signed authorization, and it
 * cannot be changed by re-signing.
 */
describe("derivePaymentKey", () => {
  it("derives a stable key from an EIP-3009 authorization", () => {
    const key = derivePaymentKey(
      eip3009({
        signature: `0x${"9".repeat(130)}`,
        authorization: {
          from: FROM,
          to: ACCEPTED.payTo,
          value: "1000",
          validAfter: "0",
          validBefore: "99999999999",
          nonce: NONCE,
        },
      })
    );

    assert.equal(key, `eip155:84532:exact:${FROM}:${NONCE}`);
  });

  it("returns a different key for a different nonce", () => {
    const first = derivePaymentKey(
      eip3009({ authorization: { from: FROM, nonce: NONCE } })
    );
    const second = derivePaymentKey(
      eip3009({
        authorization: { from: FROM, nonce: `0x${"8".repeat(64)}` },
      })
    );

    assert.notEqual(first, second);
  });

  it("returns a different key for a different payer on the same nonce", () => {
    const first = derivePaymentKey(
      eip3009({ authorization: { from: FROM, nonce: NONCE } })
    );
    const second = derivePaymentKey(
      eip3009({
        authorization: { from: `0x${"4".repeat(40)}`, nonce: NONCE },
      })
    );

    assert.notEqual(first, second);
  });

  it("ignores every field a caller could re-sign, so a replay cannot dodge the reservation", () => {
    const original = derivePaymentKey(
      eip3009({
        signature: `0x${"1".repeat(130)}`,
        authorization: {
          from: FROM,
          to: ACCEPTED.payTo,
          value: "1000",
          validAfter: "0",
          validBefore: "99999999999",
          nonce: NONCE,
        },
      })
    );

    const resigned = derivePaymentKey(
      eip3009({
        signature: `0x${"2".repeat(130)}`,
        authorization: {
          from: FROM,
          to: ACCEPTED.payTo,
          value: "999999",
          validAfter: "12345",
          validBefore: "23456",
          nonce: NONCE,
        },
      })
    );

    assert.equal(resigned, original);
  });

  it("derives a key from a Permit2 authorization", () => {
    const key = derivePaymentKey(
      eip3009({
        signature: `0x${"5".repeat(130)}`,
        permit2Authorization: {
          from: FROM,
          nonce: "12345678901234567890",
          spender: `0x${"6".repeat(40)}`,
          deadline: "99999999999",
        },
      })
    );

    assert.equal(key, `eip155:84532:exact:${FROM}:12345678901234567890`);
  });

  it("is case-insensitive about hex, so checksum casing cannot fork the key", () => {
    const lower = derivePaymentKey(
      eip3009({
        authorization: { from: "0xabcdef0123", nonce: "0xdeadbeef" },
      })
    );
    const upper = derivePaymentKey(
      eip3009({
        authorization: { from: "0xABCDEF0123", nonce: "0xDEADBEEF" },
      })
    );

    assert.equal(lower, upper);
    assert.equal(lower, "eip155:84532:exact:0xabcdef0123:0xdeadbeef");
  });

  it("returns null for an unrecognised payload shape so the caller fails closed", () => {
    assert.equal(derivePaymentKey(eip3009({})), null);
    assert.equal(derivePaymentKey(eip3009({ authorization: null })), null);
    assert.equal(
      derivePaymentKey(eip3009({ authorization: { from: FROM } })),
      null
    );
    assert.equal(
      derivePaymentKey(eip3009({ authorization: { nonce: NONCE } })),
      null
    );
    assert.equal(
      derivePaymentKey(eip3009({ authorization: { from: "", nonce: NONCE } })),
      null
    );
    assert.equal(
      derivePaymentKey(eip3009({ authorization: { from: FROM, nonce: 42 } })),
      null
    );
  });
});
