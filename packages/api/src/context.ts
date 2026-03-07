import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { auth } from "@turborepo-boilerplate/auth";
import { fromNodeHeaders } from "better-auth/node";

export async function createContext(opts: CreateExpressContextOptions) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(opts.req.headers),
  });
  return {
    session,
    headers: opts.req.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
