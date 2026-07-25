import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { startGatewayHarness } from "./helpers/gateway-harness";
import { assertMoneyEqual, assertSplitIsExact } from "./helpers/money";
import { firstRow, requireEntry } from "./helpers/rows";

const harness = await startGatewayHarness();

after(() => harness.close());

const { db, eq, schema, sql } = harness;
const { creditProvider } = harness.ledger;

/**
 * Seeds the reservation `creditProvider` claims.
 *
 * Written as raw SQL naming only the columns that predate
 * `0003_glossy_nightmare.sql`, so the ledger cases run against an older database
 * even though the gateway's own reservation write cannot.
 */
async function reserve(paymentId: string, amount: string): Promise<void> {
  await db.execute(
    sql`insert into payment_receipt (id, payment_id, amount, status)
        values (${randomUUID()}, ${paymentId}, ${amount}, 'pending')`
  );
}

function ledgerEntriesFor(userId: string) {
  return db
    .select()
    .from(schema.ledgerEntry)
    .where(eq(schema.ledgerEntry.userId, userId));
}

function balanceFor(userId: string) {
  return db
    .select()
    .from(schema.userBalance)
    .where(eq(schema.userBalance.userId, userId));
}

async function fixture() {
  return await harness.createApiFixture({
    baseUrl: "https://api.example.com/v1",
    endpoints: [{ method: "GET", path: "/weather", priceUsdc: "$0.001" }],
  });
}

describe("creditProvider", () => {
  /**
   * P1-1: rounding both halves of the split independently made both round up on
   * a half-ULP tie, so `platform_fee + provider_credit` exceeded `amount` by
   * 0.000001 on every request at these price points — money created, never
   * destroyed, so reconciliation could never close.
   */
  it("splits the fee exactly at the price points that used to drift", async () => {
    const cases = [
      {
        amount: "0.0001",
        feePercent: 2.5,
        fee: "0.000003",
        credit: "0.000097",
      },
      {
        amount: "0.0025",
        feePercent: 12.5,
        fee: "0.000313",
        credit: "0.002187",
      },
      {
        amount: "0.00035",
        feePercent: 15,
        fee: "0.000053",
        credit: "0.000297",
      },
      {
        amount: "0.0333",
        feePercent: 7.5,
        fee: "0.002498",
        credit: "0.030802",
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const api = await fixture();
      const paymentId = `zapx-test-split-${harness.runTag}-${index}`;
      await reserve(paymentId, testCase.amount);

      const result = await creditProvider({
        paymentId,
        userId: api.userId,
        apiId: api.apiId,
        endpointId: requireEntry(
          api.endpointIds,
          "GET /weather",
          "endpoint id"
        ),
        amount: testCase.amount,
        platformFeePercent: testCase.feePercent,
        txHash: `0x${"1".repeat(64)}`,
        networkId: "eip155:84532",
      });

      assert.equal(result, "credited");

      const entry = firstRow(
        await ledgerEntriesFor(api.userId),
        "ledger entry"
      );
      assertMoneyEqual(entry.amount, testCase.amount);
      assertMoneyEqual(
        entry.platformFee,
        testCase.fee,
        `platform fee for ${testCase.amount} at ${testCase.feePercent}%`
      );
      assertMoneyEqual(
        entry.providerCredit,
        testCase.credit,
        `provider credit for ${testCase.amount} at ${testCase.feePercent}%`
      );
      assertSplitIsExact(entry);
    }
  });

  it("handles the boundary fee percentages without losing a unit", async () => {
    for (const [index, feePercent] of [0, 100].entries()) {
      const api = await fixture();
      const paymentId = `zapx-test-bounds-${harness.runTag}-${index}`;
      await reserve(paymentId, "0.0001");

      await creditProvider({
        paymentId,
        userId: api.userId,
        apiId: api.apiId,
        endpointId: requireEntry(
          api.endpointIds,
          "GET /weather",
          "endpoint id"
        ),
        amount: "0.0001",
        platformFeePercent: feePercent,
        txHash: `0x${"2".repeat(64)}`,
        networkId: "eip155:84532",
      });

      const entry = firstRow(
        await ledgerEntriesFor(api.userId),
        "ledger entry"
      );
      assertSplitIsExact(entry);
      assertMoneyEqual(entry.providerCredit, feePercent === 0 ? "0.0001" : "0");
    }
  });

  /**
   * P1-2: the receipt used to be written outside the crediting transaction, so
   * a retry after a lost commit response — or a concurrent duplicate — credited
   * the provider twice. The reservation is now claimed inside the transaction,
   * guarded on `status = 'pending'`.
   */
  it("is idempotent: a second call credits nothing", async () => {
    const api = await fixture();
    const paymentId = `zapx-test-idempotent-${harness.runTag}`;
    await reserve(paymentId, "0.0001");

    const input = {
      paymentId,
      userId: api.userId,
      apiId: api.apiId,
      endpointId: requireEntry(api.endpointIds, "GET /weather", "endpoint id"),
      amount: "0.0001",
      platformFeePercent: 2.5,
      txHash: `0x${"3".repeat(64)}`,
      networkId: "eip155:84532",
    };

    assert.equal(await creditProvider(input), "credited");

    const afterFirst = await ledgerEntriesFor(api.userId);
    const balanceAfterFirst = firstRow(
      await balanceFor(api.userId),
      "user balance"
    );
    assert.equal(afterFirst.length, 1);
    assertMoneyEqual(balanceAfterFirst.availableBalance, "0.000097");

    assert.equal(await creditProvider(input), "already-settled");

    const afterSecond = await ledgerEntriesFor(api.userId);
    const balanceAfterSecond = firstRow(
      await balanceFor(api.userId),
      "user balance"
    );
    assert.equal(
      afterSecond.length,
      1,
      "no second ledger entry may be written"
    );
    assert.equal(
      firstRow(afterSecond, "ledger entry").id,
      firstRow(afterFirst, "ledger entry").id
    );
    assertMoneyEqual(
      balanceAfterSecond.availableBalance,
      balanceAfterFirst.availableBalance
    );
  });

  it("credits nothing when there is no pending reservation to claim", async () => {
    const api = await fixture();

    const result = await creditProvider({
      paymentId: `zapx-test-unreserved-${harness.runTag}`,
      userId: api.userId,
      apiId: api.apiId,
      endpointId: requireEntry(api.endpointIds, "GET /weather", "endpoint id"),
      amount: "0.0001",
      platformFeePercent: 2.5,
      txHash: `0x${"4".repeat(64)}`,
      networkId: "eip155:84532",
    });

    assert.equal(result, "already-settled");
    assert.equal((await ledgerEntriesFor(api.userId)).length, 0);
    assert.equal((await balanceFor(api.userId)).length, 0);
  });

  it("marks the reservation settled and records the settlement facts", async () => {
    const api = await fixture();
    const paymentId = `zapx-test-receipt-${harness.runTag}`;
    await reserve(paymentId, "0.0001");

    await creditProvider({
      paymentId,
      userId: api.userId,
      apiId: api.apiId,
      endpointId: requireEntry(api.endpointIds, "GET /weather", "endpoint id"),
      amount: "0.0001",
      platformFeePercent: 2.5,
      txHash: `0x${"5".repeat(64)}`,
      networkId: "eip155:8453",
    });

    // Raw SQL, naming only pre-0003 columns, so this runs on either schema.
    const { rows } = await db.execute<{
      status: string;
      tx_hash: string;
      network_id: string;
      request_id: string;
    }>(
      sql`select status, tx_hash, network_id, request_id
          from payment_receipt where payment_id = ${paymentId}`
    );

    assert.equal(rows.length, 1);
    const receipt = firstRow(rows, "payment receipt");
    assert.equal(receipt.status, "settled");
    assert.equal(receipt.tx_hash, `0x${"5".repeat(64)}`);
    assert.equal(receipt.network_id, "eip155:8453");
    assert.equal(receipt.request_id, paymentId);
  });

  it("accumulates the provider's available balance across payments", async () => {
    const api = await fixture();

    for (const index of [0, 1, 2]) {
      const paymentId = `zapx-test-accumulate-${harness.runTag}-${index}`;
      await reserve(paymentId, "0.0001");
      await creditProvider({
        paymentId,
        userId: api.userId,
        apiId: api.apiId,
        endpointId: requireEntry(
          api.endpointIds,
          "GET /weather",
          "endpoint id"
        ),
        amount: "0.0001",
        platformFeePercent: 2.5,
        txHash: `0x${"6".repeat(64)}`,
        networkId: "eip155:84532",
      });
    }

    const balance = firstRow(await balanceFor(api.userId), "user balance");
    assertMoneyEqual(balance.availableBalance, "0.000291");
  });
});
