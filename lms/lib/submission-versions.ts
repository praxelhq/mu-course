// Central read semantics for every surface that consumes immutable submission
// history. Keep "newest submitted" separate from "newest safe to score/show":
// a pending V2 must never make a valid V1 disappear.

export type AssessmentResultLike = {
  status: string;
  scoreable?: boolean;
  publishable?: boolean;
  completedAt?: Date | string | null;
};

export type SubmissionVersionLike = {
  id: string;
  version: number;
  attempt?: number;
  status: string;
  submittedAt?: Date | string | null;
  createdAt: Date | string;
  assessmentResult?: AssessmentResultLike | null;
  grades?: readonly unknown[];
};

export type SubmissionVersionSelection<T extends SubmissionVersionLike> = {
  history: T[];
  latestSubmitted: T | null;
  latestEvaluated: T | null;
  latestScoreable: T | null;
  latestPublishable: T | null;
};

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Descending learner version, then repair attempt, then receipt/create time. */
export function compareSubmissionVersions(
  left: SubmissionVersionLike,
  right: SubmissionVersionLike,
): number {
  if (left.version !== right.version) return right.version - left.version;
  const leftAttempt = left.attempt ?? 1;
  const rightAttempt = right.attempt ?? 1;
  if (leftAttempt !== rightAttempt) return rightAttempt - leftAttempt;
  const receiptDelta = timestamp(right.submittedAt) - timestamp(left.submittedAt);
  if (receiptDelta !== 0) return receiptDelta;
  const createdDelta = timestamp(right.createdAt) - timestamp(left.createdAt);
  if (createdDelta !== 0) return createdDelta;
  return right.id.localeCompare(left.id);
}

function isSubmitted(row: SubmissionVersionLike): boolean {
  return row.status !== "draft";
}

function isLegacyEvaluated(row: SubmissionVersionLike): boolean {
  return row.status === "graded" || row.status === "finalised" || Boolean(row.grades?.length);
}

function isEvaluated(row: SubmissionVersionLike): boolean {
  const result = row.assessmentResult;
  if (!result) return isLegacyEvaluated(row);
  return (
    Boolean(result.completedAt) ||
    result.status === "completed" ||
    result.status === "repair_required"
  );
}

function isScoreable(row: SubmissionVersionLike): boolean {
  return row.assessmentResult ? row.assessmentResult.scoreable === true : isLegacyEvaluated(row);
}

function isPublishable(row: SubmissionVersionLike): boolean {
  return row.assessmentResult ? row.assessmentResult.publishable === true : isLegacyEvaluated(row);
}

export function selectSubmissionVersions<T extends SubmissionVersionLike>(
  rows: readonly T[],
): SubmissionVersionSelection<T> {
  const history = [...rows].sort(compareSubmissionVersions) as T[];
  const first = (predicate: (row: T) => boolean) => history.find(predicate) ?? null;
  return {
    history,
    latestSubmitted: first(isSubmitted),
    latestEvaluated: first(isEvaluated),
    latestScoreable: first(isScoreable),
    latestPublishable: first(isPublishable),
  };
}

export type GrantState = "eligible" | "expired" | "consumed";

export function grantState(
  grant: { expiresAt: Date | string; consumedAt: Date | string | null },
  now: Date = new Date(),
): GrantState {
  if (grant.consumedAt) return "consumed";
  return timestamp(grant.expiresAt) > now.getTime() ? "eligible" : "expired";
}

/** Receipt-relative only: no section due date or evaluation state participates. */
export function improvementGrantExpiry(receivedAt: Date, frozenWindowDays: number): Date {
  if (!Number.isInteger(frozenWindowDays) || frozenWindowDays <= 0) {
    throw new Error("improvement window must be a positive whole number of calendar days");
  }
  const expiry = new Date(receivedAt);
  expiry.setUTCDate(expiry.getUTCDate() + frozenWindowDays);
  return expiry;
}
