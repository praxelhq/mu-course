import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  getArmedQuizForStudent,
  getBestOfThreeAvg,
  getStudentQuizHistory,
  submitQuizAttempt,
} from "../lib/quizzes";
import { getQuizResults, listQuizzesForInstructor } from "../lib/quizzes/instructor";
import { getStudentDashboard } from "../lib/dashboard";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// R24 — THE isolation invariant. A quiz flagged isDiagnostic must NEVER appear
// in any student-facing retrospective surface (history, tallies, counts,
// best-of, dashboard) and no student-facing payload may contain the string
// "diagnostic" or the isDiagnostic key. The live TAKING path, however, must be
// byte-identical in shape for diagnostic vs normal quizzes — students must not
// be able to detect anything special while taking one or right after.

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

/** Deep leak scan: serialize and look for any hint that diagnostics exist. */
function leakHits(value: unknown): string[] {
  const json = JSON.stringify(value) ?? "";
  const hits: string[] = [];
  if (/diagnostic/i.test(json)) hits.push("contains 'diagnostic'");
  if (/isDiagnostic/.test(json)) hits.push("contains isDiagnostic key");
  return hits;
}

/** Structural shape of a value: key sets + primitive types, arrays by element. */
function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return v.length > 0 ? [shapeOf(v[0])] : [];
  if (v instanceof Date) return "date";
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, shapeOf(val)]),
    );
  }
  return typeof v;
}

describe.skipIf(!live)("R24 diagnostic isolation (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  // A student who sat the diagnostic AND both normal quizzes (3 attempts total).
  let studentId: string;
  let sectionId: string;
  let normalScores: number[];

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    const u = await prisma.user.findFirst({
      where: {
        role: "student",
        AND: [
          { quizAttempts: { some: { quizId: "quiz_dpdp" } } },
          { quizAttempts: { some: { quizId: "quiz_s2" } } },
          { quizAttempts: { some: { quizId: "quiz_s3" } } },
        ],
      },
      select: { id: true, sectionId: true },
      orderBy: { id: "asc" },
    });
    if (!u || !u.sectionId) throw new Error("seed: no student with all three attempts");
    studentId = u.id;
    sectionId = u.sectionId;

    const normals = await prisma.quizAttempt.findMany({
      where: { userId: studentId, quizId: { in: ["quiz_s2", "quiz_s3"] } },
      select: { scorePct: true },
    });
    normalScores = normals.map((a) => a.scorePct);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // Retrospective surfaces: the diagnostic attempt simply does not exist
  // -------------------------------------------------------------------------

  it("module history shows EXACTLY the 2 normal attempts (count, ids, no leak)", async () => {
    // The student really has 3 attempt rows in the DB.
    const raw = await prisma.quizAttempt.count({ where: { userId: studentId } });
    expect(raw).toBe(3);

    const history = await getStudentQuizHistory(studentId);
    expect(history.length).toBe(2);
    expect(history.map((h) => h.quizId).sort()).toEqual(["quiz_s2", "quiz_s3"]);
    expect(leakHits(history)).toEqual([]);
  });

  it("best-of-3 average is computed from the 2 normal attempts only", async () => {
    const avg = await getBestOfThreeAvg(studentId);
    const expected = normalScores.reduce((a, b) => a + b, 0) / normalScores.length;
    expect(avg).toBeCloseTo(expected, 6);
  });

  it("GET /api/quiz/history returns data consistent with exactly 2 attempts ever existing", async () => {
    const { GET } = await import("../app/api/quiz/history/route");
    const res = await GET(
      new Request("http://localhost/api/quiz/history", {
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${studentId}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attempts.length).toBe(2);
    expect(leakHits(body)).toEqual([]);
  });

  it("dashboard payload never mentions diagnostics", async () => {
    const dash = await getStudentDashboard(studentId);
    expect(leakHits(dash)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Taking-path indistinguishability (diagnostic vs normal)
  // -------------------------------------------------------------------------

  async function forceGate(
    targetType: "session" | "quiz",
    targetId: string,
    state: "locked" | "open" | "closed",
  ) {
    await prisma.gate.upsert({
      where: { targetType_targetId_sectionId: { targetType, targetId, sectionId } },
      update: { state, opensAt: null, closedAt: null },
      create: { targetType, targetId, sectionId, state },
    });
  }

  it("instructor module DOES see the diagnostic with its per-section aggregate", async () => {
    // Runs before the taking-path test deletes one seeded attempt.
    const list = await listQuizzesForInstructor();
    const dpdp = list.find((q) => q.id === "quiz_dpdp");
    expect(dpdp).toBeDefined();
    expect(dpdp!.isDiagnostic).toBe(true);
    expect(dpdp!.attemptCount).toBe(480); // every seeded student sat it

    const results = await getQuizResults("quiz_dpdp");
    expect(results).not.toBeNull();
    expect(results!.isDiagnostic).toBe(true);
    expect(results!.perSection.length).toBe(8); // the S1 pre-read signal table
    for (const row of results!.perSection) {
      expect(row.attemptCount).toBe(60);
      expect(row.perQuestionCorrectPct.length).toBe(5);
    }
  });

  it("taking + submitting + revisiting a diagnostic is shape-identical to a normal quiz", async () => {
    // Clear this student's seeded attempts on both quizzes and arm both gates.
    await prisma.quizAttempt.deleteMany({
      where: { userId: studentId, quizId: { in: ["quiz_dpdp", "quiz_s2"] } },
    });
    await forceGate("session", "spage_1", "open");
    await forceGate("session", "spage_2", "open");
    await forceGate("quiz", "quiz_dpdp", "open");
    await forceGate("quiz", "quiz_s2", "open");

    // 1. Armed (GET) payloads: same shape, no correctIndex, no leak.
    const armedDiag = await getArmedQuizForStudent(studentId, "quiz_dpdp");
    const armedNorm = await getArmedQuizForStudent(studentId, "quiz_s2");
    expect(armedDiag.status).toBe("ready");
    expect(armedNorm.status).toBe("ready");
    expect(shapeOf(armedDiag)).toEqual(shapeOf(armedNorm));
    expect(leakHits(armedDiag)).toEqual([]);
    expect(JSON.stringify(armedDiag)).not.toContain("correctIndex");
    if (armedDiag.status === "ready") {
      for (const q of armedDiag.quiz.questions) {
        expect(Object.keys(q).sort()).toEqual(["options", "q"]);
      }
    }

    // 2. Submit both: same result shape, immediate formative feedback for BOTH.
    const subDiag = await submitQuizAttempt(studentId, "quiz_dpdp", [1, 2, 1, 1, 1]);
    const subNorm = await submitQuizAttempt(studentId, "quiz_s2", [0, 1, 2, 1, 1, 1]);
    expect(subDiag.status).toBe("ok");
    expect(subNorm.status).toBe("ok");
    expect(shapeOf(subDiag)).toEqual(shapeOf(subNorm));
    expect(leakHits(subDiag)).toEqual([]);
    expect(leakHits(subNorm)).toEqual([]);
    if (subDiag.status === "ok") {
      // Formative view: score + the correct answer for every question.
      expect(subDiag.result.scorePct).toBe(100);
      expect(subDiag.result.lines.every((l) => typeof l.correctAnswer === "number")).toBe(true);
    }

    // 3. Revisit after attempting: identical state for both kinds.
    const revisitDiag = await getArmedQuizForStudent(studentId, "quiz_dpdp");
    const revisitNorm = await getArmedQuizForStudent(studentId, "quiz_s2");
    expect(revisitDiag).toEqual(revisitNorm);
    expect(revisitDiag.status).toBe("attempted");

    // 4. And the fresh diagnostic attempt STILL never enters history/best-of.
    const history = await getStudentQuizHistory(studentId);
    expect(history.map((h) => h.quizId).sort()).toEqual(["quiz_s2", "quiz_s3"]);
    expect(leakHits(history)).toEqual([]);
    const avg = await getBestOfThreeAvg(studentId);
    expect(avg).not.toBeNull();
  });
});
