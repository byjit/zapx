import { TRPCError } from "@trpc/server";
import { auth } from "@turborepo-boilerplate/auth";
import { db } from "@turborepo-boilerplate/db";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { paymentReceipt } from "@turborepo-boilerplate/db/schema/payment-receipt";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { withdrawalRequest } from "@turborepo-boilerplate/db/schema/withdrawal";
import { fromNodeHeaders } from "better-auth/node";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../index";

type LockedWithdrawal = {
  id: string;
  user_id: string;
  amount: string;
  status: string;
};

type WithdrawalTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Locks a withdrawal row and asserts it is in one of the statuses the caller may
 * legally transition from. Shared by every admin transition so the lock and the
 * guard can never drift apart (no double approval, rejection or payout).
 */
async function lockWithdrawal(
  tx: WithdrawalTransaction,
  id: string,
  allowedStatuses: readonly string[]
): Promise<LockedWithdrawal> {
  const result = await tx.execute(sql`
    SELECT id, user_id, amount, status
    FROM withdrawal_request
    WHERE id = ${id}
    FOR UPDATE
  `);
  const withdrawal = result.rows[0] as LockedWithdrawal | undefined;

  if (!withdrawal) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Withdrawal not found",
    });
  }

  if (!allowedStatuses.includes(withdrawal.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot perform this action on a withdrawal with status: ${withdrawal.status}`,
    });
  }

  return withdrawal;
}

/**
 * Applies a balance change, failing loudly if no balance row was touched — a
 * silent no-op here would leave custodied money unaccounted for.
 */
async function updateBalanceOrThrow(
  tx: WithdrawalTransaction,
  userId: string,
  set: Parameters<ReturnType<WithdrawalTransaction["update"]>["set"]>[0]
) {
  const updated = await tx
    .update(userBalance)
    .set(set)
    .where(eq(userBalance.userId, userId))
    .returning({ userId: userBalance.userId });

  if (updated.length === 0) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No balance record found for this provider",
    });
  }
}

/**
 * Admin procedures for user management and the manual payout queue.
 * Every procedure is gated by `adminProcedure`.
 */
export const adminRouter = router({
  /**
   * List all users with pagination, search, filter, and sort
   */
  listUsers: adminProcedure
    .input(
      z.object({
        searchValue: z.string().optional(),
        searchField: z.enum(["email", "name"]).optional(),
        searchOperator: z
          .enum(["contains", "starts_with", "ends_with"])
          .optional(),
        limit: z.number().min(1).max(100).optional().default(10),
        offset: z.number().min(0).optional().default(0),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        filterField: z.string().optional(),
        filterValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
        filterOperator: z
          .enum(["eq", "ne", "lt", "lte", "gt", "gte"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        // Call Better Auth admin API
        const result = await auth.api.listUsers({
          query: {
            searchValue: input.searchValue,
            searchField: input.searchField,
            searchOperator: input.searchOperator,
            limit: input.limit.toString(),
            offset: input.offset.toString(),
            sortBy: input.sortBy,
            sortDirection: input.sortDirection,
            filterField: input.filterField,
            filterValue: input.filterValue?.toString(),
            filterOperator: input.filterOperator,
          },
          headers: fromNodeHeaders(ctx.headers),
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
          cause: error,
        });
      }
    }),

  /**
   * Impersonate a user (create session as that user)
   */
  impersonateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await auth.api.impersonateUser({
          body: {
            userId: input.userId,
          },
          headers: fromNodeHeaders(ctx.headers),
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Failed to impersonate user",
          cause: error,
        });
      }
    }),

  /**
   * Stop impersonating and return to the admin session.
   *
   * Deliberately not `adminProcedure`: during impersonation the session user *is*
   * the impersonated user, so an admin gate here would reject the one caller who
   * needs it. Better Auth authorizes this itself by requiring the session to
   * carry `impersonatedBy`.
   */
  stopImpersonating: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await auth.api.stopImpersonating({
        headers: fromNodeHeaders(ctx.headers),
      });

      return { success: true };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to stop impersonating",
        cause: error,
      });
    }
  }),

  /**
   * Remove a user from the database.
   *
   * Refused once the user has ledger history: deleting them would take the money
   * trail with them, and the platform may still custody funds on their behalf.
   * Ban instead — `banUser` already blocks their gateway traffic.
   */
  removeUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Both tables reference `user` with `ON DELETE RESTRICT`, so either one is
      // enough to make the delete fail — check both to explain why instead of
      // surfacing a raw foreign-key error.
      const [[existingEntry], [existingReceipt]] = await Promise.all([
        db
          .select({ id: ledgerEntry.id })
          .from(ledgerEntry)
          .where(eq(ledgerEntry.userId, input.userId))
          .limit(1),
        db
          .select({ id: paymentReceipt.id })
          .from(paymentReceipt)
          .where(eq(paymentReceipt.userId, input.userId))
          .limit(1),
      ]);

      if (existingEntry ?? existingReceipt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This user has financial history and cannot be deleted. Ban the user instead to preserve the audit trail.",
        });
      }

      try {
        const result = await auth.api.removeUser({
          body: {
            userId: input.userId,
          },
          headers: fromNodeHeaders(ctx.headers),
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Failed to remove user",
          cause: error,
        });
      }
    }),

  /**
   * Ban a user
   */
  banUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        banReason: z.string().optional(),
        banExpiresIn: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.banUser({
          body: {
            userId: input.userId,
            banReason: input.banReason,
            banExpiresIn: input.banExpiresIn,
          },
          headers: fromNodeHeaders(ctx.headers),
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Failed to ban user",
          cause: error,
        });
      }
    }),

  /**
   * Unban a user
   */
  unbanUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.unbanUser({
          body: {
            userId: input.userId,
          },
          headers: fromNodeHeaders(ctx.headers),
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Failed to unban user",
          cause: error,
        });
      }
    }),

  /**
   * List all withdrawal requests (admin)
   */
  listWithdrawals: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected", "completed"])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return db
        .select()
        .from(withdrawalRequest)
        .where(
          input.status ? eq(withdrawalRequest.status, input.status) : undefined
        )
        .orderBy(desc(withdrawalRequest.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Approve a withdrawal request (admin).
   *
   * Approval only clears the request for payout. The funds stay in
   * `pending_balance` until `completeWithdrawal` records the transfer that
   * actually happened (spec §6.6: payout executed → ledger updated).
   */
  approveWithdrawal: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        await lockWithdrawal(tx, input.id, ["pending"]);

        await tx
          .update(withdrawalRequest)
          .set({ status: "approved", processedAt: new Date() })
          .where(eq(withdrawalRequest.id, input.id));

        return { success: true };
      });
    }),

  /**
   * Mark an approved withdrawal as paid out (admin).
   *
   * Called once the operator has actually sent the USDC, so `total_withdrawn`
   * can never record money that was never sent.
   */
  completeWithdrawal: adminProcedure
    .input(
      z.object({
        id: z.string(),
        payoutTxHash: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const withdrawal = await lockWithdrawal(tx, input.id, ["approved"]);

        await tx
          .update(withdrawalRequest)
          .set({
            status: "completed",
            payoutTxHash: input.payoutTxHash?.trim() || null,
            completedAt: new Date(),
          })
          .where(eq(withdrawalRequest.id, input.id));

        await updateBalanceOrThrow(tx, withdrawal.user_id, {
          pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${withdrawal.amount}::numeric`,
          totalWithdrawn: sql`${userBalance.totalWithdrawn}::numeric + ${withdrawal.amount}::numeric`,
          updatedAt: new Date(),
        });

        return { success: true };
      });
    }),

  /**
   * Reject a withdrawal request (admin).
   *
   * Allowed while nothing has been sent yet — `pending` or `approved` — and
   * refunds the held amount back to the provider's available balance.
   */
  rejectWithdrawal: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const withdrawal = await lockWithdrawal(tx, input.id, [
          "pending",
          "approved",
        ]);

        await tx
          .update(withdrawalRequest)
          .set({ status: "rejected", processedAt: new Date() })
          .where(eq(withdrawalRequest.id, input.id));

        await updateBalanceOrThrow(tx, withdrawal.user_id, {
          pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${withdrawal.amount}::numeric`,
          availableBalance: sql`${userBalance.availableBalance}::numeric + ${withdrawal.amount}::numeric`,
          updatedAt: new Date(),
        });

        // Offsets the `withdrawal` entry written when the request was created.
        await tx.insert(ledgerEntry).values({
          userId: withdrawal.user_id,
          type: "refund",
          amount: withdrawal.amount,
          requestId: withdrawal.id,
          description: "Withdrawal rejected — refunded to available balance",
        });

        return { success: true };
      });
    }),
});
