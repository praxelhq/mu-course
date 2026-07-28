import { PgBoss } from "pg-boss";

// U9 — shared pg-boss access. The web process uses this ONLY to enqueue
// (best-effort at submit time — see docs/DECISIONS.md); the worker process
// registers handlers in worker/index.ts. Lazy singleton, lazy-connect.

export const QUEUE_GRADE_SUBMISSION = "grade.submission";
export const QUEUE_GRADE_SUBMISSION_DEAD = "grade.submission.dead";

/** Registered as not-implemented-yet no-ops in the worker (future units). */
export const FUTURE_QUEUES = [
  "grade.interview",
  "screenshot.capture",
  "portfolio.crawl",
] as const;

export const GRADE_RETRY_LIMIT = 4;

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
