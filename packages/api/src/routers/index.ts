import { router } from "../index";
import { adminRouter } from "./admin";
import { analyticsRouter } from "./analytics";
import { apiRouter } from "./api";
import { balanceRouter } from "./balance";
import { organizationRouter } from "./organization";
import { projectRouter } from "./project";
import { systemRouter } from "./system";
import { withdrawalRouter } from "./withdrawal";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  api: apiRouter,
  balance: balanceRouter,
  organization: organizationRouter,
  project: projectRouter,
  withdrawal: withdrawalRouter,
});
export type AppRouter = typeof appRouter;
