import { describe, expect, it } from "vitest";
import {
  buildBulkHoldResolutionPreview,
  canonicalFrozenMembership,
  chooseLatestFrozenCohortCandidates,
  deriveUnresolvedGradeHolds,
  evaluateFinalisationEligibility,
  reasonKeyForHold,
  selectFrozenOutlierHolds,
  type GradeHoldSnapshot,
} from "../lib/grade-holds";

function hold(
  reasonKey: string,
  overrides: Partial<GradeHoldSnapshot> = {},
): GradeHoldSnapshot {
  return {
    id: `hold-${reasonKey}`,
    reasonKey,
    status: "open",
    updatedAt: new Date("2026-07-30T10:00:00Z"),
    ...overrides,
  };
}

describe("unified grade holds", () => {
  it("maps persisted hold kinds to stable independent reason keys", () => {
    expect(reasonKeyForHold({ kind: "low_confidence", code: "low-confidence" })).toBe(
      "low-confidence",
    );
    expect(reasonKeyForHold({ kind: "flag", code: "possible-plagiarism" })).toBe(
      "flag:possible-plagiarism",
    );
    expect(reasonKeyForHold({ kind: "outlier", code: "percentile-high" })).toBe(
      "percentile-high",
    );
    expect(reasonKeyForHold({ kind: "repair", code: "unsafe-evidence" })).toBe("repair");
    expect(reasonKeyForHold({ kind: "appeal", code: "student-appeal" })).toBe("appeal");
  });

  it("freezes canonical membership and derives persisted percentile holds once", () => {
    const membership = canonicalFrozenMembership([
      { ownerKind: "individual", ownerId: "student-b", submissionId: "sub-b", gradeId: "g-b", total: 40 },
      { ownerKind: "individual", ownerId: "student-a", submissionId: "sub-a", gradeId: "g-a", total: 10 },
      { ownerKind: "individual", ownerId: "student-c", submissionId: "sub-c", gradeId: "g-c", total: 25 },
    ]);
    expect(membership.map((item) => item.ownerId)).toEqual(["student-a", "student-b", "student-c"]);
    expect(membership[0]).not.toHaveProperty("total");
    expect(
      selectFrozenOutlierHolds([
        { ...membership[0], total: 10 },
        { ...membership[1], total: 40 },
        { ...membership[2], total: 25 },
      ]),
    ).toEqual([
      { submissionId: "sub-a", gradeId: "g-a", code: "percentile-low" },
      { submissionId: "sub-b", gradeId: "g-b", code: "percentile-high" },
    ]);
  });

  it("blocks a cohort when the latest pre-cutoff owner attempt is not grade-ready", () => {
    const chosen = chooseLatestFrozenCohortCandidates([
      {
        ownerKind: "individual",
        ownerId: "student-a",
        submissionId: "new-pending",
        status: "grading",
        grade: null,
      },
      {
        ownerKind: "individual",
        ownerId: "student-a",
        submissionId: "old-graded",
        status: "graded",
        grade: { id: "old-grade", total: 30 },
      },
      {
        ownerKind: "individual",
        ownerId: "student-b",
        submissionId: "ready",
        status: "graded",
        grade: { id: "ready-grade", total: 20 },
      },
    ]);
    expect(chosen.blockedOwnerKeys).toEqual(["individual:student-a"]);
    expect(chosen.candidates.map((candidate) => candidate.submissionId)).toEqual(["ready"]);
  });

  it("independently blocks low confidence, policy flags, frozen outliers, repair, and appeal", () => {
    const reasons = deriveUnresolvedGradeHolds({
      confidence: 0.62,
      confidenceThreshold: 0.7,
      flags: ["possible-injection"],
      persisted: [hold("outlier-high"), hold("repair"), hold("appeal")],
      hasOpenAppeal: true,
      repairRequired: true,
    });

    expect(reasons).toEqual([
      "appeal",
      "flag:possible-injection",
      "low-confidence",
      "outlier-high",
      "repair",
    ]);
    expect(
      evaluateFinalisationEligibility({
        purpose: "graded",
        versioned: true,
        cohortFrozen: true,
        unresolvedReasons: reasons,
      }),
    ).toEqual({ eligible: false, reason: "unresolved-holds", unresolvedReasons: reasons });
  });

  it("a resolved persisted hold suppresses its matching derived cause but not another open cause", () => {
    const reasons = deriveUnresolvedGradeHolds({
      confidence: 0.5,
      confidenceThreshold: 0.7,
      flags: ["link-dead"],
      persisted: [
        hold("low-confidence", { status: "resolved" }),
        hold("flag:link-dead", { status: "open" }),
      ],
      hasOpenAppeal: false,
      repairRequired: false,
    });
    expect(reasons).toEqual(["flag:link-dead"]);
  });

  it("rejects weighted finalisation before a versioned cohort freeze", () => {
    expect(
      evaluateFinalisationEligibility({
        purpose: "graded",
        versioned: true,
        cohortFrozen: false,
        unresolvedReasons: [],
      }),
    ).toEqual({ eligible: false, reason: "cohort-not-frozen", unresolvedReasons: [] });
  });

  it("keeps formative feedback outside weighted finalisation", () => {
    expect(
      evaluateFinalisationEligibility({
        purpose: "formative",
        versioned: true,
        cohortFrozen: true,
        unresolvedReasons: [],
      }),
    ).toEqual({ eligible: false, reason: "formative", unresolvedReasons: [] });
  });

  it("bulk preview resolves only explicitly selected visible rows for one matching cause", () => {
    const preview = buildBulkHoldResolutionPreview({
      cause: "low-confidence",
      selected: [
        { holdId: "h1", expectedUpdatedAt: "2026-07-30T10:00:00.000Z" },
        { holdId: "h2", expectedUpdatedAt: "2026-07-30T10:00:00.000Z" },
        { holdId: "hidden", expectedUpdatedAt: "2026-07-30T10:00:00.000Z" },
      ],
      visibleRows: [
        hold("low-confidence", { id: "h1" }),
        hold("flag:link-dead", { id: "h2" }),
      ],
    });

    expect(preview.ready.map((row) => row.holdId)).toEqual(["h1"]);
    expect(preview.failures).toEqual([
      { holdId: "h2", reason: "cause-mismatch" },
      { holdId: "hidden", reason: "not-visible" },
    ]);
  });
});
