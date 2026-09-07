import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { allocatePoints, mulberry32, partitionTeams } from "../lib/seed-utils";
import {
  parseSubmissionSchema,
  validateSubmissionFields,
} from "../lib/submission-schema";
import {
  assertDemoSeedResetAllowed,
  DEMO_SEED_TABLES,
  main as runSeed,
} from "../prisma/seed";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Pure parts (no DB)
// ---------------------------------------------------------------------------

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("partitionTeams", () => {
  it("splits 60 students into 8 teams of 6–8 covering everyone", () => {
    const sizes = partitionTeams(60, 8);
    expect(sizes).toHaveLength(8);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(60);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(6);
      expect(s).toBeLessThanOrEqual(8);
    }
  });

  it("throws when sizes cannot fit the bounds", () => {
    expect(() => partitionTeams(100, 8, 6, 8)).toThrow();
    expect(() => partitionTeams(30, 8, 6, 8)).toThrow();
  });
});

describe("allocatePoints", () => {
  it("always sums to exactly 100 with positive shares", () => {
    const rng = mulberry32(7);
    for (const n of [5, 6, 7]) {
      for (let round = 0; round < 20; round++) {
        const pts = allocatePoints(rng, n);
        expect(pts).toHaveLength(n);
        expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
        for (const p of pts) expect(p).toBeGreaterThan(0);
      }
    }
  });

  it("gives a near-equal split with a constant rng", () => {
    const pts = allocatePoints(() => 0.5, 7);
    expect(pts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...pts) - Math.min(...pts)).toBeLessThanOrEqual(1);
  });
});

describe("submission-schema validator", () => {
  const schema = parseSubmissionSchema({
    fields: [
      { key: "appUrl", label: "App", kind: "link", required: true },
      { key: "writeup", label: "Writeup", kind: "writeup", required: true },
      { key: "extras", label: "Extras", kind: "files", required: false },
    ],
  })!;

  it("parses a well-formed schema and rejects malformed ones", () => {
    expect(schema.fields).toHaveLength(3);
    expect(parseSubmissionSchema({})).toBeNull();
    expect(parseSubmissionSchema({ fields: [{ key: 1 }] })).toBeNull();
    expect(
      parseSubmissionSchema({ fields: [{ key: "x", label: "X", kind: "nope", required: true }] }),
    ).toBeNull();
  });

  it("accepts valid fields and rejects bad links, missing required, unknown keys", () => {
    expect(
      validateSubmissionFields(schema, { appUrl: "https://a.example", writeup: "done" }).ok,
    ).toBe(true);
    expect(
      validateSubmissionFields(schema, { appUrl: "not-a-url", writeup: "done" }).ok,
    ).toBe(false);
    expect(validateSubmissionFields(schema, { appUrl: "https://a.example" }).ok).toBe(false);
    expect(
      validateSubmissionFields(schema, {
        appUrl: "https://a.example",
        writeup: "x",
        rogue: "y",
      }).ok,
    ).toBe(false);
  });
});

describe("demo seed reset boundary", () => {
  it("lists every Prisma application table but never migration history", () => {
    const modelTables = Prisma.dmmf.datamodel.models
      .map((model) => model.dbName ?? model.name)
      .sort();
    expect([...DEMO_SEED_TABLES].sort()).toEqual(modelTables);
    expect(DEMO_SEED_TABLES).not.toContain("_prisma_migrations");
  });

  it("hard-blocks Railway/production and requires explicit authority off loopback", () => {
    expect(() =>
      assertDemoSeedResetAllowed({
        DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/demo",
      }),
    ).not.toThrow();
    expect(() =>
      assertDemoSeedResetAllowed({
        DATABASE_URL: "postgresql://test:test@db.internal:5432/demo",
      }),
    ).toThrow(/ALLOW_DEMO_SEED_RESET/);
    expect(() =>
      assertDemoSeedResetAllowed({
        DATABASE_URL: "postgresql://test:test@db.internal:5432/demo",
        ALLOW_DEMO_SEED_RESET: "true",
      }),
    ).not.toThrow();
    expect(() =>
      assertDemoSeedResetAllowed({
        DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/demo",
        NODE_ENV: "production",
        ALLOW_DEMO_SEED_RESET: "true",
      }),
    ).toThrow(/disabled/);
    expect(() =>
      assertDemoSeedResetAllowed({
        DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/demo",
        RAILWAY_ENVIRONMENT_NAME: "staging",
        ALLOW_DEMO_SEED_RESET: "true",
      }),
    ).toThrow(/disabled/);
  });
});

// ---------------------------------------------------------------------------
// Live-DB seed assertions (self-skip when Postgres is unreachable)
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

describe.skipIf(!live)("seed (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates 8 sections and 483 users (480 students + 3 staff)", async () => {
    expect(await prisma.section.count()).toBe(8);
    expect(await prisma.user.count()).toBe(483);
    expect(await prisma.user.count({ where: { role: "student" } })).toBe(480);
    expect(await prisma.user.count({ where: { role: "admin" } })).toBe(2);
    expect(await prisma.user.count({ where: { role: "instructor" } })).toBe(1);
    const pushpak = await prisma.user.findUnique({ where: { email: "pushpak@praxel.in" } });
    expect(pushpak?.role).toBe("admin");
  });

  it("creates 64 teams of 6–8 members and places every student", async () => {
    const teams = await prisma.team.findMany({ include: { _count: { select: { members: true } } } });
    expect(teams).toHaveLength(64);
    for (const t of teams) {
      expect(t._count.members).toBeGreaterThanOrEqual(6);
      expect(t._count.members).toBeLessThanOrEqual(8);
    }
    expect(
      await prisma.user.count({ where: { role: "student", teamId: null } }),
    ).toBe(0);
    // Sector names come from the section's own sector-board column.
    const a1 = await prisma.team.findFirst({ where: { name: "Team A1" } });
    expect(a1?.sectorName).toBe("Frontier AI labs");
  });

  it("has >= 6 assignment types and every submission validates against its schema", async () => {
    const types = await prisma.assignmentType.count();
    expect(types).toBeGreaterThanOrEqual(6);

    const subs = await prisma.submission.findMany({
      include: { assignment: { include: { assignmentType: true } } },
    });
    expect(subs.length).toBeGreaterThan(0);
    for (const sub of subs) {
      const schema = parseSubmissionSchema(sub.assignment.assignmentType.submissionSchema);
      expect(schema, `schema for ${sub.assignment.assignmentType.slug}`).not.toBeNull();
      const result = validateSubmissionFields(schema!, sub.fields);
      expect(
        result.ok,
        `submission ${sub.id} (${sub.assignment.assignmentType.slug}): ${result.errors.join("; ")}`,
      ).toBe(true);
    }
  });

  it("has exactly one diagnostic quiz, marked isDiagnostic", async () => {
    const diagnostics = await prisma.quiz.findMany({ where: { isDiagnostic: true } });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].sessionNo).toBe(1);
    expect(await prisma.quiz.count()).toBe(3);
    // Every student has a diagnostic attempt.
    expect(
      await prisma.quizAttempt.count({ where: { quizId: diagnostics[0].id } }),
    ).toBe(480);
  });

  it("seeds ~40 submissions covering all five statuses", async () => {
    const total = await prisma.submission.count();
    expect(total).toBeGreaterThanOrEqual(38);
    expect(total).toBeLessThanOrEqual(48);
    for (const status of ["draft", "submitted", "grading", "graded", "finalised"] as const) {
      expect(
        await prisma.submission.count({ where: { status } }),
        `status ${status}`,
      ).toBeGreaterThan(0);
    }
    // Resubmission: a version-2 row with a version-1 history row behind it.
    const v2 = await prisma.submission.findFirst({ where: { version: 2 } });
    expect(v2).not.toBeNull();
    const v1 = await prisma.submission.findFirst({
      where: { assignmentId: v2!.assignmentId, userId: v2!.userId, version: 1 },
    });
    expect(v1).not.toBeNull();
    // Graded submissions carry grades; review-queue content exists.
    expect(await prisma.grade.count()).toBeGreaterThan(10);
    expect(await prisma.grade.count({ where: { confidence: { lt: 0.7 } } })).toBeGreaterThanOrEqual(2);
    expect(await prisma.grade.count({ where: { flags: { isEmpty: false } } })).toBeGreaterThanOrEqual(2);
  });

  it("peer allocations per reviewer sum to 100 and never include self", async () => {
    const reviews = await prisma.peerReview.findMany();
    expect(reviews.length).toBeGreaterThan(0);
    const byReviewer = new Map<string, number>();
    for (const r of reviews) {
      expect(r.reviewerId).not.toBe(r.revieweeId);
      byReviewer.set(r.reviewerId, (byReviewer.get(r.reviewerId) ?? 0) + r.pointsAllocated);
    }
    for (const [reviewer, sum] of byReviewer) {
      expect(sum, `reviewer ${reviewer}`).toBe(100);
    }
  });

  it("gates: sessions 1–3 open, session 4 locked; sealed schema pack locked (spot checks)", async () => {
    const sectionA = (await prisma.section.findUnique({ where: { code: "A" } }))!;
    const gate = (targetType: "session" | "material" | "assignment" | "quiz", targetId: string) =>
      prisma.gate.findUnique({
        where: {
          targetType_targetId_sectionId: { targetType, targetId, sectionId: sectionA.id },
        },
      });
    for (const n of [1, 2, 3]) {
      expect((await gate("session", `spage_${n}`))?.state, `session ${n}`).toBe("open");
    }
    expect((await gate("session", "spage_4"))?.state).toBe("locked");
    expect((await gate("material", "mat_s3_moxie"))?.state).toBe("open");
    expect((await gate("material", "mat_s3_schema_stocks"))?.state).toBe("locked");
    expect((await gate("assignment", "asg_s2_skill"))?.state).toBe("open");
    expect((await gate("assignment", "asg_s4_app"))?.state).toBe("locked");
    expect((await gate("quiz", "quiz_dpdp"))?.state).toBe("closed");
  });

  it("is idempotent: running the seed twice yields identical counts", async () => {
    const countAll = async () => ({
      sections: await prisma.section.count(),
      teams: await prisma.team.count(),
      users: await prisma.user.count(),
      types: await prisma.assignmentType.count(),
      assignments: await prisma.assignment.count(),
      quizzes: await prisma.quiz.count(),
      attempts: await prisma.quizAttempt.count(),
      materials: await prisma.material.count(),
      sessionPages: await prisma.sessionPage.count(),
      gates: await prisma.gate.count(),
      submissions: await prisma.submission.count(),
      grades: await prisma.grade.count(),
      interviews: await prisma.interview.count(),
      turns: await prisma.interviewTurn.count(),
      windows: await prisma.interviewWindow.count(),
      peerReviews: await prisma.peerReview.count(),
      gallery: await prisma.galleryItem.count(),
      signOffs: await prisma.signOff.count(),
      portfolios: await prisma.portfolioEntry.count(),
      config: await prisma.configKV.count(),
      notifications: await prisma.notification.count(),
      costLogs: await prisma.costLog.count(),
    });
    const before = await countAll();
    await runSeed();
    const after = await countAll();
    expect(after).toEqual(before);
  }, 120_000);

  it("seeds the demo interviews (one graded, one escalated) with turns and cost logs", async () => {
    const interviews = await prisma.interview.findMany({ include: { turns: true } });
    expect(interviews).toHaveLength(2);
    const statuses = interviews.map((i) => i.status).sort();
    expect(statuses).toEqual(["escalated", "graded"]);
    for (const iv of interviews) {
      expect(iv.turns.length).toBeGreaterThanOrEqual(8);
      expect(iv.turns.length).toBeLessThanOrEqual(10);
    }
    const escalated = interviews.find((i) => i.status === "escalated")!;
    expect(escalated.escalationReason).toBeTruthy();
    expect(await prisma.costLog.count({ where: { refType: "interview" } })).toBeGreaterThanOrEqual(4);
    expect(await prisma.interviewWindow.count()).toBe(8);
  });
});
