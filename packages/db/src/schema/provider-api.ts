import { createId } from "@paralleldrive/cuid2";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";
import { user } from "./auth";
import { project } from "./project";

export const providerApi = pgTable(
  "provider_api",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    openapiSpec: text("openapi_spec").notNull(),
    specVersion: text("spec_version").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("provider_api_project_id_idx").on(table.projectId),
    index("provider_api_user_id_idx").on(table.userId),
  ]
);

export const ProviderApiSelectSchema = createSelectSchema(providerApi);
export const ProviderApiInsertSchema = createInsertSchema(providerApi);
export const ProviderApiUpdateSchema = createUpdateSchema(providerApi);

export type ProviderApi = typeof providerApi;
export type ProviderApiSelect = z.infer<typeof ProviderApiSelectSchema>;
export type ProviderApiInsert = z.infer<typeof ProviderApiInsertSchema>;
export type ProviderApiUpdate = z.infer<typeof ProviderApiUpdateSchema>;
