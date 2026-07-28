import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Live-DB test files share one local Postgres, and tests/seed.test.ts
    // wipe-and-recreates the whole database. Run test files serially so the
    // seed never deletes rows out from under another file's live tests.
    fileParallelism: false,
  },
});
