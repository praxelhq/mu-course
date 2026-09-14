// Assembling everything one verdict call needs, in one place.
//
// The pipeline hands this module plain data — the checkpoint row, the
// student's answers, their uploaded bytes, the render, the tracker signals —
// and gets back the exact prompt to send. Nothing here reaches for Prisma, S3
// or the network: file bytes arrive through the injected `fetchFile`, which is
// the whole seam the tests use.
//
// Order matters and is deliberate:
//   1. extract text from PDFs and text attachments (reusing Course 1's
//      extractor through its `rangedRead` seam, so there is one PDF parser in
//      this repo and not two),
//   2. THEN anonymise — the extracted text is where a student's name most
//      often hides, inside a PDF they exported from Canva,
//   3. then convert images, capped,
//   4. then build the prompt.

import type { ShipyardCheckpointKey } from "@prisma/client";
import { extractSubmissionFiles } from "@/lib/ai/extract";
import type { CheckpointRubric } from "../checkpoints";
import type { FieldSpec, SubmissionFields } from "../fields";
import type { ReasonView } from "../view-models";
import type { TrackerSignals } from "@/lib/tracker/types";
import { anonymiseSubmission, type StudentIdentity } from "./anonymise";
import { buildVerdictPrompt, type PromptImage, type PromptRender } from "./prompts";
import type { BuiltPrompt } from "./schemas";

/** SPEC §6.5's verdict budget assumes a handful of images, not an album. */
export const MAX_IMAGES = 5;
/** Raw bytes per image, before base64. ~2MB on the wire. */
export const IMAGE_BYTE_CAP = 1_500_000;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const HEIC = /\.(heic|heif)$/i;
const TEXTUAL_EXT = /\.(pdf|json|txt|csv|md)$/i;

export type SubmissionFile = {
  key: string;
  contentType: string;
  bytes: number;
};

export type ContextCheckpoint = {
  key: ShipyardCheckpointKey;
  title: string;
  barMarkdown: string;
  rubric: CheckpointRubric;
  acceptsImages: boolean;
  fieldSchema: FieldSpec[];
};

export type ContextRender = PromptRender & {
  /** The full-page PNG from ./render, shown to the reviewer as evidence. */
  screenshotPng?: Buffer | null;
};

export type AssembleInput = {
  checkpoint: ContextCheckpoint;
  submission: { fields: SubmissionFields; files: SubmissionFile[] };
  product?: { name?: string | null; oneLiner?: string | null } | null;
  /** The identity to strip. The reviewer never sees any of it. */
  student?: StudentIdentity | null;
  fetchFile: (key: string) => Promise<Buffer>;
  render?: ContextRender | null;
  signals?: TrackerSignals | null;
  attempt: number;
  previousReasons?: ReasonView[] | null;
};

export type AssembledContext = {
  prompt: BuiltPrompt;
  /**
   * The parts of PreflightOutput this step produces. `runPreflight` fills in
   * link liveness, blank, spam and near-duplicate around them.
   */
  preflight: { extractedText: string; notes: string[] };
  /** Redactions made, for the audit line on the review. */
  redactions: number;
  imageCount: number;
  /** The anonymised fields, so the pipeline can hand the same ones to pre-flight. */
  fields: SubmissionFields;
};

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function isImage(file: SubmissionFile): boolean {
  return IMAGE_TYPES.has(file.contentType.toLowerCase()) || IMAGE_EXT.test(file.key);
}

function isHeic(file: SubmissionFile): boolean {
  const type = file.contentType.toLowerCase();
  return type === "image/heic" || type === "image/heif" || HEIC.test(file.key);
}

function mimeFor(file: SubmissionFile): string {
  const type = file.contentType.toLowerCase();
  if (IMAGE_TYPES.has(type)) return type === "image/jpg" ? "image/jpeg" : type;
  if (/\.png$/i.test(file.key)) return "image/png";
  if (/\.webp$/i.test(file.key)) return "image/webp";
  return "image/jpeg";
}

/**
 * `sharp` is not a dependency of this repo (it arrives only as a transitive of
 * some Next builds), so the downscale is BEST EFFORT: if it resolves we shrink
 * an oversized photo to fit, and if it does not we skip the image and say so
 * in a note the reviewer reads. Skipping loudly beats sending two megabytes of
 * a phone photo and beats pretending the image was fine.
 */
async function downscale(bytes: Buffer): Promise<Buffer | null> {
  try {
    // The specifier is a variable so TypeScript does not try to resolve a
    // module that is not in package.json; this is a runtime probe, not a
    // dependency.
    const specifier = "sharp";
    const mod = (await import(specifier).catch(() => null)) as
      | { default?: (input: Buffer) => SharpLike }
      | null;
    const sharp = mod?.default;
    if (!sharp) return null;
    return await sharp(bytes)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    return null;
  }
}

type SharpLike = {
  rotate(): SharpLike;
  resize(opts: { width: number; withoutEnlargement: boolean }): SharpLike;
  jpeg(opts: { quality: number }): SharpLike;
  toBuffer(): Promise<Buffer>;
};

export function toDataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function buildImages(
  input: AssembleInput,
  notes: string[],
): Promise<PromptImage[]> {
  const images: PromptImage[] = [];
  if (!input.checkpoint.acceptsImages) return images;

  // The render screenshot goes first: on checkpoint 3 it is the evidence, and
  // the student's own uploads are context around it.
  if (input.render?.screenshotPng && input.render.screenshotPng.length > 0) {
    const png = input.render.screenshotPng;
    if (png.length <= IMAGE_BYTE_CAP) {
      images.push({
        dataUrl: toDataUrl(png, "image/png"),
        label: "the rendered screenshot of the live product",
      });
    } else {
      const smaller = await downscale(png);
      if (smaller && smaller.length <= IMAGE_BYTE_CAP) {
        images.push({
          dataUrl: toDataUrl(smaller, "image/jpeg"),
          label: "the rendered screenshot of the live product (downscaled)",
        });
      } else {
        notes.push(
          "the rendered screenshot was too large to send; judge the render from its extracted text",
        );
      }
    }
  }

  const candidates = input.submission.files.filter((f) => isImage(f) || isHeic(f));
  let index = 0;
  for (const file of candidates) {
    if (images.length >= MAX_IMAGES) {
      notes.push(
        `${candidates.length - index} further image${candidates.length - index === 1 ? " was" : "s were"} not sent: the reviewer looks at the first ${MAX_IMAGES}`,
      );
      break;
    }
    index++;
    const label = `image ${index} of ${candidates.length} (${file.key.split("/").pop() ?? file.key})`;

    if (isHeic(file)) {
      notes.push(`${label}: HEIC is not supported — ask the student to upload it as a JPG or PNG`);
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = await input.fetchFile(file.key);
    } catch (err) {
      notes.push(
        `${label}: could not be read (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }

    if (bytes.length <= IMAGE_BYTE_CAP) {
      images.push({ dataUrl: toDataUrl(bytes, mimeFor(file)), label });
      continue;
    }
    const smaller = await downscale(bytes);
    if (smaller && smaller.length <= IMAGE_BYTE_CAP) {
      images.push({ dataUrl: toDataUrl(smaller, "image/jpeg"), label: `${label}, downscaled` });
      continue;
    }
    notes.push(
      `${label}: ${(bytes.length / 1_000_000).toFixed(1)}MB is over the ${(IMAGE_BYTE_CAP / 1_000_000).toFixed(1)}MB cap and could not be downscaled here, so it was not sent — do not hold its absence against the student`,
    );
  }

  return images;
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

export async function assembleReviewContext(
  input: AssembleInput,
): Promise<AssembledContext> {
  const notes: string[] = [];

  // 1 · Text out of PDFs and text attachments, through Course 1's extractor.
  //     `rangedRead` is its injection seam, so `fetchFile` becomes the reader
  //     and no S3 client is constructed here.
  const textualKeys = input.submission.files
    .filter((f) => TEXTUAL_EXT.test(f.key) || f.contentType === "application/pdf")
    .map((f) => f.key);

  let extractedText = "";
  if (textualKeys.length > 0) {
    const { extracted, failures } = await extractSubmissionFiles(textualKeys, {
      configured: () => true,
      rangedRead: async (key: string, bytes = 5 * 1024 * 1024) => {
        const buf = await input.fetchFile(key);
        return new Uint8Array(buf.subarray(0, bytes));
      },
    });
    const parts: string[] = [];
    for (const file of extracted) {
      if (file.text && file.text.trim() !== "") {
        parts.push(`--- ${file.key.split("/").pop() ?? file.key} ---\n${file.text.trim()}`);
        if (file.truncated) notes.push(`${file.key.split("/").pop()}: text was truncated`);
      } else if (file.note) {
        notes.push(`${file.key.split("/").pop()}: ${file.note}`);
      }
    }
    extractedText = parts.join("\n\n");
    notes.push(...failures);
  }

  // 2 · Anonymise fields, product and the extracted text together.
  const anonymised = anonymiseSubmission({
    fields: input.submission.fields,
    product: input.product ?? null,
    extractedText,
    student: input.student ?? null,
  });

  // 3 · Images, capped.
  const images = await buildImages(input, notes);

  // 4 · The prompt.
  const prompt = buildVerdictPrompt({
    checkpoint: {
      key: input.checkpoint.key,
      title: input.checkpoint.title,
      barMarkdown: input.checkpoint.barMarkdown,
      rubric: input.checkpoint.rubric,
    },
    submission: {
      fields: anonymised.fields,
      extractedText: anonymised.extractedText,
      product: anonymised.product,
    },
    render: input.render
      ? { domText: input.render.domText, screenshotNote: input.render.screenshotNote }
      : null,
    signals: input.signals ?? null,
    attempt: input.attempt,
    previousReasons: input.previousReasons ?? null,
    images,
  });

  return {
    prompt,
    preflight: { extractedText: anonymised.extractedText, notes },
    redactions: anonymised.redactions,
    imageCount: images.length,
    fields: anonymised.fields,
  };
}
