// Test-login backdoor guard. Used by the /api/test-login route, getSessionUser
// and the proxy. Playwright (and local dev without Clerk keys) authenticates by
// setting this cookie to a users.id after POSTing /api/test-login.
//
// SECURITY: the flag alone is NOT sufficient — NODE_ENV must also not be
// "production", UNLESS the build is an explicitly-flagged demo (DEMO_MODE=1).
// A demo is a throwaway instance with no real users, populated entirely by the
// demo seed and running without Clerk keys, so the backdoor is its only login.
// A real production deploy never sets DEMO_MODE, so ENABLE_TEST_LOGIN there
// still means a misconfiguration: instrumentation.ts refuses to boot.

export const TEST_LOGIN_COOKIE = "forge_test_user";

type EnvLike = {
  NODE_ENV?: string;
  ENABLE_TEST_LOGIN?: string;
  DEMO_MODE?: string;
};

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function testLoginFlagSet(env: EnvLike = process.env): boolean {
  return TRUTHY.has((env.ENABLE_TEST_LOGIN ?? "").toLowerCase());
}

/** Explicit opt-in marking this build as a disposable demo instance. */
export function demoModeSet(env: EnvLike = process.env): boolean {
  return TRUTHY.has((env.DEMO_MODE ?? "").toLowerCase());
}

export function isTestLoginEnabled(env: EnvLike = process.env): boolean {
  if (!testLoginFlagSet(env)) return false;
  // Hard-off in a real production build; a flagged demo build is the one
  // sanctioned exception.
  if (env.NODE_ENV === "production" && !demoModeSet(env)) return false;
  return true;
}

/**
 * Boot-time assertion: a real production build must never ship the backdoor
 * flag. A deliberately-flagged demo build (DEMO_MODE=1) is allowed to.
 */
export function assertTestLoginNotInProduction(env: EnvLike = process.env): void {
  if (env.NODE_ENV === "production" && testLoginFlagSet(env) && !demoModeSet(env)) {
    throw new Error(
      "ENABLE_TEST_LOGIN is set in a production environment without DEMO_MODE. " +
        "Refusing to start. Unset ENABLE_TEST_LOGIN before deploying, or set " +
        "DEMO_MODE=1 if this is an intentional throwaway demo instance.",
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
