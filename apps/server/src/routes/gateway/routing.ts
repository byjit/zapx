import { toPriceAmount } from "@turborepo-boilerplate/api/pricing";
import type { ProviderEndpointSelect } from "@turborepo-boilerplate/db/schema/provider-endpoint";
import type { RouteConfig } from "@x402/core/server";

/**
 * Normalizes the gateway's `{*path}` wildcard into a safe upstream path.
 *
 * Express 5 yields an **array** of segments for `{*path}`, so treating it as a
 * string comma-joins multi-segment routes (`/a/b/c` → `/a,b,c`) and nothing past
 * the first level ever matches.
 *
 * The result is also made incapable of escaping the provider's own base URL,
 * because everything downstream — endpoint matching, x402's matcher and URL
 * construction — trusts this value:
 *
 * - **Backslashes become slashes.** For `http(s)` the WHATWG URL parser treats
 *   `\` exactly like `/`, so `/\evil.com/x` resolves to a *different origin*.
 *   x402's own matcher rewrites `\` to `/` before matching, so a request could
 *   be priced against one path and fetched from another host entirely.
 * - **Empty segments collapse.** `//evil.com/x` is protocol-relative and would
 *   likewise resolve to another origin.
 * - **Dot segments are resolved away.** `..` would otherwise climb out of the
 *   base URL's path prefix, letting the cheapest matching endpoint buy access to
 *   any path on the upstream origin.
 *
 * A trailing slash is preserved: it cannot cause an escape and some upstreams
 * distinguish `/x` from `/x/`.
 */
export function resolveProxyPath(pathParam: unknown): string {
  const joined = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

  const raw = joined.replace(/\\/g, "/");
  const segments: string[] = [];

  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const path = `/${segments.join("/")}`;
  const keepsTrailingSlash = segments.length > 0 && raw.endsWith("/");

  return keepsTrailingSlash ? `${path}/` : path;
}

/**
 * Path matching with support for OpenAPI templates (`/users/{id}`), Express-style
 * params (`/users/:id`) and trailing wildcards (`/files/*`, `/files/**`).
 */
export function matchPath(pattern: string, actual: string): boolean {
  const normalizedPattern = pattern.replace(/\/+$/, "") || "/";
  const normalizedActual = actual.replace(/\/+$/, "") || "/";

  // Exact match
  if (normalizedPattern === normalizedActual) {
    return true;
  }

  // Wildcard: /files/** or /files/*
  if (normalizedPattern.endsWith("/**") || normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.replace(/\/\*\*?$/, "");
    return (
      normalizedActual.startsWith(`${prefix}/`) || normalizedActual === prefix
    );
  }

  const patternParts = normalizedPattern.split("/");
  const actualParts = normalizedActual.split("/");

  // Handle optional trailing segments: /users/{id?}
  if (patternParts.length > actualParts.length) {
    const extraParts = patternParts.slice(actualParts.length);
    const allOptional = extraParts.every(
      (part) => part.startsWith("{") && part.endsWith("?}")
    );
    if (!allOptional) {
      return false;
    }
    patternParts.length = actualParts.length;
  }

  if (patternParts.length !== actualParts.length) {
    return false;
  }

  return patternParts.every((part, index) => {
    if (isParameterSegment(part)) {
      return true;
    }
    return part === actualParts[index];
  });
}

function isParameterSegment(segment: string): boolean {
  return (
    (segment.startsWith("{") && segment.endsWith("}")) ||
    segment.startsWith(":")
  );
}

function hasParameters(path: string): boolean {
  return path.split("/").some(isParameterSegment) || path.includes("*");
}

/**
 * Picks the endpoint that should serve a request.
 *
 * Literal paths win over templated ones. Without that, a spec containing both
 * `/users/{id}` and `/users/me` had its price decided by Postgres row order,
 * so the same request could be billed differently across restarts.
 */
export function findMatchingEndpoint<
  T extends { method: string; path: string },
>(endpoints: T[], method: string, path: string): T | undefined {
  const candidates = endpoints.filter(
    (endpoint) =>
      endpoint.method.toUpperCase() === method.toUpperCase() &&
      matchPath(endpoint.path, path)
  );

  return (
    candidates.find((endpoint) => !hasParameters(endpoint.path)) ??
    candidates[0]
  );
}

/**
 * Builds the x402 route config for the one endpoint this request resolved to.
 *
 * Returned bare (not keyed by a route pattern) on purpose. x402 registers a bare
 * config under the `"*"` pattern, which matches any method and path — and that is
 * exactly right here, because the gateway has *already* matched and priced this
 * request before calling x402. Handing x402 a pattern to re-match against was the
 * original defect and an endless source of new ones: its matcher escapes `{`/`}`
 * as regex literals (so OpenAPI templates matched nothing and were served free),
 * and its `:param` substitution only accepts JS-identifier names, so ordinary
 * spec paths like `/users/{account-id}` or `/v1/{api-version}/x` could never be
 * expressed. With a wildcard there is no second matcher to disagree with ours.
 */
export function buildRouteConfig(
  endpoint: ProviderEndpointSelect,
  payTo: string,
  network: `${string}:${string}`
): RouteConfig {
  if (!endpoint.priceUsdc) {
    throw new Error(`Endpoint ${endpoint.id} has no price configured`);
  }

  return {
    accepts: [
      {
        scheme: "exact",
        price: toPriceAmount(endpoint.priceUsdc),
        network,
        payTo,
      },
    ],
    description: endpoint.summary || endpoint.description || undefined,
    mimeType: "application/json",
  };
}
