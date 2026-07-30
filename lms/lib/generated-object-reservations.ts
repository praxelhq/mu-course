import { randomUUID } from "node:crypto";
import type {
  GeneratedObjectPurpose,
  GeneratedObjectReservation,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  deleteObjectVersion,
  headObject,
  presignPut,
  putObject,
  type PresignedPut,
  type PutObjectReceipt,
  type StoredObjectMetadata,
} from "@/lib/s3";

export const GENERATED_OBJECT_RESERVATION_TTL_MS = 30 * 60_000;

export class GeneratedObjectReservationError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(status: GeneratedObjectReservationError["status"], message: string) {
    super(message);
    this.name = "GeneratedObjectReservationError";
    this.status = status;
  }
}

export type GeneratedObjectReservationInput = {
  id?: string;
  purpose: GeneratedObjectPurpose;
  submissionId?: string | null;
  interviewId?: string | null;
  targetId?: string | null;
  s3Key: string | ((reservationId: string) => string);
  declaredContentType?: string | null;
  declaredBytes?: number | null;
  expiresAt?: Date;
};

export type GeneratedObjectExpectedCoordinates = {
  purpose: GeneratedObjectPurpose;
  submissionId?: string | null;
  interviewId?: string | null;
  targetId?: string | null;
  s3Key?: string;
  s3VersionId?: string;
};

type ReservationState = Pick<
  GeneratedObjectReservation,
  | "id"
  | "purpose"
  | "submissionId"
  | "interviewId"
  | "targetId"
  | "s3Key"
  | "declaredContentType"
  | "declaredBytes"
  | "s3VersionId"
  | "expiresAt"
  | "consumedAt"
  | "cancelledAt"
>;

export type GeneratedObjectReservationDeps = {
  now?: () => Date;
  createReservation?: (
    input: Required<Pick<GeneratedObjectReservationInput, "id" | "purpose">> & {
      submissionId: string | null;
      interviewId: string | null;
      targetId: string | null;
      s3Key: string;
      declaredContentType: string | null;
      declaredBytes: number | null;
      expiresAt: Date;
    },
  ) => Promise<GeneratedObjectReservation>;
  findReservation?: (id: string) => Promise<ReservationState | null>;
  persistVersion?: (id: string, versionId: string) => Promise<GeneratedObjectReservation>;
  consumeReservation?: <T>(
    args: {
      reservation: ReservationState;
      expected: GeneratedObjectExpectedCoordinates;
      now: Date;
    },
    attach: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
  cancelReservation?: (id: string, now: Date, versionId?: string) => Promise<boolean>;
  put?: typeof putObject;
  head?: typeof headObject;
  presign?: typeof presignPut;
  deleteVersion?: typeof deleteObjectVersion;
};

function nowOf(deps: GeneratedObjectReservationDeps): Date {
  return deps.now?.() ?? new Date();
}

function baseMime(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function validateReservationInput(input: GeneratedObjectReservationInput): void {
  const hasSubmission = Boolean(input.submissionId);
  const hasInterview = Boolean(input.interviewId);
  if (hasSubmission === hasInterview) {
    throw new GeneratedObjectReservationError(400, "Exactly one generated-object parent is required.");
  }
  const submissionPurpose =
    input.purpose === "gallery_screenshot" || input.purpose === "publication_preview";
  if (submissionPurpose !== hasSubmission) {
    throw new GeneratedObjectReservationError(400, "Generated-object purpose does not match its parent.");
  }
  if (
    input.declaredBytes !== undefined &&
    input.declaredBytes !== null &&
    (!Number.isInteger(input.declaredBytes) || input.declaredBytes <= 0)
  ) {
    throw new GeneratedObjectReservationError(400, "Declared generated-object bytes must be positive.");
  }
}

function assertExpectedCoordinates(
  reservation: ReservationState,
  expected: GeneratedObjectExpectedCoordinates,
): void {
  const mismatch =
    reservation.purpose !== expected.purpose ||
    reservation.submissionId !== (expected.submissionId ?? null) ||
    reservation.interviewId !== (expected.interviewId ?? null) ||
    (expected.targetId !== undefined && reservation.targetId !== expected.targetId) ||
    (expected.s3Key !== undefined && reservation.s3Key !== expected.s3Key) ||
    (expected.s3VersionId !== undefined && reservation.s3VersionId !== expected.s3VersionId);
  if (mismatch) {
    throw new GeneratedObjectReservationError(404, "Generated-object reservation not found.");
  }
}

async function defaultCreateReservation(
  input: Parameters<NonNullable<GeneratedObjectReservationDeps["createReservation"]>>[0],
): Promise<GeneratedObjectReservation> {
  return prisma.generatedObjectReservation.create({ data: input });
}

async function defaultFindReservation(id: string): Promise<ReservationState | null> {
  return prisma.generatedObjectReservation.findUnique({ where: { id } });
}

async function defaultPersistVersion(
  id: string,
  versionId: string,
): Promise<GeneratedObjectReservation> {
  const updated = await prisma.generatedObjectReservation.updateMany({
    where: {
      id,
      s3VersionId: null,
      consumedAt: null,
      cancelledAt: null,
    },
    data: { s3VersionId: versionId },
  });
  const reservation = await prisma.generatedObjectReservation.findUnique({ where: { id } });
  if (!reservation || reservation.cancelledAt || reservation.consumedAt) {
    throw new GeneratedObjectReservationError(409, "Generated-object reservation is no longer active.");
  }
  if (updated.count !== 1 && reservation.s3VersionId !== versionId) {
    throw new GeneratedObjectReservationError(409, "Generated-object VersionId does not match its reservation.");
  }
  return reservation;
}

async function defaultConsumeReservation<T>(
  args: {
    reservation: ReservationState;
    expected: GeneratedObjectExpectedCoordinates;
    now: Date;
  },
  attach: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.generatedObjectReservation.findUnique({
      where: { id: args.reservation.id },
    });
    if (!current) {
      throw new GeneratedObjectReservationError(404, "Generated-object reservation not found.");
    }
    assertExpectedCoordinates(current, args.expected);
    const consumed = await tx.generatedObjectReservation.updateMany({
      where: {
        id: current.id,
        s3VersionId: args.expected.s3VersionId,
        consumedAt: null,
        cancelledAt: null,
        expiresAt: { gt: args.now },
      },
      data: { consumedAt: args.now },
    });
    if (consumed.count !== 1) {
      throw new GeneratedObjectReservationError(409, "Generated-object reservation is no longer active.");
    }
    return attach(tx);
  });
}

async function defaultCancelReservation(
  id: string,
  now: Date,
  versionId?: string,
): Promise<boolean> {
  const current = await prisma.generatedObjectReservation.findUnique({ where: { id } });
  if (!current || current.consumedAt) return false;
  if (current.cancelledAt) return true;
  if (versionId && current.s3VersionId && current.s3VersionId !== versionId) return false;
  const cancelled = await prisma.generatedObjectReservation.updateMany({
    where: { id, consumedAt: null, cancelledAt: null },
    data: {
      cancelledAt: now,
      ...(versionId && !current.s3VersionId ? { s3VersionId: versionId } : {}),
    },
  });
  return cancelled.count === 1;
}

export async function reserveGeneratedObject(
  input: GeneratedObjectReservationInput,
  deps: GeneratedObjectReservationDeps = {},
): Promise<GeneratedObjectReservation> {
  validateReservationInput(input);
  const now = nowOf(deps);
  const id = input.id ?? randomUUID();
  const s3Key = typeof input.s3Key === "function" ? input.s3Key(id) : input.s3Key;
  const create = deps.createReservation ?? defaultCreateReservation;
  return create({
    id,
    purpose: input.purpose,
    submissionId: input.submissionId ?? null,
    interviewId: input.interviewId ?? null,
    targetId: input.targetId ?? null,
    s3Key,
    declaredContentType: input.declaredContentType
      ? baseMime(input.declaredContentType)
      : null,
    declaredBytes: input.declaredBytes ?? null,
    expiresAt:
      input.expiresAt ?? new Date(now.getTime() + GENERATED_OBJECT_RESERVATION_TTL_MS),
  });
}

export async function persistGeneratedObjectVersion(
  reservationId: string,
  versionId: string,
  deps: GeneratedObjectReservationDeps = {},
): Promise<GeneratedObjectReservation> {
  const exactVersionId = versionId.trim();
  if (!exactVersionId) {
    throw new GeneratedObjectReservationError(409, "Generated object is missing an exact VersionId.");
  }
  return (deps.persistVersion ?? defaultPersistVersion)(reservationId, exactVersionId);
}

export async function consumeGeneratedObjectReservation<T>(
  args: {
    reservation: ReservationState;
    expected: GeneratedObjectExpectedCoordinates;
    attach: (tx: Prisma.TransactionClient) => Promise<T>;
    now?: Date;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<T> {
  assertExpectedCoordinates(args.reservation, args.expected);
  return (deps.consumeReservation ?? defaultConsumeReservation)(
    {
      reservation: args.reservation,
      expected: args.expected,
      now: args.now ?? nowOf(deps),
    },
    args.attach,
  );
}

export type GeneratedObjectCompensation = {
  attempted: boolean;
  verified: boolean;
  cancelled: boolean;
};

/** Delete only when the durable reservation proves the target was not attached. */
export async function compensateGeneratedObjectVersion(
  reservationId: string,
  receipt: PutObjectReceipt,
  deps: GeneratedObjectReservationDeps = {},
): Promise<GeneratedObjectCompensation> {
  const find = deps.findReservation ?? defaultFindReservation;
  let current: ReservationState | null;
  try {
    current = await find(reservationId);
  } catch {
    // An unavailable database makes commit state ambiguous. Preserve the
    // object; the durable pre-PUT reservation lets retention reconcile it.
    return { attempted: false, verified: false, cancelled: false };
  }
  if (!current || current.consumedAt) {
    return { attempted: false, verified: false, cancelled: false };
  }

  const deleted = await (deps.deleteVersion ?? deleteObjectVersion)(
    current.s3Key,
    receipt.versionId,
  );
  if (!deleted.verified) return { attempted: true, verified: false, cancelled: false };
  let cancelled = false;
  try {
    cancelled = await (deps.cancelReservation ?? defaultCancelReservation)(
      reservationId,
      nowOf(deps),
      receipt.versionId,
    );
  } catch {
    // Exact deletion is already verified; leaving the reservation visible is
    // safer than hiding a cleanup-state race from the erasure inventory.
  }
  return { attempted: true, verified: true, cancelled };
}

export async function writeGeneratedObject<T>(
  args: {
    reservation: GeneratedObjectReservationInput;
    body: Uint8Array;
    contentType: string;
    attach: (tx: Prisma.TransactionClient, coordinates: {
      reservationId: string;
      s3Key: string;
      s3VersionId: string;
    }) => Promise<T>;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{ value: T; reservation: GeneratedObjectReservation; receipt: PutObjectReceipt }> {
  const reservation = await reserveGeneratedObject(args.reservation, deps);
  let receipt: PutObjectReceipt | null = null;
  try {
    receipt = await (deps.put ?? putObject)(reservation.s3Key, args.body, args.contentType);
    const versioned = await persistGeneratedObjectVersion(reservation.id, receipt.versionId, deps);
    const expected: GeneratedObjectExpectedCoordinates = {
      purpose: versioned.purpose,
      submissionId: versioned.submissionId,
      interviewId: versioned.interviewId,
      targetId: versioned.targetId,
      s3Key: versioned.s3Key,
      s3VersionId: receipt.versionId,
    };
    const value = await consumeGeneratedObjectReservation(
      {
        reservation: versioned,
        expected,
        attach: (tx) =>
          args.attach(tx, {
            reservationId: versioned.id,
            s3Key: versioned.s3Key,
            s3VersionId: receipt!.versionId,
          }),
      },
      deps,
    );
    return { value, reservation: versioned, receipt };
  } catch (error) {
    if (receipt) {
      try {
        await compensateGeneratedObjectVersion(reservation.id, receipt, deps);
      } catch {
        // Preserve the original write/attach failure. The durable reservation
        // retains the exact VersionId for DPDP or retention retry.
      }
    }
    throw error;
  }
}

export async function reserveGeneratedObjectUpload(
  input: GeneratedObjectReservationInput & {
    declaredContentType: string;
    declaredBytes: number;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{ reservation: GeneratedObjectReservation; upload: PresignedPut }> {
  const reservation = await reserveGeneratedObject(input, deps);
  try {
    const upload = await (deps.presign ?? presignPut)({
      key: reservation.s3Key,
      contentType: reservation.declaredContentType!,
      maxBytes: reservation.declaredBytes!,
      oneTime: true,
    });
    return { reservation, upload };
  } catch (error) {
    await (deps.cancelReservation ?? defaultCancelReservation)(
      reservation.id,
      nowOf(deps),
    ).catch(() => false);
    throw error;
  }
}

/** HEAD and persist the exact immutable version before any browser-upload attach. */
export async function inspectGeneratedObjectUpload(
  args: {
    reservationId: string;
    expected: Omit<GeneratedObjectExpectedCoordinates, "s3VersionId">;
    now?: Date;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{ reservation: GeneratedObjectReservation; metadata: StoredObjectMetadata }> {
  const find = deps.findReservation ?? defaultFindReservation;
  const reservation = await find(args.reservationId);
  if (!reservation) {
    throw new GeneratedObjectReservationError(404, "Generated-object reservation not found.");
  }
  assertExpectedCoordinates(reservation, args.expected);
  const now = args.now ?? nowOf(deps);
  if (reservation.cancelledAt || reservation.consumedAt || reservation.expiresAt <= now) {
    throw new GeneratedObjectReservationError(409, "Generated-object reservation is no longer active.");
  }
  const metadata = await (deps.head ?? headObject)(reservation.s3Key);
  if (
    reservation.declaredBytes !== null &&
    metadata.contentLength !== reservation.declaredBytes
  ) {
    throw new GeneratedObjectReservationError(409, "Uploaded object length does not match its reservation.");
  }
  if (
    reservation.declaredContentType &&
    baseMime(metadata.contentType) !== baseMime(reservation.declaredContentType)
  ) {
    throw new GeneratedObjectReservationError(409, "Uploaded object Content-Type does not match its reservation.");
  }
  const versioned = await persistGeneratedObjectVersion(
    reservation.id,
    metadata.versionId,
    deps,
  );
  return { reservation: versioned, metadata };
}
