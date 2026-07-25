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
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";
import { user } from "./auth";

export const withdrawalRequestStatus = pgEnum("withdrawal_request_status", [
  "pending",
  "approved",
  "rejected",
  "completed",
]);

/**
 * Payout requests. Statuses follow the real-world order (spec §6.6):
 * `pending` → `approved` (operator cleared it) → `completed` (USDC actually
 * sent, `payoutTxHash` recorded), or `pending` → `rejected` (funds refunded).
 * Funds only leave `pending_balance` on completion.
 */
export const withdrawalRequest = pgTable(
  "withdrawal_request",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    walletAddress: text("wallet_address").notNull(),
    status: withdrawalRequestStatus("status").notNull().default("pending"),
    payoutTxHash: text("payout_tx_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("withdrawal_request_user_id_idx").on(table.userId),
    index("withdrawal_request_status_idx").on(table.status),
    check("withdrawal_request_amount_positive", sql`${table.amount} > 0`),
  ]
);

export const WithdrawalRequestSelectSchema =
  createSelectSchema(withdrawalRequest);
export const WithdrawalRequestInsertSchema =
  createInsertSchema(withdrawalRequest);
export const WithdrawalRequestUpdateSchema =
  createUpdateSchema(withdrawalRequest);

export type WithdrawalRequest = typeof withdrawalRequest;
export type WithdrawalRequestSelect = z.infer<
  typeof WithdrawalRequestSelectSchema
>;
export type WithdrawalRequestInsert = z.infer<
  typeof WithdrawalRequestInsertSchema
>;
export type WithdrawalRequestUpdate = z.infer<
  typeof WithdrawalRequestUpdateSchema
>;
