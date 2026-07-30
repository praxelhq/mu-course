import { describe, expect, it } from "vitest";
import {
  grantState,
  improvementGrantExpiry,
  selectSubmissionVersions,
} from "../lib/submission-versions";

const at = (iso: string) => new Date(iso);

describe("shared submission version selectors", () => {
  it("keeps a safe V1 scoreable and publishable while V2 is pending", () => {
    const v1 = {
      id: "v1",
      version: 1,
      attempt: 1,
      status: "graded",
      submittedAt: at("2026-07-20T10:00:00Z"),
      createdAt: at("2026-07-20T09:00:00Z"),
      assessmentResult: { status: "completed", scoreable: true, publishable: true },
    };
    const v2 = {
      id: "v2",
      version: 2,
      attempt: 1,
      status: "grading",
      submittedAt: at("2026-07-25T10:00:00Z"),
      createdAt: at("2026-07-25T09:00:00Z"),
      assessmentResult: { status: "provider_pending", scoreable: false, publishable: false },
    };

    const selected = selectSubmissionVersions([v1, v2]);
    expect(selected.latestSubmitted?.id).toBe("v2");
    expect(selected.latestEvaluated?.id).toBe("v1");
    expect(selected.latestScoreable?.id).toBe("v1");
    expect(selected.latestPublishable?.id).toBe("v1");
  });

  it("orders repair attempts inside one learner-visible version", () => {
    const selected = selectSubmissionVersions([
      { id: "v1a1", version: 1, attempt: 1, status: "graded", createdAt: at("2026-07-01") },
      { id: "v2a1", version: 2, attempt: 1, status: "graded", createdAt: at("2026-07-02") },
      { id: "v2a2", version: 2, attempt: 2, status: "submitted", createdAt: at("2026-07-03") },
    ]);
    expect(selected.latestSubmitted?.id).toBe("v2a2");
    expect(selected.history.map((row) => row.id)).toEqual(["v2a2", "v2a1", "v1a1"]);
  });

  it("preserves legacy evaluated/scoreable compatibility without AssessmentResult", () => {
    const selected = selectSubmissionVersions([
      { id: "legacy", version: 1, status: "finalised", createdAt: at("2026-07-01") },
    ]);
    expect(selected.latestEvaluated?.id).toBe("legacy");
    expect(selected.latestScoreable?.id).toBe("legacy");
    expect(selected.latestPublishable?.id).toBe("legacy");
  });
});

describe("grant state", () => {
  const now = at("2026-07-30T12:00:00Z");

  it("distinguishes eligible, expired, and consumed grants deterministically", () => {
    expect(grantState({ expiresAt: at("2026-07-31"), consumedAt: null }, now)).toBe("eligible");
    expect(grantState({ expiresAt: at("2026-07-30T12:00:00Z"), consumedAt: null }, now)).toBe(
      "expired",
    );
    expect(
      grantState(
        { expiresAt: at("2026-08-01"), consumedAt: at("2026-07-29T12:00:00Z") },
        now,
      ),
    ).toBe("consumed");
  });

  it("starts the frozen improvement window at the exact V1 receipt timestamp", () => {
    const receipt = at("2026-08-02T17:42:13.456Z");
    expect(improvementGrantExpiry(receipt, 10).toISOString()).toBe(
      "2026-08-12T17:42:13.456Z",
    );
    expect(receipt.toISOString()).toBe("2026-08-02T17:42:13.456Z");
    expect(() => improvementGrantExpiry(receipt, 0)).toThrow(/positive whole number/);
  });
});
