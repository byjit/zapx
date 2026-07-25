import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { paymentReceipt } from "@turborepo-boilerplate/db/schema/payment-receipt";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { and, eq, sql } from "drizzle-orm";

interface CreditProviderInput {
  /** Reservation key from `payment_receipt`, derived from the payment payload. */
  paymentId: string;
  userId: string;
  apiId: string;
  endpointId: string;
  /** Decimal string of the amount actually settled, e.g. "0.001". */
  amount: string;
  platformFeePercent: number;
  txHash: string;
  networkId: string;
}

/**
 * `credited` — this call wrote the ledger entry.
 * `already-settled` — the reservation was no longer `pending`, so some earlier
 * attempt already credited it (or it was marked failed). Nothing was written.
 */
export type CreditProviderResult = "credited" | "already-settled";

/**
 * Credits a provider for one settled payment.
 *
 * Two invariants make this safe to retry:
 *
 * 1. **Exactly once.** The payment's reservation row is claimed inside the same
 *    transaction as the ledger write, guarded on `status = 'pending'`. A second
 *    attempt — a concurrent duplicate, or a retry after a lost commit response —
 *    finds nothing to claim and writes nothing. A `settled` receipt therefore
 *    always implies "the provider was credited", and a `pending` one that
 *    outlives its request is a genuine reconciliation exception.
 *
 * 2. **The split is exact.** The provider's credit is derived from the *rounded*
 *    platform fee rather than rounded independently, so `platform_fee +
 *    provider_credit = amount` always holds. Rounding both halves separately made
 *    both round up on a half-ULP tie, creating a fraction of a cent out of thin
 *    air on every request at those price points.
 *
 * All arithmetic stays in PostgreSQL `numeric` to avoid IEEE-754 drift.
 */
export async function creditProvider(
  input: CreditProviderInput
): Promise<CreditProviderResult> {
  const feePercent = input.platformFeePercent.toString();
  // `numeric(20,6)` matches the stored `amount` exactly, so the split is derived
  // from the same value the ledger row holds — the DB-level equality check on
  // `platform_fee + provider_credit = amount` can never trip.
  const amountSql = sql`${input.amount}::numeric(20,6)`;
  const platformFeeSql = sql`round(${amountSql} * ${feePercent}::numeric / 100, 6)`;

  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(paymentReceipt)
      .set({
        status: "settled",
        requestId: input.paymentId,
        txHash: input.txHash || null,
        networkId: input.networkId,
        amount: input.amount,
      })
      .where(
        and(
          eq(paymentReceipt.paymentId, input.paymentId),
          eq(paymentReceipt.status, "pending")
        )
      )
      .returning({ id: paymentReceipt.id });

    if (claimed.length === 0) {
      return "already-settled";
    }

    // Append-only ledger entry. `provider_credit` is derived from the rounded
    // fee in the same expression, so the two can never disagree.
    const [entry] = await tx
      .insert(ledgerEntry)
      .values({
        userId: input.userId,
        apiId: input.apiId,
        endpointId: input.endpointId,
        type: "credit",
        amount: input.amount,
        platformFee: platformFeeSql,
        providerCredit: sql`${amountSql} - ${platformFeeSql}`,
        requestId: input.paymentId,
        paymentTxHash: input.txHash,
      })
      .returning();

    if (!entry) {
      throw new Error("Failed to append ledger entry");
    }

    await tx
      .insert(userBalance)
      .values({
        userId: input.userId,
        availableBalance: entry.providerCredit,
      })
      .onConflictDoUpdate({
        target: userBalance.userId,
        set: {
          availableBalance: sql`${userBalance.availableBalance}::numeric + ${entry.providerCredit}::numeric`,
          updatedAt: new Date(),
        },
      });

    return "credited";
  });
}
