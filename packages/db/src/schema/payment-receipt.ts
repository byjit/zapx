import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type z from "zod";
import { user } from "./auth";
import { providerApi } from "./provider-api";
import { providerEndpoint } from "./provider-endpoint";

export const paymentReceiptStatus = pgEnum("payment_receipt_status", [
  "pending",
  "settled",
  "failed",
]);

/**
 * One row per payment payload the gateway has accepted — the replay guard and
 * the settlement audit trail (spec §9).
 *
 * `paymentId` is derived from the payment payload itself (the EIP-3009 nonce, or
 * the client's payment-identifier extension value when present), never from a
 * client-supplied header. The unique index on it is what makes the reservation
 * atomic: the row is inserted *before* the upstream call, so a replayed payload
 * loses the race and is rejected.
 *
 * Status transitions: `pending` (reserved) → `settled` (on-chain settlement
 * succeeded *and* the provider was credited, in one transaction) or `failed`.
 * A `pending` row that outlives its request is the reconciliation queue, which
 * is why the owning user/api/endpoint are recorded up front.
 */
export const paymentReceipt = pgTable(
  "payment_receipt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    paymentId: text("payment_id").notNull(),
    requestId: text("request_id"),
    userId: text("user_id").references(() => user.id, { onDelete: "restrict" }),
    apiId: text("api_id").references(() => providerApi.id, {
      onDelete: "restrict",
    }),
    endpointId: text("endpoint_id").references(() => providerEndpoint.id, {
      onDelete: "restrict",
    }),
    txHash: text("tx_hash"),
    networkId: text("network_id"),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    status: paymentReceiptStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_receipt_payment_id_idx").on(table.paymentId),
    index("payment_receipt_tx_hash_idx").on(table.txHash),
    index("payment_receipt_status_idx").on(table.status),
    index("payment_receipt_user_id_idx").on(table.userId),
    check("payment_receipt_amount_non_negative", sql`${table.amount} >= 0`),
  ]
);

export const PaymentReceiptSelectSchema = createSelectSchema(paymentReceipt);
export const PaymentReceiptInsertSchema = createInsertSchema(paymentReceipt);

export type PaymentReceipt = typeof paymentReceipt;
export type PaymentReceiptSelect = z.infer<typeof PaymentReceiptSelectSchema>;
export type PaymentReceiptInsert = z.infer<typeof PaymentReceiptInsertSchema>;
