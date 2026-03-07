import { router } from "../index";
import { adminRouter } from "./admin";
import { organizationRouter } from "./organization";
import { systemRouter } from "./system";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  organization: organizationRouter,
});
export type AppRouter = typeof appRouter;
