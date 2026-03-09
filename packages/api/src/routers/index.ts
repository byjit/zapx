import { router } from "../index";
import { adminRouter } from "./admin";
import { organizationRouter } from "./organization";
import { projectRouter } from "./project";
import { systemRouter } from "./system";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  organization: organizationRouter,
  project: projectRouter,
});
export type AppRouter = typeof appRouter;
