import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  endpointPriceSchema,
  isValidEndpointPrice,
  MAX_ENDPOINT_PRICE_USD,
  MIN_ENDPOINT_PRICE_USD,
  toPriceAmount,
} from "@turborepo-boilerplate/api/pricing";

/**
 * P2-7: price validation used to accept `$0` (which publishes a 402 challenge
 * demanding zero) and `$999999999` (the `$100`-meant-as-`$0.100` typo class,
 * a 1000x overcharge that no on-chain settlement can undo).
 */
describe("endpointPriceSchema", () => {
  it("rejects a zero price", () => {
    assert.equal(endpointPriceSchema.safeParse("$0").success, false);
    assert.equal(endpointPriceSchema.safeParse("$0.000000").success, false);
    assert.equal(endpointPriceSchema.safeParse("$0.00").success, false);
  });

  it("rejects more precision than USDC has on-chain", () => {
    assert.equal(endpointPriceSchema.safeParse("$0.0000001").success, false);
    assert.equal(endpointPriceSchema.safeParse("$1.1234567").success, false);
  });

  it("rejects prices above the per-request ceiling", () => {
    assert.equal(endpointPriceSchema.safeParse("$999999999").success, false);
    assert.equal(endpointPriceSchema.safeParse("$100.000001").success, false);
    assert.equal(endpointPriceSchema.safeParse("$101").success, false);
  });

  it("rejects malformed shapes", () => {
    for (const price of [
      "0.001",
      "$1.2.3",
      "$.5",
      "$1.",
      "$-1",
      "1$",
      "$ 1",
      "$01",
      "USD 1",
      "",
      "$",
    ]) {
      assert.equal(
        endpointPriceSchema.safeParse(price).success,
        false,
        `${JSON.stringify(price)} must be rejected`
      );
    }
  });

  it("accepts prices from one atomic unit up to the ceiling", () => {
    for (const price of [
      "$0.000001",
      "$0.001",
      "$0.0001",
      "$1",
      "$1.5",
      "$100",
      "$99.999999",
    ]) {
      assert.equal(
        endpointPriceSchema.safeParse(price).success,
        true,
        `${price} must be accepted`
      );
    }
  });

  it("exposes bounds that match the accepted range", () => {
    assert.equal(MIN_ENDPOINT_PRICE_USD, 1e-6);
    assert.equal(MAX_ENDPOINT_PRICE_USD, 100);
  });

  it("agrees with the boolean convenience wrapper", () => {
    assert.equal(isValidEndpointPrice("$0.001"), true);
    assert.equal(isValidEndpointPrice("$0"), false);
  });
});

describe("toPriceAmount", () => {
  it("strips the leading dollar sign", () => {
    assert.equal(toPriceAmount("$0.001"), "0.001");
    assert.equal(toPriceAmount("$100"), "100");
  });

  it("leaves an already-bare amount unchanged", () => {
    assert.equal(toPriceAmount("0.001"), "0.001");
  });
});
