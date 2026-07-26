import assert from "node:assert/strict";

/** Scale of every money column in the schema: `numeric(20, 6)`. */
const MONEY_SCALE = 6;

/**
 * Money helpers that never touch `Number`.
 *
 * The whole point of the `numeric(20,6)` columns is that a fraction of a cent
 * cannot appear or disappear; asserting on parsed floats would reintroduce
 * exactly the drift these tests exist to catch.
 */
export function toFixedScale(value: string): string {
  const [whole, fraction = ""] = value.trim().split(".");
  return `${whole}.${fraction.padEnd(MONEY_SCALE, "0").slice(0, MONEY_SCALE)}`;
}

/** Decimal string → integer count of atomic units (1e-6), as a bigint. */
export function toAtomicUnits(value: string): bigint {
  const normalized = toFixedScale(value);
  const negative = normalized.startsWith("-");
  const [whole, fraction] = normalized.replace("-", "").split(".");
  const magnitude = BigInt(`${whole}${fraction}`);
  return negative ? -magnitude : magnitude;
}

export function assertMoneyEqual(
  actual: string,
  expected: string,
  message?: string
): void {
  assert.equal(
    toFixedScale(actual),
    toFixedScale(expected),
    message ?? `expected ${expected}, got ${actual}`
  );
}

/** Asserts a credit split creates and destroys nothing (P1-1). */
export function assertSplitIsExact(entry: {
  amount: string;
  platformFee: string;
  providerCredit: string;
}): void {
  assert.equal(
    toAtomicUnits(entry.platformFee) + toAtomicUnits(entry.providerCredit),
    toAtomicUnits(entry.amount),
    `platform_fee (${entry.platformFee}) + provider_credit (${entry.providerCredit}) must equal amount (${entry.amount}) exactly`
  );
}
