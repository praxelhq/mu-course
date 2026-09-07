import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

const TERMINAL_RESULT_STATES = ["completed", "repair_required", "dead_lettered"] as const;

type DeadLetterResultContext = {
  id: string;
  status: string;
  errorCode: string | null;
  submission: {
    id: string;
    userId: string;
    assignment: { title: string };
  };
};

export type AssessmentDeadLetterOutcome =
  | { kind: "marked"; assessmentResultId: string }
  | { kind: "already-terminal"; assessmentResultId: string }
  | { kind: "legacy-or-missing"; assessmentResultId: null };

/**
 * Idempotent terminal transition for a pg-boss job that exhausted retries.
 * Deterministic output remains untouched; the transition, hold, audit, and
 * learner notification commit together or not at all.
 */
export async function markAssessmentSubmissionDeadLettered(
  input: {
    submissionId: string;
    sourceJobId: string;
    exhaustedAt: Date;
  },
  deps: { prisma?: PrismaClient } = {},
): Promise<AssessmentDeadLetterOutcome> {
  const db = deps.prisma ?? defaultPrisma;
  return db.$transaction(
    async (tx) => {
      let result: DeadLetterResultContext | null = await tx.assessmentResult.findUnique({
        where: { submissionId: input.submissionId },
        select: {
          id: true,
          status: true,
          errorCode: true,
          submission: {
            select: {
              id: true,
              userId: true,
              assignment: { select: { title: true } },
            },
          },
        },
      });
      let createdTerminal = false;
      if (!result) {
        const submission = await tx.submission.findUnique({
          where: { id: input.submissionId },
          select: {
            id: true,
            userId: true,
            version: true,
            attempt: true,
            ownerKind: true,
            ownerId: true,
            assessmentVersionId: true,
            assignment: { select: { title: true, contractMode: true } },
            assessmentVersion: {
              select: {
                purpose: true,
                checksumSha256: true,
                datasetRelease: { select: { checksumSha256: true } },
                evaluatorConfig: { select: { checksumSha256: true } },
              },
            },
          },
        });
        if (!submission || submission.assignment.contractMode !== "versioned") {
          return { kind: "legacy-or-missing", assessmentResultId: null };
        }
        const created = await tx.assessmentResult.create({
          data: {
            evaluationKey: [
              "assessment",
              submission.id,
              submission.assessmentVersionId ?? "unbound",
              `v${submission.version}`,
              `a${submission.attempt}`,
            ].join(":"),
            submissionId: submission.id,
            assessmentVersionId: submission.assessmentVersionId,
            ownerKind: submission.ownerKind,
            ownerId: submission.ownerId,
            version: submission.version,
            attempt: submission.attempt,
            purpose: submission.assessmentVersion?.purpose ?? "graded",
            status: "dead_lettered",
            assessmentHash: submission.assessmentVersion?.checksumSha256 ?? null,
            datasetHash:
              submission.assessmentVersion?.datasetRelease?.checksumSha256 ?? null,
            evaluatorHash:
              submission.assessmentVersion?.evaluatorConfig?.checksumSha256 ?? null,
            deadLetteredAt: input.exhaustedAt,
            completedAt: input.exhaustedAt,
            errorCode: "grading-dead-letter",
            scoreable: false,
            publishable: false,
          },
          select: { id: true },
        });
        result = {
          id: created.id,
          status: "unclaimed",
          errorCode: null,
          submission: {
            id: submission.id,
            userId: submission.userId,
            assignment: { title: submission.assignment.title },
          },
        };
        createdTerminal = true;
      }
      if (
        !createdTerminal &&
        (TERMINAL_RESULT_STATES as readonly string[]).includes(result.status)
      ) {
        return { kind: "already-terminal", assessmentResultId: result.id };
      }

      if (!createdTerminal) {
        const changed = await tx.assessmentResult.updateMany({
          where: {
            id: result.id,
            status: { notIn: [...TERMINAL_RESULT_STATES] },
          },
          data: {
            status: "dead_lettered",
            deadLetteredAt: input.exhaustedAt,
            completedAt: input.exhaustedAt,
            errorCode: "grading-dead-letter",
            scoreable: false,
            publishable: false,
          },
        });
        if (changed.count !== 1) {
          return { kind: "already-terminal", assessmentResultId: result.id };
        }
      }

      const grade = await tx.grade.findFirst({
        where: { submissionId: result.submission.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      await tx.gradeHold.create({
        data: {
          submissionId: result.submission.id,
          gradeId: grade?.id ?? null,
          assessmentResultId: result.id,
          kind: "repair",
          code: "grading-dead-letter",
          reason: "Automated assessment exhausted its retry budget and requires staff review.",
          evidence: {
            sourceJobId: input.sourceJobId,
            priorErrorCode: result.errorCode,
          } as Prisma.InputJsonValue,
          createdBy: "system:grading-worker",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: "system:grading-worker",
          action: "assessment.grading.dead-letter",
          targetType: "assessmentResult",
          targetId: result.id,
          before: {
            status: result.status,
            errorCode: result.errorCode,
          } as Prisma.InputJsonValue,
          after: {
            status: "dead_lettered",
            errorCode: "grading-dead-letter",
            sourceJobId: input.sourceJobId,
            deadLetteredAt: input.exhaustedAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.notification.create({
        data: {
          userId: result.submission.userId,
          kind: "grading-needs-review",
          title: `${result.submission.assignment.title} needs staff review`,
          body: "Automated feedback could not be completed after several attempts. Your work is preserved and has been sent for staff review.",
        },
      });
      return { kind: "marked", assessmentResultId: result.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
