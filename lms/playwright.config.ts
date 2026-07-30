import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3210";
// Useful when another Codex task already owns the single Next dev lock.
// The reused server must still have ENABLE_TEST_LOGIN=1.
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

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
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "pnpm dev -p 3210",
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { ENABLE_TEST_LOGIN: "1" },
      },
});
