/**
 * Conversions between x402's atomic token amounts and the decimal strings the
 * ledger stores. Kept string-only: routing money through `Number` would reproduce
 * exactly the IEEE-754 drift the `numeric` columns exist to avoid.
 */

const ATOMIC_AMOUNT_PATTERN = /^\d+$/;

/**
 * Converts an atomic integer amount (as x402 reports it) to a decimal string.
 * Returns `null` if the input is not a plain non-negative integer, so callers
 * can fall back rather than persist a malformed amount.
 */
export function atomicToDecimalString(
  atomic: string,
  decimals: number
): string | null {
  if (!ATOMIC_AMOUNT_PATTERN.test(atomic) || !Number.isInteger(decimals)) {
    return null;
  }

  if (decimals <= 0) {
    return atomic.replace(/^0+(?=\d)/, "");
  }

  const padded = atomic.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole;
}
