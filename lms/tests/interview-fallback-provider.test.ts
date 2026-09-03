import { describe, expect, it, vi } from "vitest";
import { dialogAvailable, nextQuestion } from "../lib/interview/session";

// Regression: the turn-based loop is the SAFETY NET behind the realtime
// interview, and it used to require GEMINI_API_KEY. Production had no such
// key, so when the realtime agent failed the fallback threw
// ProviderNotConfiguredError -> 503 and the student sat on "Waiting for the
// next question…" forever. A safety net that needs a third-party key can be
// down at exactly the moment it is needed.

function fakeDb(agentTurns: number) {
  const turns = Array.from({ length: agentTurns * 2 + 1 }, (_, i) => ({
    id: `t${i}`,
    turnNo: i,
    speaker: i === 0 ? "system" : i % 2 === 1 ? "agent" : "student",
    text: `turn ${i}`,
    audioS3Key: null,
    startedAt: new Date("2026-09-03T10:00:00.000Z"),
  }));
  const created: Record<string, unknown>[] = [];
  return {
    created,
    client: {
      interview: {
        findUnique: vi.fn(async () => ({
          id: "iv1",
          status: "live",
          transport: "turnbased-fallback",
          createdAt: new Date("2026-09-03T10:00:00.000Z"),
          turns,
        })),
      },
      interviewTurn: {
        findMany: vi.fn(async () => turns),
        aggregate: vi.fn(async () => ({ _max: { turnNo: turns.length - 1 } })),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { ...data, id: "new", startedAt: new Date(), audioS3Key: null };
        }),
      },
      configKV: {
        findUnique: vi.fn(async () => ({
          key: "interview_script",
          value: {
            durationMinutes: 15,
            categories: [
              { key: "intro", title: "Intro", sampleQuestions: ["Tell me about yourself."] },
              {
                key: "own_work_defence",
                title: "Defence",
                sampleQuestions: ["What happens when a step times out?"],
              },
            ],
          },
        })),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(undefined)),
    } as never,
  };
}

describe("turn-based fallback needs no dialog provider", () => {
  it("reports a question source as available with no key configured", () => {
    const had = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(dialogAvailable()).toBe(true);
      expect(dialogAvailable({ gemini: null })).toBe(true);
    } finally {
      if (had !== undefined) process.env.GEMINI_API_KEY = had;
    }
  });

  // The regression is specifically "no provider configured -> hard failure".
  // Persisting a turn needs a great deal more of Prisma than is worth mocking,
  // so these assert the thing that actually broke: the provider resolution no
  // longer raises, and a provider error never reaches the student.
  it("does not raise a provider error when no dialog key is configured", async () => {
    const had = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { client } = fakeDb(0);
    try {
      const err = await nextQuestion("iv1", {
        prisma: client,
        gemini: null,
        tts: null,
        now: () => new Date("2026-09-03T10:01:00.000Z"),
      }).catch((e: unknown) => e);
      // It may still fail on the deliberately shallow persistence mock — but it
      // must never fail because a provider was missing.
      expect(String((err as Error)?.name ?? "")).not.toBe("ProviderNotConfiguredError");
      expect(String((err as Error)?.message ?? "")).not.toMatch(/provider not configured/i);
    } finally {
      if (had !== undefined) process.env.GEMINI_API_KEY = had;
    }
  });

  it("gets past provider resolution far enough to persist a question", async () => {
    const had = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { client } = fakeDb(0);
    try {
      const err = await nextQuestion("iv1", {
        prisma: client,
        gemini: null,
        tts: null,
        now: () => new Date("2026-09-03T10:01:00.000Z"),
      }).catch((e: unknown) => e);
      // Reaching appendTurn proves a question was produced from the seeded
      // bank; only the mock's persistence layer is missing.
      const trace = String((err as Error)?.stack ?? "");
      const reachedPersistence = trace.includes("appendTurn") || !(err instanceof Error);
      expect(reachedPersistence).toBe(true);
    } finally {
      if (had !== undefined) process.env.GEMINI_API_KEY = had;
    }
  });
});
