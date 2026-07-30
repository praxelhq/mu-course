import { QUEUE_GRADE_SUBMISSION_DEAD } from "@/lib/queue";
import {
  markAssessmentSubmissionDeadLettered,
  type AssessmentDeadLetterOutcome,
} from "@/lib/assessments/dead-letter";

type GradeDeadJob = { id: string; data: { submissionId?: unknown } };

export type GradeDeadLetterSource = {
  findJobs(name: string, options: { queued: boolean }): Promise<GradeDeadJob[]>;
};

/** Read-only dead-queue reconciliation. It never fetches or settles a job. */
export async function reconcileGradeSubmissionDeadLetters(
  source: GradeDeadLetterSource,
  deps: {
    markDeadLettered?: (input: {
      submissionId: string;
      sourceJobId: string;
      exhaustedAt: Date;
    }) => Promise<AssessmentDeadLetterOutcome>;
    now?: () => Date;
  } = {},
): Promise<{ examined: number; marked: number; failed: number }> {
  const jobs = await source.findJobs(QUEUE_GRADE_SUBMISSION_DEAD, {
    queued: true,
  });
  const mark = deps.markDeadLettered ?? markAssessmentSubmissionDeadLettered;
  const now = deps.now ?? (() => new Date());
  let marked = 0;
  let failed = 0;
  for (const job of jobs) {
    const submissionId = job.data?.submissionId;
    if (typeof submissionId !== "string" || !submissionId) {
      failed += 1;
      continue;
    }
    try {
      const outcome = await mark({
        submissionId,
        sourceJobId: job.id,
        exhaustedAt: now(),
      });
      if (outcome.kind === "marked") marked += 1;
    } catch {
      failed += 1;
    }
  }
  return { examined: jobs.length, marked, failed };
}
