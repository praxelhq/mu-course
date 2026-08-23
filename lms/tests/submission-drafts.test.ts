import { describe, expect, it } from "vitest";
import type { ResubmissionGrant } from "@prisma/client";
import {
  grantForDraftSelection,
  nextSelfReplaceVersion,
  revisionNeedsGrant,
  resolveSubmissionContract,
} from "../lib/submission-drafts";

type ContractInput = Parameters<typeof resolveSubmissionContract>[0];

const legacySchema = {
  fields: [{ key: "url", label: "URL", kind: "link", required: true }],
};

describe("submission contract binding", () => {
  it("keeps legacy assignments on the AssignmentType schema", () => {
    const input: ContractInput = {
      id: "assignment-1",
      contractMode: "legacy",
      assignmentType: { teamBased: false, submissionSchema: legacySchema },
      activeAssessmentVersion: null,
    };
    const resolved = resolveSubmissionContract(input);

    expect(resolved.mode).toBe("legacy");
    expect(resolved.assessmentVersion).toBeNull();
    expect(resolved.ownerKind).toBe("individual");
    expect(resolved.schema.fields[0].key).toBe("url");
  });

  it("fails closed when a versioned assignment has no same-assignment published pointer", () => {
    expect(() =>
      resolveSubmissionContract({
        id: "assignment-1",
        contractMode: "versioned",
        assignmentType: { teamBased: false, submissionSchema: legacySchema },
        activeAssessmentVersion: null,
      }),
    ).toThrow(/no published active assessment contract/i);

    expect(() =>
      resolveSubmissionContract({
        id: "assignment-1",
        contractMode: "versioned",
        assignmentType: { teamBased: false, submissionSchema: legacySchema },
        activeAssessmentVersion: {
          id: "assessment-version-2",
          assignmentId: "other-assignment",
          publishedAt: new Date("2026-08-01T00:00:00Z"),
          publicSchema: legacySchema,
          ownerKind: "individual",
        },
      }),
    ).toThrow(/no published active assessment contract/i);
  });
});

describe("revision grant selection", () => {
  const grant = (id: string, kind: "repair" | "improvement") => ({
    id,
    assignmentId: "assignment-1",
    assessmentVersionId: "assessment-version-1",
    ownerKind: "individual",
    ownerId: "student-1",
    kind,
    targetVersion: 2,
    targetAttempt: 1,
    issuedBy: null,
    trigger: "fixture",
    reason: null,
    expiresAt: new Date("2026-08-10T00:00:00Z"),
    extendedAt: null,
    extendedBy: null,
    extensionReason: null,
    consumedAt: null,
    consumedSubmissionId: null,
    sourceSubmissionId: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  }) as ResubmissionGrant;

  it("fails closed when more than one lane is eligible and none was selected", () => {
    expect(() =>
      grantForDraftSelection(
        [grant("grant-repair", "repair"), grant("grant-improvement", "improvement")],
        { id: "student-1", teamId: null },
      ),
    ).toThrow(/choose the repair or improvement lane/i);
  });

  it("returns only the explicitly selected eligible grant", () => {
    const selected = grantForDraftSelection(
      [grant("grant-repair", "repair"), grant("grant-improvement", "improvement")],
      { id: "student-1", teamId: null },
      "grant-repair",
    );
    expect(selected?.id).toBe("grant-repair");
    expect(() =>
      grantForDraftSelection(
        [grant("grant-repair", "repair")],
        { id: "student-1", teamId: null },
        "other-grant",
      ),
    ).toThrow(/unavailable/i);
  });
});

describe("self-replace versioning", () => {
  it("increments from the latest submitted version without mutating history", () => {
    expect(nextSelfReplaceVersion(null)).toBe(1);
    expect(nextSelfReplaceVersion(1)).toBe(2);
    expect(nextSelfReplaceVersion(7)).toBe(8);
  });

  it("only requires an instructor grant when self-replace is not enabled", () => {
    expect(revisionNeedsGrant({ version: 1, attempt: 1, allowSelfReplace: true })).toBe(false);
    expect(revisionNeedsGrant({ version: 2, attempt: 1, allowSelfReplace: true })).toBe(false);
    expect(revisionNeedsGrant({ version: 2, attempt: 1, allowSelfReplace: false })).toBe(true);
    expect(revisionNeedsGrant({ version: 1, attempt: 2, allowSelfReplace: false })).toBe(true);
  });
});
