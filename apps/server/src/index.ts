import "dotenv/config";
import { env } from "@turborepo-boilerplate/env";
import { createServer } from "./app";
import { checkFacilitatorHealth } from "./services/payment-verification";

const port = env.PORT;

if (env.NODE_ENV !== "test") {
  const app = createServer();
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    // Edge case #23: non-blocking health check on startup
    checkFacilitatorHealth();
  });
}

export { createServer };
