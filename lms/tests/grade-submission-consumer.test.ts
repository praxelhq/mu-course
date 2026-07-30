import { describe, expect, it, vi } from "vitest";
import {
  createGradeSubmissionQueueHandler,
  type GradeSubmissionQueueJob,
} from "../worker/jobs/grade-submission-consumer";

function job(retryCount: number, retryLimit = 4): GradeSubmissionQueueJob {
  return {
    id: `job-${retryCount}`,
    data: { submissionId: "submission-retry" },
    retryCount,
    retryLimit,
  };
}

describe("grade.submission queue retry exhaustion", () => {
  it("rethrows a retryable failure without writing terminal dead-letter state", async () => {
    const failure = new Error("provider unavailable");
    const gradeSubmission = vi.fn(async () => {
      throw failure;
    });
    const markDeadLettered = vi.fn(async () => ({ kind: "marked" }));
    const now = vi.fn(() => new Date("2026-07-30T12:00:00.000Z"));
    const handler = createGradeSubmissionQueueHandler({
      gradeSubmission,
      markDeadLettered,
      now,
      log: vi.fn(),
    });

    await expect(handler([job(3, 4)])).rejects.toBe(failure);

    expect(gradeSubmission).toHaveBeenCalledOnce();
    expect(gradeSubmission).toHaveBeenCalledWith("submission-retry");
    expect(markDeadLettered).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it.each([4, 5])(
    "writes terminal dead-letter state when retryCount %i meets or exceeds retryLimit, then rethrows",
    async (retryCount) => {
      const events: string[] = [];
      const failure = new Error("grading exhausted");
      const exhaustedAt = new Date("2026-07-30T12:34:56.000Z");
      const gradeSubmission = vi.fn(async () => {
        events.push("grade");
        throw failure;
      });
      const markDeadLettered = vi.fn(async () => {
        events.push("dead-letter");
        return { kind: "marked" };
      });
      const handler = createGradeSubmissionQueueHandler({
        gradeSubmission,
        markDeadLettered,
        now: () => exhaustedAt,
        log: vi.fn(),
      });

      await expect(handler([job(retryCount, 4)])).rejects.toBe(failure);

      expect(events).toEqual(["grade", "dead-letter"]);
      expect(markDeadLettered).toHaveBeenCalledOnce();
      expect(markDeadLettered).toHaveBeenCalledWith({
        submissionId: "submission-retry",
        sourceJobId: `job-${retryCount}`,
        exhaustedAt,
      });
    },
  );
});
