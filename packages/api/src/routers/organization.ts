import { TRPCError } from "@trpc/server";
import { auth } from "@turborepo-boilerplate/auth";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const organizationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await auth.api.listOrganizations({
        headers: fromNodeHeaders(ctx.headers),
      });
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list organizations",
        cause: error,
      });
    }
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        slug: z.string(),
        logo: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.createOrganization({
          body: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to create organization",
          cause: error,
        });
      }
    }),

  setActive: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.setActiveOrganization({
          body: {
            organizationId: input.organizationId,
          },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set active organization",
          cause: error,
        });
      }
    }),

  getFull: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          organizationSlug: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auth.api.getFullOrganization({
          query: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
          cause: error,
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        data: z.object({
          name: z.string().optional(),
          slug: z.string().optional(),
          logo: z.string().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.updateOrganization({
          body: {
            organizationId: input.organizationId,
            data: input.data,
          },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to update organization",
          cause: error,
        });
      }
    }),

  delete: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.deleteOrganization({
          body: {
            organizationId: input.organizationId,
          },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Failed to delete organization",
          cause: error,
        });
      }
    }),

  listMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auth.api.listMembers({
          query: {
            organizationId: input.organizationId,
            limit: input.limit?.toString(),
            offset: input.offset?.toString(),
          },
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list members",
          cause: error,
        });
      }
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member", "owner"]),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.createInvitation({
          body: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to invite member",
          cause: error,
        });
      }
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        memberIdOrEmail: z.string(),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.removeMember({
          body: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to remove member",
          cause: error,
        });
      }
    }),

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        role: z.enum(["admin", "member", "owner"]),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.updateMemberRole({
          body: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to update member role",
          cause: error,
        });
      }
    }),

  listInvitations: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auth.api.listInvitations({
          query: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list invitations",
          cause: error,
        });
      }
    }),

  cancelInvitation: protectedProcedure
    .input(
      z.object({
        invitationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await auth.api.cancelInvitation({
          body: input,
          headers: fromNodeHeaders(ctx.headers),
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to cancel invitation",
          cause: error,
        });
      }
    }),
});
