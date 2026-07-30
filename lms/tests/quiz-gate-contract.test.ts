import { describe, expect, it } from "vitest";
import { quizOpenEligibility } from "../lib/gates";

const eligible = {
  contractMode: "versioned" as const,
  publishedAt: new Date("2026-08-01T09:00:00Z"),
  classificationFinalizedAt: new Date("2026-08-01T08:00:00Z"),
  classifiedBy: "instructor-1",
  contentHash: "abc123",
  answerMode: "stable_id" as const,
  feedbackReleaseAt: new Date("2026-08-03T18:00:00Z"),
};

describe("versioned quiz gate eligibility", () => {
  it("preserves legacy quiz opening", () => {
    expect(
      quizOpenEligibility({
        ...eligible,
        contractMode: "legacy",
        publishedAt: null,
        classificationFinalizedAt: null,
        classifiedBy: null,
        contentHash: null,
        answerMode: "legacy_index",
        feedbackReleaseAt: null,
      }),
    ).toEqual({ eligible: true, reason: null });
  });

  it.each([
    ["publishedAt", null, "unpublished"],
    ["classificationFinalizedAt", null, "classification_not_finalized"],
    ["classifiedBy", null, "classification_not_finalized"],
    ["contentHash", null, "missing_content_hash"],
    ["answerMode", "legacy_index", "unstable_answer_mode"],
    ["feedbackReleaseAt", null, "feedback_release_unscheduled"],
  ] as const)("fails closed when %s is invalid", (key, value, reason) => {
    expect(quizOpenEligibility({ ...eligible, [key]: value })).toEqual({
      eligible: false,
      reason,
    });
  });

  it("accepts a fully published and finalized stable-ID contract", () => {
    expect(quizOpenEligibility(eligible)).toEqual({ eligible: true, reason: null });
  });
});
