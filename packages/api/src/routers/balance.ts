import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const balanceRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [balance] = await db
      .select()
      .from(userBalance)
      .where(eq(userBalance.userId, ctx.session.user.id))
      .limit(1);

    // Edge case #17: Return a properly shaped default with all fields
    if (!balance) {
      return {
        id: null,
        userId: ctx.session.user.id,
        availableBalance: "0",
        pendingBalance: "0",
        totalWithdrawn: "0",
        createdAt: null,
        updatedAt: null,
      };
    }

    return balance;
  }),

  getLedger: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        type: z.enum(["credit", "debit", "withdrawal", "refund"]).optional(),
        apiId: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(ledgerEntry.userId, ctx.session.user.id)];

      if (input.type) {
        conditions.push(eq(ledgerEntry.type, input.type));
      }
      if (input.apiId) {
        conditions.push(eq(ledgerEntry.apiId, input.apiId));
      }
      if (input.from) {
        conditions.push(gte(ledgerEntry.createdAt, input.from));
      }
      if (input.to) {
        conditions.push(lte(ledgerEntry.createdAt, input.to));
      }

      const whereClause = and(...conditions);

      // Edge case #18: Run entries + count in parallel
      const [entries, [countResult]] = await Promise.all([
        db
          .select()
          .from(ledgerEntry)
          .where(whereClause)
          .orderBy(desc(ledgerEntry.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ totalCount: count() }).from(ledgerEntry).where(whereClause),
      ]);

      return {
        entries,
        totalCount: countResult?.totalCount ?? 0,
      };
    }),
});
