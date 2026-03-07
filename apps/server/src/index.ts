import "dotenv/config";
import { env } from "@turborepo-boilerplate/env";
import { createServer } from "./app";

const port = env.PORT;

if (env.NODE_ENV !== "test") {
  const app = createServer();
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

export { createServer };
