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
  // IPv4-mapped/compatible IPv6 carrying a loopback or private address, e.g.
  // `::ffff:127.0.0.1`. WHATWG URL keeps these in textual form.
  /^::(?:ffff:)?(?:127|10|0)\./,
  /^::(?:ffff:)?192\.168\./,
  /^::(?:ffff:)?169\.254\./,
  /^::(?:ffff:)?172\.(?:1[6-9]|2\d|3[0-1])\./,
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

/**
 * Whether a bare IPv6 address is loopback, unspecified, unique-local (`fc00::/7`)
 * or link-local (`fe80::/10`) — the IPv6 equivalents of the blocked IPv4 ranges.
 */
function isPrivateIpv6(address: string): boolean {
  if (address === "::1" || address === "::") {
    return true;
  }

  const firstHextet = address.split(":")[0] ?? "";

  // fc00::/7 — unique local addresses (fc.. and fd..).
  if (/^f[cd]/.test(firstHextet)) {
    return true;
  }

  // fe80::/10 — link-local (fe80 through febf).
  return /^fe[89ab]/.test(firstHextet);
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

  // Check if hostname is a raw IP address (IPv4, or IPv4 mapped into IPv6)
  const ipCandidate = ipv6 ?? hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(ipCandidate)) {
      return {
        valid: false,
        reason: "URL must not point to private or internal IP addresses",
      };
    }
  }

  // Block internal-only TLDs
  if (INTERNAL_TLD_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { valid: false, reason: "URL must not point to internal hostnames" };
  }

  return { valid: true };
}
