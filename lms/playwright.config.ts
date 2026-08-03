import { defineConfig } from "@playwright/test";

// U16 — the definition-of-done smoke suite. Runs against a dev server on
// :3210 with the TEST-LOGIN backdoor enabled (never possible in production —
// instrumentation.ts refuses to boot prod with the flag) and the SEEDED local
// database (`pnpm seed` first). workers:1 — the specs mutate shared demo
// state (gates, submissions) and must not interleave.
//
//   pnpm exec playwright install chromium   # once
//   pnpm seed && pnpm e2e

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev -p 3210",
    url: "http://localhost:3210/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ENABLE_TEST_LOGIN: "1" },
  },
});
