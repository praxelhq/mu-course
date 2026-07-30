export type DpdpErasureCounts = {
  appeals: number;
  gradeHolds: number;
  publicationDecisions: number;
  workflowSelections: number;
  workflowNominations: number;
  galleryItems: number;
  votes: number;
  assessmentResults: number;
  resubmissionGrants: number;
  evidence: number;
  uploadReservations: number;
  generatedObjectReservations: number;
  grades: number;
  submissions: number;
  reassignedTeamSubmissions: number;
  interviewTurns: number;
  interviews: number;
  interviewRetakes: number;
  quizAttempts: number;
  peerReviews: number;
  portfolio: number;
  notifications: number;
  gateExceptions: number;
  userVotes: number;
  user: number;
};

export type DpdpErasureResult = {
  receiptId: string;
  deleted: DpdpErasureCounts;
  clerkUserId: string | null;
  alreadyCompleted: boolean;
};

export type DpdpObjectIntent = {
  receiptId: string;
  key: string;
  versionId: string;
  verifiedAt: Date | null;
};

export type DpdpPreparation =
  | { state: "completed"; result: DpdpErasureResult }
  | {
      state: "ready";
      parentReceiptId: string;
      phase: "intent" | "database_cleanup";
      clerkUserId: string | null;
      objects: DpdpObjectIntent[];
    };

export type DpdpErasureInput = {
  userId: string;
  confirmEmail: string;
  requestedBy: string;
  now?: Date;
};

export type DpdpErasurePersistence = {
  /** Validate the identity, authorize holds, and durably persist every intent. */
  prepare(input: Required<DpdpErasureInput>): Promise<DpdpPreparation>;
  /** Persist verification of one exact immutable object version. */
  recordObjectVerified(input: {
    parentReceiptId: string;
    receiptId: string;
    key: string;
    versionId: string;
    verifiedAt: Date;
    providerReceipt: string | null;
  }): Promise<void>;
  /** Move the already-persisted inventory to the narrow database-cleanup phase. */
  authorizeDatabaseCleanup(input: {
    parentReceiptId: string;
    verifiedAt: Date;
  }): Promise<void>;
  /** Apply the receipt-bound FK-ordered cleanup and complete every receipt. */
  cleanupDatabase(input: {
    parentReceiptId: string;
    completedAt: Date;
  }): Promise<DpdpErasureResult>;
};

export type DpdpObjectStore = {
  deleteObjectVersion(
    key: string,
    versionId: string,
  ): Promise<{ verified: boolean; providerReceipt?: string | null }>;
};

export type DpdpBeforeDatabaseCleanup = (input: {
  parentReceiptId: string;
  clerkUserId: string;
}) => Promise<void>;

export type DpdpErasureErrorCode =
  | "unknown-user"
  | "email-mismatch"
  | "retention-hold-active"
  | "object-version-missing"
  | "team-survivor-missing"
  | "erasure-state-conflict"
  | "object-delete-failed"
  | "object-delete-unverified";

export class DpdpErasureError extends Error {
  constructor(
    readonly code: DpdpErasureErrorCode,
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DpdpErasureError";
  }
}

/**
 * Coordinate durable DB intent with non-transactional exact-version deletes.
 * Persistence owns authorization and graph cleanup; this function never lets a
 * failed or unverified object deletion reach the destructive database phase.
 */
export async function runDpdpErasure(
  input: DpdpErasureInput,
  deps: {
    persistence: DpdpErasurePersistence;
    beforeDatabaseCleanup?: DpdpBeforeDatabaseCleanup;
  } & DpdpObjectStore,
): Promise<DpdpErasureResult> {
  const now = input.now ?? new Date();
  const preparation = await deps.persistence.prepare({ ...input, now });
  if (preparation.state === "completed") return preparation.result;

  if (preparation.phase === "intent") {
    for (const object of preparation.objects) {
      if (object.verifiedAt) continue;

      let deletion: Awaited<ReturnType<DpdpObjectStore["deleteObjectVersion"]>>;
      try {
        deletion = await deps.deleteObjectVersion(object.key, object.versionId);
      } catch (cause) {
        throw new DpdpErasureError(
          "object-delete-failed",
          503,
          "An exact object version could not be deleted; database data was retained",
          { cause },
        );
      }
      if (!deletion.verified) {
        throw new DpdpErasureError(
          "object-delete-unverified",
          503,
          "An exact object version could not be verified absent; database data was retained",
        );
      }

      await deps.persistence.recordObjectVerified({
        parentReceiptId: preparation.parentReceiptId,
        receiptId: object.receiptId,
        key: object.key,
        versionId: object.versionId,
        verifiedAt: now,
        providerReceipt:
          typeof deletion.providerReceipt === "string"
            ? deletion.providerReceipt.slice(0, 256)
            : null,
      });
    }

  }

  // External account fencing must succeed while the pending receipt still
  // contains the provider identifier. Completion removes that raw identifier
  // from the durable receipt. The callback is idempotent and is retried on a
  // resumed database_cleanup phase before any local personal rows are removed.
  if (preparation.clerkUserId && deps.beforeDatabaseCleanup) {
    await deps.beforeDatabaseCleanup({
      parentReceiptId: preparation.parentReceiptId,
      clerkUserId: preparation.clerkUserId,
    });
  }

  if (preparation.phase === "intent") {
    await deps.persistence.authorizeDatabaseCleanup({
      parentReceiptId: preparation.parentReceiptId,
      verifiedAt: now,
    });
  }

  return deps.persistence.cleanupDatabase({
    parentReceiptId: preparation.parentReceiptId,
    completedAt: now,
  });
}
