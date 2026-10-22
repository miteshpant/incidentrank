import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: new URL("./.env", import.meta.url).pathname });

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres connection and must not run
    // concurrently against the same schema.
    fileParallelism: false,
  },
});
