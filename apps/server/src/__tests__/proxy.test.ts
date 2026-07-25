import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import {
  buildUpstreamUrl,
  fetchUpstream,
  readUpstreamBody,
  sendUpstreamResponse,
} from "../routes/gateway/proxy";
import { resolveProxyPath } from "../routes/gateway/routing";
import { type StubServer, startStubServer } from "./helpers/stub-server";
import { startUpstreamStub, type UpstreamStub } from "./helpers/upstream-stub";

/**
 * The gateway's proxy layer, driven exactly as the handler drives it but with no
 * database or payment in the way — these cases must run everywhere.
 */
function createProxyApp(baseUrl: string): Express {
  const app = express();
  app.use(express.raw({ type: "*/*", limit: "10mb" }));

  app.all("/proxy/{*path}", async (req: Request, res: Response) => {
    try {
      const upstream = await fetchUpstream(
        req,
        baseUrl,
        resolveProxyPath(req.params.path)
      );
      sendUpstreamResponse(res, upstream, await readUpstreamBody(upstream));
    } catch {
      res.status(502).json({ error: "Upstream unavailable" });
    }
  });

  return app;
}

/**
 * P2-3 / P2-6: the base URL's own path prefix has to survive, and the query
 * string has to be copied from the raw request line rather than rebuilt from
 * Express's parsed `req.query`.
 */
describe("buildUpstreamUrl", () => {
  it("preserves the base URL's path prefix", () => {
    assert.equal(
      buildUpstreamUrl(
        "https://api.example.com/v1",
        "/weather",
        "/gateway/x/weather"
      ).toString(),
      "https://api.example.com/v1/weather"
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    assert.equal(
      buildUpstreamUrl(
        "https://api.example.com/v1/",
        "/weather",
        "/gateway/x/weather"
      ).toString(),
      "https://api.example.com/v1/weather"
    );
  });

  it("works when the base URL has no path at all", () => {
    for (const base of [
      "https://api.example.com",
      "https://api.example.com/",
    ]) {
      assert.equal(
        buildUpstreamUrl(base, "/weather", "/gateway/x/weather").toString(),
        "https://api.example.com/weather"
      );
    }
  });

  it("preserves a multi-segment prefix and a nested path", () => {
    assert.equal(
      buildUpstreamUrl(
        "https://api.example.com/api/v2/",
        "/a/b/c",
        "/gateway/x/a/b/c"
      ).toString(),
      "https://api.example.com/api/v2/a/b/c"
    );
  });

  it("copies bracketed query keys verbatim", () => {
    const url = buildUpstreamUrl(
      "https://api.example.com/v1",
      "/search",
      "/gateway/x/search?filter[a]=1&filter[b]=2"
    );

    assert.equal(url.search, "?filter[a]=1&filter[b]=2");
  });

  it("preserves duplicate query keys and their order", () => {
    const url = buildUpstreamUrl(
      "https://api.example.com",
      "/search",
      "/gateway/x/search?t=1&t=2"
    );

    assert.equal(url.search, "?t=1&t=2");
    assert.deepEqual(url.searchParams.getAll("t"), ["1", "2"]);
  });

  it("leaves the query empty when the request had none", () => {
    assert.equal(
      buildUpstreamUrl("https://api.example.com/v1", "/x", "/gateway/x/x")
        .search,
      ""
    );
  });

  it("keeps an empty query string empty rather than inventing one", () => {
    assert.equal(
      buildUpstreamUrl("https://api.example.com/v1", "/x", "/gateway/x/x?")
        .search,
      ""
    );
  });
});

describe("gateway proxy layer", () => {
  let upstream: UpstreamStub;
  let redirectTarget: StubServer;
  let redirectTargetHits: number;

  before(async () => {
    upstream = await startUpstreamStub();
    redirectTargetHits = 0;
    redirectTarget = await startStubServer((_req, res) => {
      redirectTargetHits++;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("internal-secret");
    });
  });

  after(async () => {
    await upstream.close();
    await redirectTarget.close();
  });

  /**
   * P1-5: `authorization` and `cookie` carry the *caller's* Zapx credentials.
   * Forwarding them let any provider register a base URL they control and
   * harvest browser session cookies and bearer tokens.
   */
  it("never forwards caller credentials or spoofable forwarding headers upstream", async () => {
    upstream.reset();
    const app = createProxyApp(upstream.url);

    await request(app)
      .get("/proxy/echo")
      .set("authorization", "Bearer super-secret")
      .set("cookie", "better-auth.session_token=leaked")
      .set("proxy-authorization", "Basic leak")
      .set("x-forwarded-for", "1.2.3.4")
      .set("x-forwarded-host", "evil.example")
      .set("x-forwarded-proto", "https")
      .set("payment-signature", "should-not-leak")
      .set("x-custom-header", "keep-me")
      .expect(200);

    const received = upstream.requests.at(0);
    assert.ok(received, "upstream must have been called");

    for (const header of [
      "authorization",
      "cookie",
      "proxy-authorization",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-proto",
      "payment-signature",
    ]) {
      assert.equal(
        received.headers[header],
        undefined,
        `${header} must not reach a provider-controlled upstream`
      );
    }

    assert.equal(received.headers["x-custom-header"], "keep-me");
  });

  /**
   * P2-2: `fetch` has already decompressed the body, so announcing the upstream's
   * `content-encoding` describes bytes the caller never receives.
   */
  it("drops content-encoding so a decompressed body is not announced as gzip", async () => {
    upstream.reset();
    const plaintext = JSON.stringify({
      compressed: true,
      value: "x".repeat(64),
    });
    const compressed = gzipSync(plaintext);
    assert.ok(
      compressed.length < Buffer.byteLength(plaintext),
      "the fixture must actually compress, otherwise the case proves nothing"
    );

    upstream.respond = (_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(compressed.length),
      });
      res.end(compressed);
    };

    const response = await request(createProxyApp(upstream.url))
      .get("/proxy/report")
      .expect(200);

    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.text, plaintext);
    assert.equal(
      response.headers["content-length"],
      String(Buffer.byteLength(plaintext)),
      "content-length must describe the bytes actually sent"
    );
  });

  it("never relays a provider's set-cookie headers onto the Zapx origin", async () => {
    // The gateway is served from the Zapx origin, so relaying an upstream cookie
    // would let a provider overwrite a caller's session cookie for the whole
    // site. Dropping the header also removes the comma-joining corruption that
    // `forEach` used to introduce for multiple cookies.
    upstream.reset();
    upstream.respond = (_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": [
          "a=1; Path=/",
          "better-auth.session_token=stolen; Domain=zapx.com; Path=/",
        ],
      });
      res.end("{}");
    };

    const response = await request(createProxyApp(upstream.url))
      .get("/proxy/cookies")
      .expect(200);

    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(response.headers["content-type"], "application/json");
  });

  /**
   * P1-6: registration-time SSRF validation only holds if it also holds at
   * request time. A validated public host answering `302 -> http://127.0.0.1/`
   * used to pull internal content straight through the gateway.
   */
  it("refuses to follow an upstream redirect into the private network", async () => {
    upstream.reset();
    redirectTargetHits = 0;
    upstream.respond = (_req, res) => {
      res.writeHead(302, { location: `${redirectTarget.url}/` });
      res.end();
    };

    const response = await request(createProxyApp(upstream.url)).get(
      "/proxy/redirect"
    );

    assert.equal(response.status, 502);
    assert.equal(
      redirectTargetHits,
      0,
      "the redirect target must never be fetched"
    );
    assert.equal(response.text.includes("internal-secret"), false);
  });

  it("preserves the base URL prefix, nested paths and the raw query string", async () => {
    upstream.reset();
    const app = createProxyApp(`${upstream.url}/v1`);

    await request(app)
      .get("/proxy/a/b/c?filter[a]=1&filter[b]=2&t=1&t=2")
      .expect(200);

    assert.equal(
      upstream.requests.at(0)?.url,
      "/v1/a/b/c?filter[a]=1&filter[b]=2&t=1&t=2"
    );
  });

  it("forwards a request body without re-serializing it", async () => {
    upstream.reset();
    const body = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

    await request(createProxyApp(upstream.url))
      .post("/proxy/upload")
      .set("content-type", "application/octet-stream")
      .send(body)
      .expect(200);

    const received = upstream.requests.at(0);
    assert.equal(received?.method, "POST");
    assert.deepEqual(received?.body, body);
  });

  it("forwards a non-2xx upstream status and body unchanged", async () => {
    upstream.reset();
    upstream.respond = (_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "no such city" }));
    };

    const response = await request(createProxyApp(upstream.url))
      .get("/proxy/weather")
      .expect(404);

    assert.deepEqual(response.body, { error: "no such city" });
  });
});
