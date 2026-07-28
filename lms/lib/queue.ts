import { PgBoss } from "pg-boss";

// U9 — shared pg-boss access. The web process uses this ONLY to enqueue
// (best-effort at submit time — see docs/DECISIONS.md); the worker process
// registers handlers in worker/index.ts. Lazy singleton, lazy-connect.

export const QUEUE_GRADE_SUBMISSION = "grade.submission";
export const QUEUE_GRADE_SUBMISSION_DEAD = "grade.submission.dead";
export const QUEUE_SCREENSHOT_CAPTURE = "screenshot.capture"; // U11
export const QUEUE_GRADE_INTERVIEW = "grade.interview"; // U12
export const QUEUE_GRADE_INTERVIEW_DEAD = "grade.interview.dead";

/** Registered as not-implemented-yet no-ops in the worker (future units). */
export const FUTURE_QUEUES = [
  "portfolio.crawl",
] as const;

export const GRADE_RETRY_LIMIT = 4;
export const SCREENSHOT_RETRY_LIMIT = 2;

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
  for (const name of FUTURE_QUEUES) {
    await b.createQueue(name);
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
