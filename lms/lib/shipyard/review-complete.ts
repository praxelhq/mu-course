// Finishing a review: the one path a verdict takes, whoever produced it.
//
// The AI reviewer, the M1 stub, an instructor's override and the dead-letter
// backstop all land here, so "a verdict was recorded" always means the same
// five things happened in the same order:
//   1. a ShipyardReview row, carrying model, provider, tokens and cost
//   2. the submission moves to `passed` or `returned` — or, for a HELD pass,
//      stays `in_review` (see `heldPass` below)
//   3. (1) and (2) commit together or not at all
//   4. `recomputeGates` re-decides every gate for this product
//   5. the provisional grade is refreshed
//   6. the student is told
//
// THE HELD PASS. SPEC §6: a pass whose confidence is low, whose write-up
// contradicts the evidence, or which is an outlier is "auto-queued for human
// review BEFORE the pass counts". So `verdict: "pass"` with `needsHuman: true`
// records the reviewer's judgement honestly — the row says pass — while the
// SUBMISSION stays `in_review` and the gate stays shut. `recomputeGates` reads
// only `verdict: pass, needsHuman: false` reviews, so the gate rule needs no
// special case; the one thing that has to be right here is that the student is
// not told they cleared anything. Only `humanResolve`
// (lib/shipyard/review-escalate.ts) moves it afterwards.
//
// Steps 4 to 6 are deliberately OUTSIDE the transaction. recomputeGates calls
// the tracker, and a slow tracker must never hold a write lock on a student's
// submission on a deadline night; if it fails, the gate sweep re-runs it within
// fifteen minutes and the stored review is already correct.

import {
  Prisma,
  type PrismaClient,
  type ShipyardGateState,
  type ShipyardVerdict,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import { recomputeGates, type CheckpointStateRow } from "./gate-state";
import type { GateReason } from "./gates";
import { onReviewCompleted, workflowRunsFrom } from "./grades";
import { WORKFLOW_TARGETS } from "./scoring";
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
  /**
   * The reviewer's `summaryForStudent`. When present it IS the notification
   * body: it is written for this purpose (≤ 60 words, warm, says what happens
   * next), where the first unmet clause's note is written to sit beside its
   * clause on the spine and reads oddly alone in a notification.
   */
  studentSummary?: string | null;
  metricSignalsSeen?: TrackerSignals | null;
  renderArtifacts?: Record<string, unknown> | null;
  promptLog?: Record<string, unknown> | null;
  /**
   * Checkpoint 5's write-up: recorded, never judged (SPEC §6). It is a `pass`
   * because nothing here refuses it, NOT because anything was cleared — the
   * gate is the tracker's run count — so the student is told "notes saved".
   */
  informational?: boolean;
};

export type CompleteReviewDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
  /**
   * Signals the caller has already read. Passed straight to `recomputeGates`
   * so the metric half is decided from the same numbers the reviewer saw,
   * rather than from a second call that could disagree with the first.
   */
  signals?: TrackerSignals | null;
};

export type CompleteReviewStatus = "passed" | "returned" | "in_review";

export type CompleteReviewResult = {
  reviewId: string;
  submissionId: string;
  productId: string;
  status: CompleteReviewStatus;
  /** True when a `pass` was recorded but is waiting on a human (SPEC §6). */
  heldForHuman: boolean;
  checkpointOrder: number;
  states: CheckpointStateRow[];
};

/** The one line that decides whether a recorded pass moves anything. */
export function isHeldPass(verdict: VerdictInput): boolean {
  return verdict.verdict === "pass" && verdict.needsHuman === true;
}

/** What a held pass says to the student: met the bar, not cleared yet. */
export const HELD_PASS_BODY =
  "Your submission met the bar and is with a reviewer for a final check.";

/** The note a student reads in the notification body. */
export function notificationBody(
  verdict: ShipyardVerdict,
  reasons: ReasonView[],
  nextCheckpointTitle: string | null,
  held = false,
  studentSummary?: string | null,
): string {
  if (held) return HELD_PASS_BODY;
  const summary = studentSummary?.trim();
  if (summary) return summary;
  if (verdict === "return") {
    const failed = reasons.find((r) => !r.met) ?? reasons[0];
    return failed?.note?.trim() || "Open the checkpoint to read what to fix.";
  }
  return nextCheckpointTitle
    ? `Next: ${nextCheckpointTitle}.`
    : "Every checkpoint is cleared. Nothing is left to submit.";
}

/** The title beside it. A held pass is neither "cleared" nor "returned". */
export function notificationTitle(
  order: number,
  verdict: ShipyardVerdict,
  held: boolean,
): string {
  if (held) return `Checkpoint ${order} is with a reviewer`;
  return `Checkpoint ${order} ${verdict === "pass" ? "cleared" : "returned"}`;
}

/**
 * What is still outstanding, in the words of the gate's own reason.
 *
 * A `both` gate whose write-up passed has NOT cleared, and telling a student
 * "Checkpoint 4 cleared" while the gate sits shut waiting on Shipped.money is
 * the one thing a notification must never do.
 */
export const OUTSTANDING_HALF_BODY: Partial<Record<GateReason, string>> = {
  "awaiting-metrics":
    "Payments live and tracker connected are still being read from Shipped.money.",
  "blocked-by-flag": "The tracker reports a blocking flag; ask your instructor.",
  "tracker-unreachable": "Shipped.money could not be read; it will retry.",
};

/** The title for a write-up that was accepted without clearing its gate. */
export function writeUpAcceptedTitle(order: number): string {
  return `Checkpoint ${order} write-up accepted`;
}

/** Checkpoint 5's write-up is recorded, never judged: say exactly that. */
export function informationalTitle(order: number): string {
  return `Checkpoint ${order} notes saved`;
}

export function informationalBody(runs: number | null): string {
  if (runs === null) {
    return "Runs are counted from your tagged n8n workflow. Shipped.money could not be read just now; it will retry.";
  }
  return `Runs are counted from your tagged n8n workflow: ${runs} of ${WORKFLOW_TARGETS.bar}.`;
}

export type NotificationFacts = {
  order: number;
  verdict: ShipyardVerdict;
  held: boolean;
  /** This checkpoint's row AFTER the verdict landed, from `recomputeGates`. */
  state: { state: ShipyardGateState; reason: GateReason } | null;
  /** The next checkpoint's title, and whether it ACTUALLY opened. */
  nextTitle: string | null;
  nextOpened: boolean;
  reasons: ReasonView[];
  studentSummary?: string | null;
  /** Checkpoint 5: recorded, not reviewed. */
  informational?: boolean;
  /** Its run count, for the informational body. Null when unread. */
  workflowRuns?: number | null;
};

/**
 * The one place a student's notification is decided, from what the GATE says
 * rather than from what the verdict said.
 *
 * The verdict answers "did the write-up meet the bar". The notification has to
 * answer "what happened to your checkpoint", and for a `both` gate those are
 * different questions with different answers (C3).
 */
export function notificationFor(facts: NotificationFacts): { title: string; body: string } {
  if (facts.informational) {
    return {
      title: informationalTitle(facts.order),
      body: informationalBody(facts.workflowRuns ?? null),
    };
  }

  if (facts.held) {
    return {
      title: notificationTitle(facts.order, facts.verdict, true),
      body: HELD_PASS_BODY,
    };
  }

  if (facts.verdict === "return") {
    return {
      title: notificationTitle(facts.order, "return", false),
      body: notificationBody("return", facts.reasons, null, false, facts.studentSummary),
    };
  }

  // A pass. Whether it CLEARED is the recomputed row's answer, not ours.
  const cleared = facts.state ? facts.state.state === "passed" : true;
  if (cleared) {
    return {
      title: notificationTitle(facts.order, "pass", false),
      // "Next: X" only when X is genuinely open now; otherwise the student
      // reads an instruction they cannot act on.
      body: notificationBody(
        "pass",
        facts.reasons,
        facts.nextOpened ? facts.nextTitle : null,
        false,
        // The reviewer's summary is about the write-up; when the next
        // checkpoint opened, where to go next is the more useful sentence.
        facts.nextOpened ? null : facts.studentSummary,
      ),
    };
  }

  const outstanding = facts.state ? OUTSTANDING_HALF_BODY[facts.state.reason] : undefined;
  return {
    title: writeUpAcceptedTitle(facts.order),
    body:
      outstanding ??
      "Your write-up is in. This checkpoint also waits on the numbers Shipped.money reports.",
  };
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

  const held = isHeldPass(verdict);
  const status: CompleteReviewStatus = held
    ? "in_review"
    : verdict.verdict === "pass"
      ? "passed"
      : "returned";

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

  // Steps 4 to 6 are best-effort BY CONTRACT, as the header says: the verdict
  // and the submission's status are committed, and a failure here must not
  // send the job back for a retry that would write a second review. The
  // fifteen-minute gate sweep repairs anything left behind.
  let states: CheckpointStateRow[] = [];
  try {
    // The gate rule is re-run in full rather than patched: `recomputeGates` is
    // the only writer of ShipyardCheckpointState (architecture §4), and a pass
    // that flipped the next checkpoint open has to go through it.
    states = await recomputeGates(submission.productId, {
      db,
      tracker: deps.tracker,
      now,
      ...(deps.signals !== undefined ? { signals: deps.signals } : {}),
    });
  } catch (err) {
    console.error(
      `[shipyard] recomputeGates failed after review ${review.id}; the sweep will repair it:`,
      err instanceof Error ? err.message : err,
    );
  }

  try {
    // A new verdict on checkpoint 3 or launch moves the product-quality
    // component, and a newly-passed sixth checkpoint moves the graduation
    // condition. A grade is derived and can always be recomputed, and it must
    // never cost a student their recorded verdict.
    await onReviewCompleted(submission.productId, { db, now });
  } catch (err) {
    console.error(
      `[shipyard] grade refresh failed after review ${review.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  const order = submission.checkpoint.order;
  const thisState = states.find((s) => s.order === order) ?? null;
  const nextState = states.find((s) => s.order === order + 1) ?? null;
  const note = notificationFor({
    order,
    verdict: verdict.verdict,
    held,
    state: thisState ? { state: thisState.state, reason: thisState.reason } : null,
    nextTitle: nextCheckpoint?.title ?? null,
    // `locked` means the student cannot act on it, whatever its title says.
    nextOpened: nextState ? nextState.state !== "locked" : nextCheckpoint === null,
    reasons: verdict.reasons,
    studentSummary: verdict.studentSummary,
    informational: verdict.informational === true,
    workflowRuns: deps.signals === undefined ? null : workflowRunsFrom(deps.signals),
  });

  try {
    await db.notification.create({
      data: {
        userId: submission.product.userId,
        kind: "shipyard.review",
        title: note.title,
        body: note.body,
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
    heldForHuman: held,
    checkpointOrder: submission.checkpoint.order,
    states,
  };
}
