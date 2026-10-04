import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    include: ["scripts/live/*.test.ts", "scripts/live/*.test.tsx"],
    testTimeout: 120000,
    hookTimeout: 10000,
    fileParallelism: false,
    environment: "node",
  },
});
