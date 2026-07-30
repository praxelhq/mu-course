import { describe, expect, it } from "vitest";
import { selectReferencedEvidence } from "../lib/evidence/referenced-evidence";

const publicSchema = {
  fields: [
    {
      key: "workflowPngFile",
      label: "Workflow PNG",
      kind: "file",
      required: true,
      fileRole: "workflowPngFile",
      acceptedMimeTypes: ["image/png"],
      maxBytes: 10_000_000,
    },
    {
      key: "sampleOutputFile",
      label: "Sample output",
      kind: "files",
      required: false,
      fileRole: "sampleOutputFile",
      acceptedMimeTypes: ["application/json"],
      maxBytes: 10_000_000,
    },
  ],
};

describe("exact referenced evidence authorization", () => {
  it("keeps only IDs frozen under their published field and role binding", () => {
    const selected = selectReferencedEvidence({
      publicSchema,
      fields: {
        workflowPngFile: "png-referenced",
        sampleOutputFile: ["sample-referenced"],
      },
      evidence: [
        { id: "png-referenced", fieldKey: "workflowPngFile", fileRole: "workflowPngFile" },
        { id: "sample-referenced", fieldKey: "sampleOutputFile", fileRole: "sampleOutputFile" },
        { id: "dangling-clean", fieldKey: "sampleOutputFile", fileRole: "sampleOutputFile" },
        { id: "png-referenced", fieldKey: "otherField", fileRole: "workflowPngFile" },
        { id: "sample-referenced", fieldKey: "sampleOutputFile", fileRole: "runLogFile" },
      ],
    });
    expect(selected).toEqual([
      { id: "png-referenced", fieldKey: "workflowPngFile", fileRole: "workflowPngFile" },
      { id: "sample-referenced", fieldKey: "sampleOutputFile", fileRole: "sampleOutputFile" },
    ]);
  });

  it("fails closed for malformed schemas, missing file roles, and malformed fields", () => {
    const evidence = [
      { id: "png-referenced", fieldKey: "workflowPngFile", fileRole: "workflowPngFile" },
    ];
    expect(
      selectReferencedEvidence({ publicSchema: {}, fields: {}, evidence }),
    ).toEqual([]);
    expect(
      selectReferencedEvidence({
        publicSchema: {
          fields: [{ key: "workflowPngFile", label: "PNG", kind: "file", required: true }],
        },
        fields: { workflowPngFile: "png-referenced" },
        evidence,
      }),
    ).toEqual([]);
    expect(
      selectReferencedEvidence({ publicSchema, fields: null, evidence }),
    ).toEqual([]);
  });
});
