import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomicToDecimalString } from "../routes/gateway/money";

/**
 * P1-1: every amount written to the ledger comes through this conversion, so a
 * rounding or truncation slip here becomes money created or destroyed. The
 * function is string-only on purpose — these cases pin that.
 */
describe("atomicToDecimalString", () => {
  it("converts USDC atomic units to a decimal string", () => {
    assert.equal(atomicToDecimalString("1000", 6), "0.001");
    assert.equal(atomicToDecimalString("1", 6), "0.000001");
    assert.equal(atomicToDecimalString("1000000", 6), "1");
    assert.equal(atomicToDecimalString("0", 6), "0");
    assert.equal(atomicToDecimalString("1500000", 6), "1.5");
    assert.equal(atomicToDecimalString("100", 6), "0.0001");
  });

  it("keeps large amounts exact rather than routing them through a float", () => {
    assert.equal(
      atomicToDecimalString("123456789012345678", 6),
      "123456789012.345678"
    );
  });

  it("strips leading zeros in the whole part and trailing zeros in the fraction", () => {
    assert.equal(atomicToDecimalString("0001000", 6), "0.001");
    assert.equal(atomicToDecimalString("1230000", 6), "1.23");
  });

  it("handles a zero-decimal asset", () => {
    assert.equal(atomicToDecimalString("1000", 0), "1000");
    assert.equal(atomicToDecimalString("0", 0), "0");
    assert.equal(atomicToDecimalString("007", 0), "7");
  });

  it("returns null for anything that is not a plain non-negative integer", () => {
    for (const invalid of ["1e6", "-5", "1.5", "", " 1", "0x10", "abc"]) {
      assert.equal(
        atomicToDecimalString(invalid, 6),
        null,
        `${JSON.stringify(invalid)} must not be accepted as an atomic amount`
      );
    }
  });

  it("returns null for a non-integer decimals argument", () => {
    assert.equal(atomicToDecimalString("1000", 6.5), null);
    assert.equal(atomicToDecimalString("1000", Number.NaN), null);
  });
});
