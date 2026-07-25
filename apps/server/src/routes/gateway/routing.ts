import { toPriceAmount } from "@turborepo-boilerplate/api/pricing";
import type { ProviderEndpointSelect } from "@turborepo-boilerplate/db/schema/provider-endpoint";
import type { RouteConfig } from "@x402/core/server";

/**
 * Normalizes the gateway's `{*path}` wildcard into an upstream path.
 *
 * Express 5 yields an **array** of segments for `{*path}`, so treating it as a
 * string comma-joins multi-segment routes (`/a/b/c` → `/a,b,c`) and nothing past
 * the first level ever matches. Leading slashes are collapsed at the same time:
 * `new URL("//evil.com/x", "https://api.good.com/v1")` resolves to
 * `https://evil.com/x`, so a request for `//evil.com/x` would otherwise be a
 * protocol-relative SSRF once the join is fixed.
 */
export function resolveProxyPath(pathParam: unknown): string {
  const joined = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";

  return `/${joined.replace(/^\/+/, "")}`;
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
 * Translates an OpenAPI path template into the placeholder syntax x402 understands.
 *
 * x402's route matcher escapes `{` and `}` as regex literals — it only knows
 * `:param`, `[param]` and `*`. An untranslated `/users/{id}` therefore matched
 * nothing, x402 reported `no-payment-required`, and the endpoint was served for
 * free. For most real OpenAPI specs that is the majority of the surface.
 *
 * Note: `matchPath` also accepts a request that omits a trailing `{id?}` segment,
 * while `:id` here requires it. That divergence is unreachable today — endpoints
 * only ever come from `parseOpenApiSpec`, and OpenAPI has no optional path
 * parameters — and it fails closed (a 500, never a free response) if it ever is
 * reached. Registering endpoints by hand would need both keys emitted.
 */
export function toX402RouteKey(method: string, path: string): string {
  const routePath = path.replace(/\{([^}?]+)\??\}/g, ":$1");
  return `${method.toUpperCase()} ${routePath}`;
}

export function buildRoutesConfig(
  endpoints: ProviderEndpointSelect[],
  payTo: string,
  network: `${string}:${string}`
): Record<string, RouteConfig> {
  const routes: Record<string, RouteConfig> = {};

  for (const endpoint of endpoints) {
    if (!endpoint.priceUsdc) {
      continue;
    }

    routes[toX402RouteKey(endpoint.method, endpoint.path)] = {
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

  return routes;
}
