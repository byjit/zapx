import { db } from "@turborepo-boilerplate/db";
import { user } from "@turborepo-boilerplate/db/schema/auth";
import { providerApi } from "@turborepo-boilerplate/db/schema/provider-api";
import {
  type ProviderEndpointSelect,
  providerEndpoint,
} from "@turborepo-boilerplate/db/schema/provider-endpoint";
import { eq } from "drizzle-orm";

/** Bounds memory to one entry per API. */
const MAX_CACHE_SIZE = 1000;

export type GatewayApi = {
  id: string;
  userId: string;
  baseUrl: string;
  ownerBanned: boolean;
};

type CacheEntry = {
  /** `provider_api.updated_at`, bumped by every pricing or base-URL change. */
  version: number;
  endpoints: ProviderEndpointSelect[];
};

const endpointCache = new Map<string, CacheEntry>();

/**
 * Fetches the routing facts for an API: owner, base URL and ban status.
 *
 * Deliberately does not select `openapi_spec` — it is never used on the request
 * path and can be megabytes.
 */
async function lookupApi(apiId: string) {
  const [result] = await db
    .select({
      id: providerApi.id,
      userId: providerApi.userId,
      baseUrl: providerApi.baseUrl,
      updatedAt: providerApi.updatedAt,
      // Edge case #6: reject traffic to a banned owner's API.
      ownerBanned: user.banned,
    })
    .from(providerApi)
    .innerJoin(user, eq(providerApi.userId, user.id))
    .where(eq(providerApi.id, apiId))
    .limit(1);

  return result ?? null;
}

function lookupEndpoints(apiId: string) {
  return db
    .select()
    .from(providerEndpoint)
    .where(eq(providerEndpoint.apiId, apiId));
}

function readCache(apiId: string, version: number) {
  const cached = endpointCache.get(apiId);
  if (!cached || cached.version !== version) {
    return null;
  }

  // Re-insert to mark as recently used — Map iterates in insertion order.
  endpointCache.delete(apiId);
  endpointCache.set(apiId, cached);
  return cached.endpoints;
}

function writeCache(
  apiId: string,
  version: number,
  endpoints: ProviderEndpointSelect[]
) {
  endpointCache.set(apiId, { version, endpoints });

  if (endpointCache.size > MAX_CACHE_SIZE) {
    const oldest = endpointCache.keys().next().value;
    if (oldest) {
      endpointCache.delete(oldest);
    }
  }
}

/**
 * Loads an API and its endpoints for the gateway.
 *
 * The endpoint list is cached against `provider_api.updated_at` rather than a
 * wall-clock TTL, so a price change takes effect on the very next request instead
 * of up to a minute later — a provider lowering a price used to keep overcharging
 * for the rest of the TTL, and the exported invalidation hook could not be called
 * from `packages/api` at all. Owner ban status comes from the same fresh probe,
 * so it is never served stale either.
 */
export async function getApiWithEndpoints(apiId: string): Promise<{
  api: GatewayApi;
  endpoints: ProviderEndpointSelect[];
} | null> {
  const record = await lookupApi(apiId);
  if (!record) {
    return null;
  }

  const version = record.updatedAt.getTime();
  let endpoints = readCache(apiId, version);

  if (!endpoints) {
    endpoints = await lookupEndpoints(apiId);
    writeCache(apiId, version, endpoints);
  }

  return {
    api: {
      id: record.id,
      userId: record.userId,
      baseUrl: record.baseUrl,
      ownerBanned: record.ownerBanned ?? false,
    },
    endpoints,
  };
}
