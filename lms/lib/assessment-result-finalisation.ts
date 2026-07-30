import { Prisma } from "@prisma/client";
import { parsePublicationPolicy } from "@/lib/publication-policy";
import { prisma as defaultPrisma } from "@/lib/db";
import { syncGalleryItem } from "@/lib/galleries";

export type FinalisationActor = {
  userId: string;
  role: "student" | "instructor" | "admin";
};

export type AssessmentResultState = {
  id: string;
  submissionId: string;
  status: string;
  scoreable: boolean;
  publishable: boolean;
  completedAt: Date | null;
  updatedAt: Date;
};

export type AssessmentResultFinalisationContext = {
  result: AssessmentResultState & {
    assessmentVersionId: string | null;
    ownerKind: "individual" | "team" | null;
    ownerId: string | null;
    version: number;
    attempt: number;
    purpose: "graded" | "formative";
  };
  submission: {
    id: string;
    status: string;
    assessmentVersionId: string | null;
    ownerKind: "individual" | "team" | null;
    ownerId: string | null;
    version: number;
    attempt: number;
    contractMode: "legacy" | "versioned";
  };
  assessmentVersion: {
    id: string;
    purpose: "graded" | "formative";
    publishedAt: Date | null;
    publicationPolicy: unknown;
  } | null;
  hasFinalGrade: boolean;
  hasOpenHold: boolean;
  hasOpenAppeal: boolean;
};

type ResultAudit = {
  actorId: string;
  action: "assessment-result.finalise";
  targetType: "assessmentResult";
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type AssessmentResultFinalisationStore = {
  getContext: (resultId: string) => Promise<AssessmentResultFinalisationContext | null>;
  compareAndSetResult: (input: {
    id: string;
    expectedUpdatedAt: Date;
    expectedStatus: string;
    expectedScoreable: boolean;
    expectedPublishable: boolean;
    scoreable: boolean;
    publishable: boolean;
  }) => Promise<AssessmentResultState | null>;
  createAudit: (entry: ResultAudit) => Promise<void>;
};

export type AssessmentResultFinalisationDeps = {
  transaction?: <T>(
    work: (store: AssessmentResultFinalisationStore) => Promise<T>,
  ) => Promise<T>;
  reconcilePublication?: (submissionId: string) => Promise<unknown>;
};

export class AssessmentResultFinalisationError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "AssessmentResultFinalisationError";
    this.status = status;
  }
}

const resultSelect = {
  id: true,
  submissionId: true,
  assessmentVersionId: true,
  ownerKind: true,
  ownerId: true,
  version: true,
  attempt: true,
  purpose: true,
  status: true,
  scoreable: true,
  publishable: true,
  completedAt: true,
  updatedAt: true,
} as const;

function prismaStore(tx: Prisma.TransactionClient): AssessmentResultFinalisationStore {
  return {
    getContext: async (resultId) => {
      const row = await tx.assessmentResult.findUnique({
        where: { id: resultId },
        select: {
          ...resultSelect,
          assessmentVersion: {
            select: {
              id: true,
              purpose: true,
              publishedAt: true,
              publicationPolicy: true,
            },
          },
          submission: {
            select: {
              id: true,
              status: true,
              assessmentVersionId: true,
              ownerKind: true,
              ownerId: true,
              version: true,
              attempt: true,
              assignment: { select: { contractMode: true } },
              grades: {
                select: {
                  provisional: true,
                  appeals: {
                    where: { status: "open" },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
              gradeHolds: {
                where: { status: "open" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!row) return null;
      return {
        result: {
          id: row.id,
          submissionId: row.submissionId,
          assessmentVersionId: row.assessmentVersionId,
          ownerKind: row.ownerKind,
          ownerId: row.ownerId,
          version: row.version,
          attempt: row.attempt,
          purpose: row.purpose,
          status: row.status,
          scoreable: row.scoreable,
          publishable: row.publishable,
          completedAt: row.completedAt,
          updatedAt: row.updatedAt,
        },
        submission: {
          id: row.submission.id,
          status: row.submission.status,
          assessmentVersionId: row.submission.assessmentVersionId,
          ownerKind: row.submission.ownerKind,
          ownerId: row.submission.ownerId,
          version: row.submission.version,
          attempt: row.submission.attempt,
          contractMode: row.submission.assignment.contractMode,
        },
        assessmentVersion: row.assessmentVersion,
        hasFinalGrade: row.submission.grades.some((grade) => !grade.provisional),
        hasOpenHold: row.submission.gradeHolds.length > 0,
        hasOpenAppeal: row.submission.grades.some((grade) => grade.appeals.length > 0),
      };
    },
    compareAndSetResult: async (input) => {
      const changed = await tx.assessmentResult.updateMany({
        where: {
          id: input.id,
          updatedAt: input.expectedUpdatedAt,
          status: input.expectedStatus as "completed",
          scoreable: input.expectedScoreable,
          publishable: input.expectedPublishable,
        },
        data: {
          scoreable: input.scoreable,
          publishable: input.publishable,
        },
      });
      if (changed.count !== 1) return null;
      return tx.assessmentResult.findUniqueOrThrow({
        where: { id: input.id },
        select: resultSelect,
      });
    },
    createAudit: async (entry) => {
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          before: entry.before as Prisma.InputJsonValue,
          after: entry.after as Prisma.InputJsonValue,
        },
      });
    },
  };
}

async function runTransaction<T>(
  deps: AssessmentResultFinalisationDeps,
  work: (store: AssessmentResultFinalisationStore) => Promise<T>,
): Promise<T> {
  if (deps.transaction) return deps.transaction(work);
  return defaultPrisma.$transaction((tx) => work(prismaStore(tx)), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function cleanReason(reason: string): string {
  const cleaned = reason.trim();
  if (!cleaned || cleaned.length > 1_000) {
    throw new AssessmentResultFinalisationError(
      400,
      "Reason must be between 1 and 1000 characters",
    );
  }
  return cleaned;
}

function exactBinding(context: AssessmentResultFinalisationContext): boolean {
  const { result, submission, assessmentVersion } = context;
  return Boolean(
    assessmentVersion &&
      result.submissionId === submission.id &&
      result.assessmentVersionId === assessmentVersion.id &&
      submission.assessmentVersionId === assessmentVersion.id &&
      result.ownerKind !== null &&
      result.ownerKind === submission.ownerKind &&
      result.ownerId !== null &&
      result.ownerId === submission.ownerId &&
      result.version === submission.version &&
      result.attempt === submission.attempt,
  );
}

function desiredPublishable(context: AssessmentResultFinalisationContext): boolean {
  const { result, submission, assessmentVersion } = context;
  if (!exactBinding(context)) {
    throw new AssessmentResultFinalisationError(
      409,
      "Assessment result does not match the exact submitted version and attempt",
    );
  }
  if (!assessmentVersion?.publishedAt) {
    throw new AssessmentResultFinalisationError(409, "Assessment version is not published");
  }
  if (result.purpose !== "graded" || assessmentVersion.purpose !== "graded") {
    throw new AssessmentResultFinalisationError(409, "Formative results cannot be finalised");
  }
  if (result.status === "repair_required") {
    throw new AssessmentResultFinalisationError(409, "Assessment result requires repair");
  }
  if (result.status !== "completed" || !result.completedAt) {
    throw new AssessmentResultFinalisationError(409, "Assessment result is not complete");
  }
  if (submission.status !== "finalised") {
    throw new AssessmentResultFinalisationError(
      409,
      "Submission has not been finalised by an instructor",
    );
  }
  if (!context.hasFinalGrade) {
    throw new AssessmentResultFinalisationError(409, "Submission has no final grade");
  }
  if (context.hasOpenHold) {
    throw new AssessmentResultFinalisationError(409, "Submission has unresolved grade holds");
  }
  if (context.hasOpenAppeal) {
    throw new AssessmentResultFinalisationError(409, "Submission has an open grade appeal");
  }
  return parsePublicationPolicy(assessmentVersion.publicationPolicy) !== null;
}

function publicState(result: AssessmentResultState): AssessmentResultState {
  return {
    id: result.id,
    submissionId: result.submissionId,
    status: result.status,
    scoreable: result.scoreable,
    publishable: result.publishable,
    completedAt: result.completedAt,
    updatedAt: result.updatedAt,
  };
}

function auditState(
  context: AssessmentResultFinalisationContext,
  result: AssessmentResultState,
  reason?: string,
): Record<string, unknown> {
  return {
    result: {
      status: result.status,
      scoreable: result.scoreable,
      publishable: result.publishable,
      completedAt: result.completedAt?.toISOString() ?? null,
      updatedAt: result.updatedAt.toISOString(),
    },
    submissionId: context.submission.id,
    assessmentVersionId: context.result.assessmentVersionId,
    ownerKind: context.result.ownerKind,
    ownerId: context.result.ownerId,
    version: context.result.version,
    attempt: context.result.attempt,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Turn one completed, human-finalised exact assessment receipt into scoring and
 * publication eligibility. Consent, instructor curation and GalleryItem state
 * deliberately remain separate workflows.
 */
export async function finaliseAssessmentResult(
  input: {
    resultId: string;
    expectedUpdatedAt: Date;
    reason: string;
    actor: FinalisationActor;
  },
  deps: AssessmentResultFinalisationDeps = {},
): Promise<{ changed: boolean; result: AssessmentResultState }> {
  if (input.actor.role !== "instructor" && input.actor.role !== "admin") {
    throw new AssessmentResultFinalisationError(403, "Instructor role required");
  }
  if (!input.resultId.trim()) {
    throw new AssessmentResultFinalisationError(400, "Assessment result id is required");
  }
  if (Number.isNaN(input.expectedUpdatedAt.getTime())) {
    throw new AssessmentResultFinalisationError(400, "Expected update time is invalid");
  }
  const reason = cleanReason(input.reason);

  const transition = async (): Promise<{ changed: boolean; result: AssessmentResultState }> =>
    runTransaction(deps, async (store) => {
      const context = await store.getContext(input.resultId);
      if (!context) throw new AssessmentResultFinalisationError(404, "Unknown assessment result");
      const publishable = desiredPublishable(context);
      if (context.result.scoreable && context.result.publishable === publishable) {
        return { changed: false, result: publicState(context.result) };
      }
      if (context.result.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new AssessmentResultFinalisationError(
          409,
          "Assessment result changed; refresh before finalising",
        );
      }

      const updated = await store.compareAndSetResult({
        id: context.result.id,
        expectedUpdatedAt: context.result.updatedAt,
        expectedStatus: context.result.status,
        expectedScoreable: context.result.scoreable,
        expectedPublishable: context.result.publishable,
        scoreable: true,
        publishable,
      });
      if (!updated) {
        const current = await store.getContext(input.resultId);
        if (current) {
          const currentPublishable = desiredPublishable(current);
          if (current.result.scoreable && current.result.publishable === currentPublishable) {
            return { changed: false, result: publicState(current.result) };
          }
        }
        throw new AssessmentResultFinalisationError(
          409,
          "Assessment result changed; refresh before finalising",
        );
      }

      await store.createAudit({
        actorId: input.actor.userId,
        action: "assessment-result.finalise",
        targetType: "assessmentResult",
        targetId: context.result.id,
        before: auditState(context, context.result),
        after: auditState(context, updated, reason),
      });
      return { changed: true, result: publicState(updated) };
    });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const outcome = await transition();
      if (outcome.changed) {
        try {
          await (deps.reconcilePublication ?? syncGalleryItem)(outcome.result.submissionId);
        } catch {
          // Eligibility is authoritative. Gallery reconciliation is retryable
          // projection work and must not roll back finalisation.
        }
      }
      return outcome;
    } catch (error) {
      if (attempt === 0 && isRetryableTransactionConflict(error)) continue;
      throw error;
    }
  }
  throw new AssessmentResultFinalisationError(409, "Assessment result changed; retry finalising");
}
