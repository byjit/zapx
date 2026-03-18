import { createId } from "@paralleldrive/cuid2";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";
import { user } from "./auth";
import { providerApi } from "./provider-api";

export const providerEndpoint = pgTable(
  "provider_endpoint",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiId: text("api_id")
      .notNull()
      .references(() => providerApi.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    operationId: text("operation_id"),
    summary: text("summary"),
    description: text("description"),
    priceUsdc: text("price_usdc"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("provider_endpoint_api_id_idx").on(table.apiId),
    index("provider_endpoint_user_id_idx").on(table.userId),
    uniqueIndex("provider_endpoint_api_method_path_idx").on(
      table.apiId,
      table.method,
      table.path
    ),
  ]
);

export const ProviderEndpointSelectSchema = createSelectSchema(providerEndpoint);
export const ProviderEndpointInsertSchema = createInsertSchema(providerEndpoint);
export const ProviderEndpointUpdateSchema = createUpdateSchema(providerEndpoint);

export type ProviderEndpoint = typeof providerEndpoint;
export type ProviderEndpointSelect = z.infer<typeof ProviderEndpointSelectSchema>;
export type ProviderEndpointInsert = z.infer<typeof ProviderEndpointInsertSchema>;
export type ProviderEndpointUpdate = z.infer<typeof ProviderEndpointUpdateSchema>;
