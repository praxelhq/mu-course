import type { BrowserContext } from "@playwright/test";

// Shared e2e auth helper: the dev server runs with ENABLE_TEST_LOGIN=1, so a
// session is just the forge_test_user cookie (see lib/auth/test-login.ts).
// POST /api/test-login validates the user exists; we then pin the cookie on
// the browser context (plus the one-time welcome cookie so student flows
// skip the /welcome redirect).

export const BASE = "http://localhost:3210";

export async function loginAs(context: BrowserContext, userId: string): Promise<void> {
  const res = await context.request.post(`${BASE}/api/test-login`, { data: { userId } });
  if (!res.ok()) {
    throw new Error(
      `test-login failed for ${userId} (${res.status()}) — is the dev server running with ENABLE_TEST_LOGIN=1 against the seeded DB?`,
    );
  }
  await context.addCookies([
    { name: "forge_test_user", value: userId, url: BASE },
    { name: "forge_welcomed", value: "1", url: BASE },
  ]);
}
