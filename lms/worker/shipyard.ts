// The Shipyard's pg-boss worker entrypoint.
//
// Deployed as its own Railway service (railway.shipyard-worker.json) from the
// same image as the Forge worker, so a deadline night of Course 2 reviews
// never competes with Course 1 grading. Playwright renders run here and
// nowhere else.
//
// M0 registers the four queues with the same retry and dead-letter shape as
// lib/queue.ts and attaches logging no-ops. M2 replaces the handlers with the
// real reviewer pipeline; the queue config is deliberately in place first so
// the topology is deployed and observable before any job does work.

import { PgBoss } from "pg-boss";
import {
  QUEUE_SHIPYARD_GATE_SWEEP,
  QUEUE_SHIPYARD_REVIEW,
  QUEUE_SHIPYARD_REVIEW_DEAD,
  QUEUE_SHIPYARD_TRACKER_REFRESH,
  SHIPYARD_REVIEW_RETRY_LIMIT,
  shipyardReviewConcurrency,
} from "../lib/shipyard/constants";

export type ShipyardReviewJobData = { submissionId: string };
export type ShipyardTrackerRefreshJobData = { productId?: string; all?: boolean };
export type ShipyardGateSweepJobData = { reason?: string };

/**
 * Create the Shipyard queues (idempotent). Dead-letter queue first, then the
 * work queue pointing at it — mirrors `ensureGradingQueues` in lib/queue.ts.
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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const concurrency = shipyardReviewConcurrency();
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: Error) => console.error("[pg-boss]", err));

  try {
    await boss.start();
  } catch (err) {
    console.error(
      "[shipyard-worker] Could not connect to Postgres at DATABASE_URL — exiting.",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  await ensureShipyardQueues(boss);

  await boss.work<ShipyardReviewJobData>(
    QUEUE_SHIPYARD_REVIEW,
    { batchSize: concurrency },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[shipyard-worker] review ${job.data.submissionId}: not implemented yet (M2)`);
      }
    },
  );

  await boss.work<ShipyardTrackerRefreshJobData>(
    QUEUE_SHIPYARD_TRACKER_REFRESH,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(
          `[shipyard-worker] tracker refresh ${job.data.productId ?? "(all)"}: not implemented yet (M3)`,
        );
      }
    },
  );

  await boss.work<ShipyardGateSweepJobData>(
    QUEUE_SHIPYARD_GATE_SWEEP,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(
          `[shipyard-worker] gate sweep (${job.data.reason ?? "scheduled"}): not implemented yet (M3)`,
        );
      }
    },
  );

  console.log(
    `[shipyard-worker] up. queues: ${QUEUE_SHIPYARD_REVIEW} (concurrency ${concurrency}), ` +
      `${QUEUE_SHIPYARD_TRACKER_REFRESH}, ${QUEUE_SHIPYARD_GATE_SWEEP}.`,
  );

  const stop = async (signal: string) => {
    console.log(`[shipyard-worker] ${signal} — draining.`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("worker/shipyard.ts")) {
  main().catch((err) => {
    console.error("[shipyard-worker] fatal:", err);
    process.exit(1);
  });
}
