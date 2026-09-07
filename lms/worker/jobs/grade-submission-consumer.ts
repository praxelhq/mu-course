export type GradeSubmissionQueueJob = {
  id: string;
  data: { submissionId: string };
  /** Present because the production worker registers with includeMetadata. */
  retryCount?: number;
  retryLimit?: number;
};

export type GradeSubmissionQueueHandlerDeps = {
  gradeSubmission(submissionId: string): Promise<void>;
  markDeadLettered(input: {
    submissionId: string;
    sourceJobId: string;
    exhaustedAt: Date;
  }): Promise<unknown>;
  now(): Date;
  log(message: string): void;
};

/**
 * Build the pg-boss grade.submission callback without starting a worker.
 * retryCount is zero-based; equality with retryLimit is the exhausted attempt.
 */
export function createGradeSubmissionQueueHandler(
  deps: GradeSubmissionQueueHandlerDeps,
): (jobs: readonly GradeSubmissionQueueJob[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      deps.log(`[grading] job ${job.id} → submission ${job.data.submissionId}`);
      try {
        await deps.gradeSubmission(job.data.submissionId);
        deps.log(`[grading] job ${job.id} done`);
      } catch (error) {
        if (
          typeof job.retryCount === "number" &&
          typeof job.retryLimit === "number" &&
          job.retryCount >= job.retryLimit
        ) {
          await deps.markDeadLettered({
            submissionId: job.data.submissionId,
            sourceJobId: job.id,
            exhaustedAt: deps.now(),
          });
        }
        throw error;
      }
    }
  };
}
