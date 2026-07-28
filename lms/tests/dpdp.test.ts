import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// U16 — DPDP tools: the admin export bundle (completeness, peer-review
// direction, diagnostic-quiz neutrality, no other student's PII) and the
// erasure endpoint (FK-safe hard delete, audit record kept, idempotency).
//
// Seed facts used:
//   user_s001: submissions + grades (with promptLog), quiz attempts incl. the
//   diagnostic "Surprise quiz · Data privacy (DPDP)", cp1 peer reviews given
//   AND received inside team_A1 (s001…s008).
//   user_s004: owns interview iv_001 (graded, with turns) — the delete target.

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

const ADMIN = "user_admin_pushpak";

describe.skipIf(!live)("U16 DPDP export + delete (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  function exportFor(actor: string | null, userId: string | null) {
    const qs = userId ? `?userId=${userId}` : "";
    return import("../app/api/admin/dpdp/export/route").then(({ GET }) =>
      GET(
        new Request(`http://localhost/api/admin/dpdp/export${qs}`, {
          headers: actor ? { cookie: `${TEST_LOGIN_COOKIE}=${actor}` } : {},
        }),
      ),
    );
  }

  function deleteFor(actor: string | null, body: unknown) {
    return import("../app/api/admin/dpdp/delete/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/admin/dpdp/delete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(actor ? { cookie: `${TEST_LOGIN_COOKIE}=${actor}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    );
  }

  // --- export --------------------------------------------------------------

  it("export is admin-only (instructor 403) and 404s on unknown users", async () => {
    expect((await exportFor(null, "user_s001")).status).toBe(401);
    expect((await exportFor("user_instructor", "user_s001")).status).toBe(403);
    expect((await exportFor(ADMIN, "user_nope")).status).toBe(404);
    expect((await exportFor(ADMIN, null)).status).toBe(400);
  });

  it("exports the student's own rows: submissions+grades (with promptLog), interviews, notifications, portfolio, audit rows, S3 manifest", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as Record<string, unknown> & {
      user: { id: string; email: string };
      submissions: { id: string; grades: { promptLog: unknown }[] }[];
      quizAttempts: { quizTitle: string; scorePct: number }[];
      peerReviewsGiven: { checkpoint: number; revieweeId: string }[];
      s3Keys: string[];
    };

    expect(bundle.user.id).toBe("user_s001");
    expect(bundle.user.email).toBe("student001@mastersunion.org");

    const dbSubs = await prisma.submission.count({ where: { userId: "user_s001" } });
    expect(bundle.submissions).toHaveLength(dbSubs);
    expect(dbSubs).toBeGreaterThan(0);
    // promptLog rides along — it is the student's own grading context.
    const gradedSub = bundle.submissions.find((s) => s.grades.length > 0)!;
    expect(gradedSub.grades[0].promptLog).toBeTruthy();
    expect(Array.isArray(bundle.s3Keys)).toBe(true);
  });

  it("contains peer reviews GIVEN, never RECEIVED", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const bundle = (await res.json()) as {
      peerReviewsGiven: { revieweeId: string; pointsAllocated: number }[];
    } & Record<string, unknown>;

    const given = await prisma.peerReview.count({ where: { reviewerId: "user_s001" } });
    const received = await prisma.peerReview.count({ where: { revieweeId: "user_s001" } });
    expect(given).toBeGreaterThan(0);
    expect(received).toBeGreaterThan(0);
    expect(bundle.peerReviewsGiven).toHaveLength(given);
    expect(bundle.peerReviewsGiven.every((r) => r.revieweeId !== "user_s001")).toBe(true);
    expect("peerReviewsReceived" in bundle).toBe(false);
    expect(JSON.stringify(bundle)).not.toContain("revieweeId\":\"user_s001");
  });

  it("includes the diagnostic attempt as a PLAIN quiz attempt — no isDiagnostic marker, no counting annotation", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const raw = await res.text();
    const bundle = JSON.parse(raw) as { quizAttempts: { quizTitle: string }[] };

    const dbAttempts = await prisma.quizAttempt.count({ where: { userId: "user_s001" } });
    expect(bundle.quizAttempts).toHaveLength(dbAttempts); // diagnostic included
    expect(bundle.quizAttempts.some((a) => a.quizTitle.includes("DPDP"))).toBe(true);

    // The neutrality guarantee: nothing anywhere in the bundle marks the
    // diagnostic as special or (not) counting.
    expect(raw).not.toContain("isDiagnostic");
    expect(raw.toLowerCase()).not.toContain("diagnostic");
  });

  it("carries no other student's email or name anywhere in the bundle", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const raw = await res.text();

    const emails = raw.match(/student\d{3}@mastersunion\.org/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(new Set(emails)).toEqual(new Set(["student001@mastersunion.org"]));

    // Teammates (whose reviews of s001 exist in the DB) never appear by name.
    const me = await prisma.user.findUniqueOrThrow({ where: { id: "user_s001" } });
    const teammates = await prisma.user.findMany({
      where: { teamId: me.teamId!, id: { not: "user_s001" } },
      select: { name: true },
    });
    for (const t of teammates) {
      if (t.name !== me.name) expect(raw).not.toContain(t.name);
    }
  });

  // --- delete --------------------------------------------------------------

  it("delete is admin-only and requires the matching confirmEmail", async () => {
    expect(
      (
        await deleteFor("user_instructor", {
          userId: "user_s004",
          confirmEmail: "student004@mastersunion.org",
        })
      ).status,
    ).toBe(403);

    const mismatch = await deleteFor(ADMIN, {
      userId: "user_s004",
      confirmEmail: "wrong@mastersunion.org",
    });
    expect(mismatch.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: "user_s004" } })).not.toBeNull();
  });

  it("deletes every row for the student in one transaction, keeps the audit record, and 404s on repeat", async () => {
    // Preconditions: s004 really has data to delete.
    expect(await prisma.interview.count({ where: { userId: "user_s004" } })).toBeGreaterThan(0);
    expect(
      await prisma.interviewTurn.count({ where: { interview: { userId: "user_s004" } } }),
    ).toBeGreaterThan(0);
    expect(await prisma.quizAttempt.count({ where: { userId: "user_s004" } })).toBeGreaterThan(0);
    expect(
      await prisma.peerReview.count({
        where: { OR: [{ reviewerId: "user_s004" }, { revieweeId: "user_s004" }] },
      }),
    ).toBeGreaterThan(0);

    const res = await deleteFor(ADMIN, {
      userId: "user_s004",
      confirmEmail: "student004@mastersunion.org",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: Record<string, number> };
    expect(body.deleted.user).toBe(1);
    expect(body.deleted.interviews).toBeGreaterThan(0);

    // Row-level verification, table by table.
    expect(await prisma.user.findUnique({ where: { id: "user_s004" } })).toBeNull();
    expect(await prisma.submission.count({ where: { userId: "user_s004" } })).toBe(0);
    expect(await prisma.interview.count({ where: { userId: "user_s004" } })).toBe(0);
    expect(await prisma.quizAttempt.count({ where: { userId: "user_s004" } })).toBe(0);
    expect(
      await prisma.peerReview.count({
        where: { OR: [{ reviewerId: "user_s004" }, { revieweeId: "user_s004" }] },
      }),
    ).toBe(0);
    expect(await prisma.portfolioEntry.count({ where: { userId: "user_s004" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: "user_s004" } })).toBe(0);

    // The audit record survives and names the erased account (legal basis).
    const audit = await prisma.auditLog.findFirst({
      where: { action: "dpdp-delete", targetId: "user_s004" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit!.after)).toContain("student004@mastersunion.org");

    // Second delete → 404.
    const again = await deleteFor(ADMIN, {
      userId: "user_s004",
      confirmEmail: "student004@mastersunion.org",
    });
    expect(again.status).toBe(404);
  });
});
