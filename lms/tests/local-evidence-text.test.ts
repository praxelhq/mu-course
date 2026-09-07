import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeBoundedLocalText,
  extractLocalEvidenceText,
  LOCAL_EXTRACTED_TEXT_MAX_CHARS,
  LOCAL_IMAGE_MAX_PIXELS,
  LOCAL_PDF_MAX_PAGES,
  LOCAL_TEXT_MAX_BYTES,
} from "../lib/evidence/local-text-extraction";
import {
  prepareWorkflowEvidenceForProvider,
  type CommittedEvidenceReceipt,
} from "../lib/evidence/prepare-provider-evidence";
import { __setS3TestOverrides } from "../lib/s3";
import { createHash } from "node:crypto";

function makeTextPdf(text: string): Uint8Array {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

function onePixelPng(): Uint8Array {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}

function onePixelJpegHeader(): Uint8Array {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function receipt(bytes: Uint8Array): CommittedEvidenceReceipt {
  return {
    id: "blueprint",
    fieldKey: "blueprintFile",
    fileRole: "blueprintFile",
    s3Key: "submissions/individual/user/assignment/version/blueprint.json",
    s3VersionId: "immutable-version-7",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.byteLength,
    inspectedMimeType: "application/json",
    scanState: "clean",
  };
}

afterEach(() => __setS3TestOverrides(null));

describe("bounded local evidence text extraction", () => {
  it("decodes complete JSON/text only within the local screening bound", () => {
    expect(decodeBoundedLocalText(Buffer.from('{"status":"ok"}'))).toBe('{"status":"ok"}');
    expect(decodeBoundedLocalText(Buffer.from([0xff, 0xfe]))).toBeNull();
    expect(decodeBoundedLocalText(Buffer.alloc(LOCAL_TEXT_MAX_BYTES + 1, 0x61))).toBeNull();
  });

  it("extracts embedded text from every page of a bounded PDF", async () => {
    const result = await extractLocalEvidenceText(
      makeTextPdf("Webhook validate retry manual queue"),
      "sampleOutputFile",
      "application/pdf",
    );
    expect(result).toContain("Webhook validate retry manual queue");
  });

  it("fails closed for a PDF without locally extractable embedded text", async () => {
    expect(
      await extractLocalEvidenceText(
        makeTextPdf(""),
        "sampleOutputFile",
        "application/pdf",
      ),
    ).toBeNull();
  });

  it("passes strict PDF page, output, and timeout bounds to the extractor", async () => {
    const extractPdfText = vi.fn(async () => "bounded embedded text");
    const result = await extractLocalEvidenceText(
      makeTextPdf("small"),
      "sampleOutputFile",
      "application/pdf",
      { extractPdfText },
    );
    expect(result).toBe("bounded embedded text");
    expect(extractPdfText).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        maxPages: LOCAL_PDF_MAX_PAGES,
        maxChars: LOCAL_EXTRACTED_TEXT_MAX_CHARS,
      }),
    );
  });

  it("rejects an extractor result that exceeds the server-owned text cap", async () => {
    expect(
      await extractLocalEvidenceText(
        makeTextPdf("small"),
        "sampleOutputFile",
        "application/pdf",
        {
          extractPdfText: async () => "x".repeat(LOCAL_EXTRACTED_TEXT_MAX_CHARS + 1),
        },
      ),
    ).toBeNull();
  });

  it.each([
    ["image/png", onePixelPng(), ".png"],
    ["image/jpeg", onePixelJpegHeader(), ".jpg"],
  ] as const)("OCRs a bounded %s using a fixed local filename", async (mimeType, bytes, suffix) => {
    const runTesseract = vi.fn(async ({ filePath }: { filePath: string }) => {
      expect(filePath.endsWith(suffix)).toBe(true);
      return "Webhook -> validate -> retry -> manual queue";
    });
    const result = await extractLocalEvidenceText(bytes, "workflowPngFile", mimeType, {
      runTesseract,
    });
    expect(result).toContain("manual queue");
    expect(runTesseract).toHaveBeenCalledOnce();
  });

  it("rejects MIME/header mismatch and decompression-bomb dimensions before OCR", async () => {
    const runTesseract = vi.fn(async () => "should not run");
    expect(
      await extractLocalEvidenceText(onePixelJpegHeader(), "workflowPngFile", "image/png", {
        runTesseract,
      }),
    ).toBeNull();

    const hugePng = Buffer.from(onePixelPng());
    hugePng.writeUInt32BE(Math.floor(LOCAL_IMAGE_MAX_PIXELS / 2) + 1, 16);
    hugePng.writeUInt32BE(2, 20);
    expect(
      await extractLocalEvidenceText(hugePng, "workflowPngFile", "image/png", {
        runTesseract,
      }),
    ).toBeNull();
    expect(runTesseract).not.toHaveBeenCalled();
  });
});

describe("production immutable evidence read binding", () => {
  it("defaults to the exact committed S3 key, VersionId, and byte count", async () => {
    const bytes = Buffer.from(
      JSON.stringify({ flow: [{ id: 1, module: "gateway:CustomWebHook" }], metadata: {} }),
    );
    const readVersion = vi.fn(async () => bytes);
    __setS3TestOverrides({ configured: true, readVersion });

    const result = await prepareWorkflowEvidenceForProvider({ receipts: [receipt(bytes)] });

    expect(result.safeForProvider).toBe(true);
    expect(readVersion).toHaveBeenCalledWith(
      "submissions/individual/user/assignment/version/blueprint.json",
      "immutable-version-7",
      bytes.byteLength,
    );
  });

  it("extracts and screens embedded PDF text before constructing an attachment", async () => {
    const secret = "Bearer FAKE_PDF_SECRET_TOKEN_123456789";
    const bytes = makeTextPdf(`Webhook output authorization ${secret}`);
    const item: CommittedEvidenceReceipt = {
      ...receipt(bytes),
      id: "sample-pdf",
      fieldKey: "sampleOutputFile",
      fileRole: "sampleOutputFile",
      inspectedMimeType: "application/pdf",
    };

    const result = await prepareWorkflowEvidenceForProvider({
      receipts: [item],
      readExact: async () => bytes,
    });

    expect(result.safeForProvider).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.findings.map((finding) => finding.detector)).toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
