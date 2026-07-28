import { rangedRead, s3Configured } from "@/lib/s3";

// U9 — submission file text extraction for grading context. Failures are
// collected, never thrown: a broken file becomes a 'context-incomplete'
// grading flag, not a dead job.
//
// v1 DELIBERATE DEVIATION (see docs/DECISIONS.md): image submissions are
// summarized as attachment notes — the grader is told an image exists but the
// bytes are not sent. Vision input is deferred; wiring image blocks through
// the grading call is overkill for v1 artifact kinds.

export interface ExtractedFile {
  key: string;
  kind: "text" | "pdf" | "image" | "binary";
  /** Present for text/pdf kinds. */
  text?: string;
  truncated?: boolean;
  /** For image kind: the S3 key so a future vision pass can fetch it. */
  s3Key?: string;
  /** Human note used when no text is embedded (image/binary). */
  note?: string;
}

export interface ExtractionResult {
  extracted: ExtractedFile[];
  failures: string[];
}

export interface ExtractDeps {
  rangedRead?: typeof rangedRead;
  configured?: () => boolean;
}

const TEXT_BYTES = 64 * 1024; // first 64KB for json/txt/csv
const PDF_BYTES = 5 * 1024 * 1024; // bounded PDF read
const PDF_TEXT_CAP = 20_000;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const TEXT_EXT = /\.(json|txt|csv|md)$/i;
const PDF_EXT = /\.pdf$/i;

export async function extractSubmissionFiles(
  files: string[],
  deps: ExtractDeps = {},
): Promise<ExtractionResult> {
  const read = deps.rangedRead ?? rangedRead;
  const configured = deps.configured ?? s3Configured;
  const extracted: ExtractedFile[] = [];
  const failures: string[] = [];

  if (files.length === 0) return { extracted, failures };

  if (!configured()) {
    // S3 not configured (local dev): grade from fields only, but tell the
    // model the file context is missing.
    for (const key of files) {
      failures.push(`file not readable (storage not configured): ${key}`);
    }
    return { extracted, failures };
  }

  for (const key of files) {
    try {
      if (IMAGE_EXT.test(key)) {
        extracted.push({
          kind: "image",
          key,
          s3Key: key,
          note: "an image was attached (not shown to the grader in v1 — judge surrounding fields; do not penalize the image itself)",
        });
      } else if (PDF_EXT.test(key)) {
        const bytes = await read(key, PDF_BYTES);
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: bytes });
        let text: string;
        try {
          text = ((await parser.getText()).text ?? "").trim();
        } finally {
          await parser.destroy?.().catch(() => {});
        }
        extracted.push({
          kind: "pdf",
          key,
          text: text.slice(0, PDF_TEXT_CAP),
          truncated: text.length > PDF_TEXT_CAP,
        });
      } else if (TEXT_EXT.test(key)) {
        const bytes = await read(key, TEXT_BYTES);
        extracted.push({
          kind: "text",
          key,
          text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
          truncated: bytes.length >= TEXT_BYTES,
        });
      } else {
        // zip / mp4 / audio / anything else: metadata note only.
        extracted.push({
          kind: "binary",
          key,
          note: `binary attachment (${key.split(".").pop() ?? "unknown"}) — content not extracted`,
        });
      }
    } catch (err) {
      failures.push(
        `extraction failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { extracted, failures };
}
