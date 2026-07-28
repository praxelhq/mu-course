/**
 * U13 — `pnpm interview:simulate`: a scripted fake candidate driven through
 * BOTH interview transports end-to-end against the local DB, with ZERO
 * provider keys required. Exits non-zero on any assertion failure.
 *
 * (a) turn-based: start → question → answer ×3 → complete → grade (mocked
 *     grading model) — asserts one coherent ordered transcript and a
 *     graded/escalated outcome.
 * (b) realtime degradation: with no LIVEKIT env the token endpoint answers
 *     503 {realtimeUnavailable}; the internal agent endpoints enforce the
 *     X-Agent-Token guard (401 without/wrong, 200 with); two agent turns are
 *     posted through the internal API, the interview flips in place to
 *     'turnbased-fallback' (audited), continues turn-based, and completes via
 *     agent-complete — ONE interview, ONE ordered transcript.
 *
 * With LIVEKIT_* set and EVAL_LIVE=1 it additionally mints a real room token
 * and verifies its JWT claims (an actual WebRTC join needs a browser — the
 * realtime path proper is validated manually / in staging, never in CI).
 */

// Deterministic zero-key run: scripted dialog + test login. Set BEFORE imports.
process.env.INTERVIEW_DEV_SCRIPTED = "1";
process.env.ENABLE_TEST_LOGIN = "1";
process.env.AGENT_INTERNAL_TOKEN = process.env.AGENT_INTERNAL_TOKEN || "simulate-secret";
const EVAL_LIVE = process.env.EVAL_LIVE === "1";
if (!EVAL_LIVE) {
  // Force the zero-key degradation path even when .env has LiveKit keys.
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

const TURNBASED_USER = "user_s010";
const REALTIME_USER = "user_s011";

function cookieReq(url: string, userId: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      cookie: `forge_test_user=${userId}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function agentReq(url: string, token: string | null, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-agent-token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function prepare(): Promise<void> {
  // Open section A's window around now; wipe the two sim users' history.
  await prisma.interviewWindow.update({
    where: { id: "ivw_A" },
    data: {
      opensAt: new Date(Date.now() - 3_600_000),
      closesAt: new Date(Date.now() + 3_600_000),
    },
  });
  const users = [TURNBASED_USER, REALTIME_USER];
  await prisma.interviewTurn.deleteMany({ where: { interview: { userId: { in: users } } } });
  await prisma.interview.deleteMany({ where: { userId: { in: users } } });
  await prisma.interviewRetake.deleteMany({ where: { userId: { in: users } } });
}

function assertOrderedTranscript(
  turns: { turnNo: number; speaker: string }[],
  label: string,
): void {
  const nos = turns.map((t) => t.turnNo);
  check(
    nos.length > 0 && nos.every((n, i) => (i === 0 ? n === 1 : n === nos[i - 1] + 1)),
    `${label}: turnNos are 1..${nos.length} with no gaps`,
  );
  check(
    turns.every((t) => t.speaker === "agent" || t.speaker === "student"),
    `${label}: only agent/student speakers (no system leak)`,
  );
}

// ---------------------------------------------------------------------------
// (a) turn-based transport
// ---------------------------------------------------------------------------

async function simulateTurnBased(): Promise<void> {
  console.log("\n[a] turn-based transport (scripted dialog, zero keys)");
  const { startInterview, nextQuestion, submitAnswer, completeInterview } = await import(
    "../lib/interview/session"
  );

  let enqueued: string | null = null;
  const deps = { gemini: null, tts: null, stt: null, enqueue: async (id: string) => (enqueued = id) };

  const iv = await startInterview(TURNBASED_USER, deps);
  check(iv.status === "live", "startInterview creates a live interview");
  check(iv.transport === "turnbased-fallback", "transport is turnbased-fallback");

  for (let i = 0; i < 3; i++) {
    const q = await nextQuestion(iv.id, deps);
    check(!q.done, `question ${i + 1} asked`);
    if (q.done) break;
    await submitAnswer(
      { interviewId: iv.id, userId: TURNBASED_USER, text: `Scripted answer ${i + 1}.` },
      deps,
    );
  }
  await completeInterview(iv.id, TURNBASED_USER, deps);
  check(enqueued === iv.id, "completeInterview enqueued grading");

  // Grade with a mocked model — asserts the pipeline, not the model.
  const { handleGradeInterview } = await import("../worker/jobs/grade-interview");
  const fakeModel = (async (args: { schema: { parse: (v: unknown) => unknown } }) => {
    const dim = (score: number) => ({ score, rationale: "simulated" });
    const data = {
      rubricScores: {
        industry_command: dim(18),
        defence_of_submissions: dim(17),
        operators_loop: dim(16),
        transfer: dim(19),
      },
      total: 70,
      confidence: 0.9,
      flags: [],
    };
    args.schema.parse(data);
    return { data, model: "simulated", usage: { inputTokens: 100, outputTokens: 50 } };
  }) as unknown as import("../worker/jobs/grade-interview").GradeInterviewDeps["model"];
  await handleGradeInterview(iv.id, { model: fakeModel });

  const row = await prisma.interview.findUniqueOrThrow({
    where: { id: iv.id },
    include: { turns: { orderBy: { turnNo: "asc" } } },
  });
  check(
    row.status === "graded" || row.status === "escalated",
    `outcome is graded/escalated (got '${row.status}')`,
  );
  const transcript = row.turns.filter((t) => t.turnNo > 0);
  assertOrderedTranscript(transcript, "turn-based");
  check(transcript.filter((t) => t.speaker === "student").length === 3, "3 student answers recorded");
  check(row.turns[0]?.speaker === "system", "system prompt stored as turn 0");
}

// ---------------------------------------------------------------------------
// (b) realtime transport → in-place degradation
// ---------------------------------------------------------------------------

async function simulateRealtimeDegradation(): Promise<void> {
  console.log("\n[b] realtime transport: unavailable → fallback (zero LiveKit keys)");
  const token = process.env.AGENT_INTERNAL_TOKEN!;

  // 1. No LIVEKIT env → token endpoint reports realtime unavailable.
  const tokenRoute = await import("../app/api/interview/token/route");
  const res503 = await tokenRoute.POST(
    cookieReq("http://sim/api/interview/token", REALTIME_USER, {}),
  );
  const body503 = (await res503.json()) as { realtimeUnavailable?: boolean };
  check(res503.status === 503, `token endpoint → 503 (got ${res503.status})`);
  check(body503.realtimeUnavailable === true, "body carries realtimeUnavailable:true");

  // 2. Start a realtime interview via the session contract (what the token
  //    route does when LiveKit IS configured).
  const { startInterview, nextQuestion, submitAnswer } = await import("../lib/interview/session");
  const deps = { gemini: null as null, tts: null, stt: null };
  const iv = await startInterview(REALTIME_USER, deps);
  await prisma.interview.update({
    where: { id: iv.id },
    data: { transport: "realtime", lastSeenAt: new Date() },
  });

  // 3. Agent internal endpoints: token guard, then two realtime turns.
  const agentTurn = await import("../app/api/interview/agent-turn/route");
  const agentContext = await import("../app/api/interview/agent-context/route");
  const agentComplete = await import("../app/api/interview/agent-complete/route");

  const noToken = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", null, {
      interviewId: iv.id,
      speaker: "agent",
      text: "x",
    }),
  );
  check(noToken.status === 401, `agent-turn without token → 401 (got ${noToken.status})`);
  const badToken = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", "wrong-token", {
      interviewId: iv.id,
      speaker: "agent",
      text: "x",
    }),
  );
  check(badToken.status === 401, "agent-turn with wrong token → 401");

  const t1 = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", token, {
      interviewId: iv.id,
      speaker: "agent",
      text: "Walk me through your sector's value chain.",
    }),
  );
  check(t1.status === 200, `agent-turn (agent) → 200 (got ${t1.status})`);
  const t2 = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", token, {
      interviewId: iv.id,
      speaker: "student",
      text: "It starts with sourcing, then processing, then retail.",
    }),
  );
  check(t2.status === 200, "agent-turn (student) → 200");

  const ctxNoToken = await agentContext.GET(
    agentReq(`http://sim/api/interview/agent-context?interviewId=${iv.id}`, null),
  );
  check(ctxNoToken.status === 401, "agent-context without token → 401");
  const ctxRes = await agentContext.GET(
    agentReq(`http://sim/api/interview/agent-context?interviewId=${iv.id}`, token),
  );
  const ctxBody = (await ctxRes.json()) as {
    systemPrompt: string;
    transcript: { turnNo: number }[];
  };
  check(ctxRes.status === 200, "agent-context with token → 200");
  check(ctxBody.systemPrompt.length > 200, "agent-context returns the system prompt");
  check(ctxBody.transcript.length === 2, "agent-context returns both realtime turns");

  // 4. Connection "drops": the client flips the interview in place.
  const fallbackRoute = await import("../app/api/interview/fallback/route");
  const flip = await fallbackRoute.POST(
    cookieReq("http://sim/api/interview/fallback", REALTIME_USER, {
      interviewId: iv.id,
      reason: "simulated-disconnect",
    }),
  );
  check(flip.status === 200, `fallback flip → 200 (got ${flip.status})`);
  const flipped = await prisma.interview.findUniqueOrThrow({ where: { id: iv.id } });
  check(flipped.transport === "turnbased-fallback", "transport is now turnbased-fallback");
  const audit = await prisma.auditLog.findFirst({
    where: { action: "interview.fallback", targetId: iv.id },
  });
  check(audit !== null, "fallback flip is audited");

  const lateAgentTurn = await agentTurn.POST(
    agentReq("http://sim/api/interview/agent-turn", token, {
      interviewId: iv.id,
      speaker: "agent",
      text: "straggler",
    }),
  );
  check(lateAgentTurn.status === 409, "agent turns rejected after the flip (409)");

  // 5. Same interview continues turn-based (scripted questions, typed answers).
  for (let i = 0; i < 2; i++) {
    const q = await nextQuestion(iv.id, deps);
    check(!q.done, `post-flip question ${i + 1} asked`);
    if (q.done) break;
    await submitAnswer(
      { interviewId: iv.id, userId: REALTIME_USER, text: `Post-fallback answer ${i + 1}.` },
      deps,
    );
  }

  // 6. agent-complete: token-guarded; records the egress key and completes.
  const noTokenComplete = await agentComplete.POST(
    agentReq("http://sim/api/interview/agent-complete", null, { interviewId: iv.id }),
  );
  check(noTokenComplete.status === 401, "agent-complete without token → 401");
  const done = await agentComplete.POST(
    agentReq("http://sim/api/interview/agent-complete", token, {
      interviewId: iv.id,
      audioS3Key: `interviews/${iv.id}/room.ogg`,
    }),
  );
  check(done.status === 200, `agent-complete with token → 200 (got ${done.status})`);

  const final = await prisma.interview.findUniqueOrThrow({
    where: { id: iv.id },
    include: { turns: { orderBy: { turnNo: "asc" } } },
  });
  check(final.status === "completed", `interview completed (got '${final.status}')`);
  check(final.audioS3Key === `interviews/${iv.id}/room.ogg`, "egress audioS3Key stored");
  check(final.transport === "turnbased-fallback", "transport ends 'turnbased-fallback'");
  const transcript = final.turns.filter((t) => t.turnNo > 0);
  assertOrderedTranscript(transcript, "cross-transport");
  check(
    transcript.length >= 6,
    `realtime + turn-based turns share one transcript (${transcript.length} turns)`,
  );
}

// ---------------------------------------------------------------------------
// Optional: live LiveKit token mint (EVAL_LIVE=1 + LIVEKIT_* env; not for CI)
// ---------------------------------------------------------------------------

async function evalLive(): Promise<void> {
  const { livekitConfigured, mintRoomToken } = await import("../lib/interview/realtime");
  if (!EVAL_LIVE || !livekitConfigured()) {
    console.log("\n[c] EVAL_LIVE mint skipped (set EVAL_LIVE=1 + LIVEKIT_* env to run)");
    return;
  }
  console.log("\n[c] EVAL_LIVE: minting a real LiveKit room token");
  const { token, roomName, url } = await mintRoomToken({
    interviewId: "simulate",
    identity: "simulate-user",
  });
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as {
    sub?: string;
    video?: { room?: string };
  };
  check(payload.sub === "simulate-user", "JWT identity claim");
  check(payload.video?.room === roomName, "JWT room grant");
  console.log(
    `  note  token minted for ${url} room ${roomName} — an actual WebRTC join needs a ` +
      "browser client; validate the realtime path manually/in staging.",
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — run against the seeded local DB.");
    process.exit(1);
  }
  await prisma.$queryRaw`SELECT 1`;
  await prepare();
  await simulateTurnBased();
  await simulateRealtimeDegradation();
  await evalLive();

  console.log(failures === 0 ? "\ninterview:simulate PASS" : `\ninterview:simulate FAIL (${failures})`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("interview:simulate crashed:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
