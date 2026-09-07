export type AssessmentClaimStatus =
  | "pending"
  | "claimed"
  | "deterministic_complete"
  | "provider_pending"
  | "completed"
  | "repair_required"
  | "failed"
  | "dead_lettered";

export const STALE_ASSESSMENT_CLAIM_STATUSES = [
  "claimed",
  "deterministic_complete",
  "provider_pending",
] as const satisfies readonly AssessmentClaimStatus[];

const STALE_ASSESSMENT_CLAIM_STATUS_SET = new Set<AssessmentClaimStatus>(
  STALE_ASSESSMENT_CLAIM_STATUSES,
);

export type AssessmentClaimRecord = {
  id: string;
  evaluationKey: string;
  status: AssessmentClaimStatus;
  claimToken: string | null;
  claimedAt: Date | null;
};

export type AssessmentClaimStore = {
  create(input: {
    evaluationKey: string;
    claimToken: string;
    claimedAt: Date;
  }): Promise<AssessmentClaimRecord>;
  find(evaluationKey: string): Promise<AssessmentClaimRecord | null>;
  /**
   * Compare-and-swap. Implementations must update only when the current token
   * still equals expectedClaimToken and the row is failed/pending or its active
   * claim lease is stale.
   */
  reclaim(input: {
    evaluationKey: string;
    expectedClaimToken: string | null;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<AssessmentClaimRecord | null>;
  isUniqueConflict(error: unknown): boolean;
};

export type AssessmentClaimOutcome =
  | { kind: "claimed"; resultId: string; claimToken: string }
  | { kind: "busy"; resultId: string }
  | {
      kind: "completed";
      resultId: string;
      status: "completed" | "repair_required" | "dead_lettered";
    };

export class EvaluationKeyConflictError extends Error {
  constructor() {
    super("Assessment evaluation key already exists");
    this.name = "EvaluationKeyConflictError";
  }
}

export class EvaluationClaimUnavailableError extends Error {
  constructor(evaluationKey: string) {
    super(`Assessment evaluation claim disappeared after a uniqueness conflict: ${evaluationKey}`);
    this.name = "EvaluationClaimUnavailableError";
  }
}

const TERMINAL = new Set<AssessmentClaimStatus>([
  "completed",
  "repair_required",
  "dead_lettered",
]);

/**
 * Atomically claim one immutable submission/version/attempt evaluation.
 * Unique-key creation is the first-writer gate; failed or abandoned claims
 * can be taken over only through the store's compare-and-swap operation.
 */
export async function claimAssessmentResult(
  input: {
    evaluationKey: string;
    claimToken: string;
    now: Date;
    staleAfterMs: number;
  },
  store: AssessmentClaimStore,
): Promise<AssessmentClaimOutcome> {
  try {
    const created = await store.create({
      evaluationKey: input.evaluationKey,
      claimToken: input.claimToken,
      claimedAt: input.now,
    });
    return { kind: "claimed", resultId: created.id, claimToken: input.claimToken };
  } catch (error) {
    if (!store.isUniqueConflict(error)) throw error;
  }

  const existing = await store.find(input.evaluationKey);
  if (!existing) throw new EvaluationClaimUnavailableError(input.evaluationKey);

  if (TERMINAL.has(existing.status)) {
    return {
      kind: "completed",
      resultId: existing.id,
      status: existing.status as "completed" | "repair_required" | "dead_lettered",
    };
  }

  const staleBefore = new Date(input.now.getTime() - Math.max(0, input.staleAfterMs));
  const reclaimable =
    existing.status === "pending" ||
    existing.status === "failed" ||
    (STALE_ASSESSMENT_CLAIM_STATUS_SET.has(existing.status) &&
      existing.claimedAt !== null &&
      existing.claimedAt < staleBefore);

  if (reclaimable) {
    const reclaimed = await store.reclaim({
      evaluationKey: input.evaluationKey,
      expectedClaimToken: existing.claimToken,
      claimToken: input.claimToken,
      claimedAt: input.now,
      staleBefore,
    });
    if (reclaimed) {
      return { kind: "claimed", resultId: reclaimed.id, claimToken: input.claimToken };
    }
  }

  return { kind: "busy", resultId: existing.id };
}
