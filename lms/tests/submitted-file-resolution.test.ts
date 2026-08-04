import { describe, expect, it } from "vitest";
import { resolveSubmittedFileObject, type SubmittedFileEvidenceRow } from "../lib/submissions";

// Regression: learners could not reopen their own uploaded PDF. The uploader
// writes an evidence id into the submission field, and the read path only
// resolved it for versioned rows — so every legacy row signed the raw id and
// S3 returned 404 for a URL that looked perfectly valid.

const KEY = "submissions/individual/u1/asg_s2_presentation/legacy/v1/attempt-1/pdf/abc/deck.pdf";

function evidence(over: Partial<SubmittedFileEvidenceRow> = {}): SubmittedFileEvidenceRow {
  return {
    id: "cmseexlg400l9pe013y8eqs44",
    fieldKey: "pdf",
    s3Key: KEY,
    s3VersionId: "v-1",
    scanState: "clean",
    ...over,
  };
}

describe("resolveSubmittedFileObject", () => {
  it("resolves an evidence id to the committed object, regardless of contract mode", () => {
    const row = evidence();
    expect(resolveSubmittedFileObject(row.id, "pdf", [row])).toEqual({
      key: KEY,
      versionId: "v-1",
    });
  });

  it("passes through a raw S3 key from rows written before the uploader changed", () => {
    expect(resolveSubmittedFileObject(KEY, "pdf", [])).toEqual({
      key: KEY,
      versionId: undefined,
    });
  });

  it("never resolves across fields, so a two-file schema cannot cross-sign", () => {
    const row = evidence({ fieldKey: "slides" });
    expect(resolveSubmittedFileObject(row.id, "pdf", [row]).key).toBe(row.id);
  });

  it("refuses evidence that has not passed the scanner", () => {
    for (const scanState of ["pending", "infected", "error"]) {
      const row = evidence({ scanState });
      expect(resolveSubmittedFileObject(row.id, "pdf", [row]).key).toBe(row.id);
    }
  });

  it("omits the version when evidence records none", () => {
    const row = evidence({ s3VersionId: null });
    expect(resolveSubmittedFileObject(row.id, "pdf", [row])).toEqual({
      key: KEY,
      versionId: undefined,
    });
  });
});
