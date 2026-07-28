// Test-login backdoor guard. Used by the /api/test-login route, getSessionUser
// and the proxy. Playwright (and local dev without Clerk keys) authenticates by
// setting this cookie to a users.id after POSTing /api/test-login.
//
// SECURITY: the flag alone is NOT sufficient — NODE_ENV must also not be
// "production". instrumentation.ts additionally refuses to boot a production
// build with ENABLE_TEST_LOGIN set.

export const TEST_LOGIN_COOKIE = "forge_test_user";

type EnvLike = {
  NODE_ENV?: string;
  ENABLE_TEST_LOGIN?: string;
};

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function testLoginFlagSet(env: EnvLike = process.env): boolean {
  return TRUTHY.has((env.ENABLE_TEST_LOGIN ?? "").toLowerCase());
}

export function isTestLoginEnabled(env: EnvLike = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  return testLoginFlagSet(env);
}

/** Boot-time assertion: a production build must never ship the backdoor flag. */
export function assertTestLoginNotInProduction(env: EnvLike = process.env): void {
  if (env.NODE_ENV === "production" && testLoginFlagSet(env)) {
    throw new Error(
      "ENABLE_TEST_LOGIN is set in a production environment. Refusing to start. " +
        "Unset ENABLE_TEST_LOGIN before deploying.",
    );
  }
}

/** Extract the test-login user id from a Request's Cookie header. */
export function testUserIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TEST_LOGIN_COOKIE) {
      const value = rest.join("=").trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}
