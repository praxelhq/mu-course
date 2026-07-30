import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  prepareWorkflowEvidenceForProvider,
  type CommittedEvidenceReceipt,
} from "../lib/evidence/prepare-provider-evidence";

function receipt(
  id: string,
  role: string,
  mime: string,
  bytes: Uint8Array,
): CommittedEvidenceReceipt {
  return {
    id,
    fieldKey: role,
    fileRole: role,
    s3Key: `submissions/user/sub/${id}`,
    s3VersionId: `version-${id}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.byteLength,
    inspectedMimeType: mime,
    scanState: "clean",
  };
}

const blueprint = Buffer.from(
  JSON.stringify({ flow: [{ id: 1, module: "gateway:CustomWebHook" }], metadata: {} }),
);

describe("committed workflow evidence provider preparation", () => {
  it("reads exact immutable versions, locally scans all roles, and emits bounded provider blocks", async () => {
    const png = Buffer.from("fake-png-bytes");
    const log = Buffer.from('{"status":"success","recipient":"[REDACTED]"}');
    const receipts = [
      receipt("blueprint", "blueprintFile", "application/json", blueprint),
      receipt("log", "runLogFile", "application/json", log),
      receipt("image", "workflowPngFile", "image/png", png),
    ];
    const objects = new Map(receipts.map((item, index) => [item.id, [blueprint, log, png][index]]));
    const readExact = vi.fn(async (item: CommittedEvidenceReceipt) => objects.get(item.id)!);

    const result = await prepareWorkflowEvidenceForProvider({
      receipts,
      readExact,
      ocr: async () => "Webhook -> validate -> route -> retry twice -> manual queue",
    });

    expect(result.safeForProvider).toBe(true);
    expect(readExact).toHaveBeenCalledTimes(3);
    expect(readExact).toHaveBeenCalledWith(
      expect.objectContaining({ s3VersionId: "version-blueprint" }),
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({ id: "workflowPngFile:image", kind: "image", mediaType: "image/png" }),
    ]);
    expect(result.textEvidence.map((item) => item.id)).toEqual([
      "blueprintFile:blueprint",
      "runLogFile:log",
    ]);
    expect(result.blueprintSummary?.moduleCount).toBe(1);
  });

  it("fails closed on byte-count or checksum drift and never produces provider blocks", async () => {
    const item = receipt("blueprint", "blueprintFile", "application/json", blueprint);
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => Buffer.from(`${blueprint.toString("utf8")} `),
      ocr: async () => "",
    });
    expect(result.safeForProvider).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.textEvidence).toEqual([]);
    expect(result.quarantinedEvidenceIds).toEqual(["blueprint"]);
    expect(JSON.stringify(result)).not.toContain(item.sha256);
  });

  it("catches a credential rendered only inside a PNG before any provider call", async () => {
    const png = Buffer.from("fake-png-bytes");
    const item = receipt("image", "workflowPngFile", "image/png", png);
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => png,
      ocr: async () => "authorization Bearer FAKE_IMAGE_SECRET_TOKEN_123456789",
    });
    expect(result.safeForProvider).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.repairFeedback).not.toContain("FAKE_IMAGE_SECRET_TOKEN");
  });

  it("fails closed when local OCR is absent or throws", async () => {
    const png = Buffer.from("fake-png-bytes");
    const item = receipt("image", "workflowPngFile", "image/png", png);
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => png,
      ocr: async () => {
        throw new Error("OCR unavailable");
      },
    });
    expect(result.safeForProvider).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ detector: "image-unreadable", role: "workflowPngFile" }),
    );
  });

  it("locally scans JPEG evidence and preserves its provider media type", async () => {
    const jpeg = Buffer.from("fake-jpeg-bytes");
    const item = receipt("image-jpeg", "workflowPngFile", "image/jpeg", jpeg);
    const ocr = vi.fn(async () => "Webhook -> validate -> bounded retry -> manual queue");
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => jpeg,
      ocr,
    });
    expect(ocr).toHaveBeenCalledWith(jpeg, "workflowPngFile", "image/jpeg");
    expect(result.safeForProvider).toBe(true);
    expect(result.attachments).toEqual([
      expect.objectContaining({ kind: "image", mediaType: "image/jpeg" }),
    ]);
  });

  it("quarantines the exact receipt when a custom-role blueprint is malformed", async () => {
    const malformed = Buffer.from("{");
    const item = {
      ...receipt("custom-blueprint", "makeBlueprintArtifact", "application/json", malformed),
      fieldKey: "blueprintFile",
    };
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => malformed,
      ocr: async () => "",
    });
    expect(result.safeForProvider).toBe(false);
    expect(result.quarantinedEvidenceIds).toEqual(["custom-blueprint"]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ detector: "blueprint-invalid", role: "makeBlueprintArtifact" }),
    );
  });

  it("fails closed on text evidence that is not valid UTF-8", async () => {
    const invalidUtf8 = Buffer.from([0xff, 0xfe, 0xfd]);
    const item = receipt("log-invalid", "runLogFile", "text/plain", invalidUtf8);
    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => invalidUtf8,
      ocr: async () => "",
    });
    expect(result.safeForProvider).toBe(false);
    expect(result.quarantinedEvidenceIds).toEqual(["log-invalid"]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ detector: "text-unreadable", role: "runLogFile" }),
    );
  });

  it("quarantines an exact AWS credential pair before constructing provider evidence", async () => {
    const accessKeyId = `AKIA${"G".repeat(16)}`;
    const secretAccessKey = "h".repeat(40);
    const bytes = Buffer.from(JSON.stringify({ accessKeyId, secretAccessKey }));
    const item = receipt("aws-pair", "runLogFile", "application/json", bytes);
    const readExact = vi.fn(async () => bytes);

    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact,
      ocr: async () => "",
    });

    expect(readExact).toHaveBeenCalledOnce();
    expect(result.safeForProvider).toBe(false);
    expect(result.quarantinedEvidenceIds).toEqual(["aws-pair"]);
    expect(result.attachments).toEqual([]);
    expect(result.textEvidence).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(accessKeyId);
    expect(JSON.stringify(result)).not.toContain(secretAccessKey);
  });
});
