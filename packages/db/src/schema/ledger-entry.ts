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

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "credit",
  "debit",
  "withdrawal",
  "refund",
]);

/**
 * The money trail — append-only and auditable (spec §8).
 *
 * Every reference uses `restrict` so that no delete elsewhere in the system can
 * erase or rewrite a committed entry: deleting a user, an API or an endpoint is
 * blocked while ledger history exists for it. Users are banned, not deleted.
 */
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    apiId: text("api_id").references(() => providerApi.id, {
      onDelete: "restrict",
    }),
    endpointId: text("endpoint_id").references(() => providerEndpoint.id, {
      onDelete: "restrict",
    }),
    type: ledgerEntryType("type").notNull(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    platformFee: numeric("platform_fee", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    providerCredit: numeric("provider_credit", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    requestId: text("request_id"),
    paymentTxHash: text("payment_tx_hash"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ledger_entry_user_id_idx").on(table.userId),
    index("ledger_entry_api_id_idx").on(table.apiId),
    index("ledger_entry_type_idx").on(table.type),
    index("ledger_entry_created_at_idx").on(table.createdAt),
    // Spec §9: each payment is linked to a unique request_id. Scoped to credits
    // so a withdrawal and its refund can share the withdrawal request id.
    uniqueIndex("ledger_entry_credit_request_id_idx")
      .on(table.requestId)
      .where(sql`${table.type} = 'credit'`),
    check("ledger_entry_amount_non_negative", sql`${table.amount} >= 0`),
    check("ledger_entry_fee_non_negative", sql`${table.platformFee} >= 0`),
    check(
      "ledger_entry_credit_non_negative",
      sql`${table.providerCredit} >= 0`
    ),
    // A credit may never create or destroy money: the split must be exact.
    check(
      "ledger_entry_credit_split_exact",
      sql`${table.type} <> 'credit' OR ${table.platformFee} + ${table.providerCredit} = ${table.amount}`
    ),
  ]
);

export const LedgerEntrySelectSchema = createSelectSchema(ledgerEntry);
export const LedgerEntryInsertSchema = createInsertSchema(ledgerEntry);

export type LedgerEntry = typeof ledgerEntry;
export type LedgerEntrySelect = z.infer<typeof LedgerEntrySelectSchema>;
export type LedgerEntryInsert = z.infer<typeof LedgerEntryInsertSchema>;
