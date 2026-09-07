import { describe, expect, it } from "vitest";
import {
  GradeAppealActionError,
  appealProjection,
  validateAppealEligibility,
} from "../lib/grade-appeals";

describe("grade appeal contract", () => {
  it("uses the frozen individual owner for versioned work even when teamId is retained", () => {
    expect(
      validateAppealEligibility({
        actorId: "student-1",
        actorTeamId: null,
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: "assessment-version-1",
        submissionOwnerKind: "individual",
        submissionOwnerId: "student-1",
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toBeUndefined();
    expect(() =>
      validateAppealEligibility({
        actorId: "student-2",
        actorTeamId: "team-1",
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: "assessment-version-1",
        submissionOwnerKind: "individual",
        submissionOwnerId: "student-1",
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toThrowError(expect.objectContaining<Partial<GradeAppealActionError>>({ status: 404 }));
  });

  it("uses the frozen team owner for versioned work rather than the uploader", () => {
    expect(
      validateAppealEligibility({
        actorId: "student-2",
        actorTeamId: "team-1",
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: "assessment-version-1",
        submissionOwnerKind: "team",
        submissionOwnerId: "team-1",
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toBeUndefined();
    expect(() =>
      validateAppealEligibility({
        actorId: "student-1",
        actorTeamId: null,
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: "assessment-version-1",
        submissionOwnerKind: "team",
        submissionOwnerId: "team-1",
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toThrowError(expect.objectContaining<Partial<GradeAppealActionError>>({ status: 404 }));
  });

  it("fails closed when versioned work is missing its canonical owner", () => {
    expect(() =>
      validateAppealEligibility({
        actorId: "student-1",
        actorTeamId: "team-1",
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: "assessment-version-1",
        submissionOwnerKind: null,
        submissionOwnerId: null,
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toThrowError(expect.objectContaining<Partial<GradeAppealActionError>>({ status: 404 }));
  });

  it("retains ownership fallback only for unversioned legacy submissions", () => {
    expect(
      validateAppealEligibility({
        actorId: "student-2",
        actorTeamId: "team-1",
        submissionUserId: "student-1",
        submissionTeamId: "team-1",
        submissionAssessmentVersionId: null,
        submissionOwnerKind: null,
        submissionOwnerId: null,
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toBeUndefined();
  });

  it("uses not-found semantics for another learner's grade and blocks duplicate open appeals", () => {
    expect(() =>
      validateAppealEligibility({
        actorId: "student-2",
        actorTeamId: null,
        submissionUserId: "student-1",
        submissionTeamId: null,
        submissionAssessmentVersionId: null,
        submissionOwnerKind: null,
        submissionOwnerId: null,
        provisional: true,
        hasOpenAppeal: false,
      }),
    ).toThrowError(expect.objectContaining<Partial<GradeAppealActionError>>({ status: 404 }));
    expect(() =>
      validateAppealEligibility({
        actorId: "student-1",
        actorTeamId: null,
        submissionUserId: "student-1",
        submissionTeamId: null,
        submissionAssessmentVersionId: null,
        submissionOwnerKind: null,
        submissionOwnerId: null,
        provisional: true,
        hasOpenAppeal: true,
      }),
    ).toThrowError(expect.objectContaining<Partial<GradeAppealActionError>>({ status: 409 }));
  });

  it("returns a safe learner-visible closure without hold or evaluator internals", () => {
    const projected = appealProjection({
      id: "appeal-1",
      gradeId: "grade-1",
      reason: "The output log was misread.",
      status: "resolved",
      outcome: "partially_accepted",
      createdAt: new Date("2026-07-30T09:00:00Z"),
      updatedAt: new Date("2026-07-30T10:00:00Z"),
      resolvedAt: new Date("2026-07-30T10:00:00Z"),
      holdId: "private-hold-id",
      resolvedBy: "private-reviewer-id",
    });
    expect(projected).toEqual({
      id: "appeal-1",
      gradeId: "grade-1",
      reason: "The output log was misread.",
      status: "resolved",
      outcome: "partially_accepted",
      openedAt: "2026-07-30T09:00:00.000Z",
      updatedAt: "2026-07-30T10:00:00.000Z",
      resolvedAt: "2026-07-30T10:00:00.000Z",
    });
    expect(JSON.stringify(projected)).not.toMatch(/hold|reviewer|resolvedBy/i);
  });
});
