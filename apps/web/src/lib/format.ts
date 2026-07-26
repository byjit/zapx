/**
 * Display formatters for values that arrive from the API as exact decimal
 * strings (every money column is `numeric(20, 6)`).
 *
 * These helpers deliberately never convert money to a `number` — parsing to a
 * float would silently round values such as `"0.001234"`. All work happens on
 * the string representation instead.
 */

import { format } from "date-fns";

const DECIMAL_STRING_REGEX = /^(-)?(\d+)(?:\.(\d+))?$/;
const TRAILING_ZEROS_REGEX = /0+$/;
const THOUSANDS_REGEX = /\B(?=(\d{3})+(?!\d))/g;

/** USDC precision — the scale of every money column in the database. */
const MAX_FRACTION_DIGITS = 6;
/** Always show cents so amounts line up in tables. */
const MIN_FRACTION_DIGITS = 2;

/**
 * Formats a decimal string as USD, e.g. `"0.001234"` -> `"$0.001234"`,
 * `"1234.5"` -> `"$1,234.50"`. Unparseable or missing values render as `$0.00`.
 */
export function formatUsd(value: string | null | undefined): string {
  const match = DECIMAL_STRING_REGEX.exec((value ?? "").trim());

  if (!match) {
    return "$0.00";
  }

  const [, sign = "", whole = "0", rawFraction = ""] = match;
  const fraction = rawFraction
    .slice(0, MAX_FRACTION_DIGITS)
    .replace(TRAILING_ZEROS_REGEX, "")
    .padEnd(MIN_FRACTION_DIGITS, "0");

  return `${sign}$${whole.replace(THOUSANDS_REGEX, ",")}.${fraction}`;
}

/** Scales a decimal string to a `numeric(_, 6)` integer for exact comparison. */
function toScaledInteger(value: string): bigint | null {
  const match = DECIMAL_STRING_REGEX.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, sign = "", whole = "0", fraction = ""] = match;
  const scaled = `${whole}${fraction.slice(0, MAX_FRACTION_DIGITS).padEnd(MAX_FRACTION_DIGITS, "0")}`;

  return BigInt(sign === "-" ? `-${scaled}` : scaled);
}

/**
 * Exact comparison of two decimal strings — negative, `0` or positive, in the
 * style of `Array#sort`. Returns `Number.NaN` if either side is not a decimal
 * string, so every comparison against it is `false`.
 */
export function compareDecimal(a: string, b: string): number {
  const left = toScaledInteger(a);
  const right = toScaledInteger(b);

  if (left === null || right === null) {
    return Number.NaN;
  }

  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/** Formats an integer count with locale thousands separators. */
export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

/**
 * Formats a timestamp for tables. Values cross the wire as ISO strings even
 * though the router types them as `Date`, so both shapes are accepted.
 */
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : format(date, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Shortens a long opaque identifier (request id, tx hash, wallet address) to
 * `head…tail` so it stays readable inside a table cell.
 */
export function truncateId(
  value: string | null | undefined,
  head = 6,
  tail = 4
): string {
  if (!value) {
    return "—";
  }

  return value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
