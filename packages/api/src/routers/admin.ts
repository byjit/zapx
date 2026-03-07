import { TRPCError } from "@trpc/server";
import { auth } from "@turborepo-boilerplate/auth";
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
});
