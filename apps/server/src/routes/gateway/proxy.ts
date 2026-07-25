import type { Request, Response } from "express";

const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Response headers the gateway must not copy through.
 *
 * Beyond the standard hop-by-hop set: `content-encoding` and `content-length`
 * describe the *upstream* body, but `fetch` has already decompressed it and the
 * re-serialized body has a different length — forwarding either announces a gzip
 * payload that is actually plaintext. Payment headers are excluded because the
 * gateway sets its own.
 */
const SKIP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  // Never relay a provider's cookies. They would be set on the Zapx origin, so a
  // malicious upstream could overwrite a caller's session cookie for the whole
  // site. x402 callers are wallets and agents, not cookie-bearing browsers, so
  // nothing legitimate is lost.
  "set-cookie",
  "payment-required",
  "payment-response",
  "payment-signature",
  "x-payment",
  "x-payment-response",
]);

/**
 * Request headers the gateway must not forward to a provider-controlled upstream.
 *
 * `authorization`, `cookie` and `proxy-authorization` carry the *caller's* Zapx
 * credentials: forwarding them would let any provider register a base URL they
 * control and harvest browser session cookies and bearer tokens. `x-forwarded-*`
 * is dropped so a caller cannot spoof the chain we did not add.
 */
const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "payment-signature",
  "payment-required",
  "payment-identifier",
  "x-payment",
  "x-payment-response",
]);

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Resolves the upstream URL for a proxied request.
 *
 * Built by cloning the registered base URL and *assigning* `pathname`, never by
 * resolving a relative reference against it. Resolution would let the request
 * path change the origin — `new URL("/\\evil.com/x", "https://api.example.com")`
 * is `https://evil.com/x` for `http(s)` schemes — which no amount of
 * registration-time validation or redirect refusal can catch. Assignment cannot
 * touch the host, and it percent-encodes `?` and `#` so a path segment cannot
 * smuggle a query string either. Cloning (rather than `base.origin`) also keeps
 * any userinfo and port the provider registered.
 *
 * The base URL's own path prefix is preserved: dropping `/v1` from
 * `https://api.example.com/v1` 404s upstream, and versioned base URLs are the
 * norm in OpenAPI `servers` entries. `path` must already be dot-segment free
 * (see `resolveProxyPath`) or `..` would climb back out of that prefix.
 *
 * The query string is copied verbatim from the raw request line rather than
 * rebuilt from `req.query`, which preserves duplicate-key order and bracketed
 * keys (`?filter[a]=1`) that Express's `qs` parser turns into nested objects.
 */
export function buildUpstreamUrl(
  baseUrl: string,
  path: string,
  originalUrl: string
): URL {
  const url = new URL(baseUrl);
  const prefix = url.pathname.replace(/\/+$/, "");

  url.pathname = `${prefix}${path}`;
  url.hash = "";

  const queryStart = originalUrl.indexOf("?");
  url.search = queryStart === -1 ? "" : originalUrl.slice(queryStart + 1);

  return url;
}

function buildForwardHeaders(req: Request): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    }
  }

  return headers;
}

export async function fetchUpstream(
  req: Request,
  baseUrl: string,
  path: string
): Promise<globalThis.Response> {
  const url = buildUpstreamUrl(baseUrl, path, req.originalUrl);

  const init: RequestInit = {
    method: req.method,
    headers: buildForwardHeaders(req),
    // Registration-time SSRF validation only holds if it also holds at request
    // time: `fetch` follows redirects by default, and a validated public host
    // answering `302 → http://127.0.0.1/` would otherwise pull internal content
    // straight through the gateway.
    redirect: "error",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };

  // Edge case #11: forward the raw body without re-serializing. Anything that is
  // not already raw bytes is skipped rather than stringified — `express.raw`
  // leaves `req.body` as an empty object when a request carries no
  // `content-type`, and forwarding a literal `{}` in place of the real body is
  // worse than forwarding nothing.
  if (METHODS_WITH_BODY.has(req.method.toUpperCase())) {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      init.body = req.body;
    } else if (typeof req.body === "string" && req.body.length > 0) {
      init.body = req.body;
    }
  }

  return fetch(url.toString(), init);
}

export function forwardUpstreamHeaders(
  res: Response,
  upstream: globalThis.Response
): void {
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
}

/**
 * Reads an upstream body into memory.
 *
 * Buffering before settlement is deliberate: if the upstream connection dies
 * mid-body we can still decline to charge, whereas settling first would take the
 * caller's money for a response they never receive.
 *
 * MVP limitation, also deliberate: because the body is fully buffered, SSE and
 * chunked LLM responses are not streamed. Streaming would require settling before
 * the first byte leaves, inverting the "only settle on a 2xx" rule the gateway is
 * built around, so it is out of scope until settlement ordering is redesigned.
 */
export async function readUpstreamBody(
  upstream: globalThis.Response
): Promise<Buffer> {
  return Buffer.from(await upstream.arrayBuffer());
}

/** Forwards an already-read upstream response — headers, status, body. */
export function sendUpstreamResponse(
  res: Response,
  upstream: globalThis.Response,
  body: Buffer
): void {
  forwardUpstreamHeaders(res, upstream);
  res.status(upstream.status).send(body);
}
