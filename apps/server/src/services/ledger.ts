import { eq, sql } from "drizzle-orm";
import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";

interface CreditProviderInput {
  userId: string;
  apiId: string;
  endpointId: string;
  amount: string; // decimal string e.g. "0.001"
  platformFeePercent: number;
  requestId: string;
  txHash: string;
}

/**
 * All arithmetic is done in PostgreSQL using the numeric type
 * to avoid IEEE 754 floating-point rounding errors.
 */
export async function creditProvider(input: CreditProviderInput) {
  // Compute fee and credit in SQL to avoid floating-point errors
  const feePercent = input.platformFeePercent.toString();

  return db.transaction(async (tx) => {
    // Use SQL to compute platformFee and providerCredit with numeric precision
    const computedResult = await tx.execute(sql`
      SELECT
        (${input.amount}::numeric(20,6) * ${feePercent}::numeric / 100)::numeric(20,6) AS platform_fee,
        (${input.amount}::numeric(20,6) - (${input.amount}::numeric(20,6) * ${feePercent}::numeric / 100))::numeric(20,6) AS provider_credit
    `);
    const computed = computedResult.rows[0] as {
      platform_fee: string;
      provider_credit: string;
    };

    const platformFee = computed.platform_fee;
    const providerCredit = computed.provider_credit;

    // Insert append-only ledger entry
    const [entry] = await tx
      .insert(ledgerEntry)
      .values({
        userId: input.userId,
        apiId: input.apiId,
        endpointId: input.endpointId,
        type: "credit",
        amount: input.amount,
        platformFee,
        providerCredit,
        requestId: input.requestId,
        paymentTxHash: input.txHash,
      })
      .returning();

    // Upsert user balance — arithmetic stays in SQL
    await tx
      .insert(userBalance)
      .values({
        userId: input.userId,
        availableBalance: providerCredit,
      })
      .onConflictDoUpdate({
        target: userBalance.userId,
        set: {
          availableBalance: sql`${userBalance.availableBalance}::numeric + ${providerCredit}::numeric`,
          updatedAt: new Date(),
        },
      });

    return entry;
  });
}

interface DebitWithdrawalInput {
  userId: string;
  amount: string; // decimal string
  requestId: string;
}

export async function debitWithdrawal(input: DebitWithdrawalInput) {
  return db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE to prevent concurrent withdrawal races
    const balanceResult = await tx.execute(sql`
      SELECT user_id, available_balance
      FROM user_balance
      WHERE user_id = ${input.userId}
      FOR UPDATE
    `);
    const balance = balanceResult.rows[0] as {
      user_id: string;
      available_balance: string;
    } | undefined;

    if (
      !balance ||
      Number.parseFloat(balance.available_balance) <
        Number.parseFloat(input.amount)
    ) {
      throw new Error("Insufficient balance");
    }

    // Insert ledger entry
    const [entry] = await tx
      .insert(ledgerEntry)
      .values({
        userId: input.userId,
        type: "withdrawal",
        amount: input.amount,
        requestId: input.requestId,
        description: "Withdrawal request",
      })
      .returning();

    // Update balance — all arithmetic in SQL
    await tx
      .update(userBalance)
      .set({
        availableBalance: sql`${userBalance.availableBalance}::numeric - ${input.amount}::numeric`,
        pendingBalance: sql`${userBalance.pendingBalance}::numeric + ${input.amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(userBalance.userId, input.userId));

    return entry;
  });
}

export async function completeWithdrawal(userId: string, amount: string) {
  await db
    .update(userBalance)
    .set({
      pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${amount}::numeric`,
      totalWithdrawn: sql`${userBalance.totalWithdrawn}::numeric + ${amount}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(userBalance.userId, userId));
}

export async function refundWithdrawal(userId: string, amount: string) {
  await db
    .update(userBalance)
    .set({
      pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${amount}::numeric`,
      availableBalance: sql`${userBalance.availableBalance}::numeric + ${amount}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(userBalance.userId, userId));
}
