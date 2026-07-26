/**
 * SSRF protection: validates that a URL does not point to private,
 * loopback, link-local, or cloud metadata IP ranges.
 *
 * This is a *literal* check on the host as written. It deliberately does not
 * resolve DNS, so a public name that resolves to a private address still passes
 * here — the gateway closes that hole at request time by refusing to follow
 * redirects, which keeps the registration-time verdict binding.
 */

const PRIVATE_IP_PATTERNS = [
  // IPv4 loopback
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  // IPv4 private ranges
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  // IPv4 link-local
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  // IPv4 metadata (AWS, GCP, Azure)
  /^169\.254\.169\.254$/,
  /^100\.100\.100\.200$/,
  // IPv4 zero
  /^0\.0\.0\.0$/,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
]);

/**
 * Hostnames that always resolve to loopback and so cannot be allow-listed by a
 * literal IP check. Covers the public `*.localhost` convention plus the wildcard
 * loopback DNS services commonly used to bypass SSRF filters.
 */
const LOOPBACK_DOMAIN_SUFFIXES = [
  ".localhost",
  ".localtest.me",
  ".lvh.me",
  ".vcap.me",
  ".nip.io",
  ".sslip.io",
];

const LOOPBACK_DOMAINS = new Set([
  "localtest.me",
  "lvh.me",
  "vcap.me",
  "nip.io",
  "sslip.io",
]);

const INTERNAL_TLD_SUFFIXES = [
  ".local",
  ".internal",
  ".intranet",
  ".home.arpa",
];

/** Strips the brackets WHATWG URL puts around an IPv6 host. */
function unwrapIpv6(hostname: string): string | null {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : null;
}

const HEXTET_COUNT = 8;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;

function parseHextetGroup(segment: string): number[] | null {
  if (segment === "") {
    return [];
  }

  const groups: number[] = [];

  for (const piece of segment.split(":")) {
    // A trailing dotted-quad, as in `::ffff:127.0.0.1`.
    if (piece.includes(".")) {
      const octets = piece.split(".").map(Number);
      const isIpv4 =
        octets.length === 4 &&
        octets.every(
          (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255
        );
      if (!isIpv4) {
        return null;
      }
      groups.push(
        ((octets[0] as number) << 8) | (octets[1] as number),
        ((octets[2] as number) << 8) | (octets[3] as number)
      );
      continue;
    }

    if (!HEXTET_PATTERN.test(piece)) {
      return null;
    }
    groups.push(Number.parseInt(piece, 16));
  }

  return groups;
}

/**
 * Expands an IPv6 address to its eight 16-bit groups, resolving `::`.
 *
 * Textual matching is not an option: the WHATWG URL parser rewrites
 * `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so any pattern written against the
 * dotted-quad form silently never fires.
 */
function expandIpv6(address: string): number[] | null {
  const parts = address.toLowerCase().split("::");
  if (parts.length > 2) {
    return null;
  }

  const head = parseHextetGroup(parts[0] ?? "");
  const tail = parts.length === 2 ? parseHextetGroup(parts[1] ?? "") : [];
  if (!(head && tail)) {
    return null;
  }

  if (parts.length === 1) {
    return head.length === HEXTET_COUNT ? head : null;
  }

  const elided = HEXTET_COUNT - head.length - tail.length;
  return elided < 1
    ? null
    : [...head, ...new Array<number>(elided).fill(0), ...tail];
}

function isPrivateIpv4(address: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(address));
}

/**
 * Whether an IPv6 address is loopback, unspecified, unique-local (`fc00::/7`),
 * link-local (`fe80::/10`), or carries a blocked IPv4 address in the
 * IPv4-mapped/compatible `::ffff:0:0/96` and `::/96` ranges.
 */
function isPrivateIpv6(address: string): boolean {
  const hextets = expandIpv6(address);
  if (!hextets) {
    return false;
  }

  // `expandIpv6` always returns exactly eight groups.
  const first = hextets[0] as number;
  const fifth = hextets[5] as number;
  const sixth = hextets[6] as number;
  const seventh = hextets[7] as number;

  // fc00::/7 — unique local addresses (fc.. and fd..).
  if ((first & 0xfe_00) === 0xfc_00) {
    return true;
  }

  // fe80::/10 — link-local.
  if ((first & 0xff_c0) === 0xfe_80) {
    return true;
  }

  // `::/96` and `::ffff:0:0/96` embed an IPv4 address in the last two groups.
  // This also covers `::` (unspecified) and `::1` (loopback).
  const isIpv4Embedded =
    hextets.slice(0, 5).every((group) => group === 0) &&
    (fifth === 0xff_ff || fifth === 0);

  if (!isIpv4Embedded) {
    return false;
  }

  const embedded = [
    sixth >> 8,
    sixth & 0xff,
    seventh >> 8,
    seventh & 0xff,
  ].join(".");

  // `::` and `::1` are 0.0.0.0 and 0.0.0.1 in this form; both are unroutable.
  return (sixth === 0 && seventh <= 1) || isPrivateIpv4(embedded);
}

export function validateBaseUrl(url: string): {
  valid: boolean;
  reason?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "URL must use http or https protocol" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: "URL must not point to localhost or metadata services",
    };
  }

  // Block hostnames that always resolve to loopback
  if (
    LOOPBACK_DOMAINS.has(hostname) ||
    LOOPBACK_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return { valid: false, reason: "URL must not point to loopback address" };
  }

  // Block IPv6 loopback, unique-local and link-local addresses
  const ipv6 =
    unwrapIpv6(hostname) ?? (hostname.includes(":") ? hostname : null);
  if (ipv6 && isPrivateIpv6(ipv6)) {
    return {
      valid: false,
      reason: "URL must not point to private or internal IP addresses",
    };
  }

  // Check if the hostname is a raw private IPv4 address
  if (isPrivateIpv4(hostname)) {
    return {
      valid: false,
      reason: "URL must not point to private or internal IP addresses",
    };
  }

  // Block internal-only TLDs
  if (INTERNAL_TLD_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { valid: false, reason: "URL must not point to internal hostnames" };
  }

  return { valid: true };
}
