import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";
import {
  DpdpErasureError,
  runDpdpErasure,
  type DpdpErasureCounts,
  type DpdpErasureInput,
  type DpdpErasurePersistence,
  type DpdpErasureResult,
  type DpdpPreparation,
} from "./dpdp-erasure";
import { deleteObjectVersion as deleteS3ObjectVersion } from "./s3";

export const DPDP_RECEIPT_GUC = "praxel.dpdp_deletion_receipt_id";
export const DPDP_WRITE_BARRIER_KEY = "731462985083870128";

const TOP_TARGET = "dpdp-user";
const OBJECT_TARGET = "dpdp-s3-object";
const ROW_TARGET = "dpdp-database-row";

type ReceiptPhase = "intent" | "database_cleanup" | "complete";

type ReceiptRow = {
  id: string;
  idempotencyKey: string;
  targetType: string;
  targetId: string;
  s3Key: string | null;
  s3VersionId: string | null;
  databaseTable: string | null;
  databaseRecordId: string | null;
  requestedBy: string;
  deletedAt: Date;
  s3VerifiedAt: Date | null;
  databaseVerifiedAt: Date | null;
  details: Prisma.JsonValue | null;
};

type LockedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clerkUserId: string | null;
  avatarUrl: string | null;
  flaggedForDeletion: boolean;
  createdAt: Date;
};

type ObjectAssociation = {
  databaseTable: string;
  databaseRecordId: string;
  submissionId: string | null;
  interviewId?: string | null;
};

type ObjectCandidate = {
  key: string;
  versionId: string;
  associations: ObjectAssociation[];
};

type RowOnlyAssociation = ObjectAssociation & {
  proofReceiptId: string;
};

type SubmissionPlan = {
  submissionId: string;
  action: "delete" | "reassign";
  teamId: string | null;
  survivorId: string | null;
  lastTeamMember: boolean;
};

const affectedSubmissionSelect = Prisma.validator<Prisma.SubmissionSelect>()({
  id: true,
  userId: true,
  teamId: true,
  assignmentId: true,
  assessmentVersionId: true,
  ownerKind: true,
  ownerId: true,
  status: true,
  submittedAt: true,
  fields: true,
  files: true,
  version: true,
  attempt: true,
  contentHash: true,
  evidence: {
    select: {
      id: true,
      reservationId: true,
      s3Key: true,
      s3VersionId: true,
      replacesEvidenceId: true,
    },
  },
  uploadReservations: {
    select: {
      id: true,
      s3Key: true,
      s3VersionId: true,
      cancelledAt: true,
    },
  },
  generatedObjectReservations: {
    select: { id: true, s3Key: true, s3VersionId: true, cancelledAt: true },
  },
  galleryItem: {
    select: { id: true, screenshotS3Key: true, screenshotS3VersionId: true },
  },
  publicationDecision: {
    select: { id: true, previewS3Key: true, previewS3VersionId: true },
  },
});

type AffectedSubmission = Prisma.SubmissionGetPayload<{
  select: typeof affectedSubmissionSelect;
}>;

const affectedInterviewSelect = Prisma.validator<Prisma.InterviewSelect>()({
  id: true,
  audioS3Key: true,
  audioS3VersionId: true,
  generatedObjectReservations: {
    select: { id: true, s3Key: true, s3VersionId: true, cancelledAt: true },
  },
  turns: {
    select: { id: true, audioS3Key: true, audioS3VersionId: true },
  },
});

type AffectedInterview = Prisma.InterviewGetPayload<{
  select: typeof affectedInterviewSelect;
}>;

const COUNT_KEYS = [
  "appeals",
  "gradeHolds",
  "publicationDecisions",
  "workflowSelections",
  "workflowNominations",
  "galleryItems",
  "votes",
  "assessmentResults",
  "resubmissionGrants",
  "evidence",
  "uploadReservations",
  "generatedObjectReservations",
  "grades",
  "submissions",
  "reassignedTeamSubmissions",
  "interviewTurns",
  "interviews",
  "interviewRetakes",
  "quizAttempts",
  "dataRaceResponses",
  "peerReviews",
  "portfolio",
  "notifications",
  "gateExceptions",
  "userVotes",
  "user",
] as const satisfies readonly (keyof DpdpErasureCounts)[];

function detailsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The durable erasure receipt is malformed",
    );
  }
  return value as Record<string, unknown>;
}

function json(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function receiptPhase(receipt: ReceiptRow): ReceiptPhase {
  const phase = detailsObject(receipt.details).phase;
  if (phase === "intent" || phase === "database_cleanup" || phase === "complete") {
    return phase;
  }
  throw new DpdpErasureError(
    "erasure-state-conflict",
    409,
    "The durable erasure receipt has an invalid phase",
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isCompletedZeroVersionProof(
  receipt: Pick<
    ReceiptRow,
    | "targetType"
    | "targetId"
    | "s3Key"
    | "s3VersionId"
    | "s3VerifiedAt"
    | "databaseVerifiedAt"
    | "details"
  >,
  reservation: {
    id: string;
    targetType?: "uncommitted-upload" | "uncommitted-generated-object";
    submissionId: string | null;
    interviewId?: string | null;
    s3Key: string;
    s3VersionId: string | null;
    cancelledAt: Date | null;
  },
): boolean {
  if (
    reservation.s3VersionId !== null ||
    reservation.cancelledAt === null ||
    receipt.targetType !== (reservation.targetType ?? "uncommitted-upload") ||
    receipt.targetId !== reservation.id ||
    receipt.s3Key !== reservation.s3Key ||
    receipt.s3VersionId !== null ||
    receipt.s3VerifiedAt === null ||
    receipt.databaseVerifiedAt === null ||
    !receipt.details ||
    typeof receipt.details !== "object" ||
    Array.isArray(receipt.details)
  ) {
    return false;
  }
  const details = receipt.details as Record<string, unknown>;
  return (
    details.phase === "complete" &&
    details.objectVersionCount === 0 &&
    details.databaseAction === "mark-cancelled" &&
    (reservation.submissionId
      ? details.submissionId === reservation.submissionId
      : details.interviewId === reservation.interviewId)
  );
}

function requiredDetailString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  if (typeof value !== "string" || !value) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      `The durable erasure receipt is missing ${key}`,
    );
  }
  return value;
}

function clerkUserId(details: Record<string, unknown>): string | null {
  return typeof details.clerkUserId === "string" && details.clerkUserId
    ? details.clerkUserId
    : null;
}

function completedCounts(details: Record<string, unknown>): DpdpErasureCounts {
  const candidate = details.deleted;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The completed erasure receipt has no deletion summary",
    );
  }
  const counts = candidate as Record<string, unknown>;
  for (const key of COUNT_KEYS) {
    if (!Number.isInteger(counts[key]) || (counts[key] as number) < 0) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The completed erasure receipt has an invalid deletion summary",
      );
    }
  }
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, counts[key]])) as DpdpErasureCounts;
}

function stableHash(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(`${part.length}:`).update(part);
  return hash.digest("hex");
}

function identityDigest(receiptId: string, value: string): string {
  const hash = createHash("sha256");
  for (const part of [receiptId, value]) {
    hash.update(`${Buffer.byteLength(part, "utf8")}:`).update(part);
  }
  return hash.digest("hex");
}

function confirmedEmailHash(receiptId: string, email: string): string {
  return identityDigest(receiptId, normalizeEmail(email));
}

function receiptConfirmsEmail(
  receiptId: string,
  details: Record<string, unknown>,
  confirmEmail: string,
): boolean {
  if (typeof details.confirmedEmail === "string") {
    return normalizeEmail(details.confirmedEmail) === normalizeEmail(confirmEmail);
  }
  return (
    typeof details.confirmedEmailHash === "string" &&
    details.confirmedEmailHash === confirmedEmailHash(receiptId, confirmEmail)
  );
}

function topIdempotencyKey(user: LockedUser): string {
  return `dpdp:user:${user.id}:${user.createdAt.getTime()}`;
}

function childIdempotencyKey(parentReceiptId: string, kind: string, identity: string): string {
  return `dpdp:${parentReceiptId}:${kind}:${stableHash(identity)}`;
}

function objectIdentity(key: string, versionId: string): string {
  return stableHash(key, versionId);
}

function associationIdentity(
  association: Pick<ObjectAssociation, "databaseTable" | "databaseRecordId">,
): string {
  return `${association.databaseTable}:${association.databaseRecordId}`;
}

function nativeHoldTargetsForAssociation(
  association: Pick<ObjectAssociation, "databaseTable" | "databaseRecordId">,
): { targetType: string; targetId: string }[] {
  const targets: { targetType: string; targetId: string }[] = [];
  if (association.databaseTable === "SubmissionEvidence") {
    targets.push({
      targetType: "submission-evidence-quarantined",
      targetId: association.databaseRecordId,
    });
  }
  if (association.databaseTable === "UploadReservation") {
    targets.push({
      targetType: "uncommitted-upload",
      targetId: association.databaseRecordId,
    });
  }
  if (association.databaseTable === "GeneratedObjectReservation") {
    targets.push({
      targetType: "uncommitted-generated-object",
      targetId: association.databaseRecordId,
    });
  }
  return targets;
}

function holdTargetsForAssociation(
  association: Pick<ObjectAssociation, "databaseTable" | "databaseRecordId">,
): { targetType: string; targetId: string }[] {
  return [
    { targetType: OBJECT_TARGET, targetId: associationIdentity(association) },
    ...nativeHoldTargetsForAssociation(association),
  ];
}

function associationRank(table: string): number {
  switch (table) {
    case "SubmissionEvidence":
      return 0;
    case "UploadReservation":
      return 1;
    case "GeneratedObjectReservation":
      return 2;
    case "Submission":
      return 3;
    case "GalleryItem":
      return 4;
    case "PublicationDecision":
      return 5;
    case "InterviewTurn":
      return 6;
    case "Interview":
      return 7;
    default:
      return 10;
  }
}

function sortAssociations(associations: ObjectAssociation[]): ObjectAssociation[] {
  return [...associations].sort(
    (left, right) =>
      associationRank(left.databaseTable) - associationRank(right.databaseTable) ||
      left.databaseTable.localeCompare(right.databaseTable) ||
      left.databaseRecordId.localeCompare(right.databaseRecordId),
  );
}

function addAssociation(candidate: ObjectCandidate, association: ObjectAssociation): void {
  const identity = associationIdentity(association);
  if (!candidate.associations.some((item) => associationIdentity(item) === identity)) {
    candidate.associations.push(association);
  }
}

async function lockReceipt(
  tx: Prisma.TransactionClient,
  receiptId: string,
): Promise<ReceiptRow | null> {
  const rows = await tx.$queryRaw<ReceiptRow[]>(Prisma.sql`
    SELECT
      "id", "idempotencyKey", "targetType", "targetId", "s3Key", "s3VersionId",
      "databaseTable", "databaseRecordId", "requestedBy", "deletedAt",
      "s3VerifiedAt", "databaseVerifiedAt", "details"
    FROM "DeletionReceipt"
    WHERE "id" = ${receiptId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<LockedUser | null> {
  const rows = await tx.$queryRaw<LockedUser[]>(Prisma.sql`
    SELECT
      "id", "email", "name", "role", "clerkUserId", "avatarUrl",
      "flaggedForDeletion", "createdAt"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function acquireDpdpExclusiveWriteBarrier(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Keep this literal in lockstep with acquire_dpdp_write_barrier() in the
  // sessions 3-5 migration. PostgreSQL advisory locks are transaction scoped,
  // so rollback cannot leave a process-wide lock behind.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(731462985083870128::BIGINT)
  `;
}

async function lockTeamsForUpdate(
  tx: Prisma.TransactionClient,
  teamIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(teamIds.filter(Boolean))].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "Team"
    WHERE "id" IN (${Prisma.join(ids)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

async function rejectPendingTeamErasurePlan(
  tx: Prisma.TransactionClient,
  userId: string,
  teamIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(teamIds.filter(Boolean))].sort();
  const teamConflict = ids.length === 0
    ? []
    : await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT receipt."id"
        FROM "DeletionReceipt" receipt
        WHERE receipt."targetType" = ${TOP_TARGET}
          AND receipt."targetId" <> ${userId}
          AND receipt."databaseVerifiedAt" IS NULL
          AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(receipt."details"->'teamReassignments') = 'array'
                    THEN receipt."details"->'teamReassignments'
                  ELSE '[]'::JSONB
                END
              ) reassignment
              WHERE reassignment->>'teamId' IN (${Prisma.join(ids)})
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(receipt."details"->'lastMemberTeamIds') = 'array'
                    THEN receipt."details"->'lastMemberTeamIds'
                  ELSE '[]'::JSONB
                END
              ) planned_team(value)
              WHERE planned_team.value IN (${Prisma.join(ids)})
            )
          )
        ORDER BY receipt."deletedAt", receipt."id"
        LIMIT 1
        FOR SHARE OF receipt
      `);
  const survivorConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT receipt."id"
    FROM "DeletionReceipt" receipt
    WHERE receipt."targetType" = ${TOP_TARGET}
      AND receipt."targetId" <> ${userId}
      AND receipt."databaseVerifiedAt" IS NULL
      AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(receipt."details"->'teamReassignments') = 'array'
              THEN receipt."details"->'teamReassignments'
            ELSE '[]'::JSONB
          END
        ) reassignment
        WHERE reassignment->>'survivorId' = ${userId}
      )
    ORDER BY receipt."deletedAt", receipt."id"
    LIMIT 1
    FOR SHARE OF receipt
  `);
  if (teamConflict.length > 0 || survivorConflict.length > 0) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "Another pending erasure owns this team membership plan; nothing was deleted",
    );
  }
}

async function acquireHoldLocks(
  tx: Prisma.TransactionClient,
  targets: { targetType: string; targetId: string }[],
): Promise<void> {
  const lockKeys = [
    ...new Set(
      targets.map(({ targetType, targetId }) =>
        `retention-hold:${targetType}:${targetId}`,
      ),
    ),
  ].sort();
  for (const lockKey of lockKeys) {
    // `$queryRaw` tries to deserialize PostgreSQL's `void` return and fails
    // with P2010. `$executeRaw` still executes the parameterized SELECT while
    // discarding that unsupported result type.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}

async function rejectActiveHolds(
  tx: Prisma.TransactionClient,
  targets: { targetType: string; targetId: string }[],
): Promise<void> {
  const unique = [
    ...new Map(
      targets.map((target) => [`${target.targetType}\0${target.targetId}`, target]),
    ).values(),
  ];
  const hold = await tx.retentionHold.findFirst({
    where: { releasedAt: null, OR: unique },
    select: { id: true },
  });
  if (hold) {
    throw new DpdpErasureError(
      "retention-hold-active",
      409,
      "An active retention hold blocks this erasure; nothing was deleted",
    );
  }
}

async function rejectOverlappingPendingIntents(
  tx: Prisma.TransactionClient,
  targets: { targetType: string; targetId: string }[],
): Promise<void> {
  const unique = [
    ...new Map(
      targets.map((target) => [`${target.targetType}\0${target.targetId}`, target]),
    ).values(),
  ];
  if (unique.length === 0) return;
  const clauses = unique.map((target) => Prisma.sql`
    (receipt."targetType" = ${target.targetType} AND receipt."targetId" = ${target.targetId})
  `);
  const conflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT receipt."id"
    FROM "DeletionReceipt" receipt
    WHERE receipt."databaseVerifiedAt" IS NULL
      AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
      AND (${Prisma.join(clauses, " OR ")})
    ORDER BY receipt."deletedAt", receipt."id"
    LIMIT 1
    FOR SHARE OF receipt
  `);
  if (conflict.length > 0) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "Another deletion executor already owns part of this erasure inventory; nothing was deleted",
    );
  }
}

function assertTopReceipt(receipt: ReceiptRow, userId: string, confirmEmail: string): void {
  const details = detailsObject(receipt.details);
  if (
    receipt.targetType !== TOP_TARGET ||
    receipt.targetId !== userId ||
    !receiptConfirmsEmail(receipt.id, details, confirmEmail)
  ) {
    throw new DpdpErasureError(
      "email-mismatch",
      400,
      "confirmEmail does not match the durable erasure identity",
    );
  }
}

async function objectReceipts(
  tx: Prisma.TransactionClient,
  parentReceiptId: string,
): Promise<ReceiptRow[]> {
  return tx.$queryRaw<ReceiptRow[]>(Prisma.sql`
    SELECT
      "id", "idempotencyKey", "targetType", "targetId", "s3Key", "s3VersionId",
      "databaseTable", "databaseRecordId", "requestedBy", "deletedAt",
      "s3VerifiedAt", "databaseVerifiedAt", "details"
    FROM "DeletionReceipt"
    WHERE "targetType" = ${OBJECT_TARGET}
      AND "details"->>'parentReceiptId' = ${parentReceiptId}
    ORDER BY "s3Key", "s3VersionId", "id"
  `);
}

async function childReceipts(
  tx: Prisma.TransactionClient,
  parentReceiptId: string,
): Promise<ReceiptRow[]> {
  return tx.$queryRaw<ReceiptRow[]>(Prisma.sql`
    SELECT
      "id", "idempotencyKey", "targetType", "targetId", "s3Key", "s3VersionId",
      "databaseTable", "databaseRecordId", "requestedBy", "deletedAt",
      "s3VerifiedAt", "databaseVerifiedAt", "details"
    FROM "DeletionReceipt"
    WHERE "details"->>'parentReceiptId' = ${parentReceiptId}
      AND "targetType" IN (${OBJECT_TARGET}, ${ROW_TARGET})
    ORDER BY "targetType", "targetId", "id"
  `);
}

async function preparationFromReceipt(
  tx: Prisma.TransactionClient,
  receipt: ReceiptRow,
  input: Required<DpdpErasureInput>,
): Promise<DpdpPreparation> {
  assertTopReceipt(receipt, input.userId, input.confirmEmail);
  const details = detailsObject(receipt.details);
  const phase = receiptPhase(receipt);
  if (phase === "complete") {
    if (!receipt.s3VerifiedAt || !receipt.databaseVerifiedAt) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The completed erasure receipt is missing verification timestamps",
      );
    }
    return {
      state: "completed",
      result: {
        receiptId: receipt.id,
        deleted: completedCounts(details),
        clerkUserId: clerkUserId(details),
        alreadyCompleted: true,
      },
    };
  }
  if (receipt.databaseVerifiedAt || (phase === "database_cleanup" && !receipt.s3VerifiedAt)) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The durable erasure receipt has contradictory verification state",
    );
  }

  const receipts = await objectReceipts(tx, receipt.id);
  const seen = new Set<string>();
  const objects = receipts.map((object) => {
    if (!object.s3Key || !object.s3VersionId) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "A persisted object intent is missing its exact immutable coordinates",
      );
    }
    const identity = objectIdentity(object.s3Key, object.s3VersionId);
    if (seen.has(identity)) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The persisted object inventory contains duplicate exact versions",
      );
    }
    seen.add(identity);
    return {
      receiptId: object.id,
      key: object.s3Key,
      versionId: object.s3VersionId,
      verifiedAt: object.s3VerifiedAt,
    };
  });
  return {
    state: "ready",
    parentReceiptId: receipt.id,
    phase,
    clerkUserId: clerkUserId(details),
    objects,
  };
}

function inventoryFor(
  submissions: AffectedSubmission[],
  interviews: AffectedInterview[],
  zeroVersionProofs: Map<string, string>,
): {
  objects: ObjectCandidate[];
  rowOnlyAssociations: RowOnlyAssociation[];
  missingVersionSources: string[];
} {
  const candidates = new Map<string, ObjectCandidate>();
  const byKey = new Map<string, ObjectCandidate[]>();
  const missingVersionSources: string[] = [];
  const rowOnlyAssociations: RowOnlyAssociation[] = [];
  const verifiedAbsentKeys = new Set<string>();
  const isGeneratedObjectMarker = (key: string | null): boolean =>
    key === "blocked" || Boolean(key?.startsWith("external-fingerprint:sha256:"));

  const exact = (key: string, versionId: string, association: ObjectAssociation) => {
    if (!key || !versionId) {
      missingVersionSources.push(associationIdentity(association));
      return;
    }
    const identity = objectIdentity(key, versionId);
    let candidate = candidates.get(identity);
    if (!candidate) {
      candidate = { key, versionId, associations: [] };
      candidates.set(identity, candidate);
      const keyCandidates = byKey.get(key) ?? [];
      keyCandidates.push(candidate);
      byKey.set(key, keyCandidates);
    }
    addAssociation(candidate, association);
  };

  const keyOnly = (key: string | null, association: ObjectAssociation) => {
    if (!key) return;
    const matches = byKey.get(key) ?? [];
    if (matches.length === 0) {
      if (verifiedAbsentKeys.has(key)) return;
      missingVersionSources.push(associationIdentity(association));
      return;
    }
    for (const match of matches) addAssociation(match, association);
  };

  // First collect exact coordinates across the whole deletion set. Key-only
  // references may point at evidence attached to a different submission, so
  // resolving them in this pass would make validity depend on row sort order.
  for (const submission of submissions) {
    for (const evidence of submission.evidence) {
      exact(evidence.s3Key, evidence.s3VersionId, {
        databaseTable: "SubmissionEvidence",
        databaseRecordId: evidence.id,
        submissionId: submission.id,
      });
    }
    for (const reservation of submission.uploadReservations) {
      const association = {
        databaseTable: "UploadReservation",
        databaseRecordId: reservation.id,
        submissionId: submission.id,
      };
      if (!reservation.s3VersionId) {
        const proofReceiptId = zeroVersionProofs.get(reservation.id);
        if (proofReceiptId) {
          rowOnlyAssociations.push({
            ...association,
            proofReceiptId,
          });
          verifiedAbsentKeys.add(reservation.s3Key);
          continue;
        }
      }
      exact(reservation.s3Key, reservation.s3VersionId ?? "", association);
    }
    for (const reservation of submission.generatedObjectReservations) {
      const association = {
        databaseTable: "GeneratedObjectReservation",
        databaseRecordId: reservation.id,
        submissionId: submission.id,
      };
      if (!reservation.s3VersionId) {
        const proofReceiptId = zeroVersionProofs.get(reservation.id);
        if (proofReceiptId) {
          rowOnlyAssociations.push({ ...association, proofReceiptId });
          verifiedAbsentKeys.add(reservation.s3Key);
          continue;
        }
      }
      exact(reservation.s3Key, reservation.s3VersionId ?? "", association);
    }
  }
  for (const interview of interviews) {
    for (const reservation of interview.generatedObjectReservations) {
      const association = {
        databaseTable: "GeneratedObjectReservation",
        databaseRecordId: reservation.id,
        submissionId: null,
        interviewId: interview.id,
      };
      if (!reservation.s3VersionId) {
        const proofReceiptId = zeroVersionProofs.get(reservation.id);
        if (proofReceiptId) {
          rowOnlyAssociations.push({ ...association, proofReceiptId });
          verifiedAbsentKeys.add(reservation.s3Key);
          continue;
        }
      }
      exact(reservation.s3Key, reservation.s3VersionId ?? "", association);
    }
  }

  // Then bind every legacy key-only reference to the exact coordinates found
  // anywhere in the graph, deduplicating a shared object version once.
  for (const submission of submissions) {
    const submissionAssociation = {
      databaseTable: "Submission",
      databaseRecordId: submission.id,
      submissionId: submission.id,
    };
    for (const key of submission.files) keyOnly(key, submissionAssociation);
    if (
      submission.galleryItem?.screenshotS3Key &&
      !isGeneratedObjectMarker(submission.galleryItem.screenshotS3Key)
    ) {
      exact(
        submission.galleryItem.screenshotS3Key,
        submission.galleryItem.screenshotS3VersionId ?? "",
        {
          databaseTable: "GalleryItem",
          databaseRecordId: submission.galleryItem.id,
          submissionId: submission.id,
        },
      );
    }
    if (
      submission.publicationDecision?.previewS3Key &&
      !isGeneratedObjectMarker(submission.publicationDecision.previewS3Key)
    ) {
      exact(
        submission.publicationDecision.previewS3Key,
        submission.publicationDecision.previewS3VersionId ?? "",
        {
          databaseTable: "PublicationDecision",
          databaseRecordId: submission.publicationDecision.id,
          submissionId: submission.id,
        },
      );
    }
  }
  for (const interview of interviews) {
    if (interview.audioS3Key) {
      exact(interview.audioS3Key, interview.audioS3VersionId ?? "", {
        databaseTable: "Interview",
        databaseRecordId: interview.id,
        submissionId: null,
        interviewId: interview.id,
      });
    }
    for (const turn of interview.turns) {
      if (!turn.audioS3Key) continue;
      exact(turn.audioS3Key, turn.audioS3VersionId ?? "", {
        databaseTable: "InterviewTurn",
        databaseRecordId: turn.id,
        submissionId: null,
        interviewId: interview.id,
      });
    }
  }

  return {
    objects: [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        associations: sortAssociations(candidate.associations),
      }))
      .sort(
        (left, right) =>
          left.key.localeCompare(right.key) || left.versionId.localeCompare(right.versionId),
      ),
    rowOnlyAssociations: rowOnlyAssociations.sort(
      (left, right) =>
        left.databaseTable.localeCompare(right.databaseTable) ||
        left.databaseRecordId.localeCompare(right.databaseRecordId),
    ),
    missingVersionSources: [...new Set(missingVersionSources)].sort(),
  };
}

async function submissionPlans(
  tx: Prisma.TransactionClient,
  submissions: AffectedSubmission[],
): Promise<SubmissionPlan[]> {
  const plans: SubmissionPlan[] = [];
  const survivorByTeam = new Map<string, string>();
  for (const submission of [...submissions].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!submission.teamId) {
      plans.push({
        submissionId: submission.id,
        action: "delete",
        teamId: null,
        survivorId: null,
        lastTeamMember: false,
      });
      continue;
    }
    let survivorId = survivorByTeam.get(submission.teamId);
    if (!survivorId) {
      const survivors = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT candidate."id"
        FROM "User" candidate
        WHERE candidate."teamId" = ${submission.teamId}
          AND candidate."id" <> ${submission.userId}
          AND NOT EXISTS (
            SELECT 1
            FROM "DeletionReceipt" receipt
            WHERE receipt."targetType" = ${TOP_TARGET}
              AND receipt."targetId" = candidate."id"
              AND receipt."databaseVerifiedAt" IS NULL
              AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
          )
        ORDER BY candidate."id"
        LIMIT 1
        FOR SHARE OF candidate
      `);
      const survivor = survivors[0] ?? null;
      if (!survivor) {
        plans.push({
          submissionId: submission.id,
          action: "delete",
          teamId: submission.teamId,
          survivorId: null,
          lastTeamMember: true,
        });
        continue;
      }
      survivorId = survivor.id;
      survivorByTeam.set(submission.teamId, survivorId);
    }
    plans.push({
      submissionId: submission.id,
      action: "reassign",
      teamId: submission.teamId,
      survivorId,
      lastTeamMember: false,
    });
  }
  return plans;
}

function holdTargets(
  userId: string,
  plans: SubmissionPlan[],
  objects: ObjectCandidate[],
  rowOnlyAssociations: RowOnlyAssociation[],
): { targetType: string; targetId: string }[] {
  return [
    { targetType: TOP_TARGET, targetId: userId },
    ...plans.map((plan) => ({ targetType: "submission", targetId: plan.submissionId })),
    ...objects.flatMap((object) =>
      object.associations.flatMap((association) => [
        ...holdTargetsForAssociation(association),
        ...(association.interviewId
          ? [{ targetType: "interview", targetId: association.interviewId }]
          : []),
      ]),
    ),
    ...rowOnlyAssociations.flatMap((association) => [
      { targetType: ROW_TARGET, targetId: associationIdentity(association) },
      ...nativeHoldTargetsForAssociation(association),
      ...(association.interviewId
        ? [{ targetType: "interview", targetId: association.interviewId }]
        : []),
    ]),
  ];
}

async function zeroVersionProofsFor(
  tx: Prisma.TransactionClient,
  submissions: AffectedSubmission[],
  interviews: AffectedInterview[],
): Promise<Map<string, string>> {
  const reservations = [
    ...submissions.flatMap((submission) => [
      ...submission.uploadReservations
        .filter((reservation) => reservation.s3VersionId === null)
        .map((reservation) => ({
          ...reservation,
          targetType: "uncommitted-upload" as const,
          submissionId: submission.id,
          interviewId: null,
        })),
      ...submission.generatedObjectReservations
        .filter((reservation) => reservation.s3VersionId === null)
        .map((reservation) => ({
          ...reservation,
          targetType: "uncommitted-generated-object" as const,
          submissionId: submission.id,
          interviewId: null,
        })),
    ]),
    ...interviews.flatMap((interview) =>
      interview.generatedObjectReservations
        .filter((reservation) => reservation.s3VersionId === null)
        .map((reservation) => ({
          ...reservation,
          targetType: "uncommitted-generated-object" as const,
          submissionId: null,
          interviewId: interview.id,
        })),
    ),
  ];
  if (reservations.length === 0) return new Map();

  const receipts = await tx.deletionReceipt.findMany({
    where: {
      targetType: {
        in: ["uncommitted-upload", "uncommitted-generated-object"],
      },
      targetId: { in: reservations.map((reservation) => reservation.id) },
      s3VersionId: null,
      s3VerifiedAt: { not: null },
      databaseVerifiedAt: { not: null },
    },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      s3Key: true,
      s3VersionId: true,
      s3VerifiedAt: true,
      databaseVerifiedAt: true,
      details: true,
    },
    orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
  });
  const proofs = new Map<string, string>();
  for (const reservation of reservations) {
    const proof = receipts.find((receipt) =>
      isCompletedZeroVersionProof(receipt, reservation),
    );
    if (proof) proofs.set(reservation.id, proof.id);
  }
  return proofs;
}

async function prepareNewIntent(
  tx: Prisma.TransactionClient,
  user: LockedUser,
  input: Required<DpdpErasureInput>,
): Promise<DpdpPreparation> {
  const submissions = await tx.submission.findMany({
    where: { userId: user.id },
    select: affectedSubmissionSelect,
    orderBy: { id: "asc" },
  });
  const affectedTeamIds = submissions.flatMap((submission) =>
    submission.teamId ? [submission.teamId] : [],
  );
  await lockTeamsForUpdate(tx, affectedTeamIds);
  await rejectPendingTeamErasurePlan(tx, user.id, affectedTeamIds);
  const plans = await submissionPlans(tx, submissions);
  const individualIds = new Set(
    plans.filter((plan) => plan.action === "delete").map((plan) => plan.submissionId),
  );
  const individualSubmissions = submissions.filter((submission) =>
    individualIds.has(submission.id),
  );
  const interviews = await tx.interview.findMany({
    where: { userId: user.id },
    select: affectedInterviewSelect,
    orderBy: { id: "asc" },
  });
  const zeroVersionProofs = await zeroVersionProofsFor(
    tx,
    individualSubmissions,
    interviews,
  );
  const inventory = inventoryFor(individualSubmissions, interviews, zeroVersionProofs);
  if (inventory.missingVersionSources.length > 0) {
    throw new DpdpErasureError(
      "object-version-missing",
      409,
      "At least one object lacks an immutable VersionId; nothing was deleted",
    );
  }

  const targets = holdTargets(
    user.id,
    plans,
    inventory.objects,
    inventory.rowOnlyAssociations,
  );
  await acquireHoldLocks(tx, targets);
  await rejectOverlappingPendingIntents(tx, targets);
  await rejectActiveHolds(tx, targets);

  const currentSubmissionIds = (
    await tx.submission.findMany({
      where: { userId: user.id },
      select: { id: true },
      orderBy: { id: "asc" },
    })
  ).map(({ id }) => id);
  if (
    currentSubmissionIds.length !== submissions.length ||
    currentSubmissionIds.some((id, index) => id !== submissions[index]?.id)
  ) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The user's submission graph changed while deletion intent was prepared",
    );
  }

  await tx.user.update({
    where: { id: user.id },
    data: { flaggedForDeletion: true },
  });

  const topReceiptId = randomUUID();
  const actorPseudonym = `dpdp-erased-actor:v1:${stableHash(topReceiptId, user.id)}`;
  const top = await tx.deletionReceipt.create({
    data: {
      id: topReceiptId,
      idempotencyKey: topIdempotencyKey(user),
      targetType: TOP_TARGET,
      targetId: user.id,
      requestedBy: input.requestedBy,
      deletedAt: input.now,
      s3VerifiedAt: null,
      databaseVerifiedAt: null,
      details: json({
        phase: "intent",
        confirmedEmail: normalizeEmail(user.email),
        email: user.email,
        name: user.name,
        clerkUserId: user.clerkUserId,
        avatarUrl: user.avatarUrl,
        userCreatedAt: user.createdAt.toISOString(),
        actorAttributionDisposition: "pseudonymized-no-explicit-retention-policy",
        actorPseudonym,
        submissionIds: plans.map((plan) => plan.submissionId),
        individualSubmissionIds: plans
          .filter((plan) => plan.action === "delete")
          .map((plan) => plan.submissionId),
        teamReassignments: plans
          .filter((plan) => plan.action === "reassign")
          .map((plan) => ({
            submissionId: plan.submissionId,
            teamId: plan.teamId,
            survivorId: plan.survivorId,
          })),
        lastMemberTeamIds: [
          ...new Set(
            plans.flatMap((plan) =>
              plan.lastTeamMember && plan.teamId ? [plan.teamId] : [],
            ),
          ),
        ].sort(),
      }),
    },
    select: { id: true },
  });

  for (const plan of plans) {
    await tx.deletionReceipt.create({
      data: {
        idempotencyKey: childIdempotencyKey(top.id, "submission", plan.submissionId),
        targetType: ROW_TARGET,
        targetId: `Submission:${plan.submissionId}`,
        databaseTable: "Submission",
        databaseRecordId: plan.submissionId,
        requestedBy: input.requestedBy,
        deletedAt: input.now,
        details: json({
          phase: "intent",
          parentReceiptId: top.id,
          submissionId: plan.submissionId,
          action: plan.action,
          teamId: plan.teamId,
          survivorId: plan.survivorId,
          lastTeamMember: plan.lastTeamMember,
        }),
      },
    });
  }

  for (const association of inventory.rowOnlyAssociations) {
    await tx.deletionReceipt.create({
      data: {
        idempotencyKey: childIdempotencyKey(
          top.id,
          "database-row",
          associationIdentity(association),
        ),
        targetType: ROW_TARGET,
        targetId: associationIdentity(association),
        databaseTable: association.databaseTable,
        databaseRecordId: association.databaseRecordId,
        requestedBy: input.requestedBy,
        deletedAt: input.now,
        s3VerifiedAt: null,
        databaseVerifiedAt: null,
        details: json({
          phase: "intent",
          parentReceiptId: top.id,
          submissionId: association.submissionId,
          interviewId: association.interviewId ?? null,
          action: "delete",
          proofReceiptId: association.proofReceiptId,
          associations: [
            {
              databaseTable: association.databaseTable,
              databaseRecordId: association.databaseRecordId,
            },
          ],
        }),
      },
    });
  }

  const objects = [] as Extract<DpdpPreparation, { state: "ready" }>["objects"];
  for (const object of inventory.objects) {
    const canonical = object.associations[0];
    if (!canonical) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "An exact object has no database association",
      );
    }
    const submissionIds = [
      ...new Set(
        object.associations
          .map((association) => association.submissionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].sort();
    const interviewIds = [
      ...new Set(
        object.associations
          .map((association) => association.interviewId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].sort();
    const receipt = await tx.deletionReceipt.create({
      data: {
        idempotencyKey: childIdempotencyKey(
          top.id,
          "object",
          objectIdentity(object.key, object.versionId),
        ),
        targetType: OBJECT_TARGET,
        targetId: associationIdentity(canonical),
        s3Key: object.key,
        s3VersionId: object.versionId,
        databaseTable: canonical.databaseTable,
        databaseRecordId: canonical.databaseRecordId,
        requestedBy: input.requestedBy,
        deletedAt: input.now,
        s3VerifiedAt: null,
        databaseVerifiedAt: null,
        details: json({
          phase: "intent",
          parentReceiptId: top.id,
          submissionId: submissionIds.length === 1 ? submissionIds[0] : null,
          submissionIds,
          interviewId: interviewIds.length === 1 ? interviewIds[0] : null,
          interviewIds,
          associations: object.associations.map(
            ({ databaseTable, databaseRecordId }) => ({ databaseTable, databaseRecordId }),
          ),
        }),
      },
      select: { id: true },
    });
    objects.push({
      receiptId: receipt.id,
      key: object.key,
      versionId: object.versionId,
      verifiedAt: null,
    });
  }

  return {
    state: "ready",
    parentReceiptId: top.id,
    phase: "intent",
    clerkUserId: user.clerkUserId,
    objects,
  };
}

async function prepare(
  db: PrismaClient,
  input: Required<DpdpErasureInput>,
): Promise<DpdpPreparation> {
  return db.$transaction(async (tx) => {
    await acquireDpdpExclusiveWriteBarrier(tx);
    const user = await lockUser(tx, input.userId);
    if (user) {
      if (user.role !== "student") {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "Only student records can be erased through the learner DPDP workflow",
        );
      }
      if (normalizeEmail(user.email) !== normalizeEmail(input.confirmEmail)) {
        throw new DpdpErasureError(
          "email-mismatch",
          400,
          "confirmEmail does not match the user's email; nothing was deleted",
        );
      }
      const existing = await tx.deletionReceipt.findUnique({
        where: { idempotencyKey: topIdempotencyKey(user) },
      });
      if (existing) {
        if (!user.flaggedForDeletion) {
          await tx.user.update({
            where: { id: user.id },
            data: { flaggedForDeletion: true },
          });
        }
        const locked = await lockReceipt(tx, existing.id);
        if (!locked) {
          throw new DpdpErasureError(
            "erasure-state-conflict",
            409,
            "The durable erasure receipt disappeared",
          );
        }
        if (receiptPhase(locked) === "complete") {
          throw new DpdpErasureError(
            "erasure-state-conflict",
            409,
            "A completed erasure receipt still has a live user row",
          );
        }
        return preparationFromReceipt(tx, locked, input);
      }
      if (user.flaggedForDeletion) {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "The user is deletion-fenced without a matching durable erasure receipt",
        );
      }
      return prepareNewIntent(tx, user, input);
    }

    const receipts = await tx.deletionReceipt.findMany({
      where: { targetType: TOP_TARGET, targetId: input.userId },
      select: { id: true, details: true },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    if (receipts.length === 0) {
      throw new DpdpErasureError("unknown-user", 404, "Unknown user");
    }
    const matching = receipts.find((receipt) => {
      try {
        return receiptConfirmsEmail(
          receipt.id,
          detailsObject(receipt.details),
          input.confirmEmail,
        );
      } catch {
        return false;
      }
    });
    if (!matching) {
      throw new DpdpErasureError(
        "email-mismatch",
        400,
        "confirmEmail does not match the durable erasure identity",
      );
    }
    const locked = await lockReceipt(tx, matching.id);
    if (!locked) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The durable erasure receipt disappeared",
      );
    }
    return preparationFromReceipt(tx, locked, input);
  });
}

function associationTargetsFromDetails(
  receipt: ReceiptRow,
): { targetType: string; targetId: string }[] {
  const details = detailsObject(receipt.details);
  const targets: { targetType: string; targetId: string }[] = [];
  if (typeof details.submissionId === "string" && details.submissionId) {
    targets.push({ targetType: "submission", targetId: details.submissionId });
  }
  if (typeof details.interviewId === "string" && details.interviewId) {
    targets.push({ targetType: "interview", targetId: details.interviewId });
  }
  if (Array.isArray(details.interviewIds)) {
    for (const interviewId of details.interviewIds) {
      if (typeof interviewId === "string" && interviewId) {
        targets.push({ targetType: "interview", targetId: interviewId });
      }
    }
  }
  if (
    receipt.targetType === ROW_TARGET &&
    receipt.databaseTable &&
    receipt.databaseRecordId
  ) {
    const association = {
      databaseTable: receipt.databaseTable,
      databaseRecordId: receipt.databaseRecordId,
    };
    targets.push(
      { targetType: ROW_TARGET, targetId: associationIdentity(association) },
      ...nativeHoldTargetsForAssociation(association),
    );
  }
  if (Array.isArray(details.associations)) {
    for (const association of details.associations) {
      if (!association || typeof association !== "object" || Array.isArray(association)) continue;
      const row = association as Record<string, unknown>;
      if (typeof row.databaseTable === "string" && typeof row.databaseRecordId === "string") {
        targets.push(
          ...holdTargetsForAssociation({
            databaseTable: row.databaseTable,
            databaseRecordId: row.databaseRecordId,
          }),
        );
      }
    }
  }
  return targets;
}

async function recordObjectVerified(
  db: PrismaClient,
  input: Parameters<DpdpErasurePersistence["recordObjectVerified"]>[0],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const parent = await lockReceipt(tx, input.parentReceiptId);
    const child = await lockReceipt(tx, input.receiptId);
    if (!parent || !child) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "A durable erasure receipt disappeared after object deletion",
      );
    }
    const childDetails = detailsObject(child.details);
    if (
      parent.targetType !== TOP_TARGET ||
      receiptPhase(parent) !== "intent" ||
      child.targetType !== OBJECT_TARGET ||
      childDetails.parentReceiptId !== parent.id ||
      child.s3Key !== input.key ||
      child.s3VersionId !== input.versionId ||
      child.databaseVerifiedAt
    ) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The object intent changed after exact-version deletion",
      );
    }
    if (child.s3VerifiedAt) return;
    await tx.deletionReceipt.update({
      where: { id: child.id },
      data: {
        s3VerifiedAt: input.verifiedAt,
        details: json({
          ...childDetails,
          providerReceipt: input.providerReceipt,
        }),
      },
    });
  });
}

async function authorizeDatabaseCleanup(
  db: PrismaClient,
  input: Parameters<DpdpErasurePersistence["authorizeDatabaseCleanup"]>[0],
): Promise<void> {
  await db.$transaction(async (tx) => {
    const parent = await lockReceipt(tx, input.parentReceiptId);
    if (!parent || parent.targetType !== TOP_TARGET || parent.databaseVerifiedAt) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The top-level erasure intent is unavailable for database cleanup",
      );
    }
    const phase = receiptPhase(parent);
    if (phase === "complete") return;
    if (phase === "database_cleanup") {
      if (!parent.s3VerifiedAt) {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "Database cleanup was authorized before S3 verification",
        );
      }
      return;
    }

    const children = await childReceipts(tx, parent.id);
    const objectChildren = children.filter((receipt) => receipt.targetType === OBJECT_TARGET);
    if (objectChildren.some((receipt) => !receipt.s3VerifiedAt || receipt.databaseVerifiedAt)) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "Not every exact object version is verified absent",
      );
    }
    const targets = [
      { targetType: TOP_TARGET, targetId: parent.targetId },
      ...children.flatMap(associationTargetsFromDetails),
    ];
    await acquireHoldLocks(tx, targets);
    await rejectActiveHolds(tx, targets);

    for (const child of children) {
      const details = detailsObject(child.details);
      if (receiptPhase(child) !== "intent") {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "A child erasure receipt has an invalid authorization phase",
        );
      }
      await tx.deletionReceipt.update({
        where: { id: child.id },
        data: { details: json({ ...details, phase: "database_cleanup" }) },
      });
    }
    const parentDetails = detailsObject(parent.details);
    await tx.deletionReceipt.update({
      where: { id: parent.id },
      data: {
        s3VerifiedAt: input.verifiedAt,
        details: json({ ...parentDetails, phase: "database_cleanup" }),
      },
    });
  });
}

function parseSubmissionPlans(receipts: ReceiptRow[]): SubmissionPlan[] {
  return receipts
    .filter(
      (receipt) =>
        receipt.targetType === ROW_TARGET && receipt.databaseTable === "Submission",
    )
    .map((receipt) => {
      const details = detailsObject(receipt.details);
      const action = details.action;
      const submissionId = requiredDetailString(details, "submissionId");
      if (action !== "delete" && action !== "reassign") {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "A submission erasure intent has an invalid action",
        );
      }
      const parsedAction: SubmissionPlan["action"] = action;
      const teamId = typeof details.teamId === "string" ? details.teamId : null;
      const survivorId = typeof details.survivorId === "string" ? details.survivorId : null;
      const lastTeamMember = details.lastTeamMember === true;
      if (
        receipt.targetId !== `Submission:${submissionId}` ||
        receipt.databaseRecordId !== submissionId ||
        (action === "delete" && survivorId !== null) ||
        (action === "delete" && (teamId !== null) !== lastTeamMember) ||
        (action === "reassign" && (!teamId || !survivorId || lastTeamMember))
      ) {
        throw new DpdpErasureError(
          "erasure-state-conflict",
          409,
          "A submission erasure intent is internally inconsistent",
        );
      }
      return { submissionId, action: parsedAction, teamId, survivorId, lastTeamMember };
    })
    .sort((left, right) => left.submissionId.localeCompare(right.submissionId));
}

async function deleteEvidenceInDependencyOrder(
  tx: Prisma.TransactionClient,
  submissionIds: string[],
): Promise<number> {
  const rows = await tx.submissionEvidence.findMany({
    where: { submissionId: { in: submissionIds } },
    select: { id: true, replacesEvidenceId: true },
  });
  const remaining = new Map(rows.map((row) => [row.id, row.replacesEvidenceId]));
  let deleted = 0;
  while (remaining.size > 0) {
    const referenced = new Set(
      [...remaining.values()].filter((id): id is string => Boolean(id && remaining.has(id))),
    );
    const leaves = [...remaining.keys()].filter((id) => !referenced.has(id)).sort();
    if (leaves.length === 0) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "Submission evidence replacement links contain a cycle",
      );
    }
    const result = await tx.submissionEvidence.deleteMany({ where: { id: { in: leaves } } });
    if (result.count !== leaves.length) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "Submission evidence changed during database cleanup",
      );
    }
    deleted += result.count;
    for (const id of leaves) remaining.delete(id);
  }
  return deleted;
}

type AuditIdentityCandidate = {
  id: string;
  actorId: string | null;
  targetId: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
};

function optionalDetailString(
  details: Record<string, unknown>,
  key: string,
): string | null {
  const value = details[key];
  return typeof value === "string" && value ? value : null;
}

function scrubIdentityString(
  value: string,
  embeddedIdentities: readonly string[],
  exactIdentities: ReadonlySet<string>,
  actorPseudonym: string,
): string {
  if (exactIdentities.has(value)) return actorPseudonym;
  let scrubbed = value;
  for (const identity of embeddedIdentities) {
    scrubbed = scrubbed.split(identity).join(actorPseudonym);
  }
  return scrubbed;
}

const AUDIT_NAME_SLOT_KEYS = new Set([
  "name",
  "fullname",
  "displayname",
  "username",
  "studentname",
  "learnername",
  "ownername",
  "actorname",
  "subjectname",
]);

function auditIdentityKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function scrubAuditJson(
  value: Prisma.JsonValue,
  embeddedIdentities: readonly string[],
  exactIdentities: ReadonlySet<string>,
  actorPseudonym: string,
  displayName: string | null,
  inNameSlot = false,
): Prisma.JsonValue {
  if (typeof value === "string") {
    const scrubbed = scrubIdentityString(
      value,
      embeddedIdentities,
      exactIdentities,
      actorPseudonym,
    );
    return inNameSlot && displayName
      ? scrubbed.split(displayName).join(actorPseudonym)
      : scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      scrubAuditJson(
        item,
        embeddedIdentities,
        exactIdentities,
        actorPseudonym,
        displayName,
        inNameSlot,
      ),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const scrubbedKey = scrubIdentityString(
          key,
          embeddedIdentities,
          exactIdentities,
          actorPseudonym,
        );
        const childNameSlot = AUDIT_NAME_SLOT_KEYS.has(auditIdentityKey(key));
        return [
          scrubbedKey,
          item === undefined
            ? null
            : scrubAuditJson(
                item,
                embeddedIdentities,
                exactIdentities,
                actorPseudonym,
                displayName,
                childNameSlot,
              ),
        ];
      }),
    );
  }
  return value;
}

async function pseudonymizeAuditIdentities(
  tx: Prisma.TransactionClient,
  input: {
    actorPseudonym: string;
    embeddedIdentities: readonly string[];
    exactIdentities: ReadonlySet<string>;
    scalarIdentities: ReadonlySet<string>;
    displayName: string | null;
  },
): Promise<void> {
  const scalarIdentities = [...input.scalarIdentities];
  const payloadText = Prisma.sql`COALESCE("before"::TEXT, '') || COALESCE("after"::TEXT, '')`;
  const jsonMatches = [
    ...input.embeddedIdentities.map(
      (identity) => Prisma.sql`POSITION(${identity} IN ${payloadText}) > 0`,
    ),
    ...[...input.exactIdentities]
      .filter((identity) => !input.embeddedIdentities.includes(identity))
      .map(
        (identity) =>
          Prisma.sql`POSITION(to_jsonb(CAST(${identity} AS TEXT))::TEXT IN ${payloadText}) > 0`,
      ),
    ...(input.displayName
      ? [
          Prisma.sql`(
            "audit_json_contains_tagged_name"("before", ${input.displayName})
            OR "audit_json_contains_tagged_name"("after", ${input.displayName})
          )`,
        ]
      : []),
  ];
  const rows = await tx.$queryRaw<AuditIdentityCandidate[]>(Prisma.sql`
    SELECT "id", "actorId", "targetId", "before", "after"
    FROM "AuditLog"
    WHERE "actorId" IN (${Prisma.join(scalarIdentities)})
      OR "targetId" IN (${Prisma.join(scalarIdentities)})
      OR (${Prisma.join(jsonMatches, " OR ")})
    ORDER BY "id"
    FOR UPDATE
  `);

  for (const row of rows) {
    const scrubbedBefore = row.before === null
      ? null
      : scrubAuditJson(
          row.before,
          input.embeddedIdentities,
          input.exactIdentities,
          input.actorPseudonym,
          input.displayName,
        );
    const scrubbedAfter = row.after === null
      ? null
      : scrubAuditJson(
          row.after,
          input.embeddedIdentities,
          input.exactIdentities,
          input.actorPseudonym,
          input.displayName,
        );
    await tx.auditLog.update({
      where: { id: row.id },
      data: {
        actorId:
          row.actorId !== null && input.scalarIdentities.has(row.actorId)
            ? input.actorPseudonym
            : row.actorId,
        targetId: input.scalarIdentities.has(row.targetId)
          ? input.actorPseudonym
          : row.targetId,
        ...(row.before === null
          ? {}
          : { before: scrubbedBefore as Prisma.InputJsonValue }),
        ...(row.after === null ? {} : { after: scrubbedAfter as Prisma.InputJsonValue }),
      },
    });
  }
}

async function pseudonymizeActorAttributions(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  actorPseudonym: string,
  parentDetails: Record<string, unknown>,
): Promise<void> {
  if (!/^dpdp-erased-actor:v1:[0-9a-f]{64}$/.test(actorPseudonym)) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The durable erasure receipt has an invalid actor pseudonym",
    );
  }

  // These updates are intentionally global. A teammate may have uploaded,
  // appealed, consented, or nominated work whose Submission.userId belongs to
  // somebody else, so submission-scoped cleanup would miss the attribution.
  await tx.uploadReservation.updateMany({
    where: { createdById: targetUserId },
    data: { createdById: actorPseudonym },
  });
  await tx.gradeAppeal.updateMany({
    where: { openedBy: targetUserId },
    data: { openedBy: actorPseudonym },
  });
  await tx.gradeHold.updateMany({
    where: { createdBy: targetUserId },
    data: { createdBy: actorPseudonym },
  });
  await tx.publicationDecision.updateMany({
    where: { ownerConsentBy: targetUserId },
    data: { ownerConsentBy: actorPseudonym },
  });
  await tx.teamWorkflowNomination.updateMany({
    where: { nominatedBy: targetUserId },
    data: { nominatedBy: actorPseudonym },
  });

  const embeddedIdentities = [
    targetUserId,
    requiredDetailString(parentDetails, "email"),
    optionalDetailString(parentDetails, "clerkUserId"),
    optionalDetailString(parentDetails, "avatarUrl"),
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const exactIdentities = new Set(embeddedIdentities);
  const scalarIdentities = new Set(embeddedIdentities);
  await pseudonymizeAuditIdentities(tx, {
    actorPseudonym,
    embeddedIdentities,
    exactIdentities,
    scalarIdentities,
    displayName: optionalDetailString(parentDetails, "name"),
  });
}

async function applyDatabaseCleanup(
  tx: Prisma.TransactionClient,
  parent: ReceiptRow,
  children: ReceiptRow[],
  completedAt: Date,
): Promise<DpdpErasureResult> {
  const parentDetails = detailsObject(parent.details);
  const targetUserId = parent.targetId;
  const plans = parseSubmissionPlans(children);
  const plannedIds = plans.map((plan) => plan.submissionId);
  const current = await tx.submission.findMany({
    where: { userId: targetUserId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (
    current.length !== plannedIds.length ||
    current.some(({ id }, index) => id !== plannedIds[index])
  ) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The user's submission graph changed after deletion intent",
    );
  }

  const individualIds = plans
    .filter((plan) => plan.action === "delete")
    .map((plan) => plan.submissionId);
  const interviewIds = (
    await tx.interview.findMany({
      where: { userId: targetUserId },
      select: { id: true },
      orderBy: { id: "asc" },
    })
  ).map(({ id }) => id);
  for (const plan of plans.filter((candidate) => candidate.lastTeamMember)) {
    const survivor = await tx.user.findFirst({
      where: { teamId: plan.teamId!, id: { not: targetUserId } },
      select: { id: true },
    });
    if (survivor) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "A same-team survivor appeared after a last-member deletion intent",
      );
    }
  }
  const teamPlans = plans.filter((plan) => plan.action === "reassign");
  for (const plan of teamPlans) {
    const survivor = await tx.user.findFirst({
      where: { id: plan.survivorId!, teamId: plan.teamId! },
      select: { id: true },
    });
    if (!survivor) {
      throw new DpdpErasureError(
        "team-survivor-missing",
        409,
        "A planned same-team survivor is no longer available",
      );
    }
  }

  const actorPseudonym = requiredDetailString(parentDetails, "actorPseudonym");
  await pseudonymizeActorAttributions(
    tx,
    targetUserId,
    actorPseudonym,
    parentDetails,
  );

  const userVotes = await tx.vote.deleteMany({ where: { voterId: targetUserId } });
  const appeals = await tx.gradeAppeal.deleteMany({
    where: { grade: { submissionId: { in: individualIds } } },
  });
  const gradeHolds = await tx.gradeHold.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const generatedObjectReservations = await tx.generatedObjectReservation.deleteMany({
    where: {
      OR: [
        { submissionId: { in: individualIds } },
        { interviewId: { in: interviewIds } },
      ],
    },
  });
  const publicationDecisions = await tx.publicationDecision.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const workflowSelections = await tx.teamWorkflowSelection.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const workflowNominations = await tx.teamWorkflowNomination.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const galleryItems = await tx.galleryItem.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const votes = await tx.vote.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const grades = await tx.grade.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  const assessmentResults = await tx.assessmentResult.deleteMany({
    where: { submissionId: { in: individualIds } },
  });
  // A revision draft points to its exact grant while the grant may also point
  // back to a source/consumed submission. Defer this one FK so both sides can
  // be removed atomically during the same verified erasure transaction.
  await tx.$executeRaw(
    Prisma.sql`SET CONSTRAINTS "Submission_resubmissionGrantId_fkey" DEFERRED`,
  );
  const resubmissionGrants = await tx.resubmissionGrant.deleteMany({
    where: {
      OR: [
        { ownerKind: "individual", ownerId: targetUserId },
        { consumedSubmissionId: { in: individualIds } },
        { sourceSubmissionId: { in: individualIds } },
      ],
    },
  });
  const evidence = await deleteEvidenceInDependencyOrder(tx, individualIds);
  const uploadReservations = await tx.uploadReservation.deleteMany({
    where: { submissionId: { in: individualIds } },
  });

  let reassignedTeamSubmissions = 0;
  for (const plan of teamPlans) {
    const updated = await tx.submission.updateMany({
      where: {
        id: plan.submissionId,
        userId: targetUserId,
        teamId: plan.teamId,
      },
      data: { userId: plan.survivorId! },
    });
    if (updated.count !== 1) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "A team submission changed before reassignment",
      );
    }
    reassignedTeamSubmissions += 1;
  }
  const submissions = await tx.submission.deleteMany({
    where: { id: { in: individualIds }, userId: targetUserId },
  });
  if (submissions.count !== individualIds.length) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "An individual submission changed before deletion",
    );
  }

  const interviewTurns = await tx.interviewTurn.deleteMany({
    where: { interview: { userId: targetUserId } },
  });
  const interviews = await tx.interview.deleteMany({ where: { userId: targetUserId } });
  const interviewRetakes = await tx.interviewRetake.deleteMany({
    where: { userId: targetUserId },
  });
  const quizAttempts = await tx.quizAttempt.deleteMany({ where: { userId: targetUserId } });
  const dataRaceResponses = await tx.dataRaceResponse.deleteMany({ where: { userId: targetUserId } });
  const peerReviews = await tx.peerReview.deleteMany({
    where: { OR: [{ reviewerId: targetUserId }, { revieweeId: targetUserId }] },
  });
  const portfolio = await tx.portfolioEntry.deleteMany({ where: { userId: targetUserId } });
  const notifications = await tx.notification.deleteMany({ where: { userId: targetUserId } });
  const gateExceptions = await tx.gateException.deleteMany({ where: { userId: targetUserId } });
  const user = await tx.user.deleteMany({ where: { id: targetUserId } });
  if (user.count !== 1) {
    throw new DpdpErasureError(
      "erasure-state-conflict",
      409,
      "The target user changed before deletion",
    );
  }

  const counts: DpdpErasureCounts = {
    appeals: appeals.count,
    gradeHolds: gradeHolds.count,
    publicationDecisions: publicationDecisions.count,
    workflowSelections: workflowSelections.count,
    workflowNominations: workflowNominations.count,
    galleryItems: galleryItems.count,
    votes: votes.count,
    assessmentResults: assessmentResults.count,
    resubmissionGrants: resubmissionGrants.count,
    evidence,
    uploadReservations: uploadReservations.count,
    generatedObjectReservations: generatedObjectReservations.count,
    grades: grades.count,
    submissions: submissions.count,
    reassignedTeamSubmissions,
    interviewTurns: interviewTurns.count,
    interviews: interviews.count,
    interviewRetakes: interviewRetakes.count,
    quizAttempts: quizAttempts.count,
    dataRaceResponses: dataRaceResponses.count,
    peerReviews: peerReviews.count,
    portfolio: portfolio.count,
    notifications: notifications.count,
    gateExceptions: gateExceptions.count,
    userVotes: userVotes.count,
    user: user.count,
  };

  await tx.auditLog.create({
    data: {
      actorId: parent.requestedBy,
      action: "dpdp-delete",
      targetType: "user",
      targetId: actorPseudonym,
      after: json({
        receiptId: parent.id,
        erasureDisposition: "pseudonymized-no-explicit-retention-policy",
        deleted: counts,
      }),
    },
  });

  for (const child of children) {
    const details = detailsObject(child.details);
    await tx.deletionReceipt.update({
      where: { id: child.id },
      data: {
        databaseVerifiedAt: completedAt,
        details: json({ ...details, phase: "complete" }),
      },
    });
  }
  await tx.deletionReceipt.update({
    where: { id: parent.id },
    data: {
      databaseVerifiedAt: completedAt,
      details: json({
        phase: "complete",
        confirmedEmailHash: confirmedEmailHash(
          parent.id,
          requiredDetailString(parentDetails, "confirmedEmail"),
        ),
        actorPseudonym,
        actorAttributionDisposition: "pseudonymized-minimal-receipt",
        identityDigests: [
          targetUserId,
          requiredDetailString(parentDetails, "email"),
          optionalDetailString(parentDetails, "clerkUserId"),
          optionalDetailString(parentDetails, "name"),
          optionalDetailString(parentDetails, "avatarUrl"),
        ]
          .filter((value): value is string => Boolean(value))
          .filter((value, index, values) => values.indexOf(value) === index)
          .map((value) => identityDigest(parent.id, value))
          .sort(),
        deleted: counts,
      }),
    },
  });

  return {
    receiptId: parent.id,
    deleted: counts,
    clerkUserId: clerkUserId(parentDetails),
    alreadyCompleted: false,
  };
}

async function cleanupDatabase(
  db: PrismaClient,
  input: Parameters<DpdpErasurePersistence["cleanupDatabase"]>[0],
): Promise<DpdpErasureResult> {
  return db.$transaction(async (tx) => {
    await acquireDpdpExclusiveWriteBarrier(tx);
    const identity = await tx.deletionReceipt.findUnique({
      where: { id: input.parentReceiptId },
      select: { targetType: true, targetId: true },
    });
    if (!identity || identity.targetType !== TOP_TARGET) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The top-level erasure receipt is missing",
      );
    }
    const lockedUser = await lockUser(tx, identity.targetId);
    const plannedChildren = await childReceipts(tx, input.parentReceiptId);
    const plannedTeams = parseSubmissionPlans(plannedChildren).flatMap((plan) =>
      plan.teamId ? [plan.teamId] : [],
    );
    await lockTeamsForUpdate(tx, plannedTeams);

    const parent = await lockReceipt(tx, input.parentReceiptId);
    if (
      !parent ||
      parent.targetType !== TOP_TARGET ||
      parent.targetId !== identity.targetId
    ) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The top-level erasure receipt is missing",
      );
    }
    const phase = receiptPhase(parent);
    if (phase === "complete") {
      const details = detailsObject(parent.details);
      return {
        receiptId: parent.id,
        deleted: completedCounts(details),
        clerkUserId: clerkUserId(details),
        alreadyCompleted: true,
      };
    }
    if (!lockedUser || !lockedUser.flaggedForDeletion) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "The target user is not durably fenced for database cleanup",
      );
    }
    if (phase !== "database_cleanup" || !parent.s3VerifiedAt || parent.databaseVerifiedAt) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "Database cleanup is not authorized by a verified erasure receipt",
      );
    }

    const children = await childReceipts(tx, parent.id);
    if (
      children.some(
        (child) =>
          receiptPhase(child) !== "database_cleanup" || child.databaseVerifiedAt !== null,
      ) ||
      children.some(
        (child) => child.targetType === OBJECT_TARGET && child.s3VerifiedAt === null,
      )
    ) {
      throw new DpdpErasureError(
        "erasure-state-conflict",
        409,
        "Child erasure receipts do not authorize database cleanup",
      );
    }

    const targets = [
      { targetType: TOP_TARGET, targetId: parent.targetId },
      ...children.flatMap(associationTargetsFromDetails),
    ];
    await acquireHoldLocks(tx, targets);
    await rejectActiveHolds(tx, targets);
    await tx.$queryRaw(
      Prisma.sql`SELECT set_config(${DPDP_RECEIPT_GUC}, ${parent.id}, true)`,
    );
    return applyDatabaseCleanup(tx, parent, children, input.completedAt);
  });
}

export function prismaDpdpErasurePersistence(
  db: PrismaClient = defaultPrisma,
): DpdpErasurePersistence {
  return {
    prepare: (input) => prepare(db, input),
    recordObjectVerified: (input) => recordObjectVerified(db, input),
    authorizeDatabaseCleanup: (input) => authorizeDatabaseCleanup(db, input),
    cleanupDatabase: (input) => cleanupDatabase(db, input),
  };
}

export async function eraseDpdpUser(
  input: DpdpErasureInput,
  options: {
    db?: PrismaClient;
    deleteObjectVersion?: (
      key: string,
      versionId: string,
    ) => Promise<{ verified: boolean; providerReceipt?: string | null }>;
    beforeDatabaseCleanup?: (input: {
      parentReceiptId: string;
      clerkUserId: string;
    }) => Promise<void>;
  } = {},
): Promise<DpdpErasureResult> {
  return runDpdpErasure(input, {
    persistence: prismaDpdpErasurePersistence(options.db),
    deleteObjectVersion: options.deleteObjectVersion ?? deleteS3ObjectVersion,
    beforeDatabaseCleanup: options.beforeDatabaseCleanup,
  });
}
