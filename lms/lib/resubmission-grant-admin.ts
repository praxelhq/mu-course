import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

const MAX_GRANT_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;

export type GrantActor = {
  userId: string;
  role: "student" | "instructor" | "admin";
};

export type GrantTarget = {
  assignmentId: string;
  assessmentVersionId: string;
  ownerKind: "individual" | "team";
  ownerId: string;
  targetVersion: number;
  targetAttempt: number;
};

export type GrantRecord = GrantTarget & {
  id: string;
  kind: "improvement" | "repair";
  issuedBy: string | null;
  trigger: string;
  reason: string | null;
  expiresAt: Date;
  extendedAt: Date | null;
  extendedBy: string | null;
  extensionReason: string | null;
  consumedAt: Date | null;
  sourceSubmissionId: string | null;
  updatedAt: Date;
};

export type RepairGrantSource = {
  id: string;
  status: string;
  assignmentId: string;
  assessmentVersionId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
  version: number;
  attempt: number;
  updatedAt: Date;
};

type GrantAudit = {
  actorId: string;
  action: "submission.repair-grant.issue" | "submission.grant.extend";
  targetType: "resubmissionGrant";
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export type ResubmissionGrantAdminStore = {
  getSource: (submissionId: string) => Promise<RepairGrantSource | null>;
  maxAttempt: (target: Omit<GrantTarget, "targetAttempt">) => Promise<number | null>;
  getTargetGrant: (target: GrantTarget & { kind: "repair" }) => Promise<GrantRecord | null>;
  createRepairGrant: (input: GrantTarget & {
    issuedBy: string;
    reason: string;
    expiresAt: Date;
    sourceSubmissionId: string;
  }) => Promise<GrantRecord>;
  getGrant: (grantId: string) => Promise<GrantRecord | null>;
  compareAndSetExtension: (input: {
    grantId: string;
    expectedUpdatedAt: Date;
    expectedExpiresAt: Date;
    expiresAt: Date;
    extendedAt: Date;
    extendedBy: string;
    reason: string;
  }) => Promise<GrantRecord | null>;
  createAudit: (entry: GrantAudit) => Promise<void>;
};

export type ResubmissionGrantAdminDeps = {
  now?: () => Date;
  transaction?: <T>(work: (store: ResubmissionGrantAdminStore) => Promise<T>) => Promise<T>;
};

export class ResubmissionGrantAdminError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "ResubmissionGrantAdminError";
    this.status = status;
  }
}

const grantSelect = {
  id: true,
  assignmentId: true,
  assessmentVersionId: true,
  ownerKind: true,
  ownerId: true,
  kind: true,
  targetVersion: true,
  targetAttempt: true,
  issuedBy: true,
  trigger: true,
  reason: true,
  expiresAt: true,
  extendedAt: true,
  extendedBy: true,
  extensionReason: true,
  consumedAt: true,
  sourceSubmissionId: true,
  updatedAt: true,
} as const;

function prismaStore(tx: Prisma.TransactionClient): ResubmissionGrantAdminStore {
  return {
    getSource: (submissionId) =>
      tx.submission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          status: true,
          assignmentId: true,
          assessmentVersionId: true,
          ownerKind: true,
          ownerId: true,
          version: true,
          attempt: true,
          updatedAt: true,
        },
      }),
    maxAttempt: async (target) => {
      const result = await tx.submission.aggregate({
        where: {
          assignmentId: target.assignmentId,
          assessmentVersionId: target.assessmentVersionId,
          ownerKind: target.ownerKind,
          ownerId: target.ownerId,
          version: target.targetVersion,
        },
        _max: { attempt: true },
      });
      return result._max.attempt;
    },
    getTargetGrant: (target) =>
      tx.resubmissionGrant.findUnique({
        where: {
          assignmentId_assessmentVersionId_ownerKind_ownerId_kind_targetVersion_targetAttempt: {
            assignmentId: target.assignmentId,
            assessmentVersionId: target.assessmentVersionId,
            ownerKind: target.ownerKind,
            ownerId: target.ownerId,
            kind: target.kind,
            targetVersion: target.targetVersion,
            targetAttempt: target.targetAttempt,
          },
        },
        select: grantSelect,
      }),
    createRepairGrant: (input) =>
      tx.resubmissionGrant.create({
        data: {
          assignmentId: input.assignmentId,
          assessmentVersionId: input.assessmentVersionId,
          ownerKind: input.ownerKind,
          ownerId: input.ownerId,
          kind: "repair",
          targetVersion: input.targetVersion,
          targetAttempt: input.targetAttempt,
          issuedBy: input.issuedBy,
          trigger: "instructor_repair",
          reason: input.reason,
          expiresAt: input.expiresAt,
          sourceSubmissionId: input.sourceSubmissionId,
        },
        select: grantSelect,
      }),
    getGrant: (grantId) =>
      tx.resubmissionGrant.findUnique({ where: { id: grantId }, select: grantSelect }),
    compareAndSetExtension: async (input) => {
      const changed = await tx.resubmissionGrant.updateMany({
        where: {
          id: input.grantId,
          updatedAt: input.expectedUpdatedAt,
          expiresAt: input.expectedExpiresAt,
          consumedAt: null,
        },
        data: {
          expiresAt: input.expiresAt,
          extendedAt: input.extendedAt,
          extendedBy: input.extendedBy,
          extensionReason: input.reason,
        },
      });
      if (changed.count !== 1) return null;
      return tx.resubmissionGrant.findUniqueOrThrow({
        where: { id: input.grantId },
        select: grantSelect,
      });
    },
    createAudit: async (entry) => {
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          before: entry.before ? (entry.before as Prisma.InputJsonValue) : undefined,
          after: entry.after as Prisma.InputJsonValue,
        },
      });
    },
  };
}

async function runTransaction<T>(
  deps: ResubmissionGrantAdminDeps,
  work: (store: ResubmissionGrantAdminStore) => Promise<T>,
): Promise<T> {
  if (deps.transaction) return deps.transaction(work);
  return defaultPrisma.$transaction((tx) => work(prismaStore(tx)), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function withConflictRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (attempt === 0 && isRetryableConflict(error)) continue;
      throw error;
    }
  }
  throw new ResubmissionGrantAdminError(409, "Grant changed; retry the request");
}

function requireStaff(actor: GrantActor): void {
  if (actor.role !== "instructor" && actor.role !== "admin") {
    throw new ResubmissionGrantAdminError(403, "Instructor role required");
  }
}

function normalizedReason(reason: string): string {
  const value = reason.trim();
  if (value.length < 3 || value.length > 1_000) {
    throw new ResubmissionGrantAdminError(400, "Reason must be between 3 and 1000 characters");
  }
  return value;
}

function validatedExpiry(expiresAt: Date, now: Date): Date {
  const timestamp = expiresAt.getTime();
  if (Number.isNaN(timestamp) || timestamp <= now.getTime()) {
    throw new ResubmissionGrantAdminError(400, "Grant expiry must be in the future");
  }
  if (timestamp > now.getTime() + MAX_GRANT_WINDOW_MS) {
    throw new ResubmissionGrantAdminError(400, "Grant expiry cannot be more than 90 days away");
  }
  return expiresAt;
}

function sameTarget(grant: GrantRecord, target: GrantTarget): boolean {
  return (
    grant.assignmentId === target.assignmentId &&
    grant.assessmentVersionId === target.assessmentVersionId &&
    grant.ownerKind === target.ownerKind &&
    grant.ownerId === target.ownerId &&
    grant.targetVersion === target.targetVersion &&
    grant.targetAttempt === target.targetAttempt
  );
}

function grantView(grant: GrantRecord): Record<string, unknown> {
  return {
    id: grant.id,
    kind: grant.kind,
    assignmentId: grant.assignmentId,
    assessmentVersionId: grant.assessmentVersionId,
    ownerKind: grant.ownerKind,
    ownerId: grant.ownerId,
    targetVersion: grant.targetVersion,
    targetAttempt: grant.targetAttempt,
    expiresAt: grant.expiresAt.toISOString(),
    consumedAt: grant.consumedAt?.toISOString() ?? null,
    sourceSubmissionId: grant.sourceSubmissionId,
    updatedAt: grant.updatedAt.toISOString(),
  };
}

export async function issueRepairGrant(
  input: GrantTarget & {
    sourceSubmissionId: string;
    expectedSourceUpdatedAt: Date;
    expiresAt: Date;
    reason: string;
    actor: GrantActor;
  },
  deps: ResubmissionGrantAdminDeps = {},
): Promise<{ changed: boolean; grant: GrantRecord }> {
  requireStaff(input.actor);
  const reason = normalizedReason(input.reason);
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt = validatedExpiry(input.expiresAt, now);
  if (Number.isNaN(input.expectedSourceUpdatedAt.getTime())) {
    throw new ResubmissionGrantAdminError(400, "Expected source update time is invalid");
  }

  return withConflictRetry(() =>
    runTransaction(deps, async (store) => {
      const source = await store.getSource(input.sourceSubmissionId);
      if (!source) throw new ResubmissionGrantAdminError(404, "Unknown source submission");
      if (source.status === "draft") {
        throw new ResubmissionGrantAdminError(409, "Repair grants require a submitted source");
      }
      if (
        !source.assessmentVersionId ||
        !source.ownerKind ||
        !source.ownerId ||
        source.assignmentId !== input.assignmentId ||
        source.assessmentVersionId !== input.assessmentVersionId ||
        source.ownerKind !== input.ownerKind ||
        source.ownerId !== input.ownerId ||
        source.version !== input.targetVersion
      ) {
        throw new ResubmissionGrantAdminError(
          409,
          "Repair grant target does not match the exact source submission",
        );
      }
      const latestAttempt = await store.maxAttempt(input);
      if (input.targetAttempt !== (latestAttempt ?? source.attempt) + 1) {
        throw new ResubmissionGrantAdminError(409, "Repair target is not the next exact attempt");
      }

      const existing = await store.getTargetGrant({ ...input, kind: "repair" });
      if (existing) {
        const identical =
          existing.consumedAt === null &&
          existing.sourceSubmissionId === source.id &&
          existing.issuedBy === input.actor.userId &&
          existing.reason === reason &&
          existing.expiresAt.getTime() === expiresAt.getTime();
        if (identical) return { changed: false, grant: existing };
        throw new ResubmissionGrantAdminError(409, "A different grant already owns this target");
      }
      if (source.updatedAt.getTime() !== input.expectedSourceUpdatedAt.getTime()) {
        throw new ResubmissionGrantAdminError(409, "Source submission changed; refresh first");
      }

      const grant = await store.createRepairGrant({
        assignmentId: input.assignmentId,
        assessmentVersionId: input.assessmentVersionId,
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        targetVersion: input.targetVersion,
        targetAttempt: input.targetAttempt,
        issuedBy: input.actor.userId,
        reason,
        expiresAt,
        sourceSubmissionId: source.id,
      });
      await store.createAudit({
        actorId: input.actor.userId,
        action: "submission.repair-grant.issue",
        targetType: "resubmissionGrant",
        targetId: grant.id,
        before: null,
        after: { ...grantView(grant), reason },
      });
      return { changed: true, grant };
    }),
  );
}

export async function extendResubmissionGrant(
  input: GrantTarget & {
    grantId: string;
    expectedUpdatedAt: Date;
    expiresAt: Date;
    reason: string;
    actor: GrantActor;
  },
  deps: ResubmissionGrantAdminDeps = {},
): Promise<{ changed: boolean; grant: GrantRecord }> {
  requireStaff(input.actor);
  const reason = normalizedReason(input.reason);
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt = validatedExpiry(input.expiresAt, now);
  if (Number.isNaN(input.expectedUpdatedAt.getTime())) {
    throw new ResubmissionGrantAdminError(400, "Expected grant update time is invalid");
  }

  return withConflictRetry(() =>
    runTransaction(deps, async (store) => {
      const before = await store.getGrant(input.grantId);
      if (!before) throw new ResubmissionGrantAdminError(404, "Unknown resubmission grant");
      if (!sameTarget(before, input)) {
        throw new ResubmissionGrantAdminError(409, "Grant does not match the exact target");
      }
      if (before.consumedAt) {
        throw new ResubmissionGrantAdminError(409, "Consumed grants cannot be extended");
      }
      const alreadyCurrent =
        before.expiresAt.getTime() === expiresAt.getTime() &&
        before.extendedBy === input.actor.userId &&
        before.extensionReason === reason;
      if (alreadyCurrent) return { changed: false, grant: before };
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new ResubmissionGrantAdminError(409, "Grant changed; refresh before extending");
      }
      if (expiresAt.getTime() <= before.expiresAt.getTime()) {
        throw new ResubmissionGrantAdminError(400, "Extension expiry must move forward");
      }

      const updated = await store.compareAndSetExtension({
        grantId: before.id,
        expectedUpdatedAt: before.updatedAt,
        expectedExpiresAt: before.expiresAt,
        expiresAt,
        extendedAt: now,
        extendedBy: input.actor.userId,
        reason,
      });
      if (!updated) {
        const current = await store.getGrant(input.grantId);
        if (
          current &&
          sameTarget(current, input) &&
          current.expiresAt.getTime() === expiresAt.getTime() &&
          current.extendedBy === input.actor.userId &&
          current.extensionReason === reason
        ) {
          return { changed: false, grant: current };
        }
        throw new ResubmissionGrantAdminError(409, "Grant changed; refresh before extending");
      }
      await store.createAudit({
        actorId: input.actor.userId,
        action: "submission.grant.extend",
        targetType: "resubmissionGrant",
        targetId: updated.id,
        before: grantView(before),
        after: { ...grantView(updated), reason },
      });
      return { changed: true, grant: updated };
    }),
  );
}
