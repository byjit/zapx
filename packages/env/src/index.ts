import { config } from "dotenv";
import { z } from "zod";

// Ensure `.env` files are loaded at first import.
// Load `.env.local` first (if present), then fall back to `.env`.
// This mirrors common frameworks' behavior where local overrides are allowed.
config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8000),
  ALLOW_OPENAPI: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val === "true"),
  BASE_URL: z.url().default("http://localhost:8000"),
  CORS_ORIGIN: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_MODE: z.enum(["memory", "redis"]).default("memory"),
  // Logging configuration
  ENABLE_FILE_LOGGING: z
    .string()
    .optional()
    .default("false")
    .transform((val) => val === "true"),
  LOG_FILE_PATH: z.string().optional().default("./logs/server.log"),
  LOG_FILE_MAX_SIZE_MB: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(10),
  // x402 Payment Gateway
  FACILITATOR_URL: z
    .string()
    .url()
    .default("https://x402.org/facilitator"),
  PAY_TO: z.string().optional(),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(10),
  X402_NETWORK: z.string().default("eip155:84532"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.format();
  console.error("❌ Invalid environment variables:", formatted);
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;
export type Env = typeof env;
export { envSchema };
