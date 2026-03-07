import { z } from "zod";

const EnvSchema = z.object({
  SERVER_URL: z.url(),
  SITE_URL: z.url().optional(),
});

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

// Vite exposes only variables prefixed with VITE_ to the client bundle
const raw = {
  SERVER_URL: import.meta.env.VITE_SERVER_URL,
  SITE_URL: import.meta.env.VITE_SITE_URL,
};

const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  throw new Error(
    "Invalid environment variables:\n" + formatZodError(parsed.error)
  );
}

export const env = parsed.data;
export type Env = typeof env;
