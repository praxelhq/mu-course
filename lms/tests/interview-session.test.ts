import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";

// U12 — turn-based interview state machine (lib/interview/session). Live DB,
// seeded world; Gemini/TTS/STT are DI mocks — no network, no keys.

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

// user_s001..060 → section A; user_s061..120 → section B.
const STUDENT_A = "user_s001";
const STUDENT_A2 = "user_s002";
const STUDENT_B = "user_s061";

type FakeGeminiReply = { question: string; category: string; done: boolean };

function fakeGemini(replies?: FakeGeminiReply[]) {
  let i = 0;
  const calls: { system: string; messages: { role: string; text: string }[] }[] = [];
  return {
    calls,
    chat: async (args: { system: string; messages: { role: string; text: string }[] }) => {
      calls.push(args);
      const reply =
        replies?.[Math.min(i, (replies?.length ?? 1) - 1)] ??
        ({ question: `Question ${i + 1}?`, category: "industry_command", done: false } as FakeGeminiReply);
      i++;
      return {
        text: JSON.stringify(reply),
        usage: { inputTokens: 1000, outputTokens: 50 },
      };
    },
  };
}

const fakeTts = () => ({
  synthesize: async (text: string) => ({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "audio/mpeg",
    chars: text.length,
  }),
});

const throwingTts = () => ({
  synthesize: async () => {
    throw new Error("tts exploded");
  },
});

const fakeStt = () => ({
  transcribe: async () => ({ text: "transcribed answer", seconds: 21 }),
});

describe.skipIf(!live)("lib/interview/session (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.gateException.deleteMany();
    await prisma.interviewRetake.deleteMany();
    // Open section A's window around "now"; leave B's in the future (closed).
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

  it("start: closed window → InterviewWindowClosedError (409)", async () => {
    const { startInterview, InterviewWindowClosedError } = await import("../lib/interview/session");
    await expect(startInterview(STUDENT_B)).rejects.toBeInstanceOf(InterviewWindowClosedError);
  });

  it("start: creates a live turnbased-fallback interview; second attempt → 409; retake admits exactly once", async () => {
    const { startInterview, AttemptExhaustedError } = await import("../lib/interview/session");
    const iv = await startInterview(STUDENT_A);
    expect(iv.status).toBe("live");
    expect(iv.transport).toBe("turnbased-fallback");
    expect(iv.attemptNumber).toBe(1);

    // The system prompt is stored as turn 0 so resume/grading share it.
    const sys = await prisma.interviewTurn.findUnique({
      where: { interviewId_turnNo: { interviewId: iv.id, turnNo: 0 } },
    });
    expect(sys?.speaker).toBe("system");
    expect(sys?.text.length).toBeGreaterThan(200);

    await expect(startInterview(STUDENT_A)).rejects.toBeInstanceOf(AttemptExhaustedError);

    // Grant a retake → admitted exactly once, grant consumed.
    const grant = await prisma.interviewRetake.create({
      data: { userId: STUDENT_A, grantedBy: "user_instructor" },
    });
    const iv2 = await startInterview(STUDENT_A);
    expect(iv2.attemptNumber).toBe(2);
    const used = await prisma.interviewRetake.findUnique({ where: { id: grant.id } });
    expect(used?.usedByInterviewId).toBe(iv2.id);
    await expect(startInterview(STUDENT_A)).rejects.toBeInstanceOf(AttemptExhaustedError);
  });

  it("buildSystemPrompt: includes submission titles + sector, wraps student text, leaks no grade numbers", async () => {
    const { buildSystemPrompt } = await import("../lib/interview/session");
    // user_s002 has seeded graded submissions (sub ids sub_s2_skill_...).
    const prompt = await buildSystemPrompt(STUDENT_A2);
    const user = await prisma.user.findUnique({
      where: { id: STUDENT_A2 },
      include: { team: true },
    });
    expect(prompt).toContain(user!.team!.sectorName);
    expect(prompt).toContain("<student_content>");
    // Any graded feedback summary must not carry the grade total or confidence.
    const grades = await prisma.grade.findMany({
      where: { submission: { userId: STUDENT_A2 } },
    });
    for (const g of grades) {
      expect(prompt).not.toContain(`${g.total}/40`);
      expect(prompt).not.toContain(`Total: ${g.total}`);
      expect(prompt).not.toContain(String(g.confidence));
    }
    expect(prompt.toLowerCase()).not.toContain("confidence");
    // Student name must not appear (anonymized like grading prompts).
    expect(prompt).not.toContain(user!.name);
  });

  it("turn loop: nextQuestion persists the agent turn even when TTS explodes afterwards", async () => {
    const { startInterview, nextQuestion } = await import("../lib/interview/session");
    const iv = await startInterview(STUDENT_A2, { gemini: fakeGemini() });
    const q = await nextQuestion(iv.id, { gemini: fakeGemini(), tts: throwingTts() });
    expect(q.done).toBe(false);
    if (q.done) throw new Error("unreachable");
    expect(q.question).toBe("Question 1?");
    expect(q.audioS3Key).toBeNull(); // TTS failed → text-only, loop continues
    const turn = await prisma.interviewTurn.findUnique({
      where: { interviewId_turnNo: { interviewId: iv.id, turnNo: q.turnNo } },
    });
    expect(turn?.speaker).toBe("agent");
    expect(turn?.text).toBe("Question 1?");
  });

  it("turn loop: concurrent double-submit persists exactly one student turn", async () => {
    const { nextQuestion, submitAnswer, DuplicateAnswerError } = await import(
      "../lib/interview/session"
    );
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    // Ensure there is a pending agent question.
    const last = await prisma.interviewTurn.findFirst({
      where: { interviewId: iv.id, turnNo: { gt: 0 } },
      orderBy: { turnNo: "desc" },
    });
    if (!last || last.speaker !== "agent") {
      await nextQuestion(iv.id, { gemini: fakeGemini() });
    }
    const before = await prisma.interviewTurn.count({
      where: { interviewId: iv.id, speaker: "student" },
    });
    const results = await Promise.allSettled([
      submitAnswer({ interviewId: iv.id, userId: STUDENT_A2, text: "my answer" }),
      submitAnswer({ interviewId: iv.id, userId: STUDENT_A2, text: "my answer" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateAnswerError);
    const after = await prisma.interviewTurn.count({
      where: { interviewId: iv.id, speaker: "student" },
    });
    expect(after).toBe(before + 1);
  });

  it("resume: getInterviewState returns the full ordered transcript + pending question", async () => {
    const { nextQuestion, getInterviewState } = await import("../lib/interview/session");
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    const q = await nextQuestion(iv.id, {
      gemini: fakeGemini([{ question: "Pending Q?", category: "transfer", done: false }]),
    });
    expect(q.done).toBe(false);
    const state = await getInterviewState(iv.id, STUDENT_A2);
    expect(state.status).toBe("live");
    expect(state.turns.length).toBeGreaterThanOrEqual(3);
    // No system turn leaks into the transcript.
    expect(state.turns.every((t) => t.speaker !== "system")).toBe(true);
    // Ordered by turnNo.
    const nos = state.turns.map((t) => t.turnNo);
    expect([...nos].sort((a, b) => a - b)).toEqual(nos);
    expect(state.pendingQuestion?.text).toBe("Pending Q?");
  });

  it("audio answers: transcribed via STT, audio key + transcript persisted; STT cost logged", async () => {
    const { submitAnswer } = await import("../lib/interview/session");
    const { reserveInterviewAnswerUpload } = await import("../lib/interview/audio-storage");
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    const { __setS3TestOverrides } = await import("../lib/s3");
    const versionId = "answer-version-1";
    __setS3TestOverrides({
      configured: true,
      sign: (d) => `https://fake.s3/${d.key}`,
      head: async () => ({
        contentLength: 3,
        contentType: "audio/webm",
        etag: "answer-etag-1",
        versionId,
      }),
    });
    try {
      const maxTurn = await prisma.interviewTurn.aggregate({
        where: { interviewId: iv.id },
        _max: { turnNo: true },
      });
      const reserved = await reserveInterviewAnswerUpload({
        interviewId: iv.id,
        turnNo: (maxTurn._max.turnNo ?? 0) + 1,
        contentType: "audio/webm",
        sizeBytes: 3,
        extension: "webm",
      });
      const res = await submitAnswer(
        {
          interviewId: iv.id,
          userId: STUDENT_A2,
          audioReservationId: reserved.reservation.id,
        },
        { stt: fakeStt() },
      );
      expect(res.transcript).toBe("transcribed answer");
      const turn = await prisma.interviewTurn.findUnique({
        where: { interviewId_turnNo: { interviewId: iv.id, turnNo: res.turnNo } },
      });
      expect(turn?.audioS3Key).toBe(reserved.reservation.s3Key);
      expect(turn?.audioS3VersionId).toBe(versionId);
      expect(turn?.text).toBe("transcribed answer");
      const consumed = await prisma.generatedObjectReservation.findUniqueOrThrow({
        where: { id: reserved.reservation.id },
      });
      expect(consumed.s3VersionId).toBe(versionId);
      expect(consumed.consumedAt).toBeInstanceOf(Date);
      const stt = await prisma.costLog.findFirst({
        where: { feature: "interview", provider: "deepgram", refId: iv.id },
      });
      expect(stt).not.toBeNull();
    } finally {
      __setS3TestOverrides(null);
    }
  });

  it("budget: forces done past the 12-minute mark and past 20 turns", async () => {
    const { nextQuestion } = await import("../lib/interview/session");
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    const q = await nextQuestion(iv.id, {
      gemini: fakeGemini(),
      now: () => new Date(iv.createdAt.getTime() + 13 * 60_000),
    });
    expect(q.done).toBe(true);
  });

  it("ownership: another student cannot read or answer the interview", async () => {
    const { getInterviewState, submitAnswer, InterviewNotFoundError } = await import(
      "../lib/interview/session"
    );
    const iv = await prisma.interview.findFirstOrThrow({ where: { userId: STUDENT_A2 } });
    await expect(getInterviewState(iv.id, STUDENT_A)).rejects.toBeInstanceOf(
      InterviewNotFoundError,
    );
    await expect(
      submitAnswer({ interviewId: iv.id, userId: STUDENT_A, text: "hijack" }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError);
  });

  it("CostLog: gemini + tts rows recorded from mocked usage", async () => {
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    const gemini = await prisma.costLog.findFirst({
      where: { feature: "interview", provider: "gemini", refId: iv.id },
    });
    expect(gemini).not.toBeNull();
    expect(gemini?.tokensIn).toBe(1000);
    // TTS succeeded at least once when a fake tts was wired.
    const { nextQuestion } = await import("../lib/interview/session");
    const { __setS3TestOverrides } = await import("../lib/s3");
    __setS3TestOverrides({
      configured: true,
      write: async () => ({ versionId: "tts-version-1", etag: "tts-etag-1" }),
      sign: (d) => `https://fake.s3/${d.key}`,
    });
    try {
      // answer the pending question first so nextQuestion is legal
      const { submitAnswer } = await import("../lib/interview/session");
      const last = await prisma.interviewTurn.findFirst({
        where: { interviewId: iv.id, turnNo: { gt: 0 } },
        orderBy: { turnNo: "desc" },
      });
      if (last?.speaker === "agent") {
        await submitAnswer({ interviewId: iv.id, userId: STUDENT_A2, text: "ok" });
      }
      const q = await nextQuestion(iv.id, { gemini: fakeGemini(), tts: fakeTts() });
      expect(q.done).toBe(false);
      if (q.done) throw new Error("unreachable");
      expect(q.audioS3Key).toMatch(
        new RegExp(`^interviews/${iv.id}/q${q.turnNo}-[A-Za-z0-9_-]+\\.mp3$`),
      );
      const turn = await prisma.interviewTurn.findUniqueOrThrow({
        where: { interviewId_turnNo: { interviewId: iv.id, turnNo: q.turnNo } },
      });
      expect(turn.audioS3Key).toBe(q.audioS3Key);
      expect(turn.audioS3VersionId).toBe("tts-version-1");
    } finally {
      __setS3TestOverrides(null);
    }
    const tts = await prisma.costLog.findFirst({
      where: { feature: "interview", provider: "elevenlabs", refId: iv.id },
    });
    expect(tts).not.toBeNull();
  });

  it("degradation: no Gemini key and no scripted fallback → ProviderNotConfiguredError", async () => {
    const { nextQuestion, submitAnswer } = await import("../lib/interview/session");
    const { ProviderNotConfiguredError } = await import("../lib/interview/providers");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    // Answer any pending question so a fresh generation is actually required
    // (an unanswered agent turn is returned idempotently without the model).
    const last = await prisma.interviewTurn.findFirst({
      where: { interviewId: iv.id, turnNo: { gt: 0 } },
      orderBy: { turnNo: "desc" },
    });
    if (last?.speaker === "agent") {
      await submitAnswer({ interviewId: iv.id, userId: STUDENT_A2, text: "answered" });
    }
    await expect(nextQuestion(iv.id)).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it("degradation: scripted dev fallback asks script questions with zero keys", async () => {
    const { startInterview, nextQuestion, submitAnswer, completeInterview } = await import(
      "../lib/interview/session"
    );
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "1");
    // Fresh student in section A, no prior interview.
    const iv = await startInterview("user_s005");
    const q1 = await nextQuestion(iv.id);
    expect(q1.done).toBe(false);
    if (q1.done) throw new Error("unreachable");
    expect(q1.question.length).toBeGreaterThan(5);
    expect(q1.audioS3Key).toBeNull(); // no TTS configured → text-only
    await submitAnswer({ interviewId: iv.id, userId: "user_s005", text: "typed answer" });
    const q2 = await nextQuestion(iv.id);
    expect(q2.done).toBe(false);
    await completeInterview(iv.id, "user_s005", { enqueue: async () => null });
    const row = await prisma.interview.findUnique({ where: { id: iv.id } });
    expect(row?.status).toBe("completed");
    expect(row?.completedAt).toBeInstanceOf(Date);
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
  });

  it("answer-url route: enforces ownership and audio content types", async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    const { __setS3TestOverrides } = await import("../lib/s3");
    __setS3TestOverrides({ configured: true, sign: (d) => `https://fake.s3/${d.key}` });
    try {
      const { POST } = await import("../app/api/interview/answer-url/route");
      const iv = await prisma.interview.findFirstOrThrow({
        where: { userId: STUDENT_A2, status: "live" },
      });
      const call = (user: string, body: unknown) =>
        POST(
          new Request("http://test/api/interview/answer-url", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `forge_test_user=${user}`,
            },
            body: JSON.stringify(body),
          }),
        );
      // Wrong owner → 404.
      const notMine = await call(STUDENT_A, {
        interviewId: iv.id,
        contentType: "audio/webm",
        sizeBytes: 1000,
      });
      expect(notMine.status).toBe(404);
      // Bad content type → 415.
      const badType = await call(STUDENT_A2, {
        interviewId: iv.id,
        contentType: "application/pdf",
        sizeBytes: 1000,
      });
      expect(badType.status).toBe(415);
      // Too large → 413.
      const tooBig = await call(STUDENT_A2, {
        interviewId: iv.id,
        contentType: "audio/webm",
        sizeBytes: 26 * 1024 * 1024,
      });
      expect(tooBig.status).toBe(413);
      // Happy path → presigned PUT under the interview's namespace.
      const ok = await call(STUDENT_A2, {
        interviewId: iv.id,
        contentType: "audio/webm",
        sizeBytes: 1000,
      });
      expect(ok.status).toBe(200);
      const json = (await ok.json()) as {
        key: string;
        url: string;
        headers: Record<string, string>;
        reservationId: string;
      };
      expect(json.key).toMatch(
        new RegExp(`^interviews/${iv.id}/a\\d+-[A-Za-z0-9_-]+\\.webm$`),
      );
      expect(json.headers["If-None-Match"]).toBe("*");
      const reservation = await prisma.generatedObjectReservation.findUniqueOrThrow({
        where: { id: json.reservationId },
      });
      expect(reservation.interviewId).toBe(iv.id);
      expect(reservation.s3Key).toBe(json.key);
      expect(reservation.s3VersionId).toBeNull();
      expect(reservation.consumedAt).toBeNull();
    } finally {
      __setS3TestOverrides(null);
    }
  });

  it("answer route: typed-answer guard rejects text-only bodies only in production without a flag (#6)", async () => {
    const { textAnswersAllowed } = await import("../app/api/interview/answer/route");
    // Dev/test: typed answers always allowed.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_INTERVIEW_TEXT_MODE", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
    expect(textAnswersAllowed()).toBe(true);

    // Production without any flag: rejected (the graded viva must be spoken).
    vi.stubEnv("NODE_ENV", "production");
    expect(textAnswersAllowed()).toBe(false);
    // Production WITH the UI text-mode flag: allowed.
    vi.stubEnv("NEXT_PUBLIC_INTERVIEW_TEXT_MODE", "1");
    expect(textAnswersAllowed()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_INTERVIEW_TEXT_MODE", "");
    // Production WITH the scripted dev env: allowed.
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "1");
    expect(textAnswersAllowed()).toBe(true);
    // restore
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
  });

  it("answer route: accepts a typed answer through the HTTP handler in the dev/text fallback (#6)", async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "1"); // scripted so nextQuestion resolves
    const { nextQuestion } = await import("../lib/interview/session");
    const iv = await prisma.interview.findFirstOrThrow({
      where: { userId: STUDENT_A2, status: "live" },
    });
    // Guarantee a pending agent question to answer.
    const last = await prisma.interviewTurn.findFirst({
      where: { interviewId: iv.id, turnNo: { gt: 0 } },
      orderBy: { turnNo: "desc" },
    });
    if (!last || last.speaker !== "agent") await nextQuestion(iv.id);

    const { POST } = await import("../app/api/interview/answer/route");
    const res = await POST(
      new Request("http://test/api/interview/answer", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `forge_test_user=${STUDENT_A2}` },
        body: JSON.stringify({ interviewId: iv.id, text: "my typed answer" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { answer: { transcript: string } };
    expect(json.answer.transcript).toBe("my typed answer");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
  });

  it("start route: resume regenerates the question when a crash left the last turn a student turn (#7)", async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "1");
    const STU = "user_s050"; // section A, no prior interview
    const { startInterview, nextQuestion, submitAnswer, getInterviewState } = await import(
      "../lib/interview/session"
    );
    const iv = await startInterview(STU);
    await nextQuestion(iv.id); // agent q1
    await submitAnswer({ interviewId: iv.id, userId: STU, text: "answer to q1" });

    // Simulate the crash window: student turn persisted, agent's next question
    // never landed — no pending question, transcript ends on a student turn.
    const mid = await getInterviewState(iv.id, STU);
    expect(mid.pendingQuestion).toBeNull();
    expect(mid.turns[mid.turns.length - 1].speaker).toBe("student");

    // Resume via the start route: it must regenerate a question, not deadlock.
    const { POST } = await import("../app/api/interview/start/route");
    const res = await POST(
      new Request("http://test/api/interview/start", {
        method: "POST",
        headers: { cookie: `forge_test_user=${STU}` },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      resumed: boolean;
      state: { pendingQuestion: { text: string } | null };
    };
    expect(json.resumed).toBe(true);
    expect(json.state.pendingQuestion).not.toBeNull();
    expect(json.state.pendingQuestion!.text.length).toBeGreaterThan(0);
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
  });

  it("start route: no dialog provider configured → 503 with a friendly message", async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INTERVIEW_DEV_SCRIPTED", "");
    const { POST } = await import("../app/api/interview/start/route");
    const res = await POST(
      new Request("http://test/api/interview/start", {
        method: "POST",
        headers: { cookie: "forge_test_user=user_s006" },
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error.toLowerCase()).toContain("interview");
    // Nothing half-created: the student can start cleanly once configured.
    const count = await prisma.interview.count({ where: { userId: "user_s006" } });
    expect(count).toBe(0);
  });
});
