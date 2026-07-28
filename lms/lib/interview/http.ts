import { S3NotConfiguredError, UploadRejectedError } from "@/lib/s3";
import { ProviderNotConfiguredError } from "./providers";
import {
  AttemptExhaustedError,
  DuplicateAnswerError,
  InterviewNotFoundError,
  InterviewNotLiveError,
  InterviewWindowClosedError,
} from "./session";

// Shared HTTP glue for the interview routes: typed-error → status
// mapping and a light per-user token bucket (same in-memory pattern as the
// U8 link checker; per-instance, which is fine at this traffic level).

/** Map a typed interview error onto a JSON Response, or null if unknown. */
export function interviewErrorResponse(err: unknown): Response | null {
  if (
    err instanceof InterviewWindowClosedError ||
    err instanceof AttemptExhaustedError ||
    err instanceof InterviewNotFoundError ||
    err instanceof InterviewNotLiveError ||
    err instanceof DuplicateAnswerError
  ) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ProviderNotConfiguredError) {
    return Response.json(
      {
        error:
          "The interview service is not available right now — a required provider is not configured. Please tell your instructor.",
        provider: err.provider,
      },
      { status: 503 },
    );
  }
  if (err instanceof UploadRejectedError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof S3NotConfiguredError) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }
  return null;
}

// Per-user token bucket: 30 interview calls/min is plenty for a 5–15s-per-turn
// loop while still stopping scripted hammering.
const BUCKET_CAPACITY = 30;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000;

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export function takeInterviewToken(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: BUCKET_CAPACITY, last: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(userId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(userId, b);
  return true;
}

export function rateLimited(): Response {
  return Response.json(
    { error: "Too many requests — take a breath and try again in a moment." },
    { status: 429 },
  );
}
