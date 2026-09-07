import { defineConfig } from "@playwright/test";

// Real-browser component layout check. The guarded fixture route mounts the
// production component without a seeded database.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "gallery-presenter-layout.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3211",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev -p 3211",
    url: "http://localhost:3211/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
