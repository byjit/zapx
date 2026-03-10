import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const currentDir = dirname(fileURLToPath(import.meta.url));

const envCandidates = [
  resolve(currentDir, ".env"),
  resolve(currentDir, "../../apps/server/.env"),
  resolve(currentDir, "../../apps/server/.env.local"),
];

for (const envFilePath of envCandidates) {
  if (existsSync(envFilePath)) {
    loadEnv({ path: envFilePath, override: false });
  }
}

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
