import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// POST /api/notifications/read — mark-read + redirect. The redirect target is
// student-supplied (a plain HTML form field), so the same-origin guard must
// refuse protocol-relative and backslash forms (open-redirect, #22).

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();
const STUDENT = "user_s001";

describe.skipIf(!live)("POST /api/notifications/read redirect guard (live DB)", () => {
  beforeAll(async () => {
    await runSeed();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  async function post(redirectTo: string | undefined): Promise<Response> {
    const { POST } = await import("../app/api/notifications/read/route");
    const form = new URLSearchParams();
    if (redirectTo !== undefined) form.set("redirectTo", redirectTo);
    return POST(
      new Request("http://localhost/api/notifications/read", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `${TEST_LOGIN_COOKIE}=${STUDENT}`,
        },
        body: form.toString(),
      }),
    );
  }

  it("refuses a protocol-relative //host redirect, falling back to /dashboard", async () => {
    const res = await post("//evil.example/phish");
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.host).toBe("localhost"); // NOT evil.example
    expect(loc.pathname).toBe("/dashboard");
  });

  it("refuses a backslash /\\host redirect too", async () => {
    const res = await post("/\\evil.example");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.host).toBe("localhost");
    expect(loc.pathname).toBe("/dashboard");
  });

  it("honors a genuine same-origin path", async () => {
    const res = await post("/grades");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.host).toBe("localhost");
    expect(loc.pathname).toBe("/grades");
  });

  it("defaults to /dashboard when no redirectTo is provided", async () => {
    const res = await post(undefined);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/dashboard");
  });
});
