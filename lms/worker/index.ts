// pg-boss worker entrypoint. U9 wires the grading queue: grade.submission is
// consumed with GRADING_CONCURRENCY parallel workers (default 5), retries
// with exponential backoff, and dead-letters to grade.submission.dead (U16
// surfaces those; admins re-enqueue via POST /api/admin/regrade).
import { PgBoss } from "pg-boss";
import {
  ensureGradingQueues,
  FUTURE_QUEUES,
  QUEUE_GRADE_INTERVIEW,
  QUEUE_GRADE_INTERVIEW_DEAD,
  QUEUE_GRADE_SUBMISSION,
  QUEUE_GRADE_SUBMISSION_DEAD,
  QUEUE_PORTFOLIO_CRAWL,
  QUEUE_SCREENSHOT_CAPTURE,
  type PortfolioCrawlJobData,
} from "../lib/queue";
import { handleGradeSubmission } from "./jobs/grade-submission";
import { handleGradeInterview } from "./jobs/grade-interview";
import { handleScreenshotCapture } from "./jobs/screenshot-capture";
import { handlePortfolioCrawl } from "./jobs/portfolio-crawl";

type GradeJobData = { submissionId: string };
type InterviewJobData = { interviewId: string };

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

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

  await ensureGradingQueues(boss);

  // pg-boss v12 concurrency: localConcurrency spawns N independent workers
  // for the queue on this node; batchSize 1 keeps one job per handler call.
  await boss.work<GradeJobData>(
    QUEUE_GRADE_SUBMISSION,
    { batchSize: 1, localConcurrency: concurrency },
    async (jobs) => {
      for (const job of jobs) {
        console.log(`[grading] job ${job.id} → submission ${job.data.submissionId}`);
        await handleGradeSubmission(job.data.submissionId);
        console.log(`[grading] job ${job.id} done`);
      }
    }
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

  // NOTE: no consumer is registered on grade.submission.dead — dead-lettered
  // jobs stay queued there so U16's admin view can list them (findJobs) and
  // redrive/regrade; consuming them here would mark them completed.

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
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
