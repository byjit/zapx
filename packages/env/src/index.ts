import { config } from "dotenv";
import { z } from "zod";

// Ensure `.env` files are loaded at first import.
// Load `.env.local` first (if present), then fall back to `.env`.
// This mirrors common frameworks' behavior where local overrides are allowed.
config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

/** Base Sepolia — the only chain the public x402.org facilitator settles on. */
const TESTNET_NETWORK = "eip155:84532";
const TESTNET_FACILITATOR_URL = "https://x402.org/facilitator";

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
  FACILITATOR_URL: z.string().url().default(TESTNET_FACILITATOR_URL),
  // The platform wallet that receives every payment. Without it the gateway
  // cannot issue a 402 challenge at all, so the format is checked up front
  // rather than failing per request.
  PAY_TO: z
    .string()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "PAY_TO must be a 20-byte EVM address, e.g. 0x1234…"
    )
    .optional(),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(10),
  X402_NETWORK: z
    .string()
    .regex(
      /^eip155:[1-9]\d*$/,
      "X402_NETWORK must be a CAIP-2 EVM chain id, e.g. eip155:84532 (Base Sepolia) or eip155:8453 (Base)"
    )
    .default(TESTNET_NETWORK),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.format();
  console.error("❌ Invalid environment variables:", formatted);
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;

/**
 * The public x402.org facilitator only settles on Base Sepolia. Pairing it with
 * any other chain used to fail silently, one request at a time; refuse to boot
 * instead so a mainnet misconfiguration is impossible to miss.
 */
if (
  new URL(env.FACILITATOR_URL).hostname.endsWith("x402.org") &&
  env.X402_NETWORK !== TESTNET_NETWORK
) {
  throw new Error(
    `Invalid x402 configuration: the public facilitator ${TESTNET_FACILITATOR_URL} only supports ${TESTNET_NETWORK}, but X402_NETWORK is ${env.X402_NETWORK}. Point FACILITATOR_URL at a facilitator that settles on ${env.X402_NETWORK}.`
  );
}

export type Env = typeof env;
export { envSchema, TESTNET_FACILITATOR_URL, TESTNET_NETWORK };
