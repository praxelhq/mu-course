import { describe, expect, it } from "vitest";
import { parseSubmissionSchema } from "../lib/submission-schema";
import { finalEvidenceAuthorizationErrors } from "../lib/submissions";

const schema = parseSubmissionSchema({
  fields: [
    {
      key: "blueprint",
      label: "Blueprint",
      kind: "file",
      required: true,
      fileRole: "make-blueprint",
      acceptedMimeTypes: ["application/json"],
      maxBytes: 1_000_000,
    },
    {
      key: "screenshots",
      label: "Screenshots",
      kind: "files",
      required: false,
      fileRole: "app-screenshot",
      acceptedMimeTypes: ["image/png"],
      maxBytes: 1_000_000,
    },
  ],
})!;

function receipt(
  id: string,
  patch: Partial<{
    submissionId: string;
    fieldKey: string;
    fileRole: string;
    scanState: string;
  }> = {},
) {
  return {
    id,
    submissionId: "draft-1",
    fieldKey: id.startsWith("blueprint") ? "blueprint" : "screenshots",
    fileRole: id.startsWith("blueprint") ? "make-blueprint" : "app-screenshot",
    scanState: "clean",
    ...patch,
  };
}

describe("final evidence authorization", () => {
  it("accepts exactly one clean receipt under each frozen field and role", () => {
    expect(
      finalEvidenceAuthorizationErrors({
        schema,
        fields: { blueprint: "blueprint-1", screenshots: ["screenshot-1"] },
        evidenceIds: ["blueprint-1", "screenshot-1"],
        evidence: [receipt("blueprint-1"), receipt("screenshot-1")],
        draftId: "draft-1",
      }),
    ).toEqual([]);
  });

  it("rejects a clean receipt whose role, field, or draft binding differs", () => {
    for (const patch of [
      { fileRole: "run-log" },
      { fieldKey: "screenshots" },
      { submissionId: "other-draft" },
    ]) {
      expect(
        finalEvidenceAuthorizationErrors({
          schema,
          fields: { blueprint: "blueprint-1" },
          evidenceIds: ["blueprint-1"],
          evidence: [receipt("blueprint-1", patch)],
          draftId: "draft-1",
        }),
      ).not.toEqual([]);
    }
  });

  it.each(["pending", "quarantined", "deleted"])(
    "rejects a %s receipt at finalisation",
    (scanState) => {
      expect(
        finalEvidenceAuthorizationErrors({
          schema,
          fields: { blueprint: "blueprint-1" },
          evidenceIds: ["blueprint-1"],
          evidence: [receipt("blueprint-1", { scanState })],
          draftId: "draft-1",
        }),
      ).not.toEqual([]);
    },
  );

  it("rejects duplicates, extras, and dangling IDs instead of balancing their counts", () => {
    const fields = { blueprint: "blueprint-1", screenshots: ["screenshot-1", "screenshot-1"] };
    expect(
      finalEvidenceAuthorizationErrors({
        schema,
        fields,
        evidenceIds: ["blueprint-1", "extra-clean"],
        evidence: [receipt("blueprint-1"), receipt("extra-clean")],
        draftId: "draft-1",
      }),
    ).toEqual([
      "final submission evidence must match the committed file-field receipts exactly",
    ]);

    expect(
      finalEvidenceAuthorizationErrors({
        schema,
        fields: { blueprint: "blueprint-1" },
        evidenceIds: ["blueprint-1", "dangling"],
        evidence: [receipt("blueprint-1")],
        draftId: "draft-1",
      }),
    ).not.toEqual([]);
  });
});
