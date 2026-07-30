import { describe, expect, it } from "vitest";
import { assessmentResultMessage } from "@/components/learner-assessment-status";
import {
  submissionFieldRequired,
  submissionWordCount,
} from "@/components/submission-form";
import type { LearnerSubmissionHistoryItem } from "@/lib/assessment-projections";

function historyItem(status: string): LearnerSubmissionHistoryItem {
  return {
    submissionId: "submission-1",
    version: 2,
    attempt: 1,
    lifecycle: "grading",
    submittedAt: "2026-07-30T10:00:00.000Z",
    createdAt: "2026-07-30T10:00:00.000Z",
    assessment: null,
    result: {
      status,
      scoreable: false,
      publishable: false,
      completedAt: null,
    },
    feedback: null,
    latestGrade: null,
    workflowNominationEligible: false,
    publication: null,
  };
}

describe("learner assessment lifecycle copy", () => {
  it("distinguishes delayed generated feedback from a lost submission", () => {
    expect(assessmentResultMessage(historyItem("provider_pending"))).toBe(
      "Generated feedback is delayed. The submission is safe and will continue automatically.",
    );
  });

  it("distinguishes a retryable grading failure from terminal dead-letter failure", () => {
    expect(assessmentResultMessage(historyItem("failed"))).toContain("eligible for retry");
    expect(assessmentResultMessage(historyItem("dead_lettered"))).toContain(
      "an instructor must intervene",
    );
  });

  it("makes draft state non-final and explicit", () => {
    expect(
      assessmentResultMessage({ ...historyItem("pending"), lifecycle: "draft", result: null }),
    ).toBe("Draft only — this version has not been submitted.");
  });
});

describe("version-aware submission form guidance", () => {
  it("counts whitespace-delimited words without counting blank input", () => {
    expect(submissionWordCount("  one\n two   three ")).toBe(3);
    expect(submissionWordCount("   ")).toBe(0);
  });

  it("marks a conditional field required only after the bound server version reaches it", () => {
    const field = { required: false, requiredFromVersion: 2 };
    expect(submissionFieldRequired(field)).toBe(false);
    expect(submissionFieldRequired(field, 1)).toBe(false);
    expect(submissionFieldRequired(field, 2)).toBe(true);
  });
});
