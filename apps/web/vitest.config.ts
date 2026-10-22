import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

loadEnv({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-mock.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
