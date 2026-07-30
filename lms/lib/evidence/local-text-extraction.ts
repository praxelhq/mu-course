import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";

export const LOCAL_TEXT_MAX_BYTES = 2_000_000;
export const LOCAL_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const LOCAL_PDF_MAX_PAGES = 10;
export const LOCAL_EXTRACTED_TEXT_MAX_CHARS = 200_000;
export const LOCAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const LOCAL_IMAGE_MAX_PIXELS = 25_000_000;
export const LOCAL_IMAGE_MAX_EDGE = 10_000;
export const LOCAL_EXTRACTION_TIMEOUT_MS = 15_000;

export type LocallyExtractableMime =
  | "application/pdf"
  | "image/png"
  | "image/jpeg";

export type TesseractRunner = (input: {
  filePath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}) => Promise<string | null>;

export type PdfTextExtractor = (
  bytes: Uint8Array,
  limits: { maxPages: number; maxChars: number; timeoutMs: number },
) => Promise<string | null>;

export type LocalTextExtractionDeps = {
  runTesseract?: TesseractRunner;
  extractPdfText?: PdfTextExtractor;
};

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode a complete text/JSON artifact for local screening. Oversized inputs
 * are rejected instead of truncated: a credential after a truncation boundary
 * must never reach a provider unseen.
 */
export function decodeBoundedLocalText(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0 || bytes.byteLength > LOCAL_TEXT_MAX_BYTES) return null;
  const text = decodeUtf8(bytes);
  if (text === null || text.length > LOCAL_EXTRACTED_TEXT_MAX_CHARS) return null;
  return text;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.byteLength < 24 ||
    !signature.every((value, index) => bytes[index] === value) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  ) {
    return null;
  }
  return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    while (offset < bytes.byteLength && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset]!;
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.byteLength) return null;
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return null;

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: readUint16(bytes, offset + 3),
        width: readUint16(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function imageWithinBounds(bytes: Uint8Array, mimeType: "image/png" | "image/jpeg"): boolean {
  if (bytes.byteLength === 0 || bytes.byteLength > LOCAL_IMAGE_MAX_BYTES) return false;
  const dimensions = mimeType === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return false;
  if (dimensions.width > LOCAL_IMAGE_MAX_EDGE || dimensions.height > LOCAL_IMAGE_MAX_EDGE) {
    return false;
  }
  return dimensions.width * dimensions.height <= LOCAL_IMAGE_MAX_PIXELS;
}

function runTesseractProcess(input: {
  filePath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "tesseract",
      [input.filePath, "stdout", "-l", "eng", "--psm", "6"],
      {
        encoding: "utf8",
        timeout: input.timeoutMs,
        maxBuffer: input.maxOutputBytes,
        windowsHide: true,
      },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

async function extractPdfText(
  bytes: Uint8Array,
  limits: { maxPages: number; maxChars: number; timeoutMs: number },
): Promise<string | null> {
  const parser = new PDFParse({
    data: new Uint8Array(bytes),
    stopAtErrors: true,
    isEvalSupported: false,
    useWasm: false,
    maxImageSize: LOCAL_IMAGE_MAX_PIXELS,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), limits.timeoutMs);
    });
    const parsed = await Promise.race([
      parser.getText({ first: limits.maxPages, parseHyperlinks: false }),
      timeout,
    ]);
    if (parsed === null || parsed.total > limits.maxPages) return null;
    // `TextResult.text` includes page separators even when a scanned PDF has
    // no embedded text. Join the page payloads so image-only PDFs fail closed.
    const text = parsed.pages.map((page) => page.text).join("\n");
    if (text.trim().length === 0 || text.length > limits.maxChars) return null;
    return text;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * Extract all locally screenable text from PDF/image evidence. `null` means
 * fail closed. The caller must sensitive-data scan the returned text before
 * constructing any provider attachment.
 */
export async function extractLocalEvidenceText(
  bytes: Uint8Array,
  _role: string,
  mimeType: string,
  deps: LocalTextExtractionDeps = {},
): Promise<string | null> {
  if (mimeType === "application/pdf") {
    if (bytes.byteLength === 0 || bytes.byteLength > LOCAL_PDF_MAX_BYTES) return null;
    const extractor = deps.extractPdfText ?? extractPdfText;
    const text = await extractor(bytes, {
      maxPages: LOCAL_PDF_MAX_PAGES,
      maxChars: LOCAL_EXTRACTED_TEXT_MAX_CHARS,
      timeoutMs: LOCAL_EXTRACTION_TIMEOUT_MS,
    });
    if (
      text === null ||
      text.trim().length === 0 ||
      text.length > LOCAL_EXTRACTED_TEXT_MAX_CHARS
    ) {
      return null;
    }
    return text;
  }

  if (mimeType !== "image/png" && mimeType !== "image/jpeg") return null;
  if (!imageWithinBounds(bytes, mimeType)) return null;

  const directory = await mkdtemp(join(tmpdir(), "praxel-evidence-ocr-"));
  const filePath = join(directory, mimeType === "image/png" ? "evidence.png" : "evidence.jpg");
  try {
    await writeFile(filePath, bytes, { flag: "wx" });
    const runner = deps.runTesseract ?? runTesseractProcess;
    const text = await runner({
      filePath,
      timeoutMs: LOCAL_EXTRACTION_TIMEOUT_MS,
      maxOutputBytes: LOCAL_EXTRACTED_TEXT_MAX_CHARS * 4,
    });
    if (text === null || text.length > LOCAL_EXTRACTED_TEXT_MAX_CHARS) return null;
    return text;
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
