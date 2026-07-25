import { createId } from "@paralleldrive/cuid2";
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiId: text("api_id").references(() => providerApi.id, {
      onDelete: "set null",
    }),
    endpointId: text("endpoint_id").references(() => providerEndpoint.id, {
      onDelete: "set null",
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
  ]
);

export const LedgerEntrySelectSchema = createSelectSchema(ledgerEntry);
export const LedgerEntryInsertSchema = createInsertSchema(ledgerEntry);

export type LedgerEntry = typeof ledgerEntry;
export type LedgerEntrySelect = z.infer<typeof LedgerEntrySelectSchema>;
export type LedgerEntryInsert = z.infer<typeof LedgerEntryInsertSchema>;
