import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { providerApi } from "@turborepo-boilerplate/db/schema/provider-api";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { and, count, eq, gte, lte, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

/**
 * Usage and revenue analytics, all derived from the ledger.
 *
 * Naming matters here (spec §14): `totalGrossVolume` is what callers paid,
 * `totalPlatformFees` is Zapx's cut, and `totalProviderCredits` is the
 * provider's actual revenue — the only figure a provider should read as theirs.
 */
export const analyticsRouter = router({
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get balance
    const [balance] = await db
      .select()
      .from(userBalance)
      .where(eq(userBalance.userId, userId))
      .limit(1);

    // Get totals from ledger
    const [totals] = await db
      .select({
        totalRequests: count(),
        totalGrossVolume: sum(ledgerEntry.amount),
        totalPlatformFees: sum(ledgerEntry.platformFee),
        totalProviderCredits: sum(ledgerEntry.providerCredit),
      })
      .from(ledgerEntry)
      .where(
        and(eq(ledgerEntry.userId, userId), eq(ledgerEntry.type, "credit"))
      );

    return {
      totalRequests: totals?.totalRequests ?? 0,
      totalGrossVolume: totals?.totalGrossVolume ?? "0",
      totalPlatformFees: totals?.totalPlatformFees ?? "0",
      totalProviderCredits: totals?.totalProviderCredits ?? "0",
      availableBalance: balance?.availableBalance ?? "0",
      pendingBalance: balance?.pendingBalance ?? "0",
      totalWithdrawn: balance?.totalWithdrawn ?? "0",
    };
  }),

  getUsageByApi: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(ledgerEntry.userId, ctx.session.user.id),
        eq(ledgerEntry.type, "credit"),
      ];

      if (input.from) conditions.push(gte(ledgerEntry.createdAt, input.from));
      if (input.to) conditions.push(lte(ledgerEntry.createdAt, input.to));

      const usage = await db
        .select({
          apiId: ledgerEntry.apiId,
          apiName: providerApi.name,
          requestCount: count(),
          totalGrossVolume: sum(ledgerEntry.amount),
          totalProviderCredits: sum(ledgerEntry.providerCredit),
        })
        .from(ledgerEntry)
        .leftJoin(providerApi, eq(ledgerEntry.apiId, providerApi.id))
        .where(and(...conditions))
        .groupBy(ledgerEntry.apiId, providerApi.name);

      return usage;
    }),

  getRevenueByPeriod: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        groupBy: z.enum(["day", "week", "month"]).default("day"),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(ledgerEntry.userId, ctx.session.user.id),
        eq(ledgerEntry.type, "credit"),
      ];

      if (input.from) conditions.push(gte(ledgerEntry.createdAt, input.from));
      if (input.to) conditions.push(lte(ledgerEntry.createdAt, input.to));

      const truncFn =
        input.groupBy === "month"
          ? sql`date_trunc('month', ${ledgerEntry.createdAt})`
          : input.groupBy === "week"
            ? sql`date_trunc('week', ${ledgerEntry.createdAt})`
            : sql`date_trunc('day', ${ledgerEntry.createdAt})`;

      const revenue = await db
        .select({
          period: truncFn.as("period"),
          requestCount: count(),
          totalGrossVolume: sum(ledgerEntry.amount),
          totalProviderCredits: sum(ledgerEntry.providerCredit),
          totalPlatformFees: sum(ledgerEntry.platformFee),
        })
        .from(ledgerEntry)
        .where(and(...conditions))
        .groupBy(truncFn)
        .orderBy(truncFn);

      return revenue;
    }),
});
