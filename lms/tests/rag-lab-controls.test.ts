import { describe, expect, it, vi } from "vitest";
import { RAG_RACE_QUESTIONS, copyRaceQuestion } from "@/app/(student)/tools/rag/rag-lab-controls";

describe("Session 8 race question copying", () => {
  it("copies each exact evaluator question", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    for (const question of RAG_RACE_QUESTIONS) {
      await expect(copyRaceQuestion(question, { writeText })).resolves.toBe(true);
    }
    expect(writeText.mock.calls.map(([question]) => question)).toEqual(RAG_RACE_QUESTIONS);
  });

  it("reports failure when clipboard access is absent or rejected", async () => {
    await expect(copyRaceQuestion(RAG_RACE_QUESTIONS[0], undefined)).resolves.toBe(false);
    await expect(copyRaceQuestion(RAG_RACE_QUESTIONS[0], {
      writeText: vi.fn().mockRejectedValue(new Error("permission denied")),
    })).resolves.toBe(false);
  });
});
