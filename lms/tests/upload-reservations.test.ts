import { describe, expect, it, vi } from "vitest";
import { parseSubmissionSchema } from "../lib/submission-schema";
import {
  deriveReplacementEvidenceId,
  inspectEvidenceBytes,
  validateUploadRequest,
} from "../lib/upload-reservations";

const blueprint = parseSubmissionSchema({
  fields: [
    {
      key: "blueprintFile",
      label: "Blueprint",
      kind: "file",
      required: true,
      acceptedMimeTypes: ["application/json", "text/json"],
      maxBytes: 2_000_000,
      maxBytesExclusive: true,
      fileRole: "make-blueprint",
    },
    {
      key: "workflowPngFile",
      label: "Workflow PNG",
      kind: "file",
      required: true,
      acceptedMimeTypes: ["image/png"],
      maxBytes: 10_000_000,
      fileRole: "workflow-png",
    },
  ],
})!;

describe("field-bound upload policy", () => {
  it("accepts a blueprint at 1,999,999 bytes and rejects exactly 2,000,000", () => {
    const field = blueprint.fields[0];
    expect(() =>
      validateUploadRequest(field, { contentType: "application/json", sizeBytes: 1_999_999 }),
    ).not.toThrow();
    expect(() =>
      validateUploadRequest(field, { contentType: "application/json", sizeBytes: 2_000_000 }),
    ).toThrow(/strictly below 2000000 bytes/i);
  });

  it("rejects an undeclared MIME before storage", () => {
    expect(() =>
      validateUploadRequest(blueprint.fields[1], {
        contentType: "application/json",
        sizeBytes: 100,
      }),
    ).toThrow(/not accepted/i);
  });
});

describe("committed evidence inspection", () => {
  it("parses a valid Make blueprint and records a role result", () => {
    const bytes = new TextEncoder().encode('{"name":"demo","flow":[]}');
    const result = inspectEvidenceBytes(blueprint.fields[0], "application/json", bytes);
    expect(result).toMatchObject({
      scanState: "clean",
      inspectedMimeType: "application/json",
      quarantineReasonCode: null,
    });
    expect(result.roleParserResult).toMatchObject({ role: "make-blueprint", parsed: true });
  });

  it("quarantines malformed JSON and a PNG field carrying JSON bytes", () => {
    const malformed = inspectEvidenceBytes(
      blueprint.fields[0],
      "application/json",
      new TextEncoder().encode("{not-json}"),
    );
    expect(malformed).toMatchObject({
      scanState: "quarantined",
      quarantineReasonCode: "role_parse_failed",
    });

    const spoofed = inspectEvidenceBytes(
      blueprint.fields[1],
      "image/png",
      new TextEncoder().encode('{"not":"a png"}'),
    );
    expect(spoofed).toMatchObject({
      scanState: "quarantined",
      quarantineReasonCode: "mime_mismatch",
    });
  });

  it("derives replacement linkage on the server under a field-scoped lock", async () => {
    const executeRaw = vi.fn(async (query: unknown) => {
      void query;
      return 1;
    });
    const queryRaw = vi.fn(async (query: unknown) => {
      void query;
      return [{ id: "quarantined-evidence-1" }];
    });

    await expect(
      deriveReplacementEvidenceId(
        { $executeRaw: executeRaw, $queryRaw: queryRaw } as never,
        {
          submissionId: "submission-1",
          fieldKey: "blueprintFile",
          fileRole: "make-blueprint",
        },
      ),
    ).resolves.toBe("quarantined-evidence-1");

    expect(executeRaw).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(
      (executeRaw.mock.calls[0]![0] as unknown as { values: unknown[] }).values,
    ).toContain(
      "evidence-replacement:submission-1:blueprintFile:make-blueprint",
    );
  });
});
