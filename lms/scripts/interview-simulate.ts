/**
 * Deterministic, database-backed contract test for the one supported student
 * transport: realtime LiveKit. It proves stale manual-fallback requests cannot
 * mutate the interview, agent turns retain one ordered transcript, and agent
 * completion alone enqueues worker grading.
 *
 * It does not claim to open WebRTC. The deployed LLM-student canary owns that
 * provider and browser proof.
 */

process.env.INTERVIEW_DEV_SCRIPTED = "1";
process.env.ENABLE_TEST_LOGIN = "1";
process.env.AGENT_INTERNAL_TOKEN = process.env.AGENT_INTERNAL_TOKEN || "simulate-secret";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REALTIME_USER = "user_s011";
let failures = 0;
let restoreState:
  | {
      window: { opensAt: Date; closesAt: Date };
      rollout: { value: unknown } | null;
    }
  | undefined;

function check(condition: unknown, label: string): void {
  if (condition) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

function cookieReq(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie: `forge_test_user=${REALTIME_USER}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function agentReq(url: string, token: string | null, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-agent-token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function prepare(): Promise<void> {
  const [window, rollout] = await Promise.all([
    prisma.interviewWindow.findUniqueOrThrow({
      where: { id: "ivw_A" },
      select: { opensAt: true, closesAt: true },
    }),
    prisma.configKV.findUnique({ where: { key: "interview_v2" }, select: { value: true } }),
  ]);
  restoreState = { window, rollout };
  await prisma.interviewWindow.update({
    where: { id: "ivw_A" },
    data: { opensAt: new Date(Date.now() - 3_600_000), closesAt: new Date(Date.now() + 3_600_000) },
  });
  await prisma.interviewTurn.deleteMany({ where: { interview: { userId: REALTIME_USER } } });
  await prisma.interview.deleteMany({ where: { userId: REALTIME_USER } });
  await prisma.interviewRetake.deleteMany({ where: { userId: REALTIME_USER } });
  await prisma.configKV.upsert({
    where: { key: "interview_v2" },
    create: { key: "interview_v2", value: { open: true } },
    update: { value: { open: true } },
  });
}

async function restore(): Promise<void> {
  if (!restoreState) return;
  await prisma.interviewWindow.update({ where: { id: "ivw_A" }, data: restoreState.window });
  if (restoreState.rollout) {
    await prisma.configKV.update({
      where: { key: "interview_v2" },
      data: { value: restoreState.rollout.value as object },
    });
  } else {
    await prisma.configKV.deleteMany({ where: { key: "interview_v2" } });
  }
}

function assertOrderedTranscript(turns: { turnNo: number; speaker: string }[]): void {
  check(
    turns.length > 0 && turns.every((turn, index) => turn.turnNo === index + 1),
    "realtime transcript has contiguous turn numbers",
  );
  check(
    turns.every((turn) => turn.speaker === "agent" || turn.speaker === "student"),
    "realtime transcript contains only agent/student turns",
  );
}

async function grade(interviewId: string): Promise<void> {
  const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
  const fakeModel = (async (args: { schema: { parse: (value: unknown) => unknown } }) => {
    const dimension = (score: number) => ({ score, rationale: "simulated realtime candidate" });
    const data = {
      rubricScores: {
        industry_command: dimension(18),
        defence_of_submissions: dimension(17),
        operators_loop: dimension(16),
        transfer: dimension(19),
      },
      total: 70,
      confidence: 0.9,
      flags: [],
    };
    args.schema.parse(data);
    return { data, model: "simulated", usage: { inputTokens: 100, outputTokens: 50 } };
  }) as unknown as import("../worker/jobs/grade-interview").GradeInterviewDeps["model"];
  await handleGradeInterview(interviewId, { model: fakeModel });
}

async function simulateRealtimeFlow(): Promise<void> {
  console.log("\n[a] realtime-only interview contract");
  const agentToken = process.env.AGENT_INTERNAL_TOKEN!;

  const tokenRoute = await import("../app/api/interview/token/route");
  const unavailable = await tokenRoute.POST(cookieReq("http://sim/api/interview/token", {}));
  check(unavailable.status === 503, "missing LiveKit configuration refuses admission");
  check(await prisma.interview.count({ where: { userId: REALTIME_USER } }) === 0, "unavailable admission creates no interview");

  const { startInterview } = await import("../lib/interview/session");
  const interview = await startInterview(REALTIME_USER);
  await prisma.interview.update({
    where: { id: interview.id },
    data: { transport: "realtime", lastSeenAt: new Date() },
  });

  const fallbackRoute = await import("../app/api/interview/fallback/route");
  const staleFallback = await fallbackRoute.POST(
    cookieReq("http://sim/api/interview/fallback", { interviewId: interview.id, reason: "simulated-disconnect" }),
  );
  check(staleFallback.status === 409, "stale manual fallback is refused");
  const afterFallback = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
  check(afterFallback.transport === "realtime", "stale fallback leaves the realtime transport intact");

  const agentTurn = await import("../app/api/interview/agent-turn/route");
  const agentComplete = await import("../app/api/interview/agent-complete/route");
  const denied = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", null, { interviewId: interview.id, speaker: "agent", text: "x" }),
  );
  check(denied.status === 401, "agent turn requires the internal token");

  const turns: ["agent" | "student", string][] = [
    ["agent", "Tell me about the automation you built."],
    ["student", "I built a Make.com flow that summarizes articles from a Google Sheet."],
    ["agent", "Welcome back. How does that flow handle an HTTP timeout?"],
    ["student", "It currently lacks an error handler, so I would add retries and an alert."],
  ];
  for (const [speaker, text] of turns) {
    const response = await agentTurn.POST(
      agentReq("http://sim/api/interview/agent-turn", agentToken, { interviewId: interview.id, speaker, text }),
    );
    check(response.status === 200, `agent turn persists (${speaker})`);
  }

  const complete = await agentComplete.POST(
    agentReq("http://sim/api/interview/agent-complete", agentToken, { interviewId: interview.id, finished: true }),
  );
  check(complete.status === 200, "completed realtime interview is accepted by the agent endpoint");

  const completed = await prisma.interview.findUniqueOrThrow({
    where: { id: interview.id },
    include: { turns: { orderBy: { turnNo: "asc" } } },
  });
  check(completed.status === "completed", "only agent completion marks the realtime interview completed");
  assertOrderedTranscript(completed.turns.filter((turn) => turn.turnNo > 0));
  await grade(interview.id);
  const graded = await prisma.interview.findUniqueOrThrow({ where: { id: interview.id } });
  check(graded.status === "graded" || graded.status === "escalated", "worker grading reaches a terminal outcome");
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — run against the seeded local DB.");
    process.exit(1);
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prepare();
    await simulateRealtimeFlow();
    console.log(failures === 0 ? "\ninterview:simulate PASS" : `\ninterview:simulate FAIL (${failures})`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await restore();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("interview:simulate crashed:", error);
  process.exitCode = 1;
});
