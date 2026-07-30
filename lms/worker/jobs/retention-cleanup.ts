import { EvidenceScanState, Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/db";
import {
  runEvidenceRetentionCleanup,
  type EvidenceDeletionCommit,
  type EvidenceRetentionCandidate,
  type EvidenceRetentionDeps,
  type EvidenceRetentionResult,
} from "../../lib/evidence/retention";
import {
  deleteObjectVersion as deleteS3ObjectVersion,
  listObjectVersionIds as listS3ObjectVersionIds,
} from "../../lib/s3";

export type RetentionPersistentCandidate = Omit<
  EvidenceRetentionCandidate,
  "idempotencyKey" | "s3VersionId"
> & {
  s3VersionId: string | null;
};

export type RetentionPersistence = {
  listCandidates(now: Date, limit: number): Promise<RetentionPersistentCandidate[]>;
  /** Persist an exact reservation VersionId before any non-transactional S3 delete. */
  persistUploadVersion(input: {
    targetId: string;
    s3Key: string;
    versionId: string;
    targetType?: "uncommitted-upload" | "uncommitted-generated-object";
  }): Promise<boolean>;
  /**
   * Serialize legal holds and create a durable deletion intent before the
   * non-transactional object-store operation begins.
   */
  prepareDeletion(candidate: EvidenceRetentionCandidate): Promise<"ready" | "held">;
  /** True only for a receipt whose S3 and database verification both completed. */
  hasDeletionReceipt(idempotencyKey: string): Promise<boolean>;
  commitDeletion(input: EvidenceDeletionCommit): Promise<void>;
};

type RetentionObjectStore = {
  listObjectVersionIds(key: string): Promise<string[]>;
  deleteObjectVersion(
    key: string,
    versionId: string,
  ): Promise<{ verified: boolean; providerReceipt?: string | null }>;
};

/** Internal marker for a reservation whose exact key was listed with zero versions. */
export const VERIFIED_ABSENT_VERSION = "__verified_absent__";

function persistedVersionId(versionId: string): string | null {
  return versionId === VERIFIED_ABSENT_VERSION ? null : versionId;
}

function idempotencyKey(candidate: RetentionPersistentCandidate, versionId: string): string {
  const versionKey =
    versionId === VERIFIED_ABSENT_VERSION ? "absent" : versionId || "unresolved";
  return ["retention", candidate.targetType, candidate.targetId, versionKey].join(":");
}

/** Bind pure retention policy to durable DB state and exact S3 versions. */
export function createProductionEvidenceRetentionDeps(input: {
  persistence: RetentionPersistence;
  objects: RetentionObjectStore;
}): EvidenceRetentionDeps {
  return {
    listCandidates: async (now, limit) => {
      const persistent = (await input.persistence.listCandidates(now, limit)).slice(0, limit);
      const candidates: EvidenceRetentionCandidate[] = [];
      for (const row of persistent) {
        let versionId = row.s3VersionId ?? "";
        if (
          (row.targetType === "uncommitted-upload" ||
            row.targetType === "uncommitted-generated-object") &&
          !versionId
        ) {
          // A reservation key can be PUT more than once before expiration. Do
          // not guess which version is authoritative: only one exact version
          // may be resolved automatically, and it is persisted before delete.
          const versions = await input.objects.listObjectVersionIds(row.s3Key);
          if (versions.length === 0) {
            versionId = VERIFIED_ABSENT_VERSION;
          }
          if (versions.length === 1) {
            const resolved = versions[0];
            const persisted = await input.persistence.persistUploadVersion({
              targetId: row.targetId,
              s3Key: row.s3Key,
              versionId: resolved,
              ...(row.targetType === "uncommitted-generated-object"
                ? { targetType: "uncommitted-generated-object" as const }
                : {}),
            });
            if (persisted) versionId = resolved;
          }
        }
        candidates.push({
          ...row,
          s3VersionId: versionId,
          idempotencyKey: idempotencyKey(row, versionId),
        });
      }
      return candidates.slice(0, limit);
    },
    hasActiveLegalHold: async (candidate) =>
      (await input.persistence.prepareDeletion(candidate)) === "held",
    hasDeletionReceipt: (key) => input.persistence.hasDeletionReceipt(key),
    deleteObjectVersion: ({ key, versionId }) =>
      versionId === VERIFIED_ABSENT_VERSION
        ? Promise.resolve({ verified: true })
        : input.objects.deleteObjectVersion(key, versionId),
    commitDeletion: (commit) => input.persistence.commitDeletion(commit),
  };
}

const UPLOAD_EXPIRY_GRACE_MS = 15 * 60 * 1_000;

function retentionPolicySnapshot(policy: {
  id: string;
  classKey: string;
  objectClass: string;
  expiresAfterDays: number | null;
  deletionAuthority: string;
  legalHoldBehavior: string;
  s3CleanupRequired: boolean;
  databaseCleanupPolicy: string;
} | null | undefined): EvidenceRetentionCandidate["retentionPolicySnapshot"] {
  if (!policy) return null;
  return {
    id: policy.id,
    classKey: policy.classKey,
    objectClass: policy.objectClass,
    expiresAfterDays: policy.expiresAfterDays,
    deletionAuthority: policy.deletionAuthority,
    legalHoldBehavior: policy.legalHoldBehavior,
    s3CleanupRequired: policy.s3CleanupRequired,
    databaseCleanupPolicy: policy.databaseCleanupPolicy,
  };
}

type RetentionTargetState = {
  boundaryType: "submission" | "interview";
  boundaryId: string;
  submissionId: string | null;
  interviewId: string | null;
  userId: string;
  databaseTable:
    | "UploadReservation"
    | "SubmissionEvidence"
    | "GeneratedObjectReservation";
};

type DeletionReceiptState = {
  targetType: string;
  targetId: string;
  s3Key: string | null;
  s3VersionId: string | null;
  s3VerifiedAt: Date | null;
  databaseVerifiedAt: Date | null;
  details: unknown;
};

type RetentionEvidenceCandidateRow = {
  id: string;
  expiresAt: Date;
  s3Key: string;
  s3VersionId: string;
  retentionPolicyId: string;
  classKey: string;
  objectClass: string;
  expiresAfterDays: number;
  deletionAuthority: string;
  legalHoldBehavior: string;
  s3CleanupRequired: boolean;
  databaseCleanupPolicy: string;
};

function compareRetentionCandidates(
  left: RetentionPersistentCandidate,
  right: RetentionPersistentCandidate,
): number {
  return (
    left.expiresAt.getTime() - right.expiresAt.getTime() ||
    left.targetType.localeCompare(right.targetType) ||
    left.targetId.localeCompare(right.targetId)
  );
}

function intentDetails(
  candidate: EvidenceRetentionCandidate,
  target: RetentionTargetState,
  phase: "intent" | "complete",
  providerReceipt?: string | null,
): Prisma.InputJsonObject {
  return {
    phase,
    databaseAction:
      candidate.databaseAction === "mark-deleted" ? "mark-deleted" : "mark-cancelled",
    ...(target.submissionId
      ? { submissionId: target.submissionId }
      : { interviewId: target.interviewId! }),
    retentionPolicySnapshot: candidate.retentionPolicySnapshot ?? null,
    ...(candidate.s3VersionId === VERIFIED_ABSENT_VERSION
      ? { objectVersionCount: 0 }
      : {}),
    ...(phase === "complete" ? { providerReceipt: providerReceipt ?? null } : {}),
  };
}

function isMatchingPendingIntent(
  receipt: DeletionReceiptState,
  candidate: EvidenceRetentionCandidate,
  target: RetentionTargetState,
): boolean {
  if (
    receipt.s3VerifiedAt !== null ||
    receipt.databaseVerifiedAt !== null ||
    receipt.targetType !== candidate.targetType ||
    receipt.targetId !== candidate.targetId ||
    receipt.s3Key !== candidate.s3Key ||
    receipt.s3VersionId !== persistedVersionId(candidate.s3VersionId)
  ) {
    return false;
  }
  if (!receipt.details || typeof receipt.details !== "object" || Array.isArray(receipt.details)) {
    return false;
  }
  const details = receipt.details as Record<string, unknown>;
  const expectedAction =
    candidate.databaseAction === "mark-deleted" ? "mark-deleted" : "mark-cancelled";
  return (
    details.phase === "intent" &&
    details.databaseAction === expectedAction &&
    (target.submissionId
      ? details.submissionId === target.submissionId
      : details.interviewId === target.interviewId)
  );
}

async function retentionTarget(
  tx: Prisma.TransactionClient,
  candidate: EvidenceRetentionCandidate,
): Promise<RetentionTargetState> {
  if (candidate.targetType === "uncommitted-upload") {
    const target = await tx.uploadReservation.findFirst({
      where: {
        id: candidate.targetId,
        s3Key: candidate.s3Key,
        s3VersionId: persistedVersionId(candidate.s3VersionId),
        consumedAt: null,
        cancelledAt: null,
      },
      select: { submissionId: true, submission: { select: { userId: true } } },
    });
    if (!target || candidate.databaseAction !== "mark-cancelled") {
      throw new Error("Retention upload target changed before deletion intent");
    }
    return {
      boundaryType: "submission",
      boundaryId: target.submissionId,
      submissionId: target.submissionId,
      interviewId: null,
      userId: target.submission.userId,
      databaseTable: "UploadReservation",
    };
  }

  if (candidate.targetType === "submission-evidence-quarantined") {
    const target = await tx.submissionEvidence.findFirst({
      where: {
        id: candidate.targetId,
        s3Key: candidate.s3Key,
        s3VersionId: candidate.s3VersionId,
        scanState: EvidenceScanState.quarantined,
        replacedBy: { some: { scanState: EvidenceScanState.clean } },
      },
      select: { submissionId: true, submission: { select: { userId: true } } },
    });
    if (!target || candidate.databaseAction !== "mark-deleted") {
      throw new Error("Retention evidence target changed before deletion intent");
    }
    return {
      boundaryType: "submission",
      boundaryId: target.submissionId,
      submissionId: target.submissionId,
      interviewId: null,
      userId: target.submission.userId,
      databaseTable: "SubmissionEvidence",
    };
  }

  if (candidate.targetType === "uncommitted-generated-object") {
    const target = await tx.generatedObjectReservation.findFirst({
      where: {
        id: candidate.targetId,
        s3Key: candidate.s3Key,
        s3VersionId: persistedVersionId(candidate.s3VersionId),
        consumedAt: null,
      },
      select: {
        submissionId: true,
        interviewId: true,
        submission: { select: { userId: true } },
        interview: { select: { userId: true } },
      },
    });
    if (!target || candidate.databaseAction !== "mark-cancelled") {
      throw new Error("Retention generated-object target changed before deletion intent");
    }
    if (target.submissionId && target.submission) {
      return {
        boundaryType: "submission",
        boundaryId: target.submissionId,
        submissionId: target.submissionId,
        interviewId: null,
        userId: target.submission.userId,
        databaseTable: "GeneratedObjectReservation",
      };
    }
    if (target.interviewId && target.interview) {
      return {
        boundaryType: "interview",
        boundaryId: target.interviewId,
        submissionId: null,
        interviewId: target.interviewId,
        userId: target.interview.userId,
        databaseTable: "GeneratedObjectReservation",
      };
    }
    throw new Error("Retention generated-object target has no learner boundary");
  }

  throw new Error("Retention target type is not eligible");
}

async function lockRetentionUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<"writable" | "fenced"> {
  const rows = await tx.$queryRaw<{ flaggedForDeletion: boolean }[]>(Prisma.sql`
    SELECT "flaggedForDeletion"
    FROM "User"
    WHERE "id" = ${userId}
    FOR SHARE
  `);
  const user = rows[0];
  if (!user) throw new Error("Retention target user changed before deletion intent");
  return user.flaggedForDeletion ? "fenced" : "writable";
}

async function hasOverlappingPendingIntent(
  tx: Prisma.TransactionClient,
  candidate: EvidenceRetentionCandidate,
  databaseTable: RetentionTargetState["databaseTable"],
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT receipt."id"
    FROM "DeletionReceipt" receipt
    WHERE receipt."idempotencyKey" <> ${candidate.idempotencyKey}
      AND receipt."databaseVerifiedAt" IS NULL
      AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
      AND (
        (
          receipt."targetType" = ${candidate.targetType}
          AND receipt."targetId" = ${candidate.targetId}
        )
        OR (
          receipt."targetType" = 'dpdp-s3-object'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(receipt."details"->'associations') = 'array'
                  THEN receipt."details"->'associations'
                ELSE '[]'::JSONB
              END
            ) association
            WHERE association->>'databaseTable' = ${databaseTable}
              AND association->>'databaseRecordId' = ${candidate.targetId}
          )
        )
      )
    ORDER BY receipt."deletedAt", receipt."id"
    LIMIT 1
    FOR SHARE OF receipt
  `);
  return rows.length > 0;
}

async function acquireRetentionLocks(
  tx: Prisma.TransactionClient,
  candidate: EvidenceRetentionCandidate,
  target: RetentionTargetState,
): Promise<void> {
  const lockKeys = [
    `retention-hold:${candidate.targetType}:${candidate.targetId}`,
    `retention-hold:${target.boundaryType}:${target.boundaryId}`,
  ].sort();
  for (const lockKey of lockKeys) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}

function receiptSelect() {
  return {
    targetType: true,
    targetId: true,
    s3Key: true,
    s3VersionId: true,
    s3VerifiedAt: true,
    databaseVerifiedAt: true,
    details: true,
  } satisfies Prisma.DeletionReceiptSelect;
}

/** Prisma binding. Submission/audit rows are never hard-deleted. */
export function prismaRetentionPersistence(
  db: PrismaClient = defaultPrisma,
): RetentionPersistence {
  return {
    listCandidates: async (now, limit) => {
      const uploadCutoff = new Date(now.getTime() - UPLOAD_EXPIRY_GRACE_MS);
      const [uploads, generatedObjects, evidence] = await Promise.all([
        db.uploadReservation.findMany({
          where: {
            expiresAt: { lte: uploadCutoff },
            consumedAt: null,
            cancelledAt: null,
            evidence: null,
          },
          select: {
            id: true,
            submissionId: true,
            expiresAt: true,
            s3Key: true,
            s3VersionId: true,
            assessmentVersion: {
              select: {
                retentionPolicyId: true,
                retentionPolicy: {
                  select: {
                    id: true,
                    classKey: true,
                    objectClass: true,
                    expiresAfterDays: true,
                    deletionAuthority: true,
                    legalHoldBehavior: true,
                    s3CleanupRequired: true,
                    databaseCleanupPolicy: true,
                  },
                },
              },
            },
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take: limit,
        }),
        db.generatedObjectReservation.findMany({
          where: {
            expiresAt: { lte: uploadCutoff },
            consumedAt: null,
            OR: [
              { cancelledAt: null },
              { cancelledAt: { not: null }, s3VersionId: null },
            ],
          },
          select: {
            id: true,
            expiresAt: true,
            s3Key: true,
            s3VersionId: true,
            submission: {
              select: {
                assessmentVersion: {
                  select: {
                    retentionPolicyId: true,
                    retentionPolicy: {
                      select: {
                        id: true,
                        classKey: true,
                        objectClass: true,
                        expiresAfterDays: true,
                        deletionAuthority: true,
                        legalHoldBehavior: true,
                        s3CleanupRequired: true,
                        databaseCleanupPolicy: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take: limit,
        }),
        db.$queryRaw<RetentionEvidenceCandidateRow[]>(Prisma.sql`
          SELECT
            evidence."id",
            evidence."s3Key",
            evidence."s3VersionId",
            evidence."committedAt" + policy."expiresAfterDays" * INTERVAL '1 day' AS "expiresAt",
            policy."id" AS "retentionPolicyId",
            policy."classKey",
            policy."objectClass",
            policy."expiresAfterDays",
            policy."deletionAuthority",
            policy."legalHoldBehavior",
            policy."s3CleanupRequired",
            policy."databaseCleanupPolicy"
          FROM "SubmissionEvidence" evidence
          JOIN "Submission" submission ON submission."id" = evidence."submissionId"
          JOIN "AssessmentVersion" version ON version."id" = submission."assessmentVersionId"
          JOIN "RetentionPolicy" policy ON policy."id" = version."retentionPolicyId"
          WHERE evidence."scanState" = 'quarantined'::"EvidenceScanState"
            AND policy."s3CleanupRequired" = true
            AND policy."expiresAfterDays" IS NOT NULL
            AND policy."expiresAfterDays" >= 0
            AND evidence."committedAt" + policy."expiresAfterDays" * INTERVAL '1 day' <= ${now}
            AND EXISTS (
              SELECT 1
              FROM "SubmissionEvidence" replacement
              WHERE replacement."replacesEvidenceId" = evidence."id"
                AND replacement."scanState" = 'clean'::"EvidenceScanState"
            )
          ORDER BY "expiresAt", evidence."id"
          LIMIT ${limit}
        `),
      ]);

      const uploadCandidates: RetentionPersistentCandidate[] = uploads.map((upload) => ({
        targetType: "uncommitted-upload",
        targetId: upload.id,
        retentionPolicyId: upload.assessmentVersion?.retentionPolicyId ?? null,
        expiresAt: upload.expiresAt,
        s3Key: upload.s3Key,
        s3VersionId: upload.s3VersionId,
        databaseAction: "mark-cancelled",
        retentionPolicySnapshot: retentionPolicySnapshot(
          upload.assessmentVersion?.retentionPolicy,
        ),
      }));
      const generatedCandidates: RetentionPersistentCandidate[] = generatedObjects.map(
        (reservation) => ({
          targetType: "uncommitted-generated-object",
          targetId: reservation.id,
          retentionPolicyId:
            reservation.submission?.assessmentVersion?.retentionPolicyId ?? null,
          expiresAt: reservation.expiresAt,
          s3Key: reservation.s3Key,
          s3VersionId: reservation.s3VersionId,
          databaseAction: "mark-cancelled",
          retentionPolicySnapshot: retentionPolicySnapshot(
            reservation.submission?.assessmentVersion?.retentionPolicy,
          ),
        }),
      );
      const evidenceCandidates: RetentionPersistentCandidate[] = evidence.map((item) => ({
        targetType: "submission-evidence-quarantined",
        targetId: item.id,
        retentionPolicyId: item.retentionPolicyId,
        expiresAt: item.expiresAt,
        s3Key: item.s3Key,
        s3VersionId: item.s3VersionId,
        databaseAction: "mark-deleted" as const,
        retentionPolicySnapshot: retentionPolicySnapshot({
          id: item.retentionPolicyId,
          classKey: item.classKey,
          objectClass: item.objectClass,
          expiresAfterDays: item.expiresAfterDays,
          deletionAuthority: item.deletionAuthority,
          legalHoldBehavior: item.legalHoldBehavior,
          s3CleanupRequired: item.s3CleanupRequired,
          databaseCleanupPolicy: item.databaseCleanupPolicy,
        }),
      }));
      return [...uploadCandidates, ...generatedCandidates, ...evidenceCandidates]
        .sort(compareRetentionCandidates)
        .slice(0, limit);
    },

    persistUploadVersion: async ({ targetId, s3Key, versionId, targetType }) => {
      if (targetType === "uncommitted-generated-object") {
        const updated = await db.generatedObjectReservation.updateMany({
          where: {
            id: targetId,
            s3Key,
            s3VersionId: null,
            consumedAt: null,
            cancelledAt: null,
          },
          data: { s3VersionId: versionId },
        });
        if (updated.count === 1) return true;
        const existing = await db.generatedObjectReservation.findUnique({
          where: { id: targetId },
          select: { s3VersionId: true },
        });
        return existing?.s3VersionId === versionId;
      }
      const updated = await db.uploadReservation.updateMany({
        where: {
          id: targetId,
          s3Key,
          s3VersionId: null,
          consumedAt: null,
          cancelledAt: null,
        },
        data: { s3VersionId: versionId },
      });
      if (updated.count === 1) return true;
      const existing = await db.uploadReservation.findUnique({
        where: { id: targetId },
        select: { s3VersionId: true },
      });
      return existing?.s3VersionId === versionId;
    },

    prepareDeletion: async (candidate) =>
      db.$transaction(async (tx) => {
        const target = await retentionTarget(tx, candidate);
        if ((await lockRetentionUser(tx, target.userId)) === "fenced") {
          return "held" as const;
        }
        await acquireRetentionLocks(tx, candidate, target);

        const lockedTarget = await retentionTarget(tx, candidate);
        if (
          lockedTarget.submissionId !== target.submissionId ||
          lockedTarget.interviewId !== target.interviewId ||
          lockedTarget.userId !== target.userId ||
          lockedTarget.databaseTable !== target.databaseTable
        ) {
          throw new Error("Retention target changed while deletion intent was serialized");
        }

        // Re-read after the locks: another retention replica may have created
        // or completed this same intent while this transaction was waiting.
        const existing = await tx.deletionReceipt.findUnique({
          where: { idempotencyKey: candidate.idempotencyKey },
          select: receiptSelect(),
        });
        if (existing?.s3VerifiedAt && existing.databaseVerifiedAt) return "ready" as const;
        if (existing && !isMatchingPendingIntent(existing, candidate, target)) {
          throw new Error("Deletion receipt conflicts with retention candidate");
        }
        if (
          await hasOverlappingPendingIntent(tx, candidate, target.databaseTable)
        ) {
          return "held" as const;
        }

        const hold = await tx.retentionHold.findFirst({
          where: {
            releasedAt: null,
            OR: [
              { targetType: candidate.targetType, targetId: candidate.targetId },
              { targetType: target.boundaryType, targetId: target.boundaryId },
            ],
          },
          select: { id: true },
        });
        if (hold) return "held" as const;
        if (existing) return "ready" as const;

        await tx.deletionReceipt.create({
          data: {
            idempotencyKey: candidate.idempotencyKey,
            retentionPolicyId: candidate.retentionPolicyId,
            targetType: candidate.targetType,
            targetId: candidate.targetId,
            s3Key: candidate.s3Key,
            s3VersionId: persistedVersionId(candidate.s3VersionId),
            databaseTable: target.databaseTable,
            databaseRecordId: candidate.targetId,
            requestedBy: "retention-worker",
            // This is the deletion-intent time; verification timestamps remain
            // null until both external and local state transitions complete.
            deletedAt: new Date(),
            s3VerifiedAt: null,
            databaseVerifiedAt: null,
            details: intentDetails(candidate, target, "intent"),
          },
        });
        return "ready" as const;
      }),

    hasDeletionReceipt: async (key) => {
      const receipt = await db.deletionReceipt.findUnique({
        where: { idempotencyKey: key },
        select: { s3VerifiedAt: true, databaseVerifiedAt: true },
      });
      return Boolean(receipt?.s3VerifiedAt && receipt.databaseVerifiedAt);
    },

    commitDeletion: async (input) => {
      await db.$transaction(async (tx) => {
        const existing = await tx.deletionReceipt.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: receiptSelect(),
        });
        if (!existing) throw new Error("Deletion intent is missing before retention commit");
        if (existing.s3VerifiedAt && existing.databaseVerifiedAt) return;
        if (!existing.details || typeof existing.details !== "object" || Array.isArray(existing.details)) {
          throw new Error("Deletion intent metadata is invalid");
        }
        const details = existing.details as Record<string, unknown>;
        const submissionId = details.submissionId;
        const interviewId = details.interviewId;
        if (
          !(
            (typeof submissionId === "string" && submissionId) ||
            (typeof interviewId === "string" && interviewId)
          )
        ) {
          throw new Error("Deletion intent is missing its learner boundary");
        }
        const candidate: EvidenceRetentionCandidate = {
          idempotencyKey: input.idempotencyKey,
          retentionPolicyId: input.retentionPolicyId,
          targetType: input.targetType,
          targetId: input.targetId,
          expiresAt: input.deletedAt,
          s3Key: input.s3Key,
          s3VersionId: input.s3VersionId,
          databaseAction: input.databaseAction,
          retentionPolicySnapshot:
            details.retentionPolicySnapshot as EvidenceRetentionCandidate["retentionPolicySnapshot"],
        };
        const target = await retentionTarget(tx, candidate);
        if (
          target.submissionId !== (typeof submissionId === "string" ? submissionId : null) ||
          target.interviewId !== (typeof interviewId === "string" ? interviewId : null)
        ) {
          throw new Error("Retention target crossed its learner boundary before commit");
        }
        if ((await lockRetentionUser(tx, target.userId)) === "fenced") {
          throw new Error("Retention target became DPDP-fenced before commit");
        }
        await acquireRetentionLocks(tx, candidate, target);

        const lockedTarget = await retentionTarget(tx, candidate);
        if (
          lockedTarget.submissionId !== target.submissionId ||
          lockedTarget.interviewId !== target.interviewId ||
          lockedTarget.userId !== target.userId ||
          lockedTarget.databaseTable !== target.databaseTable
        ) {
          throw new Error("Retention target changed while deletion commit was serialized");
        }

        const lockedReceipt = await tx.deletionReceipt.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: receiptSelect(),
        });
        if (!lockedReceipt) throw new Error("Deletion intent disappeared before commit");
        if (lockedReceipt.s3VerifiedAt && lockedReceipt.databaseVerifiedAt) return;
        if (!isMatchingPendingIntent(lockedReceipt, candidate, target)) {
          throw new Error("Deletion intent conflicts with retention commit");
        }

        if (input.targetType === "uncommitted-upload") {
          const updated = await tx.uploadReservation.updateMany({
            where: {
              id: input.targetId,
              s3Key: input.s3Key,
              s3VersionId: persistedVersionId(input.s3VersionId),
              consumedAt: null,
              cancelledAt: null,
            },
            data: { cancelledAt: input.deletedAt },
          });
          if (updated.count !== 1) throw new Error("Retention target changed before commit");
        } else if (input.targetType === "uncommitted-generated-object") {
          const updated = await tx.generatedObjectReservation.updateMany({
            where: {
              id: input.targetId,
              s3Key: input.s3Key,
              s3VersionId: persistedVersionId(input.s3VersionId),
              consumedAt: null,
              cancelledAt: null,
            },
            data: { cancelledAt: input.deletedAt },
          });
          if (updated.count !== 1) {
            const alreadyCancelled = await tx.generatedObjectReservation.findFirst({
              where: {
                id: input.targetId,
                s3Key: input.s3Key,
                s3VersionId: persistedVersionId(input.s3VersionId),
                consumedAt: null,
                cancelledAt: { not: null },
              },
              select: { id: true },
            });
            if (!alreadyCancelled) {
              throw new Error("Retention target changed before commit");
            }
          }
        } else {
          const updated = await tx.submissionEvidence.updateMany({
            where: {
              id: input.targetId,
              s3Key: input.s3Key,
              s3VersionId: input.s3VersionId,
              scanState: EvidenceScanState.quarantined,
            },
            data: { scanState: EvidenceScanState.deleted },
          });
          if (updated.count !== 1) throw new Error("Retention target changed before commit");
        }

        await tx.deletionReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: {
            s3VerifiedAt: input.deletedAt,
            databaseVerifiedAt: input.deletedAt,
            details: intentDetails(
              candidate,
              target,
              "complete",
              input.providerReceipt,
            ),
          },
        });
      });
    },
  };
}

export async function handleRetentionCleanup(input: {
  now?: Date;
  requestedBy?: string;
  batchSize?: number;
  deps?: EvidenceRetentionDeps;
} = {}): Promise<EvidenceRetentionResult> {
  const deps =
    input.deps ??
    createProductionEvidenceRetentionDeps({
      persistence: prismaRetentionPersistence(),
      objects: {
        listObjectVersionIds: listS3ObjectVersionIds,
        deleteObjectVersion: deleteS3ObjectVersion,
      },
    });
  return runEvidenceRetentionCleanup(
    {
      now: input.now ?? new Date(),
      requestedBy: input.requestedBy ?? "retention-worker",
      batchSize: input.batchSize,
    },
    deps,
  );
}
