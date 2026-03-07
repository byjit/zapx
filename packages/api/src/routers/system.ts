import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

export const systemRouter = router({
  healthCheck: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/health-check",
        tags: ["Health"],
        summary: "Health check endpoint",
      },
    })
    .input(z.void())
    .output(z.string())
    .query(() => "OK"),
  privateData: protectedProcedure.query(({ ctx }) => ({
    message: "This is private",
    user: ctx.session.user,
  })),
});
