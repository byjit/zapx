import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import type { PaymentRequirements } from "@x402/core/types";
import type { Express } from "express";
import request from "supertest";
import { TEST_NETWORK, TEST_TX_HASH } from "./helpers/facilitator-stub";
import { startGatewayHarness } from "./helpers/gateway-harness";
import { assertMoneyEqual, assertSplitIsExact } from "./helpers/money";
import {
  buildEip3009Payload,
  encodePaymentSignature,
  randomNonce,
  readAcceptedRequirement,
} from "./helpers/payment";
import { firstRow } from "./helpers/rows";
import { UPSTREAM_DEFAULT_BODY } from "./helpers/upstream-stub";

const harness = await startGatewayHarness();

after(() => harness.close());

/**
 * Every case below writes a payment reservation, which only exists once
 * `0003_glossy_nightmare.sql` has been applied. Against an older database they
 * are skipped rather than failed, with the migration named in the reason.
 */
const skip = harness.pendingMigrationReason ?? undefined;

const { db, eq, schema } = harness;

/** Payer address for this run; the run tag makes every reservation key unique. */
const PAYER = `0x${harness.runTag}`;

/** The reservation key `derivePaymentKey` produces, spelled out rather than imported. */
function reservationKey(nonce: string): string {
  return `${TEST_NETWORK}:exact:${PAYER.toLowerCase()}:${nonce.toLowerCase()}`;
}

async function readChallengeFor(
  app: Express,
  path: string
): Promise<PaymentRequirements> {
  const response = await request(app).get(path).expect(402);
  return readAcceptedRequirement(response.headers);
}

function signPayment(
  accepted: PaymentRequirements,
  nonce: string,
  overrides: { signature?: string; validAfter?: string } = {}
): string {
  return encodePaymentSignature(
    buildEip3009Payload(accepted, { from: PAYER, nonce, ...overrides })
  );
}

function ledgerEntriesFor(userId: string) {
  return db
    .select()
    .from(schema.ledgerEntry)
    .where(eq(schema.ledgerEntry.userId, userId));
}

function receiptFor(paymentId: string) {
  return db
    .select()
    .from(schema.paymentReceipt)
    .where(eq(schema.paymentReceipt.paymentId, paymentId));
}

function balanceFor(userId: string) {
  return db
    .select()
    .from(schema.userBalance)
    .where(eq(schema.userBalance.userId, userId));
}

async function pricedApi(price: string, path = "/weather") {
  harness.upstream.reset();
  harness.facilitator.reset();
  return await harness.createApiFixture({
    baseUrl: harness.upstream.url,
    endpoints: [{ method: "GET", path, priceUsdc: price }],
  });
}

describe("gateway paid request path", () => {
  /**
   * P1-1: `$0.0001` at a 2.5% fee is one of the price points where rounding both
   * halves of the split independently created 0.000001 out of thin air. The
   * assertion is on exact equality, not on a tolerance.
   */
  it("settles a payment, returns the upstream body and credits the provider exactly", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;

    const accepted = await readChallengeFor(app, url);
    const nonce = randomNonce();

    const response = await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, nonce))
      .expect(200);

    assert.equal(response.body.ok, UPSTREAM_DEFAULT_BODY.ok);
    assert.equal(response.body.source, UPSTREAM_DEFAULT_BODY.source);
    assert.ok(
      response.headers["payment-response"],
      "a settled response must carry the PAYMENT-RESPONSE header"
    );
    assert.equal(harness.facilitator.calls.verify, 1);
    assert.equal(harness.facilitator.calls.settle, 1);
    assert.equal(harness.upstream.requests.length, 1);

    const receipt = firstRow(
      await receiptFor(reservationKey(nonce)),
      "payment receipt"
    );
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.txHash, TEST_TX_HASH);
    assert.equal(receipt.userId, fixture.userId);

    const entries = await ledgerEntriesFor(fixture.userId);
    assert.equal(entries.length, 1);
    const entry = firstRow(entries, "ledger entry");
    assert.equal(entry.type, "credit");
    assertMoneyEqual(entry.amount, "0.0001");
    assertMoneyEqual(entry.platformFee, "0.000003");
    assertMoneyEqual(entry.providerCredit, "0.000097");
    assertSplitIsExact(entry);

    const balance = firstRow(await balanceFor(fixture.userId), "user balance");
    assertMoneyEqual(balance.availableBalance, entry.providerCredit);
  });

  /**
   * P0-4 / P0-5: the reservation is derived from the payload and claimed before
   * any upstream work, so one signature buys exactly one response. Re-signing a
   * fresh payload over the same nonce — the attack the old client-supplied
   * `payment-identifier` header allowed — must not get past it either.
   */
  it("rejects a replayed payload, and a re-signed one over the same nonce", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;

    const accepted = await readChallengeFor(app, url);
    const nonce = randomNonce();
    const signature = signPayment(accepted, nonce);

    await request(app).get(url).set("payment-signature", signature).expect(200);
    assert.equal(harness.facilitator.calls.settle, 1);

    const replay = await request(app)
      .get(url)
      .set("payment-signature", signature)
      .expect(409);
    assert.match(replay.body.error, /already been used/i);

    const resigned = await request(app)
      .get(url)
      .set(
        "payment-signature",
        signPayment(accepted, nonce, {
          signature: `0x${"c".repeat(130)}`,
          validAfter: "12345",
        })
      )
      .expect(409);
    assert.match(resigned.body.error, /already been used/i);

    assert.equal(
      harness.facilitator.calls.settle,
      1,
      "a replay must never reach settlement"
    );
    assert.equal((await ledgerEntriesFor(fixture.userId)).length, 1);

    // A genuinely new payment still works.
    const secondNonce = randomNonce();
    await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, secondNonce))
      .expect(200);

    assert.equal(harness.facilitator.calls.settle, 2);
    const entries = await ledgerEntriesFor(fixture.userId);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assertSplitIsExact(entry);
    }

    const balance = firstRow(await balanceFor(fixture.userId), "user balance");
    assertMoneyEqual(balance.availableBalance, "0.000194");
  });

  /**
   * P0-5: verification is a stateless pass-through to the facilitator, so
   * without an atomic reservation N concurrent requests carrying one signature
   * all get served while only one can ever settle on-chain.
   */
  it("serves exactly one of five concurrent requests carrying the same payload", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;

    const accepted = await readChallengeFor(app, url);
    const signature = signPayment(accepted, randomNonce());

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).get(url).set("payment-signature", signature)
      )
    );

    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409, 409]);

    assert.equal(harness.facilitator.calls.settle, 1);
    assert.equal(
      harness.upstream.requests.length,
      1,
      "the provider must do one unit of work for one payment"
    );
    assert.equal((await ledgerEntriesFor(fixture.userId)).length, 1);
  });

  it("forwards a non-2xx upstream without settling, and still burns the payload", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    harness.upstream.respond = (_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "no such city" }));
    };

    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);
    const nonce = randomNonce();
    const signature = signPayment(accepted, nonce);

    const response = await request(app)
      .get(url)
      .set("payment-signature", signature)
      .expect(404);

    assert.deepEqual(response.body, { error: "no such city" });
    assert.equal(
      harness.facilitator.calls.settle,
      0,
      "nothing may settle when the upstream did not succeed"
    );
    assert.equal((await ledgerEntriesFor(fixture.userId)).length, 0);

    assert.equal(
      firstRow(await receiptFor(reservationKey(nonce)), "payment receipt")
        .status,
      "failed"
    );

    // The caller received the upstream body, so the payload is spent.
    await request(app).get(url).set("payment-signature", signature).expect(409);
    assert.equal(harness.upstream.requests.length, 1);
  });

  it("returns the settlement failure and credits nobody when the facilitator declines", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    harness.facilitator.settle = (facilitatorRequest) => ({
      success: false,
      errorReason: "insufficient_funds",
      errorMessage: "payer balance too low",
      transaction: "",
      network: facilitatorRequest.paymentRequirements.network,
    });

    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);
    const nonce = randomNonce();

    const response = await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, nonce));

    assert.notEqual(response.status, 200);
    assert.equal((await ledgerEntriesFor(fixture.userId)).length, 0);
    assert.equal(
      firstRow(await receiptFor(reservationKey(nonce)), "payment receipt")
        .status,
      "failed"
    );
  });

  /**
   * P2-1: across the 402 → sign → retry round trip the client pays the price it
   * was quoted. The ledger must record what actually settled, not whatever price
   * happens to be in the endpoint row by the time the credit is written.
   */
  it("credits the amount the facilitator reports as settled", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    harness.facilitator.settle = (facilitatorRequest) => ({
      success: true,
      transaction: TEST_TX_HASH,
      network: facilitatorRequest.paymentRequirements.network,
      // Half the authorized maximum, in atomic units.
      amount: "50",
    });

    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);

    await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, randomNonce()))
      .expect(200);

    const entry = firstRow(
      await ledgerEntriesFor(fixture.userId),
      "ledger entry"
    );
    assertMoneyEqual(entry.amount, "0.00005");
    assertSplitIsExact(entry);
  });

  /**
   * P1-5: the caller's own credentials must never reach a provider-controlled
   * upstream, on the paid path just as on any other.
   */
  it("strips caller credentials before calling the provider", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);

    await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, randomNonce()))
      .set("authorization", "Bearer super-secret")
      .set("cookie", "better-auth.session_token=leaked")
      .set("x-forwarded-for", "1.2.3.4")
      .set("x-trace", "keep-me")
      .expect(200);

    const forwarded = harness.upstream.requests.at(0);
    assert.ok(forwarded);
    for (const header of [
      "authorization",
      "cookie",
      "x-forwarded-for",
      "payment-signature",
    ]) {
      assert.equal(
        forwarded.headers[header],
        undefined,
        `${header} leaked upstream`
      );
    }
    assert.equal(forwarded.headers["x-trace"], "keep-me");
  });

  /**
   * P2-2: `content-encoding` describes bytes the caller never sees, because
   * `fetch` already decompressed them. A provider's `set-cookie` is dropped
   * outright — relayed, it would be set on the Zapx origin, letting a malicious
   * upstream overwrite a caller's session cookie for the whole site.
   */
  it("drops content-encoding and never relays the provider's cookies", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    const plaintext = JSON.stringify({ report: "x".repeat(64) });
    const compressed = gzipSync(plaintext);
    harness.upstream.respond = (_req, res) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(compressed.length),
        "set-cookie": ["a=1; Path=/", "b=2; Path=/; HttpOnly"],
      });
      res.end(compressed);
    };

    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);

    const response = await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, randomNonce()))
      .expect(200);

    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.text, plaintext);
    assert.equal(response.headers["set-cookie"], undefined);
  });

  /**
   * The reservation is burned, not released. Handing the payload back whenever
   * the upstream failed would make one signature an unbounded lever: the caller
   * influences whether the upstream errors, and nothing settles on that path.
   */
  it("burns the reservation when the upstream never answers, without settling", {
    skip,
  }, async () => {
    const fixture = await pricedApi("$0.0001");
    // Point the API at a port nothing is listening on.
    await db
      .update(schema.providerApi)
      .set({ baseUrl: "http://127.0.0.1:1/", updatedAt: new Date() })
      .where(eq(schema.providerApi.id, fixture.apiId));

    const app = harness.createApp();
    const url = `/gateway/${fixture.apiId}/weather`;
    const accepted = await readChallengeFor(app, url);
    const nonce = randomNonce();

    const response = await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, nonce))
      .expect(502);

    assert.match(response.body.error, /NOT settled/);
    assert.equal(harness.facilitator.calls.settle, 0);
    assert.equal((await ledgerEntriesFor(fixture.userId)).length, 0);
    assert.equal(
      firstRow(await receiptFor(reservationKey(nonce)), "payment receipt")
        .status,
      "failed",
      "the payload is spent even though nothing settled"
    );

    // Retrying the same payload is refused; a new signature is required.
    await request(app)
      .get(url)
      .set("payment-signature", signPayment(accepted, nonce))
      .expect(409);
  });
});
