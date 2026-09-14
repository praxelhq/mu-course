// Finishing a review: the one path a verdict takes, whoever produced it.
//
// The AI reviewer, the M1 stub, an instructor's override and the dead-letter
// backstop all land here, so "a verdict was recorded" always means the same
// five things happened in the same order:
//   1. a ShipyardReview row, carrying model, provider, tokens and cost
//   2. the submission moves to `passed` or `returned`
//   3. (1) and (2) commit together or not at all
//   4. `recomputeGates` re-decides every gate for this product
//   5. the student is told
//
// Steps 4 and 5 are deliberately OUTSIDE the transaction. recomputeGates calls
// the tracker, and a slow tracker must never hold a write lock on a student's
// submission on a deadline night; if it fails, the gate sweep re-runs it within
// fifteen minutes and the stored review is already correct.

import { Prisma, type PrismaClient, type ShipyardVerdict } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import { recomputeGates, type CheckpointStateRow } from "./gate-state";
import type { ReasonView } from "./view-models";

export type VerdictInput = {
  verdict: ShipyardVerdict;
  /** Student-facing, one entry per bar clause. */
  reasons: ReasonView[];
  /** Internal per-criterion scores; never shown to a student. */
  rubricScores: Record<string, number>;
  confidence: number;
  modelUsed: string;
  providerUsed: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  reviewedBy?: "ai" | "human";
  needsHuman?: boolean;
  metricSignalsSeen?: TrackerSignals | null;
  renderArtifacts?: Record<string, unknown> | null;
  promptLog?: Record<string, unknown> | null;
};

export type CompleteReviewDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
};

export type CompleteReviewResult = {
  reviewId: string;
  submissionId: string;
  productId: string;
  status: "passed" | "returned";
  checkpointOrder: number;
  states: CheckpointStateRow[];
};

/** The note a student reads in the notification body. */
export function notificationBody(
  verdict: ShipyardVerdict,
  reasons: ReasonView[],
  nextCheckpointTitle: string | null,
): string {
  if (verdict === "return") {
    const failed = reasons.find((r) => !r.met) ?? reasons[0];
    return failed?.note?.trim() || "Open the checkpoint to read what to fix.";
  }
  return nextCheckpointTitle
    ? `Next: ${nextCheckpointTitle}.`
    : "Every checkpoint is cleared. Nothing is left to submit.";
}

/** Record a verdict, move the gate, and tell the student. */
export async function completeReview(
  submissionId: string,
  verdict: VerdictInput,
  deps: CompleteReviewDeps = {},
): Promise<CompleteReviewResult> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();

  const submission = await db.shipyardSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      productId: true,
      checkpointId: true,
      status: true,
      product: { select: { userId: true } },
      checkpoint: { select: { order: true, title: true } },
    },
  });
  if (!submission) {
    throw new ShipyardError(404, { error: `No submission ${submissionId}.` });
  }

  const status = verdict.verdict === "pass" ? "passed" : "returned";

  const nextCheckpoint = await db.shipyardCheckpoint.findFirst({
    where: { courseId: SHIPYARD_COURSE_ID, order: { gt: submission.checkpoint.order } },
    orderBy: { order: "asc" },
    select: { title: true },
  });

  const review = await db.$transaction(async (tx) => {
    const created = await tx.shipyardReview.create({
      data: {
        courseId: SHIPYARD_COURSE_ID,
        submissionId,
        verdict: verdict.verdict,
        reasons: verdict.reasons as unknown as Prisma.InputJsonValue,
        rubricScores: verdict.rubricScores as unknown as Prisma.InputJsonValue,
        confidence: verdict.confidence,
        metricSignalsSeen: verdict.metricSignalsSeen
          ? (verdict.metricSignalsSeen as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        renderArtifacts: verdict.renderArtifacts
          ? (verdict.renderArtifacts as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        promptLog: verdict.promptLog
          ? (verdict.promptLog as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        modelUsed: verdict.modelUsed,
        providerUsed: verdict.providerUsed,
        tokensIn: verdict.tokensIn ?? 0,
        tokensOut: verdict.tokensOut ?? 0,
        costUsd: verdict.costUsd ?? 0,
        reviewedBy: verdict.reviewedBy ?? "ai",
        needsHuman: verdict.needsHuman ?? false,
        createdAt: now,
      },
      select: { id: true },
    });
    await tx.shipyardSubmission.update({
      where: { id: submissionId },
      data: { status },
    });
    return created;
  });

  // The gate rule is re-run in full rather than patched: `recomputeGates` is
  // the only writer of ShipyardCheckpointState (architecture §4), and a pass
  // that flipped the next checkpoint open has to go through it.
  const states = await recomputeGates(submission.productId, {
    db,
    tracker: deps.tracker,
    now,
  });

  try {
    await db.notification.create({
      data: {
        userId: submission.product.userId,
        kind: "shipyard.review",
        title: `Checkpoint ${submission.checkpoint.order} ${
          verdict.verdict === "pass" ? "cleared" : "returned"
        }`,
        body: notificationBody(verdict.verdict, verdict.reasons, nextCheckpoint?.title ?? null),
      },
    });
  } catch (err) {
    // A notification is not the verdict. Losing one must not fail the review
    // and send the job back for a retry that would double-write it.
    console.error(
      `[shipyard] notification failed for submission ${submissionId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    reviewId: review.id,
    submissionId,
    productId: submission.productId,
    status,
    checkpointOrder: submission.checkpoint.order,
    states,
  };
}
