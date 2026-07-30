import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  resolveSessionUser,
  type SessionDeps,
  type SessionUserRow,
} from "../lib/auth/session";
import { decideRosterGate, flagOffRosterUser } from "../lib/auth/roster-gate";
import {
  assertTestLoginNotInProduction,
  isTestLoginEnabled,
  TEST_LOGIN_COOKIE,
} from "../lib/auth/test-login";
import { AuthError, withAuth } from "../lib/auth";
import {
  enrollTemporarySectionFUser,
  isTemporarySectionFEnrollmentOpen,
  temporaryEnrollmentName,
  type TemporaryEnrollmentDeps,
} from "../lib/auth/temporary-section-f-enrollment";

const student: SessionUserRow = {
  id: "u_student",
  email: "student@example.com",
  role: "student",
  sectionId: "sec_a",
  teamId: "team_1",
};
const instructor: SessionUserRow = {
  id: "u_instructor",
  email: "teach@example.com",
  role: "instructor",
  sectionId: null,
  teamId: null,
};

describe("temporary Section F enrollment window", () => {
  const now = new Date("2026-07-30T07:00:00.000Z");

  it("opens only before a valid near-term absolute expiry", () => {
    expect(
      isTemporarySectionFEnrollmentOpen(
        { TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "2026-07-30T07:30:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isTemporarySectionFEnrollmentOpen(
        { TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "2026-07-30T07:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("fails closed for missing, invalid, or excessively long windows", () => {
    expect(isTemporarySectionFEnrollmentOpen({}, now)).toBe(false);
    expect(
      isTemporarySectionFEnrollmentOpen(
        { TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "not-a-date" },
        now,
      ),
    ).toBe(false);
    expect(
      isTemporarySectionFEnrollmentOpen(
        { TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "2026-07-30T07:30:00.001Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isTemporarySectionFEnrollmentOpen(
        { TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "2026-07-30T09:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("derives a usable temporary display name from the authenticated email", () => {
    expect(temporaryEnrollmentName("first.last+class@mastersunion.org")).toBe(
      "first last class",
    );
  });

  function enrollmentDeps(
    overrides: Partial<TemporaryEnrollmentDeps> = {},
  ): TemporaryEnrollmentDeps {
    return {
      findSectionF: async () => ({ id: "sec_f" }),
      createUser: async ({ email, sectionId }) => ({
        id: `new:${email}`,
        role: "student",
        sectionId,
      }),
      claimExistingSectionFStudent: async () => null,
      createAuditLog: async () => {},
      ...overrides,
    };
  }

  const openEnv = {
    TEMPORARY_SECTION_F_ENROLLMENT_UNTIL: "2026-07-30T07:30:00.000Z",
  };

  it("creates an unknown authenticated user as a Section F student", async () => {
    const creates: unknown[] = [];
    const audits: unknown[] = [];
    const claims: unknown[] = [];
    const deps = enrollmentDeps({
      createUser: async (data) => {
        creates.push(data);
        return { id: "u_new", role: "student", sectionId: "sec_f" };
      },
      claimExistingSectionFStudent: async (data) => {
        claims.push(data);
        return null;
      },
      createAuditLog: async (data) => {
        audits.push(data);
      },
    });

    const result = await enrollTemporarySectionFUser(
      {
        email: "First.Last@Example.com",
        clerkUserId: "clerk_new",
        env: openEnv,
        now: () => now,
      },
      deps,
    );

    expect(result).toEqual({ id: "u_new", role: "student", sectionId: "sec_f" });
    expect(creates).toEqual([
      {
        email: "first.last@example.com",
        name: "first last",
        sectionId: "sec_f",
        clerkUserId: "clerk_new",
      },
    ]);
    expect(claims).toHaveLength(0);
    expect(audits).toEqual([
      {
        userId: "u_new",
        email: "first.last@example.com",
        expiresAt: openEnv.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL,
      },
    ]);
  });

  it("claims only an existing Section F student after a concurrent create", async () => {
    const deps = enrollmentDeps({
      createUser: async () => null,
      claimExistingSectionFStudent: async () => ({
        id: "u_raced",
        role: "student",
        sectionId: "sec_f",
      }),
    });
    await expect(
      enrollTemporarySectionFUser(
        { email: "race@example.com", clerkUserId: "clerk_race", env: openEnv, now: () => now },
        deps,
      ),
    ).resolves.toEqual({ id: "u_raced", role: "student", sectionId: "sec_f" });
  });

  it("does not overwrite a privileged or differently assigned race winner", async () => {
    const deps = enrollmentDeps({
      createUser: async () => null,
      claimExistingSectionFStudent: async () => null,
    });
    await expect(
      enrollTemporarySectionFUser(
        { email: "admin@example.com", clerkUserId: "clerk_new", env: openEnv, now: () => now },
        deps,
      ),
    ).resolves.toBeNull();
  });

  it("does not create a user if the window closes during lookup", async () => {
    const createUser = vi.fn<TemporaryEnrollmentDeps["createUser"]>();
    const claimExisting = vi.fn<TemporaryEnrollmentDeps["claimExistingSectionFStudent"]>();
    const times = [now, new Date("2026-07-30T07:30:00.000Z")];
    const deps = enrollmentDeps({
      createUser,
      claimExistingSectionFStudent: claimExisting,
    });
    await expect(
      enrollTemporarySectionFUser(
        {
          email: "late@example.com",
          clerkUserId: "clerk_late",
          env: openEnv,
          now: () => times.shift() ?? times[0] ?? now,
        },
        deps,
      ),
    ).resolves.toBeNull();
    expect(createUser).not.toHaveBeenCalled();
    expect(claimExisting).not.toHaveBeenCalled();
  });

  it("keeps an enrollment usable when the audit write fails", async () => {
    const deps = enrollmentDeps({
      createAuditLog: async () => {
        throw new Error("audit unavailable");
      },
    });
    await expect(
      enrollTemporarySectionFUser(
        { email: "student@example.com", clerkUserId: "clerk_student", env: openEnv, now: () => now },
        deps,
      ),
    ).resolves.toMatchObject({ role: "student", sectionId: "sec_f" });
  });
});

function makeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    testLoginEnabled: false,
    getTestUserId: async () => null,
    getClerkSession: async () => null,
    getClerkEmail: async () => null,
    db: {
      findUserById: async () => null,
      findUserByClerkId: async () => null,
      findUserByEmail: async () => null,
      linkClerkId: async () => {},
    },
    ...overrides,
  };
}

describe("resolveSessionUser", () => {
  it("resolves a roster user by clerkUserId with role from the DB", async () => {
    const deps = makeDeps({
      getClerkSession: async () => ({ clerkUserId: "clerk_1" }),
      db: {
        findUserById: async () => null,
        findUserByClerkId: async (id) => (id === "clerk_1" ? student : null),
        findUserByEmail: async () => null,
        linkClerkId: async () => {},
      },
    });
    const session = await resolveSessionUser(deps);
    expect(session).toEqual({
      userId: "u_student",
      email: "student@example.com",
      role: "student",
      sectionId: "sec_a",
      teamId: "team_1",
    });
  });

  it("falls back to email lookup and backfills clerkUserId", async () => {
    const linked: string[] = [];
    const deps = makeDeps({
      getClerkSession: async () => ({ clerkUserId: "clerk_new" }),
      getClerkEmail: async () => "teach@example.com",
      db: {
        findUserById: async () => null,
        findUserByClerkId: async () => null,
        findUserByEmail: async (email) =>
          email === "teach@example.com" ? instructor : null,
        linkClerkId: async (userId, clerkUserId) => {
          linked.push(`${userId}:${clerkUserId}`);
        },
      },
    });
    const session = await resolveSessionUser(deps);
    expect(session?.userId).toBe("u_instructor");
    expect(session?.role).toBe("instructor");
    expect(linked).toEqual(["u_instructor:clerk_new"]);
  });

  it("returns null for an off-roster clerk session (unknown email)", async () => {
    const deps = makeDeps({
      getClerkSession: async () => ({ clerkUserId: "clerk_stranger" }),
      getClerkEmail: async () => "stranger@gmail.com",
    });
    expect(await resolveSessionUser(deps)).toBeNull();
  });

  it("uses the test-login cookie when enabled", async () => {
    const deps = makeDeps({
      testLoginEnabled: true,
      getTestUserId: async () => "u_student",
      db: {
        findUserById: async (id) => (id === "u_student" ? student : null),
        findUserByClerkId: async () => null,
        findUserByEmail: async () => null,
        linkClerkId: async () => {},
      },
    });
    const session = await resolveSessionUser(deps);
    expect(session?.userId).toBe("u_student");
    expect(session?.role).toBe("student");
  });

  it("ignores the test cookie when test login is disabled", async () => {
    const deps = makeDeps({
      testLoginEnabled: false,
      getTestUserId: async () => "u_student",
      db: {
        findUserById: async () => student,
        findUserByClerkId: async () => null,
        findUserByEmail: async () => null,
        linkClerkId: async () => {},
      },
    });
    expect(await resolveSessionUser(deps)).toBeNull();
  });
});

describe("decideRosterGate", () => {
  it("allows a request whose clerk user maps to a roster row", () => {
    expect(
      decideRosterGate({ authenticated: true, email: "x@y.z", rosterLookup: { id: "u1" } }),
    ).toEqual({ allow: true });
  });

  it("rejects and flags an authenticated user with no roster row", () => {
    const d = decideRosterGate({
      authenticated: true,
      email: "stranger@gmail.com",
      rosterLookup: null,
    });
    expect(d).toEqual({ allow: false, reason: "not-on-roster", flag: true });
  });

  it("rejects unauthenticated requests without flagging", () => {
    const d = decideRosterGate({ authenticated: false, email: null, rosterLookup: null });
    expect(d).toEqual({ allow: false, reason: "unauthenticated", flag: false });
  });

  it("fails closed (no flag) on DB error", () => {
    const d = decideRosterGate({
      authenticated: true,
      email: "x@y.z",
      rosterLookup: "error",
    });
    expect(d).toEqual({ allow: false, reason: "db-error", flag: false });
  });
});

describe("flagOffRosterUser", () => {
  it("writes an AuditLog row and flags the Clerk user", async () => {
    const audits: unknown[] = [];
    const flagged: string[] = [];
    await flagOffRosterUser({
      clerkUserId: "clerk_stranger",
      email: "stranger@gmail.com",
      createAuditLog: async (entry) => {
        audits.push(entry);
      },
      flagClerkUser: async (id) => {
        flagged.push(id);
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "auth.off_roster_rejected",
      targetType: "clerk_user",
      targetId: "clerk_stranger",
    });
    expect(flagged).toEqual(["clerk_stranger"]);
  });

  it("still writes the AuditLog when the Clerk call fails (best effort)", async () => {
    const audits: unknown[] = [];
    await expect(
      flagOffRosterUser({
        clerkUserId: "clerk_stranger",
        email: "stranger@gmail.com",
        createAuditLog: async (entry) => {
          audits.push(entry);
        },
        flagClerkUser: async () => {
          throw new Error("clerk down");
        },
      }),
    ).resolves.toBeUndefined();
    expect(audits).toHaveLength(1);
  });
});

describe("withAuth role gating", () => {
  const ok = async () => Response.json({ ok: true });

  it("returns 401 when there is no session", async () => {
    const handler = withAuth(ok, { getUser: async () => null });
    const res = await handler(new Request("http://test.local/api/x"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when a student hits an instructor-gated handler", async () => {
    const handler = withAuth(ok, {
      role: "instructor",
      getUser: async () => ({
        userId: student.id,
        email: student.email,
        role: "student" as const,
        sectionId: student.sectionId,
        teamId: student.teamId,
      }),
    });
    const res = await handler(new Request("http://test.local/api/x"));
    expect(res.status).toBe(403);
  });

  it("admin passes an instructor gate", async () => {
    const handler = withAuth(ok, {
      role: "instructor",
      getUser: async () => ({
        userId: "u_admin",
        email: "admin@example.com",
        role: "admin" as const,
        sectionId: null,
        teamId: null,
      }),
    });
    const res = await handler(new Request("http://test.local/api/x"));
    expect(res.status).toBe(200);
  });

  it("AuthError carries typed status codes", () => {
    expect(new AuthError(401).status).toBe(401);
    expect(new AuthError(403).status).toBe(403);
  });
});

describe("test-login guard", () => {
  it("is disabled in production even when the flag is set", () => {
    expect(
      isTestLoginEnabled({ NODE_ENV: "production", ENABLE_TEST_LOGIN: "1" }),
    ).toBe(false);
  });

  it("is enabled in production only when DEMO_MODE is also set", () => {
    expect(
      isTestLoginEnabled({
        NODE_ENV: "production",
        ENABLE_TEST_LOGIN: "1",
        DEMO_MODE: "1",
      }),
    ).toBe(true);
    // DEMO_MODE alone (without the login flag) never enables the backdoor.
    expect(
      isTestLoginEnabled({ NODE_ENV: "production", DEMO_MODE: "1" }),
    ).toBe(false);
  });

  it("is disabled when the flag is absent or false", () => {
    expect(isTestLoginEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(
      isTestLoginEnabled({ NODE_ENV: "development", ENABLE_TEST_LOGIN: "false" }),
    ).toBe(false);
  });

  it("is enabled outside production when the flag is set", () => {
    expect(
      isTestLoginEnabled({ NODE_ENV: "development", ENABLE_TEST_LOGIN: "1" }),
    ).toBe(true);
    expect(
      isTestLoginEnabled({ NODE_ENV: "test", ENABLE_TEST_LOGIN: "true" }),
    ).toBe(true);
  });

  it("boot assertion rejects the flag in production without DEMO_MODE", () => {
    expect(() =>
      assertTestLoginNotInProduction({
        NODE_ENV: "production",
        ENABLE_TEST_LOGIN: "1",
      }),
    ).toThrow(/Refusing to start/);
  });

  it("boot assertion permits the flag in a flagged demo build", () => {
    expect(() =>
      assertTestLoginNotInProduction({
        NODE_ENV: "production",
        ENABLE_TEST_LOGIN: "1",
        DEMO_MODE: "1",
      }),
    ).not.toThrow();
  });

  it("test-login route 404s when NODE_ENV=production is simulated", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    try {
      const { POST } = await import("../app/api/test-login/route");
      const res = await POST(
        new Request("http://test.local/api/test-login", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---------------------------------------------------------------------------
// Live-DB tests (self-skip when the local Postgres is unreachable), mirroring
// tests/schema.test.ts. Exercise the admin roster endpoint end to end via the
// test-login cookie path.
// ---------------------------------------------------------------------------

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

describe.skipIf(!live)("admin roster endpoint (live DB)", () => {
  const stamp = Date.now();
  const adminEmail = `admin-${stamp}@test.local`;
  const newEmail = `rostered-${stamp}@test.local`;
  const sectionCode = `RG${stamp}`;
  let prisma: import("@prisma/client").PrismaClient;
  let adminId: string;
  let studentId: string;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const section = await prisma.section.create({
      data: { code: sectionCode, name: "Roster Gate Test" },
    });
    adminId = (
      await prisma.user.create({
        data: { email: adminEmail, name: "Admin", role: "admin", sectionId: section.id },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: {
          email: `student-${stamp}@test.local`,
          name: "Student",
          role: "student",
          sectionId: section.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
    await prisma.section.deleteMany({ where: { code: sectionCode } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  function post(userId: string, body: unknown) {
    return new Request("http://test.local/api/admin/roster", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
      },
    });
  }

  it("admin creates a roster row that then resolves to a session", async () => {
    const { POST } = await import("../app/api/admin/roster/route");
    const res = await POST(
      post(adminId, {
        email: newEmail,
        name: "New Student",
        sectionCode,
        role: "student",
      }),
    );
    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: newEmail } });
    expect(row?.role).toBe("student");

    // The new row resolves through getSessionUser via the test-login cookie.
    const { getSessionUser } = await import("../lib/auth");
    const session = await getSessionUser(
      new Request("http://test.local/", {
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${row!.id}` },
      }),
    );
    expect(session?.email).toBe(newEmail);
  });

  it("student gets 403 from the admin endpoint", async () => {
    const { POST } = await import("../app/api/admin/roster/route");
    const res = await POST(
      post(studentId, { email: "nope@test.local", name: "X", sectionCode }),
    );
    expect(res.status).toBe(403);
  });
});
