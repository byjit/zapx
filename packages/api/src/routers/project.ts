import { TRPCError } from "@trpc/server";
import {
  createProject,
  deleteProjectByIdForUser,
  getProjectByIdForUser,
  listProjectsByUser,
  updateProjectByIdForUser,
} from "@turborepo-boilerplate/db/project";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

export const projectRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await listProjectsByUser(ctx.session.user.id);
  }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectByIdForUser(
        input.id,
        ctx.session.user.id
      );
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return project;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await createProject({
        userId: ctx.session.user.id,
        name: input.name.trim(),
        description: input.description?.trim(),
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        data: z
          .object({
            name: z.string().min(1).max(120).optional(),
            description: z.string().max(1000).nullable().optional(),
          })
          .refine(
            (value) =>
              Object.values(value).some((field) => field !== undefined),
            {
              message: "At least one field is required to update a project",
            }
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedProject = await updateProjectByIdForUser({
        id: input.id,
        userId: ctx.session.user.id,
        data: {
          name: input.data.name?.trim(),
          description: input.data.description?.trim() ?? input.data.description,
        },
      });

      if (!updatedProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return updatedProject;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const deletedProject = await deleteProjectByIdForUser(
        input.id,
        ctx.session.user.id
      );

      if (!deletedProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return {
        success: true,
        project: deletedProject,
      };
    }),
});
