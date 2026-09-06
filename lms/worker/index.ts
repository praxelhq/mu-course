// pg-boss worker entrypoint. U9 wires the grading queue: grade.submission is
// consumed with GRADING_CONCURRENCY parallel workers (default 5), retries
// with exponential backoff, and dead-letters to grade.submission.dead (U16
// surfaces those; admins re-enqueue via POST /api/admin/regrade).
import { PgBoss } from "pg-boss";
import { prisma } from "../lib/db";
import { inspectPrismaDatabaseReadiness } from "../lib/operations/database-readiness";
import { expectedMigrationHead } from "../lib/operations/readiness";
import { loadRuntimeIdentity } from "../lib/operations/runtime-identity";
import { recordServiceHeartbeat } from "../lib/operations/service-heartbeats";
import {
  ensureGradingQueues,
  FUTURE_QUEUES,
  QUEUE_GRADE_INTERVIEW,
  QUEUE_GRADE_INTERVIEW_DEAD,
  QUEUE_GRADE_SUBMISSION,
  QUEUE_GRADE_SUBMISSION_DEAD,
  QUEUE_PORTFOLIO_CRAWL,
  QUEUE_PREREQUISITE_PREPARE,
  QUEUE_RETENTION_CLEANUP,
  QUEUE_SCREENSHOT_CAPTURE,
  type PortfolioCrawlJobData,
  type PrerequisitePrepareJobData,
} from "../lib/queue";
import { handleGradeSubmission } from "./jobs/grade-submission";
import { createGradeSubmissionQueueHandler } from "./jobs/grade-submission-consumer";
import { handleGradeInterview } from "./jobs/grade-interview";
import { handleScreenshotCapture } from "./jobs/screenshot-capture";
import { handlePortfolioCrawl } from "./jobs/portfolio-crawl";
import { handlePreparePrerequisite } from "./jobs/prepare-prerequisite";
import { markAssessmentSubmissionDeadLettered } from "../lib/assessments/dead-letter";
import { reconcileGradeSubmissionDeadLetters } from "./jobs/reconcile-grade-dead-letters";
import { sweepInterviews } from "./jobs/sweep-interviews";
import { handleRetentionCleanup } from "./jobs/retention-cleanup";
import {
  parseHeartbeatIntervalSeconds,
  startWorkerHeartbeat,
} from "./runtime-heartbeat";
import {
  resolveRetentionSchedule,
  runScheduledRetention,
} from "./retention-schedule";
import { verifyWorkerRuntimeDependencies } from "./runtime-dependencies";

type GradeJobData = { submissionId: string };
type InterviewJobData = { interviewId: string };

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const runtimeIdentity = loadRuntimeIdentity();
  const identityRequired =
    process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
  if (identityRequired && !runtimeIdentity.verified) {
    throw new Error("Worker image is missing immutable Railway artifact identity");
  }
  const retentionSchedule = resolveRetentionSchedule(process.env, identityRequired);
  const runtimeCapabilities = runtimeIdentity.verified
    ? await verifyWorkerRuntimeDependencies()
    : null;

  const concurrency = Math.max(1, Number(process.env.GRADING_CONCURRENCY) || 5);

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: Error) => console.error("[pg-boss]", err));
  try {
    await boss.start();
  } catch (err) {
    console.error(
      "[worker] Could not connect to Postgres at DATABASE_URL — exiting.",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  let runtimeSchemaHead: string | null = null;
  let runtimeHeartbeat: { stop(): void } | null = null;
  if (!runtimeIdentity.verified) {
    console.warn("[worker] local runtime identity unavailable; durable heartbeat disabled");
  } else {
    const schemaHead = expectedMigrationHead();
    runtimeSchemaHead = schemaHead;
    const database = await inspectPrismaDatabaseReadiness(prisma);
    runtimeHeartbeat = await startWorkerHeartbeat({
      identity: runtimeIdentity,
      expectedSchemaHead: schemaHead,
      database,
      intervalSeconds: parseHeartbeatIntervalSeconds(
        process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS,
      ),
      localOcrEnglish: runtimeCapabilities?.localOcrEnglish === true,
      writeHeartbeat: (record) =>
        recordServiceHeartbeat(record, {
          upsert: (args) => prisma.serviceHeartbeat.upsert(args),
        }),
    });
  }

  await ensureGradingQueues(boss);

  // pg-boss v12 concurrency: localConcurrency spawns N independent workers
  // for the queue on this node; batchSize 1 keeps one job per handler call.
  await boss.work<GradeJobData>(
    QUEUE_GRADE_SUBMISSION,
    { batchSize: 1, localConcurrency: concurrency, includeMetadata: true },
    createGradeSubmissionQueueHandler({
      gradeSubmission: handleGradeSubmission,
      markDeadLettered: markAssessmentSubmissionDeadLettered,
      now: () => new Date(),
      log: (message) => console.log(message),
    }),
  );

  // U11: screenshot capture (headless chromium; serial — browser launches are
  // heavy and the queue is shallow).
  await boss.work<GradeJobData>(
    QUEUE_SCREENSHOT_CAPTURE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[screenshot] job ${job.id} → submission ${job.data.submissionId}`);
        await handleScreenshotCapture(job.data.submissionId);
        console.log(`[screenshot] job ${job.id} done`);
      }
    }
  );

  // U12: interview grading — serial (shallow queue; one Anthropic call each),
  // retries with backoff, dead-letters to grade.interview.dead (no consumer —
  // same admin redrive story as submissions).
  await boss.work<InterviewJobData>(
    QUEUE_GRADE_INTERVIEW,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[interview-grading] job ${job.id} → interview ${job.data.interviewId}`);
        await handleGradeInterview(job.data.interviewId);
        console.log(`[interview-grading] job ${job.id} done`);
      }
    }
  );

  // Prerequisite prepare: recover PDF text the web tier cannot extract, and
  // summarise a blueprint so the interviewer reads prose, not Make JSON.
  await boss.work<PrerequisitePrepareJobData>(
    QUEUE_PREREQUISITE_PREPARE,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[prerequisite] job ${job.id} → ${job.data.kind} for ${job.data.userId}`);
        const out = await handlePreparePrerequisite(job.data);
        console.log(
          `[prerequisite] job ${job.id} extracted=${out.extracted} digested=${out.digested}` +
            (out.reason ? ` (${out.reason})` : ""),
        );
      }
    }
  );

  // NOTE: no consumer is registered on grade.submission.dead — dead-lettered
  // jobs stay queued there so U16's admin view can list them (findJobs) and
  // redrive/regrade; consuming them here would mark them completed.
  // Reconciliation only reads queued rows and idempotently repairs LMS state;
  // it never fetches/settles a job from the dead-letter queue.
  const reconcileDeadLetters = async () => {
    const result = await reconcileGradeSubmissionDeadLetters(boss);
    if (result.marked > 0 || result.failed > 0) {
      console.log(
        `[grading] dead-letter reconciliation examined=${result.examined} marked=${result.marked} failed=${result.failed}`,
      );
    }
  };
  // Interviews that fell through: completed-but-ungraded, and abandoned live
  // rooms. Runs on the same cadence as the submission reconciler.
  const sweep = async () => {
    const result = await sweepInterviews();
    if (result.requeued > 0 || result.reaped > 0) {
      console.log(
        `[interview-sweep] requeued=${result.requeued} reaped=${result.reaped}`,
      );
    }
  };

  await reconcileDeadLetters();
  await sweep();
  const interviewSweepTimer = setInterval(() => {
    void sweep().catch((error) => console.error("[interview-sweep] failed", error));
  }, 60_000);
  interviewSweepTimer.unref();
  const deadLetterReconcileTimer = setInterval(() => {
    void reconcileDeadLetters().catch((error) =>
      console.error("[grading] dead-letter reconciliation failed", error),
    );
  }, 60_000);
  deadLetterReconcileTimer.unref();

  // U16: portfolio link-liveness crawl — serial (one job crawls one student
  // or the whole cohort; per-student link probes run 3 at a time inside).
  await boss.work<PortfolioCrawlJobData>(
    QUEUE_PORTFOLIO_CRAWL,
    { batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[portfolio-crawl] job ${job.id} → ${JSON.stringify(job.data)}`);
        const { crawled } = await handlePortfolioCrawl(job.data);
        console.log(`[portfolio-crawl] job ${job.id} done (${crawled} student(s))`);
      }
    }
  );

  if (retentionSchedule && runtimeSchemaHead) {
    await boss.work(
      QUEUE_RETENTION_CLEANUP,
      { batchSize: 1 },
      async (jobs) => {
        for (const job of jobs) {
          const result = await runScheduledRetention({
            identity: runtimeIdentity,
            schemaHead: runtimeSchemaHead!,
            intervalSeconds: retentionSchedule.intervalSeconds,
            cleanup: () => handleRetentionCleanup(),
            writeHeartbeat: (record) =>
              recordServiceHeartbeat(record, {
                upsert: (args) => prisma.serviceHeartbeat.upsert(args),
              }),
          });
          console.log(
            `[retention] job ${job.id} examined=${result.examined} deleted=${result.deleted} held=${result.held}`,
          );
        }
      },
    );
    await boss.schedule(
      QUEUE_RETENTION_CLEANUP,
      retentionSchedule.cron,
      { trigger: "schedule" },
      { tz: "UTC", key: "runtime-v1" },
    );
    // Produce a fresh staging/deploy receipt without waiting for the first
    // cron tick. Singleton throttling prevents every replica from duplicating it.
    await boss.send(
      QUEUE_RETENTION_CLEANUP,
      { trigger: "startup" },
      {
        singletonKey: "startup",
        singletonSeconds: retentionSchedule.intervalSeconds,
      },
    );
  }

  // Future queues (later units): registered so sends don't rot silently.
  for (const name of FUTURE_QUEUES) {
    await boss.work(name, async (jobs) => {
      for (const job of jobs) {
        console.warn(`[worker] queue ${name} not implemented yet (job ${job.id})`);
      }
    });
  }

  console.log(
    `Worker started. grade.submission consumer up (concurrency ${concurrency}, retryBackoff on, dead letter → ${QUEUE_GRADE_SUBMISSION_DEAD}); grade.interview consumer up (dead letter → ${QUEUE_GRADE_INTERVIEW_DEAD}).`
  );

  const shutdown = async () => {
    clearInterval(deadLetterReconcileTimer);
    runtimeHeartbeat?.stop();
    await boss.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
