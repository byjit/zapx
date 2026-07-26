import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProviderEndpointSelect } from "@turborepo-boilerplate/db/schema/provider-endpoint";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { buildUpstreamUrl } from "../routes/gateway/proxy";
import {
  buildRouteConfig,
  findMatchingEndpoint,
  matchPath,
  resolveProxyPath,
} from "../routes/gateway/routing";

const PAY_TO = `0x${"1".repeat(40)}`;
const NETWORK = "eip155:84532" as const;

function endpoint(
  overrides: Partial<ProviderEndpointSelect> & { method: string; path: string }
): ProviderEndpointSelect {
  const now = new Date();
  return {
    id: `endpoint-${overrides.method}-${overrides.path}`,
    userId: "user-1",
    apiId: "api-1",
    operationId: null,
    summary: null,
    description: null,
    priceUsdc: "$0.001",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * A route-matching probe: `requiresPayment` only reads `path` and `method`, so
 * the rest of the adapter exists to satisfy the interface.
 */
function requestContext(method: string, path: string) {
  return {
    method,
    path,
    adapter: {
      getHeader: () => undefined,
      getMethod: () => method,
      getPath: () => path,
      getUrl: () => `http://gateway.test${path}`,
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "zapx-tests",
    },
  };
}

function routeMatcher(routes: unknown) {
  return new x402HTTPResourceServer(
    new x402ResourceServer(),
    routes as ConstructorParameters<typeof x402HTTPResourceServer>[1]
  );
}

const BACKSLASH = String.fromCharCode(92);

/**
 * P0-2: Express 5 hands `{*path}` back as an array of segments. Treating it as
 * a string comma-joined every nested route into `/a,b,c`, which matched no
 * stored endpoint, so only single-segment paths worked at all.
 */
describe("resolveProxyPath", () => {
  it("joins multi-segment wildcards with slashes, not commas", () => {
    assert.equal(resolveProxyPath(["a", "b", "c"]), "/a/b/c");
    assert.equal(
      resolveProxyPath(["users", "123", "orders"]),
      "/users/123/orders"
    );
  });

  it("handles a single segment", () => {
    assert.equal(resolveProxyPath(["weather"]), "/weather");
    assert.equal(resolveProxyPath("weather"), "/weather");
  });

  it("resolves an empty or absent wildcard to the root path", () => {
    assert.equal(resolveProxyPath([]), "/");
    assert.equal(resolveProxyPath(""), "/");
    assert.equal(resolveProxyPath(undefined), "/");
    assert.equal(resolveProxyPath(null), "/");
  });

  it("collapses leading slashes so a protocol-relative path cannot escape the base URL", () => {
    assert.equal(resolveProxyPath(["", "evil.com", "x"]), "/evil.com/x");
    assert.equal(resolveProxyPath(["", "", "evil.com"]), "/evil.com");
    assert.equal(resolveProxyPath("//evil.com/x"), "/evil.com/x");
  });

  it("keeps the resolved path inside the provider's origin (SSRF regression)", () => {
    const proxyPath = resolveProxyPath(["", "evil.com", "x"]);
    const url = buildUpstreamUrl(
      "https://api.good.com/v1",
      proxyPath,
      "/gateway/x//evil.com/x"
    );

    assert.equal(url.origin, "https://api.good.com");
    assert.equal(url.toString(), "https://api.good.com/v1/evil.com/x");
  });

  it("rewrites backslashes, which the URL parser treats as authority separators", () => {
    // Express decodes `%5C` to a backslash, and for http(s) the WHATWG parser
    // reads `/\host` exactly like `//host` — a different origin entirely.
    assert.equal(
      resolveProxyPath([`${BACKSLASH}127.0.0.1:9999`, "secret"]),
      "/127.0.0.1:9999/secret"
    );
    assert.equal(
      resolveProxyPath([`${BACKSLASH}${BACKSLASH}evil.com`, "x"]),
      "/evil.com/x"
    );
  });

  it("resolves dot segments so `..` cannot climb out of the base URL prefix", () => {
    assert.equal(resolveProxyPath(["..", "admin"]), "/admin");
    assert.equal(resolveProxyPath(["a", "..", "..", "..", "etc"]), "/etc");
    assert.equal(resolveProxyPath(["a", ".", "b"]), "/a/b");
  });

  it("preserves a trailing slash, which cannot cause an escape", () => {
    assert.equal(resolveProxyPath("a/b/"), "/a/b/");
    assert.equal(resolveProxyPath("/"), "/");
  });

  for (const [label, segments] of [
    ["backslash host", [`${BACKSLASH}127.0.0.1:9999`, "secret"]],
    ["backslash userinfo", [`${BACKSLASH}@evil.com`, "x"]],
    ["cloud metadata", [`${BACKSLASH}169.254.169.254`, "latest"]],
    ["dot segments", ["..", "admin"]],
  ] as Array<[string, string[]]>) {
    it(`cannot leave the provider's origin via ${label}`, () => {
      const url = buildUpstreamUrl(
        "https://api.good.com/v1",
        resolveProxyPath(segments),
        "/gateway/x/whatever"
      );

      assert.equal(url.origin, "https://api.good.com");
      assert.ok(
        url.pathname.startsWith("/v1/"),
        `expected the /v1 prefix to hold, got ${url.pathname}`
      );
    });
  }
});

/**
 * P0-3: OpenAPI stores templated paths verbatim (`/users/{id}`), but x402's route
 * matcher escapes braces as regex literals, so a stored key matched nothing, x402
 * answered `no-payment-required`, and the endpoint was served for free.
 *
 * The gateway now hands x402 a bare config, which it registers under `"*"`. The
 * gateway has already matched and priced the request, so there is no second
 * matcher left to disagree with it.
 */
describe("buildRouteConfig", () => {
  it("prices the endpoint it is given", () => {
    const config = buildRouteConfig(
      endpoint({
        method: "GET",
        path: "/users/{id}",
        priceUsdc: "$0.001",
        summary: "Fetch a user",
      }),
      PAY_TO,
      NETWORK
    );

    assert.deepEqual(config.accepts, [
      { scheme: "exact", price: "0.001", network: NETWORK, payTo: PAY_TO },
    ]);
    assert.equal(config.description, "Fetch a user");
  });

  it("refuses to build a config for an unpriced endpoint", () => {
    assert.throws(() =>
      buildRouteConfig(
        endpoint({ method: "GET", path: "/free", priceUsdc: null }),
        PAY_TO,
        NETWORK
      )
    );
  });

  it("requires payment for the request path, whatever the stored template looks like", () => {
    // Every one of these is a real OpenAPI path. Translating them to `:param`
    // produced keys x402 could not match — its substitution only accepts
    // JS-identifier names — so each would have hard-failed on every request.
    const paths: Array<[string, string]> = [
      ["/users/{id}", "/users/123"],
      ["/users/{account-id}", "/users/123"],
      ["/v1/{api-version}/things", "/v1/2024-01/things"],
      ["/files/{file.name}", "/files/report.pdf"],
      ["/x/{2fa}", "/x/enabled"],
      ["/{proxy+}", "/anything"],
      ["/a/b/c", "/a/b/c"],
      ["/users/{id}/", "/users/123"],
    ];

    for (const [stored, requested] of paths) {
      const matcher = routeMatcher(
        buildRouteConfig(
          endpoint({ method: "GET", path: stored, priceUsdc: "$0.001" }),
          PAY_TO,
          NETWORK
        )
      );

      assert.equal(
        matcher.requiresPayment(requestContext("GET", requested)),
        true,
        `x402 must require payment for ${requested} stored as ${stored}`
      );
    }
  });

  it("proves a stored OpenAPI key would never have matched, so the regression cannot return silently", () => {
    const config = buildRouteConfig(
      endpoint({ method: "GET", path: "/users/{id}", priceUsdc: "$0.001" }),
      PAY_TO,
      NETWORK
    );

    assert.equal(
      routeMatcher({ "GET /users/{id}": config }).requiresPayment(
        requestContext("GET", "/users/123")
      ),
      false,
      "x402 escapes braces as regex literals — keying by the stored path serves the endpoint for free"
    );
    assert.equal(
      routeMatcher({ "GET /users/:account-id": config }).requiresPayment(
        requestContext("GET", "/users/123")
      ),
      false,
      "x402's :param substitution rejects non-identifier names — such a key never matches"
    );
  });
});

describe("matchPath", () => {
  it("matches literal paths, ignoring trailing slashes", () => {
    assert.equal(matchPath("/users", "/users"), true);
    assert.equal(matchPath("/users/", "/users"), true);
    assert.equal(matchPath("/users", "/users/"), true);
    assert.equal(matchPath("/", "/"), true);
    assert.equal(matchPath("/users", "/accounts"), false);
  });

  it("matches OpenAPI and Express parameter segments", () => {
    assert.equal(matchPath("/users/{id}", "/users/123"), true);
    assert.equal(matchPath("/users/:id", "/users/123"), true);
    assert.equal(matchPath("/users/{id}", "/users/123/orders"), false);
    assert.equal(matchPath("/users/{id}", "/users"), false);
  });

  it("treats a trailing optional segment as optional", () => {
    assert.equal(matchPath("/users/{id?}", "/users"), true);
    assert.equal(matchPath("/users/{id?}", "/users/123"), true);
  });

  it("matches trailing wildcards", () => {
    assert.equal(matchPath("/files/**", "/files/a/b/c"), true);
    assert.equal(matchPath("/files/*", "/files/a"), true);
    assert.equal(matchPath("/files/**", "/files"), true);
    assert.equal(matchPath("/files/**", "/filesx/a"), false);
  });
});

/**
 * P2-4: match used to be first-row-wins with no `ORDER BY`, so Postgres row
 * order decided which price a request was charged.
 */
describe("findMatchingEndpoint", () => {
  const literal = endpoint({
    method: "GET",
    path: "/users/me",
    priceUsdc: "$0.05",
  });
  const templated = endpoint({
    method: "GET",
    path: "/users/{id}",
    priceUsdc: "$0.001",
  });

  it("prefers a literal path over a templated one, whatever the row order", () => {
    for (const rows of [
      [templated, literal],
      [literal, templated],
    ]) {
      const matched = findMatchingEndpoint(rows, "GET", "/users/me");
      assert.equal(matched?.path, "/users/me");
      assert.equal(matched?.priceUsdc, "$0.05");
    }
  });

  it("falls back to the templated row for a path no literal covers", () => {
    const matched = findMatchingEndpoint(
      [literal, templated],
      "GET",
      "/users/123"
    );
    assert.equal(matched?.path, "/users/{id}");
  });

  it("prefers a literal path over a wildcard", () => {
    const wildcard = endpoint({ method: "GET", path: "/files/**" });
    const exact = endpoint({ method: "GET", path: "/files/readme" });

    assert.equal(
      findMatchingEndpoint([wildcard, exact], "GET", "/files/readme")?.path,
      "/files/readme"
    );
    assert.equal(
      findMatchingEndpoint([wildcard, exact], "GET", "/files/a/b")?.path,
      "/files/**"
    );
  });

  it("compares methods case-insensitively but never across methods", () => {
    const rows = [endpoint({ method: "post", path: "/echo" })];

    assert.equal(findMatchingEndpoint(rows, "POST", "/echo")?.path, "/echo");
    assert.equal(findMatchingEndpoint(rows, "GET", "/echo"), undefined);
  });

  it("ignores a trailing slash on the request", () => {
    const rows = [endpoint({ method: "GET", path: "/weather" })];

    assert.equal(
      findMatchingEndpoint(rows, "GET", "/weather/")?.path,
      "/weather"
    );
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(findMatchingEndpoint([literal], "GET", "/unknown"), undefined);
    assert.equal(findMatchingEndpoint([], "GET", "/users/me"), undefined);
  });
});
