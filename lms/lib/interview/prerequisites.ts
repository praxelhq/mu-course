import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { extractSubmissionFiles } from "@/lib/ai/extract";
import {
  headObject,
  keyForInterviewPrerequisite,
  presignPut,
  type PresignedPut,
} from "@/lib/s3";

// The three artifacts every student supplies personally before the interview
// can start. They are deliberately NOT submissions: a resume must never become
// a graded artifact or reach a gallery, so these live in their own table with
// their own lifecycle (see prisma/schema.prisma InterviewPrerequisite).
//
// The interview questions are grounded in whatever the student uploads here,
// which makes all of it untrusted model input — extraction is bounded and
// every consumer wraps it in <student_content> (lib/interview/session).

export const PREREQUISITE_KINDS = ["resume", "blueprint", "sector_map"] as const;
export type PrerequisiteKind = (typeof PREREQUISITE_KINDS)[number];

export const PREREQUISITE_LABELS: Record<PrerequisiteKind, string> = {
  resume: "your latest resume",
  blueprint: "your Make blueprint JSON",
  sector_map: "your sector map",
};

/**
 * Accepted content types per kind, mapped to the extension the S3 key gets.
 * DOCX is deliberately absent: lib/ai/extract reads PDF and text, and adding a
 * DOCX parser for a format students can export straight to PDF is not worth a
 * dependency. `rejectionFor` gives that specific advice rather than a generic
 * "unsupported type".
 */
export const PREREQUISITE_CONTENT_TYPES: Record<
  PrerequisiteKind,
  Record<string, string>
> = {
  resume: {
    "application/pdf": "pdf",
    "text/plain": "txt",
  },
  blueprint: {
    "application/json": "json",
    "text/json": "json",
  },
  sector_map: {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  },
};

const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const MB = 1024 * 1024;
export const MAX_PREREQUISITE_BYTES = 20 * MB;
/** Bounded text kept on the row so prompt assembly never re-reads S3. */
export const PREREQUISITE_TEXT_CAP = 12_000;

export class PrerequisiteRejectedError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PrerequisiteRejectedError";
  }
}

export class MissingPrerequisitesError extends Error {
  readonly status = 409;
  readonly missing: PrerequisiteKind[];
  constructor(missing: PrerequisiteKind[]) {
    super(
      `Before your interview you need to upload ${missing
        .map((kind) => PREREQUISITE_LABELS[kind])
        .join(", ")}.`,
    );
    this.name = "MissingPrerequisitesError";
    this.missing = missing;
  }
}

export function isPrerequisiteKind(value: unknown): value is PrerequisiteKind {
  return (
    typeof value === "string" &&
    (PREREQUISITE_KINDS as readonly string[]).includes(value)
  );
}

/** Extension for an accepted (kind, contentType) pair, or null when unaccepted. */
export function extensionFor(kind: PrerequisiteKind, contentType: string): string | null {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return PREREQUISITE_CONTENT_TYPES[kind][normalized] ?? null;
}

/**
 * Pure upload validation. Returns the rejection message, or null when the
 * upload is acceptable. Kept pure so the rules are testable without S3.
 */
export function rejectionFor(
  kind: PrerequisiteKind,
  contentType: string,
  sizeBytes: number,
): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "That file looks empty. Please choose a file and try again.";
  }
  if (sizeBytes > MAX_PREREQUISITE_BYTES) {
    return `That file is larger than ${MAX_PREREQUISITE_BYTES / MB}MB. Please upload a smaller one.`;
  }
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (kind === "resume" && DOCX_TYPES.has(normalized)) {
    return "Word documents are not supported. Export your resume as a PDF and upload that.";
  }
  if (!extensionFor(kind, contentType)) {
    const accepted = Object.keys(PREREQUISITE_CONTENT_TYPES[kind]).join(", ");
    return `That file type is not accepted for ${PREREQUISITE_LABELS[kind]}. Accepted: ${accepted}.`;
  }
  return null;
}

export type PrerequisiteDeps = {
  prisma?: PrismaClient;
  /** DI seams so the whole flow is testable without S3. */
  presign?: typeof presignPut;
  head?: typeof headObject;
  /** DI seam for text extraction; defaults to the shared S3-backed extractor. */
  extract?: typeof extractSubmissionFiles;
};

function db(deps: PrerequisiteDeps): PrismaClient {
  return deps.prisma ?? defaultPrisma;
}

export type PrerequisiteRow = {
  kind: PrerequisiteKind;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  extractedText: string | null;
  /** Short prose summary of extractedText; null until the digest job runs. */
  digest: string | null;
  createdAt: Date;
};

/**
 * Whether the interview will actually be able to quote this artifact.
 * A PDF with no text layer, or a malformed export, reads as zero characters —
 * the upload succeeds and the interview then has nothing to ground questions
 * in. That has to reach the student at upload time, not be discovered mid-viva.
 */
export type PrerequisiteCommit = PrerequisiteRow & {
  readable: boolean;
  unreadableReason: string | null;
};

const UNREADABLE_ADVICE: Record<PrerequisiteKind, string> = {
  resume:
    "We could not read any text out of that PDF, so the interview will not be able to ask about your resume. Re-export it (File → Print → Save as PDF usually fixes it) and upload again.",
  blueprint:
    "We could not read that blueprint file. Re-export the blueprint JSON from Make and upload again.",
  sector_map:
    "We could not read any text out of that file, so the interview will not be able to quote your map. If it is a scan or an image, export a text-based PDF and upload again.",
};

export async function listPrerequisites(
  userId: string,
  deps: PrerequisiteDeps = {},
): Promise<PrerequisiteRow[]> {
  const rows = await db(deps).interviewPrerequisite.findMany({
    where: { userId },
    orderBy: { kind: "asc" },
  });
  return rows.map((row) => ({
    kind: row.kind as PrerequisiteKind,
    s3Key: row.s3Key,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    extractedText: row.extractedText,
    digest: row.digest,
    createdAt: row.createdAt,
  }));
}

/** Which of the three the student still owes, in canonical order. */
export async function missingPrerequisites(
  userId: string,
  deps: PrerequisiteDeps = {},
): Promise<PrerequisiteKind[]> {
  const rows = await db(deps).interviewPrerequisite.findMany({
    where: { userId },
    select: { kind: true },
  });
  const present = new Set(rows.map((row) => row.kind));
  return PREREQUISITE_KINDS.filter((kind) => !present.has(kind));
}

/**
 * The interview gate. Lives here rather than in lib/gates because GateTarget
 * has no interview member and the interview is scheduled by InterviewWindow;
 * startInterview calls this beside its window/attempt/retake guards so every
 * entry point inherits it from one place.
 */
export async function assertPrerequisitesComplete(
  userId: string,
  deps: PrerequisiteDeps = {},
): Promise<void> {
  const missing = await missingPrerequisites(userId, deps);
  if (missing.length > 0) throw new MissingPrerequisitesError(missing);
}

/**
 * Presign a one-time PUT straight to S3. These objects are user-scoped, so they
 * deliberately do NOT use GeneratedObjectReservation: that machinery binds an
 * object to exactly one parent row (a submission or an interview) and a
 * prerequisite has neither — it is uploaded before any interview exists and
 * survives across attempts. The row itself holds the coordinates, and DPDP
 * erasure reads them directly (lib/dpdp-erasure-prisma).
 */
export async function presignPrerequisiteUpload(
  args: {
    userId: string;
    kind: PrerequisiteKind;
    contentType: string;
    sizeBytes: number;
  },
  deps: PrerequisiteDeps = {},
): Promise<{ s3Key: string; upload: PresignedPut }> {
  const rejection = rejectionFor(args.kind, args.contentType, args.sizeBytes);
  if (rejection) throw new PrerequisiteRejectedError(rejection);
  const extension = extensionFor(args.kind, args.contentType)!;

  const s3Key = keyForInterviewPrerequisite(args.userId, args.kind, randomUUID(), extension);
  const upload = await (deps.presign ?? presignPut)({
    key: s3Key,
    contentType: args.contentType,
    maxBytes: args.sizeBytes,
    oneTime: true,
  });
  return { s3Key, upload };
}

/**
 * HEAD the uploaded object, bind its exact immutable version, and upsert the
 * row. A re-upload replaces the student's previous file of that kind in place
 * rather than accumulating copies of a resume.
 */
export async function commitPrerequisite(
  args: {
    userId: string;
    kind: PrerequisiteKind;
    s3Key: string;
  },
  deps: PrerequisiteDeps = {},
): Promise<PrerequisiteCommit> {
  const client = db(deps);

  // The key is server-derived, never client-chosen: a student may only commit
  // an object inside their own prerequisite namespace.
  const expectedPrefix = `interview-prerequisites/${args.userId}/${args.kind}-`;
  if (!args.s3Key.startsWith(expectedPrefix)) {
    throw new PrerequisiteRejectedError("That upload does not belong to you.");
  }

  const metadata = await (deps.head ?? headObject)(args.s3Key);
  if (!extensionFor(args.kind, metadata.contentType)) {
    throw new PrerequisiteRejectedError(
      `The uploaded file is not an accepted type for ${PREREQUISITE_LABELS[args.kind]}.`,
    );
  }
  if (metadata.contentLength > MAX_PREREQUISITE_BYTES) {
    throw new PrerequisiteRejectedError("That file is larger than the upload limit.");
  }

  // Extraction is best-effort — an unreadable file still counts as uploaded —
  // but the outcome is REPORTED rather than swallowed. A silently empty resume
  // produces an interview that cannot ask about the student's own history and
  // gives nobody a clue why.
  const extract = deps.extract ?? extractSubmissionFiles;
  let extractedText: string | null = null;
  let extractionFailure: string | null = null;
  try {
    const result = await extract([args.s3Key]);
    const text = result.extracted.map((file) => file.text ?? "").join("\n").trim();
    extractedText = text ? text.slice(0, PREREQUISITE_TEXT_CAP) : null;
    if (!extractedText) {
      extractionFailure = result.failures[0] ?? "no text could be read from the file";
    }
  } catch (error) {
    extractionFailure = error instanceof Error ? error.message : String(error);
  }

  if (extractionFailure) {
    // Technical reason for whoever debugs this later; the student gets plain
    // advice instead. Today this would have said "Invalid PDF structure".
    console.warn(
      `[interview-prerequisite] ${args.kind} for ${args.userId} produced no text: ${extractionFailure}`,
    );
  }

  const row = await client.interviewPrerequisite.upsert({
    where: { userId_kind: { userId: args.userId, kind: args.kind } },
    create: {
      userId: args.userId,
      kind: args.kind,
      s3Key: args.s3Key,
      s3VersionId: metadata.versionId,
      contentType: metadata.contentType,
      sizeBytes: metadata.contentLength,
      extractedText,
    },
    update: {
      s3Key: args.s3Key,
      s3VersionId: metadata.versionId,
      contentType: metadata.contentType,
      sizeBytes: metadata.contentLength,
      extractedText,
      // The digest describes the PREVIOUS file. The prompt builder prefers a
      // digest over raw text and counts one as proof the artifact is readable,
      // so leaving it here meant a student who replaced their blueprint was
      // then interrogated about the file they had just replaced.
      digest: null,
      digestedAt: null,
    },
  });

  return {
    kind: args.kind,
    s3Key: row.s3Key,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    extractedText: row.extractedText,
    digest: row.digest,
    createdAt: row.createdAt,
    readable: extractedText !== null,
    unreadableReason: extractedText === null ? UNREADABLE_ADVICE[args.kind] : null,
  };
}
