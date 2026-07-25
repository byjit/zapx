import { TRPCError } from "@trpc/server";
import { auth } from "@turborepo-boilerplate/auth";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@turborepo-boilerplate/db";
import { userBalance } from "@turborepo-boilerplate/db/schema/user-balance";
import { ledgerEntry } from "@turborepo-boilerplate/db/schema/ledger-entry";
import { withdrawalRequest } from "@turborepo-boilerplate/db/schema/withdrawal";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

/**
 * Admin procedures for user management
 * Requires admin authentication
 */
export const adminRouter = router({
  /**
   * List all users with pagination, search, filter, and sort
   */
  listUsers: protectedProcedure
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
  impersonateUser: protectedProcedure
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
   * Stop impersonating and return to admin session
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
   * Remove a user from the database
   */
  removeUser: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
  banUser: protectedProcedure
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
  unbanUser: protectedProcedure
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
  listWithdrawals: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "approved", "rejected", "completed"])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        // Verify admin access
        await auth.api.listUsers({
          query: { limit: "1", offset: "0" },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const conditions = input.status
        ? [eq(withdrawalRequest.status, input.status)]
        : [];

      return db
        .select()
        .from(withdrawalRequest)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(withdrawalRequest.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /**
   * Approve a withdrawal request (admin)
   * Uses SELECT ... FOR UPDATE to prevent double-approval race (#16)
   */
  approveWithdrawal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.listUsers({
          query: { limit: "1", offset: "0" },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      return db.transaction(async (tx) => {
        // Lock the withdrawal row to prevent concurrent approval
        const approveResult = await tx.execute(sql`
          SELECT id, user_id, amount, status
          FROM withdrawal_request
          WHERE id = ${input.id}
          FOR UPDATE
        `);
        const withdrawal = approveResult.rows[0] as {
          id: string;
          user_id: string;
          amount: string;
          status: string;
        } | undefined;

        if (!withdrawal) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Withdrawal not found",
          });
        }

        if (withdrawal.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot approve withdrawal with status: ${withdrawal.status}`,
          });
        }

        // Update withdrawal status
        await tx
          .update(withdrawalRequest)
          .set({ status: "approved", processedAt: new Date() })
          .where(eq(withdrawalRequest.id, input.id));

        // Move from pending to withdrawn — arithmetic in SQL
        await tx
          .update(userBalance)
          .set({
            pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${withdrawal.amount}::numeric`,
            totalWithdrawn: sql`${userBalance.totalWithdrawn}::numeric + ${withdrawal.amount}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(userBalance.userId, withdrawal.user_id));

        return { success: true };
      });
    }),

  /**
   * Reject a withdrawal request (admin)
   * Uses SELECT ... FOR UPDATE to prevent double-rejection race (#16)
   */
  rejectWithdrawal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.listUsers({
          query: { limit: "1", offset: "0" },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      return db.transaction(async (tx) => {
        // Lock the withdrawal row to prevent concurrent rejection
        const rejectResult = await tx.execute(sql`
          SELECT id, user_id, amount, status
          FROM withdrawal_request
          WHERE id = ${input.id}
          FOR UPDATE
        `);
        const withdrawal = rejectResult.rows[0] as {
          id: string;
          user_id: string;
          amount: string;
          status: string;
        } | undefined;

        if (!withdrawal) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Withdrawal not found",
          });
        }

        if (withdrawal.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot reject withdrawal with status: ${withdrawal.status}`,
          });
        }

        // Update withdrawal status
        await tx
          .update(withdrawalRequest)
          .set({ status: "rejected", processedAt: new Date() })
          .where(eq(withdrawalRequest.id, input.id));

        // Refund: move from pending back to available
        await tx
          .update(userBalance)
          .set({
            pendingBalance: sql`${userBalance.pendingBalance}::numeric - ${withdrawal.amount}::numeric`,
            availableBalance: sql`${userBalance.availableBalance}::numeric + ${withdrawal.amount}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(userBalance.userId, withdrawal.user_id));

        // Append refund ledger entry
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
