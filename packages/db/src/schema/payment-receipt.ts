import { createId } from "@paralleldrive/cuid2";
import {
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

export const paymentReceiptStatus = pgEnum("payment_receipt_status", [
  "pending",
  "settled",
  "failed",
]);

export const paymentReceipt = pgTable(
  "payment_receipt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    paymentId: text("payment_id").notNull(),
    requestId: text("request_id"),
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
  ]
);

export const PaymentReceiptSelectSchema = createSelectSchema(paymentReceipt);
export const PaymentReceiptInsertSchema = createInsertSchema(paymentReceipt);

export type PaymentReceipt = typeof paymentReceipt;
export type PaymentReceiptSelect = z.infer<typeof PaymentReceiptSelectSchema>;
export type PaymentReceiptInsert = z.infer<typeof PaymentReceiptInsertSchema>;
