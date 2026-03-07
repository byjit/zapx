import { z } from "zod";

// Note: this package intentionally does NOT load dotenv.
// The consuming app (server, tests, etc.) is responsible for providing
// process.env (e.g. via `dotenv/config`, platform env vars, CI secrets).

export const authEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // better-auth defaults expect these to exist in many setups.
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BETTER_AUTH_URL: z.url().min(1, "BETTER_AUTH_URL is required"),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  // Polar billing
  POLAR_ACCESS_TOKEN: z.string().min(1, "POLAR_ACCESS_TOKEN is required"),
  POLAR_SUCCESS_URL: z.string().min(1, "POLAR_SUCCESS_URL is required"),
  POLAR_PRO_PRODUCT_ID: z.string().min(1, "POLAR_PRO_PRODUCT_ID is required"),
  POLAR_PRO_SLUG: z.string().min(1, "POLAR_PRO_SLUG is required"),
  POLAR_WEBHOOK_SECRET: z.string().optional(),

  // Optional: some consumers may not need to restrict origins.
  CORS_ORIGIN: z.string().optional(),
});

const parsed = authEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = z.treeifyError(parsed.error);
  console.error("❌ Invalid auth environment variables:", formatted);
  throw new Error("Invalid auth environment variables");
}

export const env = parsed.data;
export type AuthEnv = typeof env;
