import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import request from "supertest";
import { TEST_NETWORK, TEST_PAY_TO } from "./helpers/facilitator-stub";
import { startGatewayHarness } from "./helpers/gateway-harness";
import { readAcceptedRequirement, readChallenge } from "./helpers/payment";

/**
 * The stubs have to be listening before `@turborepo-boilerplate/env` parses
 * `process.env`, so the harness is started at module scope and every application
 * module behind it is loaded with a dynamic import.
 */
const harness = await startGatewayHarness();

after(() => harness.close());

describe("gateway routing and the 402 challenge", () => {
  it("returns 404 for an unknown apiId", async () => {
    const response = await request(harness.createApp())
      .get("/gateway/does-not-exist/weather")
      .expect(404);

    assert.deepEqual(response.body, { error: "API not found" });
  });

  it("returns 403 when the API owner is banned", async () => {
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      ownerBanned: true,
      endpoints: [{ method: "GET", path: "/weather", priceUsdc: "$0.001" }],
    });

    const response = await request(harness.createApp())
      .get(`/gateway/${fixture.apiId}/weather`)
      .expect(403);

    assert.deepEqual(response.body, {
      error: "This API is currently unavailable",
    });
  });

  it("returns 404 when no endpoint matches the path or method", async () => {
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/weather", priceUsdc: "$0.001" }],
    });
    const app = harness.createApp();

    const unknownPath = await request(app)
      .get(`/gateway/${fixture.apiId}/forecast`)
      .expect(404);
    assert.deepEqual(unknownPath.body, { error: "Endpoint not found" });

    await request(app).post(`/gateway/${fixture.apiId}/weather`).expect(404);
  });

  it("returns 400 for an endpoint imported without a price", async () => {
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/weather", priceUsdc: null }],
    });

    const response = await request(harness.createApp())
      .get(`/gateway/${fixture.apiId}/weather`)
      .expect(400);

    assert.deepEqual(response.body, {
      error: "Endpoint has no pricing configured",
    });
  });

  /**
   * P0-1: `initialize()` was never called on the resource server, so
   * `buildPaymentRequirements` threw "Facilitator does not support exact on …"
   * and the outer catch turned every priced request into
   * `502 {"error":"Gateway error"}`. No caller ever saw a challenge.
   */
  it("answers an unpaid priced request with a 402 challenge, not a 502", async () => {
    harness.upstream.reset();
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/weather", priceUsdc: "$0.001" }],
    });

    const response = await request(harness.createApp()).get(
      `/gateway/${fixture.apiId}/weather`
    );

    assert.notEqual(
      response.status,
      502,
      `expected a payment challenge, got ${response.status} ${JSON.stringify(response.body)}`
    );
    assert.equal(response.status, 402);

    assert.equal(readChallenge(response.headers).accepts.length, 1);
    const accepted = readAcceptedRequirement(response.headers);
    assert.equal(accepted.scheme, "exact");
    assert.equal(accepted.network, TEST_NETWORK);
    assert.equal(accepted.payTo, TEST_PAY_TO);
    // $0.001 of a 6-decimal stablecoin.
    assert.equal(accepted.amount, "1000");
    assert.match(accepted.asset, /^0x[0-9a-fA-F]{40}$/);

    assert.equal(
      harness.upstream.requests.length,
      0,
      "an unpaid request must never reach the provider"
    );
  });

  it("prices from the endpoint row, so a different price yields a different challenge", async () => {
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "POST", path: "/echo", priceUsdc: "$0.0001" }],
    });

    const response = await request(harness.createApp())
      .post(`/gateway/${fixture.apiId}/echo`)
      .expect(402);

    assert.equal(readAcceptedRequirement(response.headers).amount, "100");
  });

  /**
   * P0-2: Express 5 returns `{*path}` as an array. Read as a string it became
   * `/a,b,c`, matched no stored endpoint, and every nested route answered
   * `404 "Endpoint not found"` before payment was ever considered.
   */
  it("charges for a nested path instead of 404-ing it", async () => {
    harness.upstream.reset();
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/a/b/c", priceUsdc: "$0.001" }],
    });

    const response = await request(harness.createApp()).get(
      `/gateway/${fixture.apiId}/a/b/c`
    );

    assert.equal(
      response.status,
      402,
      `nested paths must reach the payment layer, got ${response.status} ${JSON.stringify(response.body)}`
    );
    assert.equal(readAcceptedRequirement(response.headers).amount, "1000");
    assert.equal(harness.upstream.requests.length, 0);
  });

  /**
   * P0-3: OpenAPI templated paths are stored verbatim (`/users/{id}`) but x402
   * escapes braces as regex literals, so the route never matched, x402 reported
   * `no-payment-required`, and the gateway proxied the response free of charge.
   */
  it("charges for a templated path and never serves it for free", async () => {
    harness.upstream.reset();
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/users/{id}", priceUsdc: "$0.001" }],
    });

    const response = await request(harness.createApp()).get(
      `/gateway/${fixture.apiId}/users/123`
    );

    assert.equal(
      response.status,
      402,
      `templated paths must be charged for, got ${response.status} ${JSON.stringify(response.body)}`
    );
    assert.notEqual(
      response.status,
      200,
      "a priced templated endpoint must never return the upstream body without payment"
    );
    assert.equal(readAcceptedRequirement(response.headers).amount, "1000");
    assert.equal(
      harness.upstream.requests.length,
      0,
      "the provider's API must not be called for an unpaid request"
    );
  });

  /**
   * P2-4: with `/users/{id}` and `/users/me` in one spec, the price charged used
   * to depend on Postgres row order.
   */
  it("charges the literal endpoint's price when a template also matches", async () => {
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [
        { method: "GET", path: "/users/{id}", priceUsdc: "$0.001" },
        { method: "GET", path: "/users/me", priceUsdc: "$0.05" },
      ],
    });
    const app = harness.createApp();

    const literal = await request(app)
      .get(`/gateway/${fixture.apiId}/users/me`)
      .expect(402);
    assert.equal(readAcceptedRequirement(literal.headers).amount, "50000");

    const templated = await request(app)
      .get(`/gateway/${fixture.apiId}/users/42`)
      .expect(402);
    assert.equal(readAcceptedRequirement(templated.headers).amount, "1000");
  });

  it("rejects a malformed payment header with a fresh challenge rather than an error", async () => {
    harness.upstream.reset();
    const fixture = await harness.createApiFixture({
      baseUrl: harness.upstream.url,
      endpoints: [{ method: "GET", path: "/weather", priceUsdc: "$0.001" }],
    });

    const response = await request(harness.createApp())
      .get(`/gateway/${fixture.apiId}/weather`)
      .set("payment-signature", "not-base64-json!!");

    assert.equal(response.status, 402);
    assert.equal(harness.upstream.requests.length, 0);
  });
});
