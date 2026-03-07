import { config } from "dotenv";
import { z } from "zod";

// Ensure `.env` files are loaded at first import.
// Load `.env.local` first (if present), then fall back to `.env`.
config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

const servicesEnvSchema = z.object({
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  SLACK_NOTIFICATION_URL: z.url().optional(),
});

const parsedServicesEnv = servicesEnvSchema.safeParse(process.env);

if (!parsedServicesEnv.success) {
  const formatted = z.treeifyError(parsedServicesEnv.error);
  console.error("❌ Invalid services environment variables:", formatted);
  throw new Error("Invalid services environment variables");
}

export const servicesEnv = parsedServicesEnv.data;
export type ServicesEnv = typeof servicesEnv;
export { servicesEnvSchema };
