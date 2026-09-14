// The `shipyard.review.dead` consumer.
//
// Four retries with backoff have failed, so nobody is going to review this
// submission. Without a consumer it would sit in `in_review` forever: the
// student would watch a queue position that never moves, and the resubmit form
// stays shut while a prior attempt is in review — so the failure silently
// removes their only way forward.
//
// Instead the submission is RETURNED with one stock reason. A return is
// recoverable (the cooldown lifts, they resubmit, it works); a submission stuck
// in review is not. The reason says plainly that the fault was ours, and the
// review is flagged for a human so an instructor sees it in the queue.
//
// This is the one place the Shipyard consumes a dead-letter queue rather than
// leaving the rows for an admin view (the Forge's grading queue does the
// opposite): there, a dead-lettered grade can be redriven with no student
// waiting on a gate; here, the gate IS the student's next step.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/db";
import { completeReview, type CompleteReviewResult } from "../../lib/shipyard/review-complete";

export const DEAD_LETTER_REASON =
  "The reviewer could not run. Resubmit, or ask your instructor.";

export type ReviewDeadLetterDeps = {
  db?: PrismaClient;
  now?: Date;
  complete?: typeof completeReview;
};

export type ReviewDeadLetterOutcome =
  | { handled: false; reason: "missing" | "already-final" }
  | ({ handled: true } & CompleteReviewResult);

export async function handleReviewDeadLetter(
  submissionId: string,
  deps: ReviewDeadLetterDeps = {},
): Promise<ReviewDeadLetterOutcome> {
  const db = deps.db ?? defaultPrisma;
  const complete = deps.complete ?? completeReview;

  const submission = await db.shipyardSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true },
  });
  if (!submission) return { handled: false, reason: "missing" };
  if (submission.status === "passed" || submission.status === "returned") {
    // A late retry succeeded before the dead letter was consumed. Leave it.
    return { handled: false, reason: "already-final" };
  }

  const result = await complete(
    submissionId,
    {
      verdict: "return",
      reasons: [{ criterion: "The reviewer ran", met: false, note: DEAD_LETTER_REASON }],
      rubricScores: {},
      confidence: 0,
      modelUsed: "none",
      providerUsed: "none",
      reviewedBy: "ai",
      // Not a judgement about the work: an instructor should see this.
      needsHuman: true,
    },
    { db, now: deps.now },
  );
  return { handled: true, ...result };
}
