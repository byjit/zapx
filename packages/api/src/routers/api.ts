import { TRPCError } from "@trpc/server";
import {
  createProviderApiWithEndpoints,
  listProviderApisByProjectForUser,
  updateEndpointPricingForUser,
} from "@turborepo-boilerplate/db/api-registry";
import { getProjectByIdForUser } from "@turborepo-boilerplate/db/project";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import { parseOpenApiSpec } from "../openapi";
import { validateBaseUrl } from "../url-validation";

const endpointPriceSchema = z
  .string()
  .regex(/^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/, "Price must look like $0.001");

const createApiInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().max(120).optional(),
  baseUrl: z.string().max(500).optional(),
  defaultPriceUsdc: endpointPriceSchema.optional(),
  openapiSpec: z.string().min(1),
});

export const apiRouter = router({
  listByProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectByIdForUser(
        input.projectId,
        ctx.session.user.id
      );

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return listProviderApisByProjectForUser(
        input.projectId,
        ctx.session.user.id
      );
    }),

  create: protectedProcedure
    .input(createApiInputSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectByIdForUser(
        input.projectId,
        ctx.session.user.id
      );

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      try {
        const parsedSpec = parseOpenApiSpec(input.openapiSpec);
        const apiName = input.name?.trim() || parsedSpec.apiName;
        const baseUrl = input.baseUrl?.trim() || parsedSpec.baseUrl;

        if (!baseUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Base URL is required. Add it manually or include a server URL in the OpenAPI spec.",
          });
        }

        const validatedBaseUrl = z.url().parse(baseUrl);

        // Edge case #7: SSRF protection — reject private/internal URLs
        const urlCheck = validateBaseUrl(validatedBaseUrl);
        if (!urlCheck.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: urlCheck.reason || "Invalid base URL",
          });
        }

        return createProviderApiWithEndpoints({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          name: apiName,
          baseUrl: validatedBaseUrl,
          openapiSpec: input.openapiSpec.trim(),
          specVersion: parsedSpec.specVersion,
          defaultPriceUsdc: input.defaultPriceUsdc,
          endpoints: parsedSpec.endpoints,
        });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Base URL must be a valid URL",
          });
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to parse the uploaded OpenAPI spec",
        });
      }
    }),

  updateEndpointPricing: protectedProcedure
    .input(
      z.object({
        endpointId: z.string().min(1),
        priceUsdc: endpointPriceSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedEndpoint = await updateEndpointPricingForUser({
        endpointId: input.endpointId,
        userId: ctx.session.user.id,
        priceUsdc: input.priceUsdc,
      });

      if (!updatedEndpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }

      return updatedEndpoint;
    }),
});
