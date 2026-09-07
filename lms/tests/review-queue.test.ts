import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import {
  finaliseAssignment,
  getReviewQueue,
  overrideGrade,
  previewFinalise,
} from "../lib/review-queue";
import { getStudentDashboard } from "../lib/dashboard";

// U10 — human oversight: review queue (low-confidence + flags + dynamic
// percentile outliers), one-click override with reason, batch finalise.
// Live-DB tests against the deterministic seed (self-skip without Postgres).
//
// Seed facts used below:
//   grade_sub_019 → confidence 0.55, submission graded  (queue: low-confidence)
//   grade_sub_024 → flags [possible-plagiarism], graded (queue: flag)
//   grade_sub_007 → flags [link-dead], provisional      (queue: flag)
//   grade_sub_006 → confidence 0.62 BUT its owner resubmitted (sub_042_v2
//                   supersedes sub_006) → must NOT be in the queue.

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

describe.skipIf(!live)("U10 review queue + override + finalise (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed(); // pristine world — earlier test files mutate the DB
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  // --- helpers -------------------------------------------------------------

  /** Create a controlled assignment with graded submissions of known totals. */
  async function createCohort(assignmentId: string, totals: number[], startUser: number) {
    await prisma.assignment.create({
      data: {
        id: assignmentId,
        assignmentTypeId: "atype_skill",
        title: `PCT · ${assignmentId}`,
        brief: "Controlled percentile fixture",
        sectionIds: [],
      },
    });
    await addGrades(assignmentId, totals, startUser);
  }

  async function addGrades(assignmentId: string, totals: number[], startUser: number) {
    for (let i = 0; i < totals.length; i++) {
      const uid = `user_s${String(startUser + i).padStart(3, "0")}`;
      const subId = `sub_${assignmentId}_${startUser + i}`;
      await prisma.submission.create({
        data: {
          id: subId,
          assignmentId,
          userId: uid,
          status: "graded",
          submittedAt: new Date("2026-07-25T10:00:00Z"),
          fields: {},
          files: [],
          version: 1,
          contentHash: subId,
        },
      });
      await prisma.grade.create({
        data: {
          id: `grade_${subId}`,
          submissionId: subId,
          rubricScores: { functionality: { score: 5, rationale: "fixture" } },
          total: totals[i],
          confidence: 0.95,
          feedbackMd: "fixture",
          flags: [],
          gradedBy: "ai",
          provisional: true,
        },
      });
    }
  }

  // --- queue contents from the seed ---------------------------------------

  it("contains the seeded low-confidence and flagged grades with correct reasons", async () => {
    const queue = await getReviewQueue();
    const byGrade = new Map(queue.map((i) => [i.gradeId, i]));

    const low = byGrade.get("grade_sub_019");
    expect(low, "0.55-confidence grade should be queued").toBeTruthy();
    expect(low!.reasons).toContain("low-confidence");
    expect(low!.confidence).toBe(0.55);

    const plag = byGrade.get("grade_sub_024");
    expect(plag, "possible-plagiarism grade should be queued").toBeTruthy();
    expect(plag!.reasons).toContain("possible-plagiarism");

    const dead = byGrade.get("grade_sub_007");
    expect(dead, "link-dead grade should be queued").toBeTruthy();
    expect(dead!.reasons).toContain("link-dead");

    // Every queue item has at least one reason and carries submission info.
    for (const item of queue) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.studentName.length).toBeGreaterThan(0);
      expect(item.assignmentTitle.length).toBeGreaterThan(0);
      expect(item.typeTitle.length).toBeGreaterThan(0);
      expect(item.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("excludes superseded versions and clean mid-distribution grades", async () => {
    const queue = await getReviewQueue();
    const ids = new Set(queue.map((i) => i.gradeId));

    // sub_006 (confidence 0.62) was superseded by the v2 resubmission
    // sub_042_v2 of the same owner — the old grade must not be queued.
    expect(ids.has("grade_sub_006")).toBe(false);

    // A clean grade (confidence ≥ 0.7, no flags) whose total sits STRICTLY
    // between its assignment's min and max CANDIDATE totals is never queued.
    // Candidates = the latest grade of the latest submission version per
    // owner, provisional only — the same set the queue ranks.
    const subs = await prisma.submission.findMany({
      where: { grades: { some: {} } },
      select: {
        assignmentId: true,
        userId: true,
        teamId: true,
        grades: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, total: true, confidence: true, flags: true, provisional: true },
        },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    const latest = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      const key = `${s.assignmentId}:${s.teamId ?? s.userId}`;
      if (!latest.has(key)) latest.set(key, s);
    }
    const candidates = [...latest.values()]
      .filter((s) => s.grades[0]?.provisional)
      .map((s) => ({ assignmentId: s.assignmentId, ...s.grades[0] }));
    const byAssignment = new Map<string, number[]>();
    for (const g of candidates) {
      const list = byAssignment.get(g.assignmentId) ?? [];
      list.push(g.total);
      byAssignment.set(g.assignmentId, list);
    }
    const cleanMid = candidates.filter((g) => {
      const totals = byAssignment.get(g.assignmentId)!;
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      return g.confidence >= 0.7 && g.flags.length === 0 && g.total > min && g.total < max;
    });
    expect(cleanMid.length).toBeGreaterThan(0); // the seed provides at least one
    for (const g of cleanMid) expect(ids.has(g.id), g.id).toBe(false);
  });

  // --- dynamic percentile trigger ------------------------------------------

  it("flags exactly ceil(n*0.05) top and bottom outliers for n=20", async () => {
    await createCohort("asg_pct_a", Array.from({ length: 20 }, (_, i) => 10 + i), 301);

    const queue = await getReviewQueue({ assignmentId: "asg_pct_a" });
    expect(queue.length).toBe(2); // all clean & confident — only percentile
    const high = queue.find((i) => i.reasons.includes("percentile-high"));
    const low = queue.find((i) => i.reasons.includes("percentile-low"));
    expect(high?.total).toBe(29);
    expect(low?.total).toBe(10);
  });

  it("membership shifts when the distribution moves (computed at render, not grade time)", async () => {
    // 20 more, all higher: n=40 → k=2 each side. The early top outlier (29)
    // is now mid-distribution and must drop out of the queue.
    await addGrades("asg_pct_a", Array.from({ length: 20 }, (_, i) => 30 + i), 331);

    const queue = await getReviewQueue({ assignmentId: "asg_pct_a" });
    const highs = queue.filter((i) => i.reasons.includes("percentile-high")).map((i) => i.total).sort((a, b) => a - b);
    const lows = queue.filter((i) => i.reasons.includes("percentile-low")).map((i) => i.total).sort((a, b) => a - b);
    expect(highs).toEqual([48, 49]);
    expect(lows).toEqual([10, 11]);
    expect(queue.some((i) => i.total === 29)).toBe(false);
  });

  it("n=2 flags both (one high, one low); n=1 flags none", async () => {
    await createCohort("asg_pct_two", [12, 35], 361);
    const two = await getReviewQueue({ assignmentId: "asg_pct_two" });
    expect(two.length).toBe(2);
    expect(two.find((i) => i.total === 35)!.reasons).toEqual(["percentile-high"]);
    expect(two.find((i) => i.total === 12)!.reasons).toEqual(["percentile-low"]);

    await createCohort("asg_pct_one", [22], 371);
    const one = await getReviewQueue({ assignmentId: "asg_pct_one" });
    expect(one.length).toBe(0);
  });

  // --- override -------------------------------------------------------------

  it("override requires a non-empty reason", async () => {
    await expect(
      overrideGrade({ gradeId: "grade_sub_019", actorId: "user_instructor", reason: "   " }),
    ).rejects.toThrow(/reason/i);
    // Nothing changed.
    const g = await prisma.grade.findUnique({ where: { id: "grade_sub_019" } });
    expect(g!.overriddenBy).toBeNull();
    expect(g!.gradedBy).toBe("ai");
  });

  it("override recomputes the total, audits before/after, and notifies the student", async () => {
    const before = await prisma.grade.findUnique({
      where: { id: "grade_sub_019" },
      include: { submission: { select: { userId: true } } },
    });
    const beforeScores = before!.rubricScores as Record<string, { score: number }>;
    const expectedTotal =
      9 + 8 + beforeScores.relevance.score + beforeScores["verification-evidence"].score;

    await overrideGrade({
      gradeId: "grade_sub_019",
      actorId: "user_instructor",
      rubricScores: { functionality: 9, craft: 8 },
      feedbackMd: "Rechecked by hand — the verification note holds up.",
      reason: "Confidence was low; manual recheck confirms higher quality.",
    });

    const after = await prisma.grade.findUnique({ where: { id: "grade_sub_019" } });
    expect(after!.gradedBy).toBe("human");
    expect(after!.overriddenBy).toBe("user_instructor");
    expect(after!.overrideReason).toContain("manual recheck");
    expect(after!.total).toBe(expectedTotal);
    const afterScores = after!.rubricScores as Record<string, { score: number }>;
    expect(afterScores.functionality.score).toBe(9);
    expect(afterScores.craft.score).toBe(8);
    expect(afterScores.relevance.score).toBe(beforeScores.relevance.score);
    expect(after!.feedbackMd).toContain("Rechecked by hand");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "grade.override", targetId: "grade_sub_019" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect(audit!.actorId).toBe("user_instructor");
    const auditBefore = audit!.before as { total: number; gradedBy: string };
    const auditAfter = audit!.after as { total: number; gradedBy: string };
    expect(auditBefore.total).toBe(before!.total);
    expect(auditBefore.gradedBy).toBe("ai");
    expect(auditAfter.total).toBe(expectedTotal);
    expect(auditAfter.gradedBy).toBe("human");

    const notification = await prisma.notification.findFirst({
      where: { userId: before!.submission.userId, kind: "grade-updated" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).toBeTruthy();
    expect(notification!.title).toBe("Your grade was reviewed and updated");
  });

  // --- batch finalise -------------------------------------------------------

  it("finalise flips the batch, audits it, and holds back newly-outlier unreviewed grades", async () => {
    await createCohort("asg_pct_fin", Array.from({ length: 20 }, (_, i) => 10 + i), 401);

    const preview = await previewFinalise("asg_pct_fin");
    expect(preview.count).toBe(18);
    expect(preview.newlyFlagged.length).toBe(2);

    const result = await finaliseAssignment({ assignmentId: "asg_pct_fin", actorId: "user_instructor" });
    expect(result.finalised).toBe(18);
    expect(result.newlyFlagged.length).toBe(2);
    const flaggedTotals = result.newlyFlagged.map((f) => f.total).sort((a, b) => a - b);
    expect(flaggedTotals).toEqual([10, 29]);

    // Batch flipped: 18 finalised submissions with non-provisional grades.
    const finalisedSubs = await prisma.submission.findMany({
      where: { assignmentId: "asg_pct_fin", status: "finalised" },
      include: { grades: true },
    });
    expect(finalisedSubs.length).toBe(18);
    for (const s of finalisedSubs) expect(s.grades[0].provisional).toBe(false);

    // The two outliers stayed graded + provisional (NOT auto-finalised).
    const held = await prisma.submission.findMany({
      where: { assignmentId: "asg_pct_fin", status: "graded" },
      include: { grades: true },
    });
    expect(held.length).toBe(2);
    for (const s of held) expect(s.grades[0].provisional).toBe(true);

    // One audit row summarising the batch.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "assignment.finalise", targetId: "asg_pct_fin" },
    });
    expect(audit).toBeTruthy();
    const summary = audit!.after as { finalised: number; submissionIds: string[] };
    expect(summary.finalised).toBe(18);
    expect(summary.submissionIds.length).toBe(18);
  });

  it("already-overridden outliers finalise normally on the next pass", async () => {
    // Override the high outlier (total 29 → user 420's grade), then finalise.
    const high = await prisma.grade.findFirst({
      where: { submission: { assignmentId: "asg_pct_fin" }, total: 29, provisional: true },
    });
    expect(high).toBeTruthy();
    await overrideGrade({
      gradeId: high!.id,
      actorId: "user_instructor",
      reason: "Outlier verified — the work genuinely is this strong.",
    });

    const result = await finaliseAssignment({ assignmentId: "asg_pct_fin", actorId: "user_instructor" });
    expect(result.finalised).toBe(1); // the overridden outlier goes through
    expect(result.newlyFlagged.length).toBe(1); // the unreviewed low outlier stays held
    expect(result.newlyFlagged[0].total).toBe(10);

    const overridden = await prisma.grade.findUnique({ where: { id: high!.id } });
    expect(overridden!.provisional).toBe(false);
  });

  // --- endpoint guards ------------------------------------------------------

  function post(path: string, userId: string, body: unknown) {
    return new Request(`http://test.local${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
      },
    });
  }

  it("students are blocked (403) from override and finalise endpoints", async () => {
    const { POST: override } = await import("../app/api/grades/override/route");
    const { POST: finalise } = await import("../app/api/grades/finalise/route");

    const r1 = await override(
      post("/api/grades/override", "user_s001", {
        gradeId: "grade_sub_024",
        reason: "student should never reach this",
      }),
    );
    expect(r1.status).toBe(403);

    const r2 = await finalise(
      post("/api/grades/finalise", "user_s001", { assignmentId: "asg_s2_skill" }),
    );
    expect(r2.status).toBe(403);

    // Instructor with an empty reason → 400, not a write.
    const r3 = await override(
      post("/api/grades/override", "user_instructor", { gradeId: "grade_sub_024", reason: "" }),
    );
    expect(r3.status).toBe(400);
    const untouched = await prisma.grade.findUnique({ where: { id: "grade_sub_024" } });
    expect(untouched!.overriddenBy).toBeNull();
  });

  it("finalise endpoint asks for confirmation first, then executes", async () => {
    await createCohort("asg_pct_api", [15, 40], 431);
    const { POST: finalise } = await import("../app/api/grades/finalise/route");

    const r1 = await finalise(
      post("/api/grades/finalise", "user_instructor", { assignmentId: "asg_pct_api" }),
    );
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1.needsConfirm).toBe(true);
    expect(b1.newlyFlagged.length).toBe(2); // n=2 → both outliers, unreviewed

    // Nothing changed without confirmed:true.
    const still = await prisma.submission.count({
      where: { assignmentId: "asg_pct_api", status: "graded" },
    });
    expect(still).toBe(2);

    const r2 = await finalise(
      post("/api/grades/finalise", "user_instructor", { assignmentId: "asg_pct_api", confirmed: true }),
    );
    const b2 = await r2.json();
    expect(b2.ok).toBe(true);
    expect(b2.finalised).toBe(0); // both held back for review
    expect(b2.newlyFlagged.length).toBe(2);
  });

  // --- student projections never leak promptLog -----------------------------

  it("the student dashboard grade projection contains no promptLog", async () => {
    const d = await getStudentDashboard("user_s001");
    expect(d.grades.length).toBeGreaterThan(0);
    expect(JSON.stringify(d)).not.toContain("promptLog");
  });
});
