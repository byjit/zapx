import { db } from "@turborepo-boilerplate/db";
import { paymentReceipt } from "@turborepo-boilerplate/db/schema/payment-receipt";
import { and, eq } from "drizzle-orm";

type ReservationInput = {
  paymentId: string;
  userId: string;
  apiId: string;
  endpointId: string;
  /** Decimal string of the amount the payment is required to cover. */
  amount: string;
  networkId: string;
};

/**
 * Claims a payment payload for exactly one request, before any upstream work.
 *
 * `x402ResourceServer.verifyPayment` is a stateless pass-through to the
 * facilitator — no nonce cache, no dedupe — so without this, N concurrent
 * requests carrying one signature all verify and all get served while EIP-3009's
 * on-chain nonce lets only one of them settle: the provider does N units of work
 * and is paid for one. The unique index on `payment_id` makes the claim atomic,
 * so the losers are rejected before the upstream is touched.
 *
 * Returns `false` when the payload was already used.
 */
export async function reservePayment(
  input: ReservationInput
): Promise<boolean> {
  const reserved = await db
    .insert(paymentReceipt)
    .values({
      paymentId: input.paymentId,
      userId: input.userId,
      apiId: input.apiId,
      endpointId: input.endpointId,
      amount: input.amount,
      networkId: input.networkId,
      status: "pending",
    })
    .onConflictDoNothing({ target: paymentReceipt.paymentId })
    .returning({ id: paymentReceipt.id });

  return reserved.length > 0;
}

/**
 * Gives a reservation back, so the same signed payload may be presented again.
 *
 * Only safe when the request delivered *nothing* to the caller — an upstream that
 * never produced a response. If any upstream bytes reached the caller the
 * reservation must be retained (see `markPaymentUnsettled`), otherwise an
 * endpoint whose useful content sits behind a non-2xx status could be replayed
 * from a single signature indefinitely.
 */
export async function releasePayment(paymentId: string): Promise<void> {
  await db
    .delete(paymentReceipt)
    .where(
      and(
        eq(paymentReceipt.paymentId, paymentId),
        eq(paymentReceipt.status, "pending")
      )
    );
}

/**
 * Burns a reservation without crediting anyone: the payload was spent on this
 * attempt but nothing settled on-chain, so nobody was charged. Retrying costs the
 * caller only a fresh signature.
 */
export async function markPaymentUnsettled(paymentId: string): Promise<void> {
  await db
    .update(paymentReceipt)
    .set({ status: "failed" })
    .where(
      and(
        eq(paymentReceipt.paymentId, paymentId),
        eq(paymentReceipt.status, "pending")
      )
    );
}
