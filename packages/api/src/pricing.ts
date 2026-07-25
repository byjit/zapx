/**
 * The single source of truth for endpoint price validation.
 *
 * Dependency-free apart from zod so the browser bundle can import it too —
 * the price rules must not drift between the upload dialog, the pricing table
 * and the tRPC procedures that persist them.
 */
import { z } from "zod";

/** USDC has 6 decimals on-chain; quoting more precision than that is a lie. */
export const ENDPOINT_PRICE_DECIMALS = 6;

/** Smallest quotable price: one USDC atomic unit. `$0` is not a price. */
export const MIN_ENDPOINT_PRICE_USD = 1e-6;

/**
 * Per-request ceiling. Guards the `$100`-meant-as-`$0.100` typo class, which
 * would overcharge a caller 1000x with no way to undo an on-chain settlement.
 */
export const MAX_ENDPOINT_PRICE_USD = 100;

/** Shape only — `$` plus up to 6 decimals. Range is checked separately. */
export const ENDPOINT_PRICE_REGEX = /^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export const ENDPOINT_PRICE_HINT = `Price must look like $0.001 — above $0, at most $${MAX_ENDPOINT_PRICE_USD}, with up to ${ENDPOINT_PRICE_DECIMALS} decimals`;

/** Strips the leading `$` from a price, yielding a plain decimal string. */
export function toPriceAmount(price: string): string {
  return price.replace(/^\$/, "");
}

function isInRange(price: string): boolean {
  const amount = Number.parseFloat(toPriceAmount(price));
  return (
    Number.isFinite(amount) &&
    amount >= MIN_ENDPOINT_PRICE_USD &&
    amount <= MAX_ENDPOINT_PRICE_USD
  );
}

export const endpointPriceSchema = z
  .string()
  .regex(ENDPOINT_PRICE_REGEX, ENDPOINT_PRICE_HINT)
  .refine(isInRange, ENDPOINT_PRICE_HINT);

/** Convenience for form-level validation that only needs a boolean. */
export function isValidEndpointPrice(price: string): boolean {
  return endpointPriceSchema.safeParse(price).success;
}
