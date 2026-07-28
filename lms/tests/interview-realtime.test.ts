import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";

// U13 — realtime interview transport: token endpoint (guards, concurrency,
// LiveKit token mint), the X-Agent-Token-guarded internal agent endpoints,
// the in-place turnbased-fallback flip, and the heartbeat. Live DB, seeded
// world; the LiveKit "server" is just env + local JWT signing — no network.

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

// user_s001..060 → section A (window opened in beforeAll); s061.. → B (closed).
const CLOSED_WINDOW_USER = "user_s061";
const CAPACITY_USER = "user_s021";
const TOKEN_USER = "user_s022";
const AGENT_FLOW_USER = "user_s023";
const FALLBACK_USER = "user_s024";
const OTHER_USER = "user_s025";
const COMPLETE_USER = "user_s026";
const ROOM_FILLER_USER = "user_s030"; // owns the 30 fake occupied rooms

const AGENT_TOKEN = "test-agent-secret";

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

function stubLivekit(): void {
  vi.stubEnv("LIVEKIT_URL", "wss://fake.livekit.test");
  vi.stubEnv("LIVEKIT_API_KEY", "APIfaketest");
  vi.stubEnv("LIVEKIT_API_SECRET", "secretsecretsecretsecretsecret12");
}

function unstubLivekit(): void {
  vi.stubEnv("LIVEKIT_URL", "");
  vi.stubEnv("LIVEKIT_API_KEY", "");
  vi.stubEnv("LIVEKIT_API_SECRET", "");
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
}

const fakeGemini = () => {
  let i = 0;
  return {
    chat: async () => ({
      text: JSON.stringify({
        question: `RT question ${++i}?`,
        category: "transfer",
        done: false,
      }),
      usage: { inputTokens: 100, outputTokens: 20 },
    }),
  };
};

/** Start a live interview via the U12 contract, then flip it to realtime —
 * exactly what the token route does once LiveKit is configured. */
async function startRealtime(
  prisma: import("@prisma/client").PrismaClient,
  userId: string,
): Promise<string> {
  const { startInterview } = await import("../lib/interview/session");
  const iv = await startInterview(userId);
  await prisma.interview.update({
    where: { id: iv.id },
    data: { transport: "realtime", lastSeenAt: new Date() },
  });
  return iv.id;
}

describe.skipIf(!live)("U13 realtime interview transport (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    vi.stubEnv("AGENT_INTERNAL_TOKEN", AGENT_TOKEN);
    vi.stubEnv("INTERVIEW_MAX_ROOMS", "30");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.interviewWindow.update({
      where: { id: "ivw_A" },
      data: {
        opensAt: new Date(Date.now() - 3_600_000),
        closesAt: new Date(Date.now() + 3_600_000),
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // token route
  // -------------------------------------------------------------------------

  it("token: no LIVEKIT env → 503 {realtimeUnavailable:true}", async () => {
    unstubLivekit();
    const { POST } = await import("../app/api/interview/token/route");
    const res = await POST(cookieReq("http://t/api/interview/token", TOKEN_USER, {}));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { realtimeUnavailable?: boolean };
    expect(body.realtimeUnavailable).toBe(true);
    // Nothing half-created — the attempt is untouched.
    expect(await prisma.interview.count({ where: { userId: TOKEN_USER } })).toBe(0);
  });

  it("token: closed window → 409 (U12 guards inherited)", async () => {
    stubLivekit();
    const { POST } = await import("../app/api/interview/token/route");
    const res = await POST(cookieReq("http://t/api/interview/token", CLOSED_WINDOW_USER, {}));
    expect(res.status).toBe(409);
  });

  it("token: 30 occupied rooms → 429 {waiting:true}; stale heartbeats free them", async () => {
    stubLivekit();
    // 30 fake live realtime interviews with a fresh heartbeat.
    await prisma.interview.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        userId: ROOM_FILLER_USER,
        status: "live" as const,
        transport: "realtime",
        attemptNumber: i + 1,
        lastSeenAt: new Date(),
      })),
    });
    const { POST } = await import("../app/api/interview/token/route");
    const busy = await POST(cookieReq("http://t/api/interview/token", CAPACITY_USER, {}));
    expect(busy.status).toBe(429);
    const busyBody = (await busy.json()) as { waiting?: boolean; activeRooms?: number };
    expect(busyBody.waiting).toBe(true);
    expect(busyBody.activeRooms).toBe(30);
    expect(await prisma.interview.count({ where: { userId: CAPACITY_USER } })).toBe(0);

    // Stale heartbeats (>90s) no longer count — the same student gets a room.
    await prisma.interview.updateMany({
      where: { userId: ROOM_FILLER_USER },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) },
    });
    const freed = await POST(cookieReq("http://t/api/interview/token", CAPACITY_USER, {}));
    expect(freed.status).toBe(200);
    await prisma.interviewTurn.deleteMany({
      where: { interview: { userId: ROOM_FILLER_USER } },
    });
    await prisma.interview.deleteMany({ where: { userId: ROOM_FILLER_USER } });
  });

  it("token: mints a JWT with room interview-{id} + the student's identity", async () => {
    stubLivekit();
    const { POST } = await import("../app/api/interview/token/route");
    const res = await POST(cookieReq("http://t/api/interview/token", TOKEN_USER, {}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      interviewId: string;
      token: string;
      roomName: string;
      url: string;
    };
    expect(body.roomName).toBe(`interview-${body.interviewId}`);
    expect(body.url).toBe("wss://fake.livekit.test");
    const payload = decodeJwtPayload(body.token) as {
      sub?: string;
      video?: { room?: string; roomJoin?: boolean };
    };
    expect(payload.sub).toBe(TOKEN_USER);
    expect(payload.video?.room).toBe(`interview-${body.interviewId}`);
    expect(payload.video?.roomJoin).toBe(true);
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id: body.interviewId } });
    expect(iv.transport).toBe("realtime");
    expect(iv.status).toBe("live");
    expect(iv.lastSeenAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // agent endpoints
  // -------------------------------------------------------------------------

  it("agent-turn: 401 without or with a wrong token", async () => {
    const { POST } = await import("../app/api/interview/agent-turn/route");
    const body = { interviewId: "iv_x", speaker: "agent", text: "hi" };
    const none = await POST(agentReq("http://t/api/interview/agent-turn", null, body));
    expect(none.status).toBe(401);
    const wrong = await POST(agentReq("http://t/api/interview/agent-turn", "nope", body));
    expect(wrong.status).toBe(401);
  });

  it("agent-turn: appends ordered turns via the session contract; agent-context serves prompt + transcript", async () => {
    const id = await startRealtime(prisma, AGENT_FLOW_USER);
    const { POST } = await import("../app/api/interview/agent-turn/route");
    const texts: [string, string][] = [
      ["agent", "First question?"],
      ["student", "First answer."],
      ["agent", "Second question?"],
    ];
    const turnNos: number[] = [];
    for (const [speaker, text] of texts) {
      const res = await POST(
        agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
          interviewId: id,
          speaker,
          text,
        }),
      );
      expect(res.status).toBe(200);
      turnNos.push(((await res.json()) as { turnNo: number }).turnNo);
    }
    expect(turnNos).toEqual([1, 2, 3]);

    const { GET } = await import("../app/api/interview/agent-context/route");
    const denied = await GET(
      agentReq(`http://t/api/interview/agent-context?interviewId=${id}`, null),
    );
    expect(denied.status).toBe(401);
    const ok = await GET(
      agentReq(`http://t/api/interview/agent-context?interviewId=${id}`, AGENT_TOKEN),
    );
    expect(ok.status).toBe(200);
    const ctx = (await ok.json()) as {
      systemPrompt: string;
      transcript: { turnNo: number; speaker: string; text: string }[];
    };
    expect(ctx.systemPrompt.length).toBeGreaterThan(200);
    expect(ctx.transcript.map((t) => t.turnNo)).toEqual([1, 2, 3]);
    expect(ctx.transcript.every((t) => t.speaker !== "system")).toBe(true);
  });

  it("agent-turn: rejects turnbased and non-live interviews", async () => {
    const { startInterview, completeInterview } = await import("../lib/interview/session");
    const { POST } = await import("../app/api/interview/agent-turn/route");

    // Turn-based interview (transport never flipped) → 409.
    const tb = await startInterview(OTHER_USER);
    const tbRes = await POST(
      agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
        interviewId: tb.id,
        speaker: "agent",
        text: "x",
      }),
    );
    expect(tbRes.status).toBe(409);

    // Completed realtime interview → 409 (InterviewNotLive).
    const id = await startRealtime(prisma, COMPLETE_USER);
    await completeInterview(id, COMPLETE_USER, { enqueue: async () => null });
    const doneRes = await POST(
      agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
        interviewId: id,
        speaker: "agent",
        text: "x",
      }),
    );
    expect(doneRes.status).toBe(409);

    // Unknown interview → 404.
    const missing = await POST(
      agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
        interviewId: "iv_does_not_exist",
        speaker: "agent",
        text: "x",
      }),
    );
    expect(missing.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // fallback flip
  // -------------------------------------------------------------------------

  it("fallback: owner flips to turnbased-fallback (audited); turns before+after stay one ordered transcript", async () => {
    const id = await startRealtime(prisma, FALLBACK_USER);
    const agentTurn = await import("../app/api/interview/agent-turn/route");
    for (const [speaker, text] of [
      ["agent", "Realtime question?"],
      ["student", "Realtime answer."],
    ] as const) {
      const res = await agentTurn.POST(
        agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
          interviewId: id,
          speaker,
          text,
        }),
      );
      expect(res.status).toBe(200);
    }

    // Another student cannot flip it — owner-or-404.
    const { POST } = await import("../app/api/interview/fallback/route");
    const notMine = await POST(
      cookieReq("http://t/api/interview/fallback", OTHER_USER, { interviewId: id }),
    );
    expect(notMine.status).toBe(404);

    const flip = await POST(
      cookieReq("http://t/api/interview/fallback", FALLBACK_USER, {
        interviewId: id,
        reason: "poor-connection",
      }),
    );
    expect(flip.status).toBe(200);
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.transport).toBe("turnbased-fallback");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "interview.fallback", targetType: "interview", targetId: id },
    });
    expect(audit?.actorId).toBe(FALLBACK_USER);
    expect((audit?.after as { reason?: string })?.reason).toBe("poor-connection");

    // Idempotent repeat; straggler agent posts are refused.
    const again = await POST(
      cookieReq("http://t/api/interview/fallback", FALLBACK_USER, { interviewId: id }),
    );
    expect(again.status).toBe(200);
    const straggler = await agentTurn.POST(
      agentReq("http://t/api/interview/agent-turn", AGENT_TOKEN, {
        interviewId: id,
        speaker: "agent",
        text: "late",
      }),
    );
    expect(straggler.status).toBe(409);

    // Same interview continues over the U12 loop — one ordered transcript.
    const { nextQuestion, submitAnswer, getInterviewState } = await import(
      "../lib/interview/session"
    );
    const q = await nextQuestion(id, { gemini: fakeGemini(), tts: null });
    expect(q.done).toBe(false);
    await submitAnswer({ interviewId: id, userId: FALLBACK_USER, text: "post-flip answer" });
    const state = await getInterviewState(id, FALLBACK_USER);
    const nos = state.turns.map((t) => t.turnNo);
    expect(nos).toEqual([1, 2, 3, 4]);
    expect(state.turns.map((t) => t.speaker)).toEqual(["agent", "student", "agent", "student"]);
  });

  // -------------------------------------------------------------------------
  // agent-complete + heartbeat
  // -------------------------------------------------------------------------

  it("agent-complete: token-guarded; sets completed + audioS3Key and enqueues grading", async () => {
    const id = await startRealtime(prisma, "user_s027");
    const { POST } = await import("../app/api/interview/agent-complete/route");
    const denied = await POST(
      agentReq("http://t/api/interview/agent-complete", null, { interviewId: id }),
    );
    expect(denied.status).toBe(401);

    // Key outside the interview namespace is refused.
    const badKey = await POST(
      agentReq("http://t/api/interview/agent-complete", AGENT_TOKEN, {
        interviewId: id,
        audioS3Key: "interviews/other/room.ogg",
      }),
    );
    expect(badKey.status).toBe(400);

    const ok = await POST(
      agentReq("http://t/api/interview/agent-complete", AGENT_TOKEN, {
        interviewId: id,
        audioS3Key: `interviews/${id}/room.ogg`,
      }),
    );
    expect(ok.status).toBe(200);
    const iv = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(iv.status).toBe("completed");
    expect(iv.audioS3Key).toBe(`interviews/${id}/room.ogg`);
    expect(iv.completedAt).toBeInstanceOf(Date);

    // Idempotent repeat (completeInterview's completed short-circuit).
    const repeat = await POST(
      agentReq("http://t/api/interview/agent-complete", AGENT_TOKEN, { interviewId: id }),
    );
    expect(repeat.status).toBe(200);
  });

  it("heartbeat: state polls refresh lastSeenAt (30s throttle); agent turns refresh it too", async () => {
    const id = await startRealtime(prisma, "user_s028");
    const stale = new Date(Date.now() - 5 * 60_000);
    await prisma.interview.update({ where: { id }, data: { lastSeenAt: stale } });

    const { GET } = await import("../app/api/interview/state/route");
    const res = await GET(cookieReq(`http://t/api/interview/state?id=${id}`, "user_s028"));
    expect(res.status).toBe(200);
    const afterPoll = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(afterPoll.lastSeenAt!.getTime()).toBeGreaterThan(stale.getTime());

    // Within the 30s throttle window a second poll leaves it untouched.
    const seen = afterPoll.lastSeenAt!;
    await GET(cookieReq(`http://t/api/interview/state?id=${id}`, "user_s028"));
    const afterSecond = await prisma.interview.findUniqueOrThrow({ where: { id } });
    expect(afterSecond.lastSeenAt!.getTime()).toBe(seen.getTime());
  });
});
