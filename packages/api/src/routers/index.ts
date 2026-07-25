import { router } from "../index";
import { adminRouter } from "./admin";
import { analyticsRouter } from "./analytics";
import { apiRouter } from "./api";
import { balanceRouter } from "./balance";
import { projectRouter } from "./project";
import { systemRouter } from "./system";
import { withdrawalRouter } from "./withdrawal";

/**
 * `organizationRouter` is deliberately not registered.
 *
 * Spec §6.0 defines the tenant as the user ("User = Provider — one balance per
 * user") and no financial table references an organization. Exposing org
 * procedures would let a teammate accept an invite and then find no projects,
 * APIs or balance. The router file is kept for the day multi-tenant ownership is
 * actually specced; until then the surface stays closed.
 */
export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  analytics: analyticsRouter,
  api: apiRouter,
  balance: balanceRouter,
  project: projectRouter,
  withdrawal: withdrawalRouter,
});
export type AppRouter = typeof appRouter;
