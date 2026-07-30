export type RetentionPolicySnapshot = {
  id: string;
  classKey: string;
  objectClass: string;
  expiresAfterDays: number | null;
  deletionAuthority: string;
  legalHoldBehavior: string;
  s3CleanupRequired: boolean;
  databaseCleanupPolicy: string;
};

export type EvidenceRetentionCandidate = {
  /** Stable unique key persisted on DeletionReceipt. */
  idempotencyKey: string;
  targetType: string;
  targetId: string;
  retentionPolicyId: string | null;
  expiresAt: Date;
  s3Key: string;
  s3VersionId: string;
  databaseAction: "mark-deleted" | "mark-cancelled" | "delete-row";
  /** Immutable effective terms copied into the deletion intent. */
  retentionPolicySnapshot?: RetentionPolicySnapshot | null;
};

export type EvidenceDeletionCommit = {
  idempotencyKey: string;
  retentionPolicyId: string | null;
  targetType: string;
  targetId: string;
  s3Key: string;
  s3VersionId: string;
  requestedBy: string;
  deletedAt: Date;
  s3Verified: true;
  providerReceipt: string | null;
  databaseAction: "mark-deleted" | "mark-cancelled";
};

export type EvidenceRetentionDeps = {
  listCandidates(now: Date, limit: number): Promise<EvidenceRetentionCandidate[]>;
  hasActiveLegalHold(candidate: EvidenceRetentionCandidate): Promise<boolean>;
  hasDeletionReceipt(idempotencyKey: string): Promise<boolean>;
  /** Must delete and verify this exact immutable S3 object version. */
  deleteObjectVersion(input: {
    key: string;
    versionId: string;
  }): Promise<{ verified: boolean; providerReceipt?: string | null }>;
  /** Atomically mark local state and create the idempotent deletion receipt. */
  commitDeletion(input: EvidenceDeletionCommit): Promise<void>;
};

export type EvidenceRetentionResult = {
  examined: number;
  deleted: number;
  held: number;
  notExpired: number;
  alreadyDeleted: number;
  failed: { idempotencyKey: string; errorCode: string }[];
};

export class RetentionAdapterUnavailableError extends Error {
  constructor(message = "Retention storage adapter is unavailable") {
    super(message);
    this.name = "RetentionAdapterUnavailableError";
  }
}

export const DEFAULT_RETENTION_CLEANUP_BATCH_SIZE = 100;
export const MAX_RETENTION_CLEANUP_BATCH_SIZE = 500;

const ELIGIBLE_TARGETS = new Set([
  "uncommitted-upload",
  "uncommitted-generated-object",
  "submission-evidence-quarantined",
]);

function eligibilityError(candidate: EvidenceRetentionCandidate): string | null {
  if (!ELIGIBLE_TARGETS.has(candidate.targetType)) return "target-not-eligible";
  // Submission and audit rows are evidence history. Retention may mark an
  // upload/evidence row but never hard-delete those durable records here.
  if (candidate.databaseAction === "delete-row") return "target-not-eligible";
  if (!candidate.s3Key || !candidate.s3VersionId) return "object-version-missing";
  if (!candidate.idempotencyKey || !candidate.targetId) return "candidate-invalid";
  return null;
}

function retentionErrorCode(error: unknown): string {
  if (error instanceof RetentionAdapterUnavailableError) return "adapter-unavailable";
  return "delete-failed";
}

function retentionBatchSize(requested: number | undefined): number {
  const batchSize = requested ?? DEFAULT_RETENTION_CLEANUP_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("Retention cleanup batchSize must be a positive integer");
  }
  return Math.min(batchSize, MAX_RETENTION_CLEANUP_BATCH_SIZE);
}

/**
 * Execute the narrow evidence-retention policy. The caller supplies all I/O;
 * without an exact S3 version-delete adapter this fails closed and writes no
 * receipt that could falsely claim deletion.
 */
export async function runEvidenceRetentionCleanup(
  input: { now: Date; requestedBy: string; batchSize?: number },
  deps: EvidenceRetentionDeps,
): Promise<EvidenceRetentionResult> {
  const batchSize = retentionBatchSize(input.batchSize);
  const candidates = (await deps.listCandidates(input.now, batchSize)).slice(0, batchSize);
  const result: EvidenceRetentionResult = {
    examined: candidates.length,
    deleted: 0,
    held: 0,
    notExpired: 0,
    alreadyDeleted: 0,
    failed: [],
  };

  for (const candidate of candidates) {
    const ineligible = eligibilityError(candidate);
    if (ineligible) {
      result.failed.push({ idempotencyKey: candidate.idempotencyKey, errorCode: ineligible });
      continue;
    }
    if (candidate.expiresAt > input.now) {
      result.notExpired += 1;
      continue;
    }
    if (await deps.hasDeletionReceipt(candidate.idempotencyKey)) {
      result.alreadyDeleted += 1;
      continue;
    }
    if (await deps.hasActiveLegalHold(candidate)) {
      result.held += 1;
      continue;
    }

    try {
      const deletion = await deps.deleteObjectVersion({
        key: candidate.s3Key,
        versionId: candidate.s3VersionId,
      });
      if (!deletion.verified) {
        result.failed.push({
          idempotencyKey: candidate.idempotencyKey,
          errorCode: "delete-unverified",
        });
        continue;
      }
      await deps.commitDeletion({
        idempotencyKey: candidate.idempotencyKey,
        retentionPolicyId: candidate.retentionPolicyId,
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        s3Key: candidate.s3Key,
        s3VersionId: candidate.s3VersionId,
        requestedBy: input.requestedBy,
        deletedAt: input.now,
        s3Verified: true,
        providerReceipt:
          typeof deletion.providerReceipt === "string"
            ? deletion.providerReceipt.slice(0, 256)
            : null,
        databaseAction:
          candidate.databaseAction === "mark-deleted" ? "mark-deleted" : "mark-cancelled",
      });
      result.deleted += 1;
    } catch (error) {
      result.failed.push({
        idempotencyKey: candidate.idempotencyKey,
        errorCode: retentionErrorCode(error),
      });
    }
  }

  return result;
}
