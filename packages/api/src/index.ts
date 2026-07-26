import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { isAdminUser } from "@turborepo-boilerplate/auth/permissions";
import type { OpenApiMeta } from "trpc-to-openapi";
import type { Context } from "./context";
import type { AppRouter } from "./routers/index";

export const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/**
 * Platform-admin procedures.
 *
 * Authorization is a pure check against the session user's role, so it costs no
 * query and does not couple unrelated capabilities (approving a withdrawal used
 * to require the `user:list` permission) to each other.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdminUser(ctx.session.user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

export type { AppRouter } from "./routers/index";
export { appRouter } from "./routers/index";
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
