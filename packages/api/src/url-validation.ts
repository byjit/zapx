/**
 * SSRF protection: validates that a URL does not point to private,
 * loopback, link-local, or cloud metadata IP ranges.
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

  // Block IPv6 loopback
  if (hostname === "[::1]" || hostname === "::1") {
    return { valid: false, reason: "URL must not point to loopback address" };
  }

  // Check if hostname is a raw IP address
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        reason: "URL must not point to private or internal IP addresses",
      };
    }
  }

  // Block .local and .internal TLDs
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, reason: "URL must not point to internal hostnames" };
  }

  return { valid: true };
}
