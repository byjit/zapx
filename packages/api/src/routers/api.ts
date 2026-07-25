import { TRPCError } from "@trpc/server";
import {
  createProviderApiWithEndpoints,
  deleteProviderApiForUser,
  listProviderApisByProjectForUser,
  updateEndpointPricingForUser,
  updateProviderApiBaseUrlForUser,
} from "@turborepo-boilerplate/db/api-registry";
import { getProjectByIdForUser } from "@turborepo-boilerplate/db/project";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import { parseOpenApiSpec } from "../openapi";
import { endpointPriceSchema } from "../pricing";
import { validateBaseUrl } from "../url-validation";

/**
 * Upper bound on an uploaded spec. The Express body limit is 10 MB; this keeps a
 * single field from consuming all of it, while staying above real-world specs.
 */
const MAX_OPENAPI_SPEC_LENGTH = 5_000_000;

const baseUrlInputSchema = z.string().min(1).max(500);

const createApiInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().max(120).optional(),
  baseUrl: baseUrlInputSchema.optional(),
  defaultPriceUsdc: endpointPriceSchema.optional(),
  openapiSpec: z.string().min(1).max(MAX_OPENAPI_SPEC_LENGTH),
});

/**
 * Parses, normalizes and SSRF-checks a provider-supplied base URL.
 * Shared by import and later edits so both apply the identical policy.
 */
function assertSafeBaseUrl(rawBaseUrl: string): string {
  let baseUrl: string;
  try {
    baseUrl = z.url().parse(rawBaseUrl.trim());
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Base URL must be a valid URL",
    });
  }

  // Edge case #7: SSRF protection — reject private/internal URLs
  const urlCheck = validateBaseUrl(baseUrl);
  if (!urlCheck.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: urlCheck.reason || "Invalid base URL",
    });
  }

  return baseUrl;
}

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

        const validatedBaseUrl = assertSafeBaseUrl(baseUrl);

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

  /**
   * Correct a wrong or changed upstream base URL without re-importing the spec.
   */
  updateBaseUrl: protectedProcedure
    .input(
      z.object({
        apiId: z.string().min(1),
        baseUrl: baseUrlInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedApi = await updateProviderApiBaseUrlForUser({
        apiId: input.apiId,
        userId: ctx.session.user.id,
        baseUrl: assertSafeBaseUrl(input.baseUrl),
      });

      if (!updatedApi) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API not found",
        });
      }

      return updatedApi;
    }),

  /**
   * Deletes an API and its endpoints. Refused once the API has earned anything —
   * revenue history is append-only, so ban/retire rather than delete.
   */
  delete: protectedProcedure
    .input(z.object({ apiId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await deleteProviderApiForUser({
        apiId: input.apiId,
        userId: ctx.session.user.id,
      });

      if (result === "not-found") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API not found",
        });
      }

      if (result === "has-history") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This API has payment history and cannot be deleted — its revenue audit trail must be preserved.",
        });
      }

      return { success: true };
    }),
});
