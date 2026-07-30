import { describe, expect, it } from "vitest";
import {
  reviewQueueCandidateIdentityKey,
  type ReviewQueueCandidateIdentity,
} from "../lib/review-queue";

function identity(
  patch: Partial<ReviewQueueCandidateIdentity> = {},
): ReviewQueueCandidateIdentity {
  return {
    id: "submission-a",
    assignmentId: "assignment-s5",
    userId: "student-a",
    teamId: "team-shared",
    assessmentVersionId: "assessment-s5-v1",
    ownerKind: "individual",
    ownerId: "student-a",
    ...patch,
  };
}

describe("review queue candidate identity", () => {
  it("keeps versioned individual teammates as separate review candidates", () => {
    const first = reviewQueueCandidateIdentityKey(identity());
    const teammate = reviewQueueCandidateIdentityKey(
      identity({
        id: "submission-b",
        userId: "student-b",
        ownerId: "student-b",
      }),
    );

    expect(teammate).not.toBe(first);
  });

  it("collapses only newer versions for the same frozen versioned owner", () => {
    const first = reviewQueueCandidateIdentityKey(identity());
    const resubmission = reviewQueueCandidateIdentityKey(
      identity({ id: "submission-a-v2", userId: "different-submitter" }),
    );

    expect(resubmission).toBe(first);
    expect(
      reviewQueueCandidateIdentityKey(
        identity({ ownerKind: "team", ownerId: "student-a" }),
      ),
    ).not.toBe(first);
  });

  it("retains the submitter/team fallback only for legacy unversioned rows", () => {
    const legacy = identity({
      assessmentVersionId: null,
      ownerKind: null,
      ownerId: null,
    });
    const teammate = {
      ...legacy,
      id: "legacy-submission-b",
      userId: "student-b",
    };

    expect(reviewQueueCandidateIdentityKey(teammate)).toBe(
      reviewQueueCandidateIdentityKey(legacy),
    );
    expect(
      reviewQueueCandidateIdentityKey({
        ...teammate,
        teamId: null,
      }),
    ).not.toBe(reviewQueueCandidateIdentityKey(legacy));
  });

  it("isolates malformed version-bound rows instead of falling back to team identity", () => {
    const missingOwner = identity({ ownerKind: null, ownerId: null });
    const other = { ...missingOwner, id: "submission-malformed-b" };

    expect(reviewQueueCandidateIdentityKey(other)).not.toBe(
      reviewQueueCandidateIdentityKey(missingOwner),
    );
  });
});
