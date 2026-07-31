import { describe, expect, it } from "vitest";
import { scoreDataRaceAnswer } from "@/lib/data-race";

describe("Data Race scoring v1", () => {
  it("gives zero and resets the streak for an incorrect answer", () => {
    expect(scoreDataRaceAnswer({ correct: false, responseMs: 1, durationSeconds: 30, previousStreak: 5 }))
      .toEqual({ points: 0, streak: 0 });
  });

  it("awards 600 base plus up to 400 speed points", () => {
    expect(scoreDataRaceAnswer({ correct: true, responseMs: 0, durationSeconds: 30, previousStreak: 0 }))
      .toEqual({ points: 1000, streak: 1 });
    expect(scoreDataRaceAnswer({ correct: true, responseMs: 30_000, durationSeconds: 30, previousStreak: 0 }))
      .toEqual({ points: 600, streak: 1 });
  });

  it("adds 50 per consecutive answer after the first and caps at 250", () => {
    expect(scoreDataRaceAnswer({ correct: true, responseMs: 30_000, durationSeconds: 30, previousStreak: 1 }))
      .toEqual({ points: 650, streak: 2 });
    expect(scoreDataRaceAnswer({ correct: true, responseMs: 30_000, durationSeconds: 30, previousStreak: 99 }))
      .toEqual({ points: 850, streak: 100 });
  });

  it("clamps elapsed time to the question window", () => {
    expect(scoreDataRaceAnswer({ correct: true, responseMs: -50, durationSeconds: 30, previousStreak: 0 }).points).toBe(1000);
    expect(scoreDataRaceAnswer({ correct: true, responseMs: 90_000, durationSeconds: 30, previousStreak: 0 }).points).toBe(600);
  });
});
