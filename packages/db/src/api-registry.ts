import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { project } from "./schema/project";
import { providerApi } from "./schema/provider-api";
import { providerEndpoint } from "./schema/provider-endpoint";

type CreateProviderApiInput = {
  userId: string;
  projectId: string;
  name: string;
  baseUrl: string;
  openapiSpec: string;
  specVersion: string;
  defaultPriceUsdc?: string;
  endpoints: Array<{
    method: string;
    path: string;
    operationId?: string | null;
    summary?: string | null;
    description?: string | null;
  }>;
};

type UpdateEndpointPricingInput = {
  userId: string;
  endpointId: string;
  priceUsdc: string;
};

export const createProviderApiWithEndpoints = async (
  input: CreateProviderApiInput
) => {
  return db.transaction(async (tx) => {
    const [createdApi] = await tx
      .insert(providerApi)
      .values({
        userId: input.userId,
        projectId: input.projectId,
        name: input.name,
        baseUrl: input.baseUrl,
        openapiSpec: input.openapiSpec,
        specVersion: input.specVersion,
      })
      .returning();

    if (!createdApi) {
      throw new Error("Failed to create provider API");
    }

    if (input.endpoints.length > 0) {
      await tx.insert(providerEndpoint).values(
        input.endpoints.map((endpoint) => ({
          userId: input.userId,
          apiId: createdApi.id,
          method: endpoint.method,
          path: endpoint.path,
          operationId: endpoint.operationId ?? null,
          summary: endpoint.summary ?? null,
          description: endpoint.description ?? null,
          priceUsdc: input.defaultPriceUsdc ?? null,
        }))
      );
    }

    await tx
      .update(project)
      .set({ updatedAt: new Date() })
      .where(eq(project.id, input.projectId));

    const createdEndpoints = await tx
      .select()
      .from(providerEndpoint)
      .where(eq(providerEndpoint.apiId, createdApi.id))
      .orderBy(providerEndpoint.path, providerEndpoint.method);

    return {
      ...createdApi,
      endpoints: createdEndpoints,
    };
  });
};

export const listProviderApisByProjectForUser = async (
  projectId: string,
  userId: string
) => {
  const apis = await db
    .select()
    .from(providerApi)
    .where(
      and(eq(providerApi.projectId, projectId), eq(providerApi.userId, userId))
    )
    .orderBy(desc(providerApi.createdAt));

  if (apis.length === 0) {
    return [];
  }

  const apiIds = apis.map((api) => api.id);
  const endpoints = await db
    .select()
    .from(providerEndpoint)
    .where(
      and(
        eq(providerEndpoint.userId, userId),
        inArray(providerEndpoint.apiId, apiIds)
      )
    )
    .orderBy(providerEndpoint.path, providerEndpoint.method);

  const endpointsByApiId = new Map<string, typeof endpoints>();
  for (const endpoint of endpoints) {
    const existing = endpointsByApiId.get(endpoint.apiId) ?? [];
    existing.push(endpoint);
    endpointsByApiId.set(endpoint.apiId, existing);
  }

  return apis.map((api) => ({
    ...api,
    endpoints: endpointsByApiId.get(api.id) ?? [],
  }));
};

export const updateEndpointPricingForUser = async (
  input: UpdateEndpointPricingInput
) => {
  return db.transaction(async (tx) => {
    const [updatedEndpoint] = await tx
      .update(providerEndpoint)
      .set({
        priceUsdc: input.priceUsdc,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(providerEndpoint.id, input.endpointId),
          eq(providerEndpoint.userId, input.userId)
        )
      )
      .returning();

    if (!updatedEndpoint) {
      return null;
    }

    await tx
      .update(providerApi)
      .set({ updatedAt: new Date() })
      .where(eq(providerApi.id, updatedEndpoint.apiId));

    const [apiRecord] = await tx
      .select({
        projectId: providerApi.projectId,
      })
      .from(providerApi)
      .where(eq(providerApi.id, updatedEndpoint.apiId))
      .limit(1);

    if (apiRecord) {
      await tx
        .update(project)
        .set({ updatedAt: new Date() })
        .where(eq(project.id, apiRecord.projectId));
    }

    return updatedEndpoint;
  });
};
