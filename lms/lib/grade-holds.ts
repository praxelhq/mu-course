export type GradeHoldSnapshot = {
  id: string;
  /** Stable cause key: low-confidence, flag:<code>, outlier-high, repair, appeal. */
  reasonKey: string;
  status: "open" | "resolved";
  updatedAt: Date;
};

export type PersistedGradeHoldIdentity = {
  kind: "low_confidence" | "flag" | "outlier" | "repair" | "appeal";
  code: string;
};

export function reasonKeyForHold(hold: PersistedGradeHoldIdentity): string {
  switch (hold.kind) {
    case "low_confidence":
      return "low-confidence";
    case "flag":
      return `flag:${hold.code}`;
    case "outlier":
      return hold.code;
    case "repair":
      return "repair";
    case "appeal":
      return "appeal";
  }
}

export type FrozenMembershipItem = {
  ownerKind: "individual" | "team";
  ownerId: string;
  submissionId: string;
  gradeId: string;
};

export type FrozenMembershipCandidate = FrozenMembershipItem & { total: number };

export type FrozenCohortCandidateRow = {
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
  submissionId: string;
  status: string;
  grade: { id: string; total: number } | null;
  assessmentResultId?: string | null;
};

/** Rows must arrive newest-first. An unready latest attempt blocks its owner. */
export function chooseLatestFrozenCohortCandidates(
  rows: FrozenCohortCandidateRow[],
): {
  candidates: Array<FrozenMembershipCandidate & { assessmentResultId: string | null }>;
  blockedOwnerKeys: string[];
} {
  const seen = new Set<string>();
  const blockedOwnerKeys: string[] = [];
  const candidates: Array<
    FrozenMembershipCandidate & { assessmentResultId: string | null }
  > = [];
  for (const row of rows) {
    if (!row.ownerKind || !row.ownerId) {
      blockedOwnerKeys.push(`unbound:${row.submissionId}`);
      continue;
    }
    const ownerKey = `${row.ownerKind}:${row.ownerId}`;
    if (seen.has(ownerKey)) continue;
    seen.add(ownerKey);
    if (row.status !== "graded" || !row.grade) {
      blockedOwnerKeys.push(ownerKey);
      continue;
    }
    candidates.push({
      ownerKind: row.ownerKind,
      ownerId: row.ownerId,
      submissionId: row.submissionId,
      gradeId: row.grade.id,
      total: row.grade.total,
      assessmentResultId: row.assessmentResultId ?? null,
    });
  }
  return { candidates, blockedOwnerKeys };
}

function compareMembership(a: FrozenMembershipItem, b: FrozenMembershipItem): number {
  return (
    a.ownerKind.localeCompare(b.ownerKind) ||
    a.ownerId.localeCompare(b.ownerId) ||
    a.submissionId.localeCompare(b.submissionId) ||
    a.gradeId.localeCompare(b.gradeId)
  );
}

export function canonicalFrozenMembership(
  candidates: FrozenMembershipCandidate[],
): FrozenMembershipItem[] {
  return candidates
    .map((candidate) => ({
      ownerKind: candidate.ownerKind,
      ownerId: candidate.ownerId,
      submissionId: candidate.submissionId,
      gradeId: candidate.gradeId,
    }))
    .sort(compareMembership);
}

/** Compute the immutable top/bottom five-percent reasons at cohort freeze. */
export function selectFrozenOutlierHolds(
  candidates: FrozenMembershipCandidate[],
): { submissionId: string; gradeId: string; code: "percentile-low" | "percentile-high" }[] {
  if (candidates.length < 2) return [];
  const sorted = [...candidates].sort(
    (a, b) => a.total - b.total || compareMembership(a, b),
  );
  const bandSize = Math.ceil(sorted.length * 0.05);
  return [
    ...sorted.slice(0, bandSize).map((candidate) => ({
      submissionId: candidate.submissionId,
      gradeId: candidate.gradeId,
      code: "percentile-low" as const,
    })),
    ...sorted.slice(sorted.length - bandSize).map((candidate) => ({
      submissionId: candidate.submissionId,
      gradeId: candidate.gradeId,
      code: "percentile-high" as const,
    })),
  ];
}

export type FinalisationEligibility =
  | { eligible: true; reason: null; unresolvedReasons: [] }
  | {
      eligible: false;
      reason: "formative" | "cohort-not-frozen" | "unresolved-holds";
      unresolvedReasons: string[];
    };

function persistedState(
  holds: GradeHoldSnapshot[],
  reasonKey: string,
): "open" | "resolved" | "absent" {
  const matching = holds.filter((hold) => hold.reasonKey === reasonKey);
  if (matching.some((hold) => hold.status === "open")) return "open";
  if (matching.some((hold) => hold.status === "resolved")) return "resolved";
  return "absent";
}

/**
 * One source of truth for every reason that can keep a weighted grade
 * provisional. A resolved persisted reason suppresses the matching derived
 * signal; resolving one cause never suppresses a different cause.
 */
export function deriveUnresolvedGradeHolds(input: {
  confidence: number;
  confidenceThreshold: number;
  flags: string[];
  persisted: GradeHoldSnapshot[];
  hasOpenAppeal: boolean;
  repairRequired: boolean;
}): string[] {
  const unresolved = new Set(
    input.persisted
      .filter((hold) => hold.status === "open")
      .map((hold) => hold.reasonKey),
  );

  const addDerived = (reasonKey: string, active: boolean): void => {
    if (!active) return;
    if (persistedState(input.persisted, reasonKey) !== "resolved") unresolved.add(reasonKey);
  };

  addDerived(
    "low-confidence",
    Number.isFinite(input.confidence) && input.confidence < input.confidenceThreshold,
  );
  for (const flag of input.flags) addDerived(`flag:${flag}`, Boolean(flag));
  addDerived("repair", input.repairRequired);
  addDerived("appeal", input.hasOpenAppeal);

  return [...unresolved].sort((a, b) => a.localeCompare(b));
}

export function evaluateFinalisationEligibility(input: {
  purpose: "graded" | "formative";
  versioned: boolean;
  cohortFrozen: boolean;
  unresolvedReasons: string[];
}): FinalisationEligibility {
  if (input.purpose === "formative") {
    return { eligible: false, reason: "formative", unresolvedReasons: [] };
  }
  if (input.versioned && !input.cohortFrozen) {
    return { eligible: false, reason: "cohort-not-frozen", unresolvedReasons: [] };
  }
  if (input.unresolvedReasons.length > 0) {
    return {
      eligible: false,
      reason: "unresolved-holds",
      unresolvedReasons: [...input.unresolvedReasons],
    };
  }
  return { eligible: true, reason: null, unresolvedReasons: [] };
}

export type BulkHoldSelection = { holdId: string; expectedUpdatedAt: string };

export type BulkHoldResolutionPreview = {
  ready: BulkHoldSelection[];
  failures: {
    holdId: string;
    reason: "not-visible" | "cause-mismatch" | "stale" | "already-resolved" | "duplicate-selection";
  }[];
};

/**
 * Validate an instructor's explicit visible-row selection before mutation.
 * This is deliberately not a query/filter bulk action: every target id and
 * optimistic timestamp must arrive in the confirmed request.
 */
export function buildBulkHoldResolutionPreview(input: {
  cause: string;
  selected: BulkHoldSelection[];
  visibleRows: GradeHoldSnapshot[];
}): BulkHoldResolutionPreview {
  const visible = new Map(input.visibleRows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const ready: BulkHoldSelection[] = [];
  const failures: BulkHoldResolutionPreview["failures"] = [];

  for (const selection of input.selected) {
    if (seen.has(selection.holdId)) {
      failures.push({ holdId: selection.holdId, reason: "duplicate-selection" });
      continue;
    }
    seen.add(selection.holdId);
    const row = visible.get(selection.holdId);
    if (!row) {
      failures.push({ holdId: selection.holdId, reason: "not-visible" });
      continue;
    }
    if (row.reasonKey !== input.cause) {
      failures.push({ holdId: selection.holdId, reason: "cause-mismatch" });
      continue;
    }
    if (row.status !== "open") {
      failures.push({ holdId: selection.holdId, reason: "already-resolved" });
      continue;
    }
    if (row.updatedAt.toISOString() !== selection.expectedUpdatedAt) {
      failures.push({ holdId: selection.holdId, reason: "stale" });
      continue;
    }
    ready.push(selection);
  }

  return { ready, failures };
}
