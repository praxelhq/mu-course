import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type SubmissionEvidence,
  type UploadReservation,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  headObject,
  keyForReservedSubmission,
  presignPut,
  readObjectVersion,
  type PresignedPut,
} from "@/lib/s3";
import { ensureSubmissionDraft, getBoundDraftContext } from "@/lib/submission-drafts";
import type { SubmissionFieldDef } from "@/lib/submission-schema";

const RESERVATION_TTL_MS = 10 * 60_000;
const MAX_ACTIVE_RESERVATIONS_PER_OWNER_ASSIGNMENT = 40;
const MAX_ACTIVE_RESERVED_BYTES_PER_OWNER_ASSIGNMENT = 512 * 1024 * 1024;

export class UploadPolicyError extends Error {
  readonly status: 400 | 403 | 409 | 413 | 415 | 422;
  constructor(status: UploadPolicyError["status"], message: string) {
    super(message);
    this.name = "UploadPolicyError";
    this.status = status;
  }
}

function baseMime(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function mimeFamily(value: string): string {
  const mime = baseMime(value);
  if (mime === "application/json" || mime === "text/json") return "json";
  if (mime === "application/x-ndjson") return "ndjson";
  return mime;
}

export function validateUploadRequest(
  field: SubmissionFieldDef,
  upload: { contentType: string; sizeBytes: number },
): void {
  if (field.kind !== "file" && field.kind !== "files") {
    throw new UploadPolicyError(422, `Field "${field.key}" is not an upload field.`);
  }
  if (!Number.isInteger(upload.sizeBytes) || upload.sizeBytes <= 0) {
    throw new UploadPolicyError(413, "Upload size must be a positive whole number of bytes.");
  }
  const contentType = baseMime(upload.contentType);
  if (
    field.acceptedMimeTypes &&
    !field.acceptedMimeTypes.some((accepted) => mimeFamily(accepted) === mimeFamily(contentType))
  ) {
    throw new UploadPolicyError(415, `Content type ${contentType} is not accepted for "${field.key}".`);
  }
  if (field.maxBytes !== undefined) {
    if (field.maxBytesExclusive && upload.sizeBytes >= field.maxBytes) {
      throw new UploadPolicyError(
        413,
        `Field "${field.key}" must be strictly below ${field.maxBytes} bytes.`,
      );
    }
    if (!field.maxBytesExclusive && upload.sizeBytes > field.maxBytes) {
      throw new UploadPolicyError(
        413,
        `Field "${field.key}" allows at most ${field.maxBytes} bytes.`,
      );
    }
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function detectMime(bytes: Uint8Array): string {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  if (startsWith(bytes, [0x1f, 0x8b])) return "application/gzip";

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trimStart();
    if (text.startsWith("{") || text.startsWith("[")) return "application/json";
    return "text/plain";
  } catch {
    return "application/octet-stream";
  }
}

export type EvidenceInspection = {
  scanState: "clean" | "quarantined";
  inspectedMimeType: string;
  quarantineReasonCode: "mime_mismatch" | "role_parse_failed" | null;
  roleParserResult: Record<string, unknown> | null;
};

type EvidenceReplacementLookup = Pick<
  Prisma.TransactionClient,
  "$executeRaw" | "$queryRaw"
>;

/**
 * Selects the newest unresolved quarantined receipt for the same field role.
 * The field-scoped advisory lock makes concurrent clean commits choose at most
 * one replacement for a quarantined receipt.
 */
export async function deriveReplacementEvidenceId(
  tx: EvidenceReplacementLookup,
  input: { submissionId: string; fieldKey: string; fileRole: string },
): Promise<string | null> {
  const lockKey = [
    "evidence-replacement",
    input.submissionId,
    input.fieldKey,
    input.fileRole,
  ].join(":");
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  );
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT quarantined."id"
    FROM "SubmissionEvidence" quarantined
    WHERE quarantined."submissionId" = ${input.submissionId}
      AND quarantined."fieldKey" = ${input.fieldKey}
      AND quarantined."fileRole" = ${input.fileRole}
      AND quarantined."scanState" = 'quarantined'::"EvidenceScanState"
      AND NOT EXISTS (
        SELECT 1
        FROM "SubmissionEvidence" replacement
        WHERE replacement."replacesEvidenceId" = quarantined."id"
          AND replacement."scanState" = 'clean'::"EvidenceScanState"
      )
    ORDER BY quarantined."committedAt" DESC, quarantined."id" DESC
    LIMIT 1
    FOR UPDATE OF quarantined
  `);
  return rows[0]?.id ?? null;
}

function mimeAccepted(field: SubmissionFieldDef, declared: string, inspected: string): boolean {
  const inspectedFamily = mimeFamily(inspected);
  if (mimeFamily(declared) !== inspectedFamily) return false;
  return (
    !field.acceptedMimeTypes ||
    field.acceptedMimeTypes.some((accepted) => mimeFamily(accepted) === inspectedFamily)
  );
}

/** Local magic/role inspection. It never returns matched secret values. */
export function inspectEvidenceBytes(
  field: SubmissionFieldDef,
  declaredContentType: string,
  bytes: Uint8Array,
): EvidenceInspection {
  const inspectedMimeType = detectMime(bytes);
  if (!mimeAccepted(field, declaredContentType, inspectedMimeType)) {
    return {
      scanState: "quarantined",
      inspectedMimeType,
      quarantineReasonCode: "mime_mismatch",
      roleParserResult: null,
    };
  }

  const role = field.fileRole ?? field.key;
  if (mimeFamily(inspectedMimeType) === "json") {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      if (parsed === null || typeof parsed !== "object") throw new Error("top-level scalar");
      const shape = Array.isArray(parsed) ? "array" : "object";
      const keys = Array.isArray(parsed) ? [] : Object.keys(parsed as Record<string, unknown>).sort();
      return {
        scanState: "clean",
        inspectedMimeType: "application/json",
        quarantineReasonCode: null,
        roleParserResult: { role, parsed: true, shape, keys },
      };
    } catch {
      return {
        scanState: "quarantined",
        inspectedMimeType: "application/json",
        quarantineReasonCode: "role_parse_failed",
        roleParserResult: { role, parsed: false },
      };
    }
  }

  return {
    scanState: "clean",
    inspectedMimeType,
    quarantineReasonCode: null,
    roleParserResult: { role, parsed: true, shape: "binary" },
  };
}

export type ReservedUpload = {
  reservation: UploadReservation;
  draftId: string;
  draftUpdatedAt: Date;
  assessmentVersionId: string | null;
  grantId: string | null;
  version: number;
  attempt: number;
  upload: PresignedPut;
};

export async function reserveSubmissionUpload(args: {
  userId: string;
  assignmentId: string;
  draftId?: string;
  grantId?: string;
  fieldKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  now?: Date;
}): Promise<ReservedUpload> {
  const now = args.now ?? new Date();
  const bound = await ensureSubmissionDraft({
    userId: args.userId,
    assignmentId: args.assignmentId,
    draftId: args.draftId,
    grantId: args.grantId,
  });
  const field = bound.schema.fields.find((candidate) => candidate.key === args.fieldKey);
  if (!field) throw new UploadPolicyError(422, `Unknown upload field "${args.fieldKey}".`);
  validateUploadRequest(field, { contentType: args.contentType, sizeBytes: args.sizeBytes });

  const reservationId = randomUUID();
  const key = keyForReservedSubmission({
    ownerKind: bound.draft.ownerKind ?? "individual",
    ownerId: bound.draft.ownerId ?? args.userId,
    assignmentId: bound.draft.assignmentId,
    assessmentVersionId: bound.draft.assessmentVersionId,
    version: bound.draft.version,
    attempt: bound.draft.attempt,
    fieldKey: field.key,
    reservationId,
    filename: args.filename,
  });
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  const reservation = await prisma.$transaction(
    async (tx) => {
      const active = await tx.uploadReservation.aggregate({
        where: {
          ownerKind: bound.draft.ownerKind ?? "individual",
          ownerId: bound.draft.ownerId ?? args.userId,
          assignmentId: bound.draft.assignmentId,
          consumedAt: null,
          cancelledAt: null,
          expiresAt: { gt: now },
        },
        _count: { _all: true },
        _sum: { declaredBytes: true },
      });
      if (active._count._all >= MAX_ACTIVE_RESERVATIONS_PER_OWNER_ASSIGNMENT) {
        throw new UploadPolicyError(409, "Too many active upload reservations for this assignment.");
      }
      if (
        (active._sum.declaredBytes ?? 0) + args.sizeBytes >
        MAX_ACTIVE_RESERVED_BYTES_PER_OWNER_ASSIGNMENT
      ) {
        throw new UploadPolicyError(413, "The active upload byte quota for this assignment is exceeded.");
      }
      return tx.uploadReservation.create({
        data: {
          id: reservationId,
          submissionId: bound.draft.id,
          assignmentId: bound.draft.assignmentId,
          assessmentVersionId: bound.draft.assessmentVersionId,
          ownerKind: bound.draft.ownerKind ?? "individual",
          ownerId: bound.draft.ownerId ?? args.userId,
          createdById: args.userId,
          fieldKey: field.key,
          fileRole: field.fileRole ?? field.key,
          filename: args.filename,
          s3Key: key,
          declaredContentType: baseMime(args.contentType),
          declaredBytes: args.sizeBytes,
          expiresAt,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );

  try {
    const upload = await presignPut({
      key,
      contentType: reservation.declaredContentType,
      maxBytes: reservation.declaredBytes,
      oneTime: true,
    });
    return {
      reservation,
      draftId: bound.draft.id,
      draftUpdatedAt: bound.draft.updatedAt,
      assessmentVersionId: bound.draft.assessmentVersionId,
      grantId: bound.grantId,
      version: bound.draft.version,
      attempt: bound.draft.attempt,
      upload,
    };
  } catch (error) {
    await prisma.uploadReservation.updateMany({
      where: { id: reservation.id, consumedAt: null },
      data: { cancelledAt: new Date() },
    });
    throw error;
  }
}

export async function commitUploadReservation(args: {
  userId: string;
  reservationId: string;
  now?: Date;
}): Promise<SubmissionEvidence> {
  const now = args.now ?? new Date();
  const reservation = await prisma.uploadReservation.findUnique({
    where: { id: args.reservationId },
    include: { evidence: true, submission: { select: { status: true } } },
  });
  if (!reservation || reservation.createdById !== args.userId) {
    throw new UploadPolicyError(403, "Unknown upload reservation.");
  }
  if (reservation.evidence || reservation.consumedAt) {
    throw new UploadPolicyError(409, "This upload reservation has already been used.");
  }
  if (reservation.cancelledAt || reservation.expiresAt.getTime() <= now.getTime()) {
    throw new UploadPolicyError(409, "This upload reservation has expired.");
  }
  if (reservation.submission.status !== "draft") {
    throw new UploadPolicyError(409, "The bound draft is no longer editable.");
  }

  const bound = await getBoundDraftContext({ userId: args.userId, draftId: reservation.submissionId });
  const field = bound.schema.fields.find((candidate) => candidate.key === reservation.fieldKey);
  if (!field || (field.kind !== "file" && field.kind !== "files")) {
    throw new UploadPolicyError(422, "The reservation no longer matches its bound field role.");
  }
  validateUploadRequest(field, {
    contentType: reservation.declaredContentType,
    sizeBytes: reservation.declaredBytes,
  });

  const metadata = await headObject(reservation.s3Key);
  if (metadata.contentLength !== reservation.declaredBytes) {
    throw new UploadPolicyError(409, "Uploaded object length does not match the signed reservation.");
  }
  if (mimeFamily(metadata.contentType) !== mimeFamily(reservation.declaredContentType)) {
    throw new UploadPolicyError(409, "Uploaded object Content-Type does not match the reservation.");
  }
  const bytes = await readObjectVersion(
    reservation.s3Key,
    metadata.versionId,
    reservation.declaredBytes,
  );
  if (bytes.byteLength !== reservation.declaredBytes) {
    throw new UploadPolicyError(409, "Uploaded object length changed during verification.");
  }
  const inspection = inspectEvidenceBytes(field, reservation.declaredContentType, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.uploadReservation.updateMany({
      where: {
        id: reservation.id,
        consumedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now, s3VersionId: metadata.versionId },
    });
    if (consumed.count !== 1) {
      throw new UploadPolicyError(409, "This upload reservation has already been used.");
    }
    const replacesEvidenceId =
      inspection.scanState === "clean"
        ? await deriveReplacementEvidenceId(tx, {
            submissionId: reservation.submissionId,
            fieldKey: reservation.fieldKey,
            fileRole: reservation.fileRole,
          })
        : null;
    return tx.submissionEvidence.create({
      data: {
        submissionId: reservation.submissionId,
        reservationId: reservation.id,
        fieldKey: reservation.fieldKey,
        fileRole: reservation.fileRole,
        s3Key: reservation.s3Key,
        s3VersionId: metadata.versionId,
        etag: metadata.etag,
        sha256,
        byteCount: metadata.contentLength,
        declaredContentType: reservation.declaredContentType,
        inspectedMimeType: inspection.inspectedMimeType,
        ...(inspection.roleParserResult
          ? { roleParserResult: inspection.roleParserResult as Prisma.InputJsonValue }
          : {}),
        scanState: inspection.scanState,
        quarantineReasonCode: inspection.quarantineReasonCode,
        replacesEvidenceId,
      },
    });
  });
}

/** Lifecycle workers consume this bounded list and delete the exact S3 version. */
export async function listExpiredUploadReservations(limit = 100): Promise<UploadReservation[]> {
  return prisma.uploadReservation.findMany({
    where: { consumedAt: null, cancelledAt: null, expiresAt: { lte: new Date() } },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(limit, 500)),
  });
}
