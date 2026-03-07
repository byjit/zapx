import { z } from "zod";

export const dbEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

const parsed = dbEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = z.treeifyError(parsed.error);
  console.error("❌ Invalid db environment variables:", formatted);
  throw new Error("Invalid db environment variables");
}

export const env = parsed.data;
export type DbEnv = typeof env;
