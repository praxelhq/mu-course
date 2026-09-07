import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  getArmedQuizForStudent,
  getBestOfThreeAvg,
  getStudentQuizHistory,
  submitQuizAttempt,
} from "../lib/quizzes";
import { setGateState } from "../lib/gates";
import { getSessionHub } from "../lib/materials";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// U14 functional behavior: instructor arming (a plain gate flip), the
// best-of-three feed, idempotent double-submit via the unique constraint,
// the mid-close grace window, and input validation.

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

const SEC = "sec_A";
const INSTRUCTOR = "user_instructor";

describe.skipIf(!live)("quizzes (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  async function clearAttempts(userId: string, quizIds: string[]) {
    await prisma.quizAttempt.deleteMany({ where: { userId, quizId: { in: quizIds } } });
  }

  async function setQuizGate(
    quizId: string,
    state: "locked" | "open" | "closed",
    closedAt?: Date,
  ) {
    await setGateState({
      targetType: "quiz",
      targetId: quizId,
      sectionId: SEC,
      state,
      actorId: INSTRUCTOR,
    });
    if (closedAt) {
      await prisma.gate.update({
        where: { targetType_targetId_sectionId: { targetType: "quiz", targetId: quizId, sectionId: SEC } },
        data: { closedAt },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Arming = gate flip
  // -------------------------------------------------------------------------

  it("arming via gate flip makes the quiz armed, and the hub slot reflects it", async () => {
    const u = "user_s001";
    await clearAttempts(u, ["quiz_s2"]);

    // Seed leaves quiz gates closed → not armed.
    await setGateState({ targetType: "session", targetId: "spage_2", sectionId: SEC, state: "open", actorId: INSTRUCTOR });
    await setQuizGate("quiz_s2", "closed");
    expect((await getArmedQuizForStudent(u, "quiz_s2")).status).toBe("closed");

    // The instructor's arm action is exactly setGateState → open.
    await setQuizGate("quiz_s2", "open");
    const armed = await getArmedQuizForStudent(u, "quiz_s2");
    expect(armed.status).toBe("ready");
    if (armed.status === "ready") {
      expect(armed.quiz.id).toBe("quiz_s2");
      expect(armed.quiz.questions.length).toBe(6);
      expect(JSON.stringify(armed.quiz)).not.toContain("correctIndex");
    }

    // Hub quiz slot (the data the 4s gate poll re-renders) shows it armed.
    const hub = await getSessionHub(u, 2);
    expect(hub && !hub.locked).toBe(true);
    if (hub && !hub.locked) {
      const slot = hub.quizzes.find((q) => q.id === "quiz_s2");
      expect(slot?.armed).toBe(true);
    }
  });

  it("unarmed / never-opened quiz is not available (module + route)", async () => {
    const u = "user_s006";
    // A fresh quiz with NO gate rows at all (missing row = locked).
    await prisma.quiz.create({
      data: {
        id: "quiz_t_unarmed",
        sessionNo: 2,
        title: "Surprise quiz · Never armed",
        isDiagnostic: false,
        sectionIds: [SEC],
        questions: [
          { q: "Q1", options: ["a", "b"], correctIndex: 0 },
          { q: "Q2", options: ["a", "b"], correctIndex: 1 },
        ],
      },
    });
    expect((await getArmedQuizForStudent(u, "quiz_t_unarmed")).status).toBe("not_available");
    expect((await submitQuizAttempt(u, "quiz_t_unarmed", [0, 1])).status).toBe("not_available");

    const { GET } = await import("../app/api/quiz/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/quiz/quiz_t_unarmed", {
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${u}` },
      }),
      { params: Promise.resolve({ id: "quiz_t_unarmed" }) },
    );
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Best-of-three feed
  // -------------------------------------------------------------------------

  it("best-3 picks the top three non-diagnostic scores; the 4th is feedback only", async () => {
    const u = "user_s002";
    // Reset to a known state: keep the diagnostic attempt, replace normals.
    await clearAttempts(u, ["quiz_s2", "quiz_s3"]);
    await prisma.quiz.createMany({
      data: [
        { id: "quiz_t_a", sessionNo: 2, title: "Surprise quiz · Extra A", isDiagnostic: false, sectionIds: [SEC], questions: [{ q: "Q", options: ["a", "b"], correctIndex: 0 }] },
        { id: "quiz_t_b", sessionNo: 3, title: "Surprise quiz · Extra B", isDiagnostic: false, sectionIds: [SEC], questions: [{ q: "Q", options: ["a", "b"], correctIndex: 0 }] },
      ],
    });
    const base = new Date("2026-07-21T05:00:00Z").getTime();
    const rows: [string, number][] = [
      ["quiz_s2", 90],
      ["quiz_s3", 60], // the 4th-best → feedback only
      ["quiz_t_a", 80],
      ["quiz_t_b", 70],
    ];
    await prisma.quizAttempt.createMany({
      data: rows.map(([quizId, scorePct], i) => ({
        quizId,
        userId: u,
        answers: { choices: [0] },
        scorePct,
        submittedAt: new Date(base + i * 60_000),
      })),
    });

    const history = await getStudentQuizHistory(u);
    expect(history.length).toBe(4); // the diagnostic attempt never appears
    const byQuiz = new Map(history.map((h) => [h.quizId, h]));
    expect(byQuiz.get("quiz_s2")?.countsTowardGrade).toBe(true);
    expect(byQuiz.get("quiz_t_a")?.countsTowardGrade).toBe(true);
    expect(byQuiz.get("quiz_t_b")?.countsTowardGrade).toBe(true);
    expect(byQuiz.get("quiz_s3")?.countsTowardGrade).toBe(false);

    expect(await getBestOfThreeAvg(u)).toBeCloseTo((90 + 80 + 70) / 3, 6);
  });

  // -------------------------------------------------------------------------
  // Idempotent double-submit (the unique constraint is the only guard)
  // -------------------------------------------------------------------------

  it("hammered double-submit: exactly 1 row; losers get the original result", async () => {
    const u = "user_s003";
    await clearAttempts(u, ["quiz_s2"]);
    await setQuizGate("quiz_s2", "open");

    const answers = [0, 1, 2, 1, 1, 1]; // all correct → 100
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => submitQuizAttempt(u, "quiz_s2", answers)),
    );
    const oks = outcomes.filter((o) => o.status === "ok");
    const dups = outcomes.filter((o) => o.status === "duplicate");
    expect(oks.length).toBe(1);
    expect(dups.length).toBe(4);
    for (const d of dups) {
      if (d.status === "duplicate" && oks[0].status === "ok") {
        expect(d.result).toEqual(oks[0].result); // the ORIGINAL result
      }
    }
    const rowCount = await prisma.quizAttempt.count({ where: { userId: u, quizId: "quiz_s2" } });
    expect(rowCount).toBe(1);

    // Route-level: a later re-submit answers 409 with the original result.
    const { POST } = await import("../app/api/quiz/[id]/submit/route");
    const res = await POST(
      new Request("http://localhost/api/quiz/quiz_s2/submit", {
        method: "POST",
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${u}`, "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      }),
      { params: Promise.resolve({ id: "quiz_s2" }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.status).toBe("duplicate");
    expect(body.result.scorePct).toBe(100);
  });

  // -------------------------------------------------------------------------
  // Mid-close grace window
  // -------------------------------------------------------------------------

  it("gate closed 60s ago → submit accepted; 200s ago → rejected", async () => {
    const u60 = "user_s004";
    const u200 = "user_s005";
    await clearAttempts(u60, ["quiz_s2"]);
    await clearAttempts(u200, ["quiz_s2"]);

    await setQuizGate("quiz_s2", "closed", new Date(Date.now() - 60_000));
    const accepted = await submitQuizAttempt(u60, "quiz_s2", [0, 1, 2, 1, 1, 1]);
    expect(accepted.status).toBe("ok");

    await setQuizGate("quiz_s2", "open"); // reset stamps
    await setQuizGate("quiz_s2", "closed", new Date(Date.now() - 200_000));
    const rejected = await submitQuizAttempt(u200, "quiz_s2", [0, 1, 2, 1, 1, 1]);
    expect(rejected.status).toBe("closed");

    // Route surfaces the friendly message.
    const { POST } = await import("../app/api/quiz/[id]/submit/route");
    const res = await POST(
      new Request("http://localhost/api/quiz/quiz_s2/submit", {
        method: "POST",
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${u200}`, "content-type": "application/json" },
        body: JSON.stringify({ answers: [0, 1, 2, 1, 1, 1] }),
      }),
      { params: Promise.resolve({ id: "quiz_s2" }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/closed/i);
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("answers length/shape validated → 422", async () => {
    const u = "user_s007";
    await clearAttempts(u, ["quiz_s2"]);
    await setQuizGate("quiz_s2", "open");

    expect((await submitQuizAttempt(u, "quiz_s2", [0, 1])).status).toBe("invalid"); // wrong length
    expect((await submitQuizAttempt(u, "quiz_s2", [0, 1, 2, 1, 1, 9])).status).toBe("invalid"); // out of range
    expect((await submitQuizAttempt(u, "quiz_s2", "nope")).status).toBe("invalid"); // not an array
    expect((await submitQuizAttempt(u, "quiz_s2", [0, 1, 2, 1, 1, 1.5])).status).toBe("invalid"); // non-integer

    const { POST } = await import("../app/api/quiz/[id]/submit/route");
    const res = await POST(
      new Request("http://localhost/api/quiz/quiz_s2/submit", {
        method: "POST",
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${u}`, "content-type": "application/json" },
        body: JSON.stringify({ answers: [0, 1] }),
      }),
      { params: Promise.resolve({ id: "quiz_s2" }) },
    );
    expect(res.status).toBe(422);

    // Nothing was written by any invalid attempt.
    expect(await prisma.quizAttempt.count({ where: { userId: u, quizId: "quiz_s2" } })).toBe(0);
  });
});
