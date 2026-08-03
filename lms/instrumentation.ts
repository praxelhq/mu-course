import { assertTestLoginNotInProduction } from "@/lib/auth/test-login";

// Boot-time assertion: refuse to start a production server with the
// test-login backdoor flag set. Runs once per server boot (Next.js
// instrumentation hook), in addition to the per-request guard in
// app/api/test-login/route.ts.
export async function register(): Promise<void> {
  assertTestLoginNotInProduction();
}
