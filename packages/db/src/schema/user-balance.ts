import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
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

export const userBalance = pgTable(
  "user_balance",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    availableBalance: numeric("available_balance", {
      precision: 20,
      scale: 6,
    })
      .notNull()
      .default("0"),
    pendingBalance: numeric("pending_balance", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    totalWithdrawn: numeric("total_withdrawn", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_balance_user_id_idx").on(table.userId),
    // Custodied money can never go negative — enforced at the database level so
    // no code path (or manual query) can overdraw a provider.
    check(
      "user_balance_available_non_negative",
      sql`${table.availableBalance} >= 0`
    ),
    check(
      "user_balance_pending_non_negative",
      sql`${table.pendingBalance} >= 0`
    ),
    check(
      "user_balance_withdrawn_non_negative",
      sql`${table.totalWithdrawn} >= 0`
    ),
  ]
);

export const UserBalanceSelectSchema = createSelectSchema(userBalance);
export const UserBalanceInsertSchema = createInsertSchema(userBalance);
export const UserBalanceUpdateSchema = createUpdateSchema(userBalance);

export type UserBalance = typeof userBalance;
export type UserBalanceSelect = z.infer<typeof UserBalanceSelectSchema>;
export type UserBalanceInsert = z.infer<typeof UserBalanceInsertSchema>;
export type UserBalanceUpdate = z.infer<typeof UserBalanceUpdateSchema>;
