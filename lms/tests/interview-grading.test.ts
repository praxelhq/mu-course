import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";
import type { StructuredCaller } from "../lib/ai/client";

// U12 — grade.interview consumer: rubric persistence, escalation rules,
// score-free notifications. Model is a DI mock; live DB.

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

type InterviewGrade = {
  rubricScores: Record<string, { score: number; rationale: string }>;
  total: number;
  confidence: number;
  flags: string[];
};

function mockModel(reply: InterviewGrade): StructuredCaller {
  return (async (args: { schema: { safeParse: (v: unknown) => { success: boolean } } }) => {
    const parsed = (args.schema as unknown as { parse: (v: unknown) => unknown }).parse(reply);
    return {
      data: parsed,
      usage: { inputTokens: 5000, outputTokens: 400 },
      raw: JSON.stringify(reply),
      retries: 0,
      model: "claude-sonnet-4-5",
    };
  }) as unknown as StructuredCaller;
}

const GOOD_GRADE: InterviewGrade = {
  rubricScores: {
    industry_command: { score: 21, rationale: "Clear grasp of unit economics." },
    defence_of_submissions: { score: 19, rationale: "Explained the automation and its failure mode." },
    operators_loop: { score: 20, rationale: "Named the exact number re-derived." },
    transfer: { score: 17, rationale: "Applied the model to the new scenario sensibly." },
  },
  total: 77,
  confidence: 0.88,
  flags: [],
};

describe.skipIf(!live)("worker/jobs/grade-interview (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function makeCompletedInterview(userId: string): Promise<string> {
    const id = `ivt_${userId}_${Date.now()}`;
    const t0 = new Date(Date.now() - 11 * 60_000);
    await prisma.interview.create({
      data: {
        id,
        userId,
        status: "completed",
        transport: "turnbased-fallback",
        attemptNumber: 1,
        createdAt: t0,
        completedAt: new Date(),
      },
    });
    const qa: [string, string][] = [
      ["Explain the economics of your industry.", "Lenders earn the spread minus defaults."],
      ["Walk me through your automation.", "It watches an inbox and writes a sheet the ops lead reviews."],
      ["What number did you personally verify?", "October clean revenue — rebuilt the pivot myself."],
    ];
    let turnNo = 1;
    for (const [i, [q, a]] of qa.entries()) {
      await prisma.interviewTurn.create({
        data: {
          interviewId: id,
          turnNo: turnNo++,
          speaker: "agent",
          text: q,
          startedAt: new Date(t0.getTime() + i * 3 * 60_000),
        },
      });
      await prisma.interviewTurn.create({
        data: {
          interviewId: id,
          turnNo: turnNo++,
          speaker: "student",
          text: a,
          startedAt: new Date(t0.getTime() + i * 3 * 60_000 + 45_000),
        },
      });
    }
    return id;
  }

  it("high confidence, no flags → graded with rubric persisted; notification carries no scores; CostLog written", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    const id = await makeCompletedInterview("user_s010");
    await handleGradeInterview(id, { model: mockModel(GOOD_GRADE) });

    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.status).toBe("graded");
    expect(iv.confidence).toBe(0.88);
    // Flat, seed-compatible shape ({industry_command: n, ..., total}) plus
    // rationales/flags for the instructor page.
    const scores = iv.rubricScores as Record<string, unknown>;
    expect(scores.industry_command).toBe(21);
    expect(scores.total).toBe(77);
    expect((scores.rationales as Record<string, string>).transfer).toBeTruthy();
    expect(iv.escalationReason).toBeNull();

    const ntf = await prisma.notification.findFirst({
      where: { userId: "user_s010", kind: "interview-recorded" },
      orderBy: { createdAt: "desc" },
    });
    expect(ntf).not.toBeNull();
    expect(ntf!.title + (ntf!.body ?? "")).not.toMatch(/\d/); // no scores, no numbers at all

    const cost = await prisma.costLog.findFirst({
      where: { feature: "interview", provider: "anthropic", refId: id },
    });
    expect(cost).not.toBeNull();
    expect(cost!.tokensIn).toBe(5000);
  });

  it("confidence 0.65 → escalated with a reason", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    const id = await makeCompletedInterview("user_s011");
    await handleGradeInterview(id, {
      model: mockModel({ ...GOOD_GRADE, confidence: 0.65 }),
    });
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.status).toBe("escalated");
    expect(iv.escalationReason).toMatch(/confidence/i);
  });

  it("'inconsistent-with-submissions' flag → escalated even at high confidence", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    const id = await makeCompletedInterview("user_s012");
    await handleGradeInterview(id, {
      model: mockModel({ ...GOOD_GRADE, flags: ["inconsistent-with-submissions"] }),
    });
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.status).toBe("escalated");
    expect(iv.escalationReason).toMatch(/inconsistent/i);
  });

  it("'possible-coaching' flag → escalated", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    const id = await makeCompletedInterview("user_s013");
    await handleGradeInterview(id, {
      model: mockModel({ ...GOOD_GRADE, flags: ["possible-coaching"] }),
    });
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.status).toBe("escalated");
    expect(iv.escalationReason).toMatch(/coaching/i);
  });

  it("prompt: includes the transcript with per-turn timings and wrapped submission summaries", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    const id = await makeCompletedInterview("user_s002"); // has seeded graded submissions
    let seenSystem = "";
    let seenUser = "";
    const spyModel: StructuredCaller = (async (args: {
      system: string;
      user: string;
      schema: { parse: (v: unknown) => unknown };
    }) => {
      seenSystem = args.system;
      seenUser = args.user;
      return {
        data: args.schema.parse(GOOD_GRADE),
        usage: { inputTokens: 1, outputTokens: 1 },
        raw: "{}",
        retries: 0,
        model: "claude-sonnet-4-5",
      };
    }) as unknown as StructuredCaller;
    await handleGradeInterview(id, { model: spyModel });
    expect(seenUser).toContain("Walk me through your automation.");
    expect(seenUser).toMatch(/\+\d+s|\d+s later|elapsed/i); // per-turn timing present
    expect(seenUser).toContain("<student_content>");
    expect(seenSystem).toMatch(/industry_command/);
    expect(seenSystem).toMatch(/possible-coaching/);
  });

  it("skips interviews that are not completed", async () => {
    const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
    // Seeded iv_001 is already graded — handler must not touch it.
    const before = await prisma.interview.findUniqueOrThrow({ where: { id: "iv_001" } });
    await handleGradeInterview("iv_001", { model: mockModel(GOOD_GRADE) });
    const after = await prisma.interview.findUniqueOrThrow({ where: { id: "iv_001" } });
    expect(after.status).toBe(before.status);
    expect(after.confidence).toBe(before.confidence);
  });

  it("escalation vs graded is decided by the pure rule helper", async () => {
    const { interviewEscalationReason } = await import("../lib/ai/interview-grading");
    expect(interviewEscalationReason({ confidence: 0.9, flags: [] })).toBeNull();
    expect(interviewEscalationReason({ confidence: 0.69, flags: [] })).toMatch(/confidence/i);
    expect(
      interviewEscalationReason({ confidence: 0.9, flags: ["inconsistent-with-submissions"] }),
    ).toMatch(/inconsistent/i);
    expect(interviewEscalationReason({ confidence: 0.9, flags: ["too-short"] })).toBeNull();
  });
});
