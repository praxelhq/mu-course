// The Shipyard's queue topology, and the web tier's one way onto it.
//
// The shape lives here rather than in `worker/shipyard.ts` because both ends
// need it: the worker creates the queues at boot, and a submit handler has to
// be able to enqueue into a queue that exists even if the worker has never run
// on this database. Mirrors `ensureGradingQueues` in lib/queue.ts.

import type { PgBoss } from "pg-boss";
import { getBoss } from "@/lib/queue";
import {
  QUEUE_SHIPYARD_GATE_SWEEP,
  QUEUE_SHIPYARD_REVIEW,
  QUEUE_SHIPYARD_REVIEW_DEAD,
  QUEUE_SHIPYARD_TRACKER_REFRESH,
  SHIPYARD_REVIEW_RETRY_LIMIT,
} from "./constants";

export type ShipyardReviewJobData = { submissionId: string };
export type ShipyardTrackerRefreshJobData = { productId?: string; all?: boolean };
export type ShipyardGateSweepJobData = { reason?: string };

/**
 * Create the Shipyard queues (idempotent). Dead-letter queue first, then the
 * work queue pointing at it.
 */
export async function ensureShipyardQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_SHIPYARD_REVIEW_DEAD);
  await boss.createQueue(QUEUE_SHIPYARD_REVIEW, {
    retryLimit: SHIPYARD_REVIEW_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: 15, // seconds; doubles per retry with jitter
    deadLetter: QUEUE_SHIPYARD_REVIEW_DEAD,
  });
  // A failed tracker read is not an incident: the next refresh or the sweep
  // picks the product up again, so there is no dead letter here.
  await boss.createQueue(QUEUE_SHIPYARD_TRACKER_REFRESH, {
    retryLimit: 2,
    retryBackoff: true,
    retryDelay: 30,
  });
  await boss.createQueue(QUEUE_SHIPYARD_GATE_SWEEP, {
    retryLimit: 2,
    retryBackoff: true,
    retryDelay: 60,
  });
}

/**
 * Best-effort enqueue of a review. A queue outage must NOT lose a student's
 * submission: the row is already committed, so the failure is logged and the
 * submission sits in `submitted` for an instructor (or the gate sweep) to pick
 * up, rather than the student being told their work did not save.
 */
export async function enqueueShipyardReview(submissionId: string): Promise<string | null> {
  try {
    const boss = await getBoss();
    await ensureShipyardQueues(boss);
    return await boss.send(QUEUE_SHIPYARD_REVIEW, { submissionId });
  } catch (err) {
    console.error(
      `[shipyard] failed to enqueue review for ${submissionId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
