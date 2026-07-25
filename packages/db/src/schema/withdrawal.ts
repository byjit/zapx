import { createId } from "@paralleldrive/cuid2";
import {
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

export const withdrawalRequest = pgTable(
  "withdrawal_request",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    walletAddress: text("wallet_address").notNull(),
    status: withdrawalRequestStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [
    index("withdrawal_request_user_id_idx").on(table.userId),
    index("withdrawal_request_status_idx").on(table.status),
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
