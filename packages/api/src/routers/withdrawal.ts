import { TRPCError } from "@trpc/server";
import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { withdrawalRequest } from "@turborepo-boilerplate/db/schema/withdrawal";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

const MINIMUM_WITHDRAWAL_AMOUNT = 1.0; // $1.00 minimum

export const withdrawalRouter = router({
  request: protectedProcedure
    .input(
      z.object({
        amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid amount"),
        walletAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Edge case #20: enforce the minimum. A float comparison is exact enough
      // against a whole-dollar threshold; the balance comparison below is not,
      // and stays in SQL.
      if (Number.parseFloat(input.amount) < MINIMUM_WITHDRAWAL_AMOUNT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum withdrawal amount is $${MINIMUM_WITHDRAWAL_AMOUNT.toFixed(2)}`,
        });
      }

      return db.transaction(async (tx) => {
        // Edge case #3 & #15: `SELECT … FOR UPDATE` serializes concurrent
        // withdrawal requests. The sufficiency test lives in the predicate so it
        // runs on the exact `numeric` values and is re-evaluated after the lock
        // is taken — comparing parsed floats in JS could clear a withdrawal a
        // hair larger than the balance, which the database's non-negative
        // constraint would then reject with an opaque error.
        const balanceResult = await tx.execute(sql`
          SELECT user_id
          FROM user_balance
          WHERE user_id = ${userId}
            AND available_balance >= ${input.amount}::numeric(20,6)
          FOR UPDATE
        `);

        if (balanceResult.rows.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Insufficient balance",
          });
        }

        // Create withdrawal request
        const [withdrawal] = await tx
          .insert(withdrawalRequest)
          .values({
            userId,
            amount: input.amount,
            walletAddress: input.walletAddress,
            status: "pending",
          })
          .returning();

        // Deduct from available, add to pending — arithmetic in SQL
        await tx
          .update(userBalance)
          .set({
            availableBalance: sql`${userBalance.availableBalance}::numeric - ${input.amount}::numeric`,
            pendingBalance: sql`${userBalance.pendingBalance}::numeric + ${input.amount}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(userBalance.userId, userId));

        // Append ledger entry
        await tx.insert(ledgerEntry).values({
          userId,
          type: "withdrawal",
          amount: input.amount,
          requestId: withdrawal!.id,
          description: `Withdrawal to ${input.walletAddress}`,
        });

        return withdrawal;
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(withdrawalRequest)
        .where(eq(withdrawalRequest.userId, ctx.session.user.id))
        .orderBy(desc(withdrawalRequest.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
});
