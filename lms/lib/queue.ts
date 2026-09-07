import { PgBoss } from "pg-boss";

// Shared pg-boss access. The web process uses this ONLY to enqueue
// (best-effort at submit time — see docs/DECISIONS.md); the worker process
// registers handlers in worker/index.ts. Lazy singleton, lazy-connect.

export const QUEUE_GRADE_SUBMISSION = "grade.submission";
export const QUEUE_GRADE_SUBMISSION_DEAD = "grade.submission.dead";
export const QUEUE_SCREENSHOT_CAPTURE = "screenshot.capture"; // U11
export const QUEUE_GRADE_INTERVIEW = "grade.interview"; // U12
export const QUEUE_GRADE_INTERVIEW_DEAD = "grade.interview.dead";
export const QUEUE_PORTFOLIO_CRAWL = "portfolio.crawl"; // U16
export const QUEUE_PREREQUISITE_PREPARE = "interview.prerequisite-prepare";
export const QUEUE_RETENTION_CLEANUP = "maintenance.retention-cleanup";
export const QUEUE_RETENTION_CLEANUP_DEAD = "maintenance.retention-cleanup.dead";

/** Registered as not-implemented-yet no-ops in the worker (future units). */
export const FUTURE_QUEUES = [] as const;

export const GRADE_RETRY_LIMIT = 4;
export const SCREENSHOT_RETRY_LIMIT = 2;
export const RETENTION_RETRY_LIMIT = 2;

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

/** Lazy-connected singleton PgBoss. Throws when DATABASE_URL is unset/down. */
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const b = new PgBoss(url);
    b.on("error", (err: Error) => console.error("[pg-boss]", err));
    await b.start();
    boss = b;
    return b;
  })();
  try {
    return await starting;
  } catch (err) {
    starting = null; // allow a later retry after a transient failure
    throw err;
  }
}

/**
 * Create the grading queues (idempotent). Dead-letter queue first, then the
 * work queue pointing at it, with exponential-backoff retries.
 */
export async function ensureGradingQueues(b: PgBoss): Promise<void> {
  await b.createQueue(QUEUE_GRADE_SUBMISSION_DEAD);
  await b.createQueue(QUEUE_GRADE_SUBMISSION, {
    retryLimit: GRADE_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: 15, // seconds; doubles per retry with jitter
    deadLetter: QUEUE_GRADE_SUBMISSION_DEAD,
  });
  await b.createQueue(QUEUE_SCREENSHOT_CAPTURE, {
    retryLimit: SCREENSHOT_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: 30,
  });
  // U12: interview grading mirrors submission grading (retry → dead letter).
  await b.createQueue(QUEUE_GRADE_INTERVIEW_DEAD);
  await b.createQueue(QUEUE_GRADE_INTERVIEW, {
    retryLimit: GRADE_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: 15,
    deadLetter: QUEUE_GRADE_INTERVIEW_DEAD,
  });
  // U16: portfolio link-liveness crawl (no dead letter — a failed crawl is
  // re-run wholesale from the admin costs page).
  await b.createQueue(QUEUE_PORTFOLIO_CRAWL, {
    retryLimit: 2,
    retryBackoff: true,
    retryDelay: 30,
  });
  // Prerequisite prepare: recover text the web tier could not extract (PDFs)
  // and summarise a blueprint. No dead letter — a failure is not an incident,
  // the interview prompt falls back to raw text, then to asking the student.
  await b.createQueue(QUEUE_PREREQUISITE_PREPARE, {
    retryLimit: 2,
    retryBackoff: true,
    retryDelay: 20,
  });
  await b.createQueue(QUEUE_RETENTION_CLEANUP_DEAD);
  await b.createQueue(QUEUE_RETENTION_CLEANUP, {
    retryLimit: RETENTION_RETRY_LIMIT,
    retryBackoff: true,
    retryDelay: 60,
    deadLetter: QUEUE_RETENTION_CLEANUP_DEAD,
  });
  for (const name of FUTURE_QUEUES) {
    await b.createQueue(name);
  }
}

export type PortfolioCrawlJobData = { userId?: string; all?: boolean };

/**
 * Best-effort enqueue of a portfolio crawl (U16). Admin-triggered; a queue
 * outage never crashes the caller — it just reports 503 and the admin retries.
 */
export async function enqueuePortfolioCrawl(data: PortfolioCrawlJobData): Promise<string | null> {
  try {
    const b = await getBoss();
    await ensureGradingQueues(b);
    return await b.send(QUEUE_PORTFOLIO_CRAWL, data);
  } catch (err) {
    console.error(
      "[queue] failed to enqueue portfolio crawl:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * The admin costs page's dead-letter view. Lists jobs still QUEUED in a
 * dead-letter queue (redriven/completed ones drop out). Returns [] when the
 * queue infrastructure is unreachable — the page renders a note instead.
 */
export async function listDeadLetterJobs<T extends object>(
  queue: string,
): Promise<
  { id: string; data: T; retryCount: number; createdOn: Date; output: object | null }[]
> {
  try {
    const b = await getBoss();
    const jobs = await b.findJobs<T>(queue, { queued: true });
    return jobs.map((j) => ({
      id: j.id,
      data: j.data,
      retryCount: j.retryCount,
      createdOn: j.createdOn,
      output: j.output ?? null,
    }));
  } catch (err) {
    console.error(
      `[queue] could not list dead-letter jobs for ${queue}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Best-effort enqueue of a grading job. Returns the job id, or null when the
 * queue is unavailable — the submission itself must still succeed; an admin
 * can re-enqueue via POST /api/admin/regrade.
 */
export async function enqueueGradeSubmission(submissionId: string): Promise<string | null> {
  try {
    const b = await getBoss();
    await ensureGradingQueues(b);
    return await b.send(QUEUE_GRADE_SUBMISSION, { submissionId });
  } catch (err) {
    console.error(
      `[queue] failed to enqueue grading for ${submissionId} (submission still recorded):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Best-effort enqueue of interview grading (U12). Completion itself must
 * never fail on a queue outage — an admin can re-enqueue.
 */
export async function enqueueGradeInterview(interviewId: string): Promise<string | null> {
  try {
    const b = await getBoss();
    await ensureGradingQueues(b);
    return await b.send(QUEUE_GRADE_INTERVIEW, { interviewId });
  } catch (err) {
    console.error(
      `[queue] failed to enqueue interview grading for ${interviewId} (interview still completed):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Best-effort enqueue of a screenshot-capture job (U11). A queue outage never
 * fails the caller — the gallery card just shows its placeholder until an
 * admin re-enqueues via POST /api/admin/screenshots.
 */
export async function enqueueScreenshotCapture(submissionId: string): Promise<string | null> {
  try {
    const b = await getBoss();
    await ensureGradingQueues(b);
    return await b.send(QUEUE_SCREENSHOT_CAPTURE, { submissionId });
  } catch (err) {
    console.error(
      `[queue] failed to enqueue screenshot capture for ${submissionId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export type PrerequisitePrepareJobData = { userId: string; kind: string };

/**
 * Best-effort enqueue of artifact preparation. The upload itself must always
 * succeed — a queue outage just means the interviewer works from whatever the
 * web tier managed to extract.
 */
export async function enqueuePrerequisitePrepare(
  data: PrerequisitePrepareJobData,
): Promise<string | null> {
  try {
    const b = await getBoss();
    await ensureGradingQueues(b);
    return await b.send(QUEUE_PREREQUISITE_PREPARE, data);
  } catch (err) {
    console.error(
      `[queue] failed to enqueue ${data.kind} preparation for ${data.userId} (upload still recorded):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
