import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";
import type { StructuredCaller } from "../lib/ai/client";
import type { LookupFn } from "../lib/net/safe-fetch";
import { handleGradeSubmission } from "../worker/jobs/grade-submission";

// U9 — end-to-end grading pipeline with a mocked model client (DI): a seeded
// 'submitted' submission becomes a provisional AI Grade with a full promptLog,
// Notification and CostLog rows; model double-failure leaves status 'grading'
// (dead-letter carries it). Burst tolerance is exercised with a promise pool
// driving the handler directly at concurrency 5 (pg-boss polling inside
// vitest is too flaky to assert on deterministically — stated per the plan).

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

const DIMS = ["functionality", "craft", "relevance", "verification-evidence"];

function fakeModelResponse(confidence = 0.88) {
  return {
    rubricScores: Object.fromEntries(DIMS.map((d) => [d, { score: 7, rationale: "Looks solid." }])),
    total: 28,
    feedbackMd: "**Strong points:** works.\n\n**To improve:** verify more.",
    confidence,
    flags: [] as string[],
  };
}

function fakeModel(opts: { failTimes?: number; delayMs?: number; onCall?: () => void } = {}): StructuredCaller {
  let calls = 0;
  return async (args) => {
    calls += 1;
    opts.onCall?.();
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.failTimes && calls <= opts.failTimes) {
      throw new Error(`fake model failure ${calls}`);
    }
    void args;
    return {
      data: fakeModelResponse() as never,
      usage: { inputTokens: 1200, outputTokens: 300 },
      raw: JSON.stringify(fakeModelResponse()),
      retries: 0,
      model: "fake-model",
    };
  };
}

// safeFetch DI: resolve every hostname to a public IP; every link is alive.
const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const okFetch: typeof fetch = async () =>
  new Response(null, { status: 200 });
const deadFetch: typeof fetch = async () =>
  new Response(null, { status: 404 });

describe.skipIf(!live)("grade-submission pipeline (live DB, mocked model)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("end-to-end: submitted → graded with provisional Grade, promptLog, Notification, CostLog", async () => {
    // sub_003 is seeded 'submitted' (skill assignment).
    const before = await prisma.submission.findUniqueOrThrow({ where: { id: "sub_003" } });
    expect(before.status).toBe("submitted");

    await handleGradeSubmission("sub_003", {
      model: fakeModel(),
      fetchImpl: okFetch,
      lookup: publicLookup,
      embed: null,
    });

    const after = await prisma.submission.findUniqueOrThrow({ where: { id: "sub_003" } });
    expect(after.status).toBe("graded");

    const grade = await prisma.grade.findFirstOrThrow({
      where: { submissionId: "sub_003" },
      orderBy: { createdAt: "desc" },
    });
    expect(grade.provisional).toBe(true);
    expect(grade.gradedBy).toBe("ai");
    expect(grade.total).toBe(28);
    const log = grade.promptLog as Record<string, unknown>;
    expect(log).toBeTruthy();
    expect(typeof log.system).toBe("string");
    expect(typeof log.user).toBe("string");
    expect(log.response).toBeTruthy();
    expect(log.usage).toBeTruthy();
    expect(log.model).toBeTruthy();

    const notif = await prisma.notification.findFirst({
      where: { userId: before.userId, kind: "grade-ready" },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).toBeTruthy();
    expect(notif!.title).toMatch(/grade is ready/i);
    expect(notif!.title + (notif!.body ?? "")).toMatch(/provisional/i);

    const cost = await prisma.costLog.findFirst({
      where: { feature: "grading", refType: "submission", refId: "sub_003" },
    });
    expect(cost).toBeTruthy();
    expect(cost!.provider).toBe("anthropic");
    expect(cost!.tokensIn).toBe(1200);
    expect(cost!.tokensOut).toBe(300);
    expect(cost!.costUsd).toBeGreaterThan(0);
  });

  it("dead link → link-dead flag and capped functionality in the stored grade", async () => {
    // Re-arm a fresh submitted submission (skill type, has a link field).
    await prisma.submission.create({
      data: {
        id: "gp_deadlink",
        assignmentId: "asg_s2_skill",
        userId: "user_s030",
        status: "submitted",
        submittedAt: new Date(),
        fields: { skillLink: "https://dead.example.com/x", writeup: "w" },
        files: [],
        version: 1,
        contentHash: "gp_deadlink_hash",
      },
    });
    await handleGradeSubmission("gp_deadlink", {
      model: fakeModel(),
      fetchImpl: deadFetch,
      lookup: publicLookup,
      embed: null,
    });
    const grade = await prisma.grade.findFirstOrThrow({ where: { submissionId: "gp_deadlink" } });
    expect(grade.flags).toContain("link-dead");
    const scores = grade.rubricScores as Record<string, { score: number }>;
    expect(scores.functionality.score).toBeLessThanOrEqual(3);
  });

  it("status guard: non-'submitted' submissions are skipped", async () => {
    // sub_005 is seeded 'draft'.
    const draft = await prisma.submission.findFirstOrThrow({ where: { status: "draft" } });
    await handleGradeSubmission(draft.id, {
      model: fakeModel(),
      fetchImpl: okFetch,
      lookup: publicLookup,
      embed: null,
    });
    const after = await prisma.submission.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("draft");
    expect(await prisma.grade.count({ where: { submissionId: draft.id } })).toBe(0);
  });

  it("model failure → handler throws, status remains 'grading' (dead-letter carries it)", async () => {
    await prisma.submission.create({
      data: {
        id: "gp_fail",
        assignmentId: "asg_s2_skill",
        userId: "user_s031",
        status: "submitted",
        submittedAt: new Date(),
        fields: { skillLink: "https://ok.example.com/x", writeup: "w" },
        files: [],
        version: 1,
        contentHash: "gp_fail_hash",
      },
    });
    await expect(
      handleGradeSubmission("gp_fail", {
        model: fakeModel({ failTimes: 99 }),
        fetchImpl: okFetch,
        lookup: publicLookup,
        embed: null,
      }),
    ).rejects.toThrow(/fake model failure/);
    const after = await prisma.submission.findUniqueOrThrow({ where: { id: "gp_fail" } });
    expect(after.status).toBe("grading");
    expect(await prisma.grade.count({ where: { submissionId: "gp_fail" } })).toBe(0);
  });

  it("burst: 50 jobs drain through a concurrency-5 pool, no starvation", async () => {
    // 50 fresh submitted submissions.
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `gp_burst_${String(i).padStart(2, "0")}`;
      ids.push(id);
      await prisma.submission.create({
        data: {
          id,
          assignmentId: "asg_s2_skill",
          userId: `user_s${String(100 + i).padStart(3, "0")}`,
          status: "submitted",
          submittedAt: new Date(),
          fields: { skillLink: `https://burst.example.com/${id}`, writeup: `burst writeup ${id}` },
          files: [],
          version: 1,
          contentHash: `burst_hash_${id}`,
        },
      });
    }

    let inFlight = 0;
    let maxInFlight = 0;
    const model: StructuredCaller = async (args) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 25));
      inFlight -= 1;
      void args;
      return {
        data: fakeModelResponse() as never,
        usage: { inputTokens: 500, outputTokens: 100 },
        raw: "{}",
        retries: 0,
        model: "fake-model",
      };
    };

    // Simple promise pool at concurrency 5 (simulating the pg-boss worker pool).
    const CONCURRENCY = 5;
    const queue = [...ids];
    async function drain() {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        await handleGradeSubmission(id, {
          model,
          fetchImpl: okFetch,
          lookup: publicLookup,
          embed: null,
        });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, drain));

    const graded = await prisma.submission.count({
      where: { id: { in: ids }, status: "graded" },
    });
    expect(graded).toBe(50);
    expect(maxInFlight).toBeLessThanOrEqual(CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran concurrently
    const grades = await prisma.grade.count({ where: { submissionId: { in: ids } } });
    expect(grades).toBe(50);
  }, 120_000);
});
