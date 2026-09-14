// The Shipyard's pg-boss worker entrypoint.
//
// Deployed as its own Railway service (railway.shipyard-worker.json) from the
// same image as the Forge worker, so a deadline night of Course 2 reviews
// never competes with Course 1 grading. Playwright renders run here and
// nowhere else.
//
// This file is wiring only: every handler lives in `worker/shipyard-jobs/` and
// is a plain async function over a submission id, so the whole pipeline is
// testable without a queue.
//
//   shipyard.review          M1 stub reviewer; M2 swaps in the model call
//   shipyard.review.dead     returns a submission nobody could review
//   shipyard.gate-sweep      15-minute metric-gate sweep (SPEC §5)
//   shipyard.tracker-refresh placeholder until M3

import { PgBoss, type JobWithMetadata } from "pg-boss";
import {
  QUEUE_SHIPYARD_GATE_SWEEP,
  QUEUE_SHIPYARD_REVIEW,
  QUEUE_SHIPYARD_REVIEW_DEAD,
  QUEUE_SHIPYARD_TRACKER_REFRESH,
  shipyardReviewConcurrency,
} from "../lib/shipyard/constants";
import {
  ensureShipyardQueues,
  type ShipyardGateSweepJobData,
  type ShipyardReviewJobData,
  type ShipyardTrackerRefreshJobData,
} from "../lib/shipyard/queue";
import { handleReviewSubmission } from "./shipyard-jobs/review-submission";
import { handleReviewDeadLetter } from "./shipyard-jobs/review-dead-letter";
import { GATE_SWEEP_CRON, sweepMetricGates } from "./shipyard-jobs/gate-sweep";

export { ensureShipyardQueues };
export type {
  ShipyardGateSweepJobData,
  ShipyardReviewJobData,
  ShipyardTrackerRefreshJobData,
};

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

  // One job per handler invocation (batchSize 1) with `concurrency` of them in
  // flight: a review is a single long model call, so a batch would serialise
  // what the concurrency is meant to parallelise.
  await boss.work(
    QUEUE_SHIPYARD_REVIEW,
    { batchSize: 1, localConcurrency: concurrency, includeMetadata: true },
    async (jobs: JobWithMetadata<ShipyardReviewJobData>[]) => {
      for (const job of jobs) {
        const outcome = await handleReviewSubmission(job.data.submissionId);
        if (!outcome.handled) {
          console.warn(
            `[shipyard-worker] review ${job.data.submissionId}: skipped (${outcome.reason})`,
          );
          continue;
        }
        console.log(
          `[shipyard-worker] review ${job.data.submissionId} → ${outcome.status}` +
            ` (attempt ${job.retryCount + 1}, checkpoint ${outcome.checkpointOrder})`,
        );
      }
    },
  );

  // Unlike the Forge's grading dead letter, this one IS consumed — see
  // worker/shipyard-jobs/review-dead-letter.ts for why.
  await boss.work<ShipyardReviewJobData>(
    QUEUE_SHIPYARD_REVIEW_DEAD,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const submissionId = job.data?.submissionId;
        if (!submissionId) {
          console.error("[shipyard-worker] dead-letter job with no submissionId", job.id);
          continue;
        }
        const outcome = await handleReviewDeadLetter(submissionId);
        console.warn(
          `[shipyard-worker] dead-letter ${submissionId}: ` +
            (outcome.handled ? "returned with the stock reason" : `skipped (${outcome.reason})`),
        );
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
        const result = await sweepMetricGates();
        console.log(
          `[shipyard-worker] gate sweep (${job.data?.reason ?? "scheduled"}) ` +
            `examined=${result.examined} changed=${result.changed} failed=${result.failed}`,
        );
      }
    },
  );

  await boss.schedule(
    QUEUE_SHIPYARD_GATE_SWEEP,
    GATE_SWEEP_CRON,
    { reason: "schedule" },
    { tz: "UTC", key: "gate-sweep-v1" },
  );

  console.log(
    `[shipyard-worker] up. queues: ${QUEUE_SHIPYARD_REVIEW} (concurrency ${concurrency}, ` +
      `dead letter → ${QUEUE_SHIPYARD_REVIEW_DEAD}), ${QUEUE_SHIPYARD_TRACKER_REFRESH}, ` +
      `${QUEUE_SHIPYARD_GATE_SWEEP} (${GATE_SWEEP_CRON}).`,
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
