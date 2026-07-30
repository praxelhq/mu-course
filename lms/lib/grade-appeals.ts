import { Prisma, type GradeAppealStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export class GradeAppealActionError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "GradeAppealActionError";
    this.status = status;
  }
}

export type AppealEligibility = {
  actorId: string;
  actorTeamId: string | null;
  submissionUserId: string;
  submissionTeamId: string | null;
  submissionAssessmentVersionId: string | null;
  submissionOwnerKind: "individual" | "team" | null;
  submissionOwnerId: string | null;
  provisional: boolean;
  hasOpenAppeal: boolean;
};

function ownsAppealedSubmission(input: AppealEligibility): boolean {
  if (input.submissionOwnerKind === "individual") {
    return input.submissionOwnerId !== null && input.submissionOwnerId === input.actorId;
  }
  if (input.submissionOwnerKind === "team") {
    return (
      input.submissionOwnerId !== null &&
      input.actorTeamId !== null &&
      input.submissionOwnerId === input.actorTeamId
    );
  }

  // A versioned or partially bound row must never inherit legacy ownership.
  if (input.submissionAssessmentVersionId !== null || input.submissionOwnerId !== null) {
    return false;
  }

  // Explicit legacy compatibility only: unversioned rows predate canonical owners.
  return input.submissionTeamId !== null
    ? input.submissionTeamId === input.actorTeamId
    : input.submissionUserId === input.actorId;
}

/** Ownership failures intentionally look like a missing grade to prevent enumeration. */
export function validateAppealEligibility(input: AppealEligibility): void {
  if (!ownsAppealedSubmission(input)) {
    throw new GradeAppealActionError(404, "Unknown grade");
  }
  if (!input.provisional) {
    throw new GradeAppealActionError(400, "Only a provisional grade can be appealed");
  }
  if (input.hasOpenAppeal) {
    throw new GradeAppealActionError(409, "This grade already has an open appeal");
  }
}

type AppealProjectionSource = {
  id: string;
  gradeId: string;
  reason: string;
  status: GradeAppealStatus;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  /** Accepted from DB rows but intentionally excluded from the projection. */
  holdId?: string | null;
  resolvedBy?: string | null;
};

export type LearnerAppealProjection = {
  id: string;
  gradeId: string;
  reason: string;
  status: GradeAppealStatus;
  outcome: string | null;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

/** Deliberately omits hold ids, reviewer identity, and all evaluator context. */
export function appealProjection(source: AppealProjectionSource): LearnerAppealProjection {
  return {
    id: source.id,
    gradeId: source.gradeId,
    reason: source.reason,
    status: source.status,
    outcome: source.outcome,
    openedAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    resolvedAt: source.resolvedAt?.toISOString() ?? null,
  };
}

function cleanReason(value: string, label: string): string {
  const reason = value.trim();
  if (!reason) throw new GradeAppealActionError(400, `${label} is required`);
  if (reason.length > 2_000) {
    throw new GradeAppealActionError(400, `${label} must be 2,000 characters or fewer`);
  }
  return reason;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function openGradeAppeal(
  input: { gradeId: string; actorId: string; reason: string },
  deps: { prisma?: PrismaClient } = {},
): Promise<LearnerAppealProjection> {
  const db = deps.prisma ?? defaultPrisma;
  const reason = cleanReason(input.reason, "An appeal reason");
  const [actor, grade] = await Promise.all([
    db.user.findUnique({ where: { id: input.actorId }, select: { teamId: true } }),
    db.grade.findUnique({
      where: { id: input.gradeId },
      select: {
        id: true,
        provisional: true,
        submission: {
          select: {
            id: true,
            userId: true,
            teamId: true,
            assessmentVersionId: true,
            ownerKind: true,
            ownerId: true,
          },
        },
        appeals: { where: { status: "open" }, select: { id: true }, take: 1 },
      },
    }),
  ]);
  if (!actor || !grade) throw new GradeAppealActionError(404, "Unknown grade");
  validateAppealEligibility({
    actorId: input.actorId,
    actorTeamId: actor.teamId,
    submissionUserId: grade.submission.userId,
    submissionTeamId: grade.submission.teamId,
    submissionAssessmentVersionId: grade.submission.assessmentVersionId,
    submissionOwnerKind: grade.submission.ownerKind,
    submissionOwnerId: grade.submission.ownerId,
    provisional: grade.provisional,
    hasOpenAppeal: grade.appeals.length > 0,
  });

  try {
    const appeal = await db.$transaction(async (tx) => {
      const hold = await tx.gradeHold.create({
        data: {
          submissionId: grade.submission.id,
          gradeId: grade.id,
          kind: "appeal",
          code: "student-appeal",
          reason: "A learner appeal requires instructor resolution.",
          createdBy: input.actorId,
        },
        select: { id: true },
      });
      const created = await tx.gradeAppeal.create({
        data: {
          gradeId: grade.id,
          openedBy: input.actorId,
          reason,
          holdId: hold.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "grade.appeal.open",
          targetType: "grade",
          targetId: grade.id,
          after: {
            appealId: created.id,
            gradeId: grade.id,
            status: "open",
            reason,
          } as Prisma.InputJsonValue,
        },
      });
      return created;
    });
    return appealProjection(appeal);
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new GradeAppealActionError(409, "This grade already has an open appeal");
    }
    throw error;
  }
}

export type GradeAppealOutcome = "accepted" | "partially_accepted" | "denied";

export async function resolveGradeAppeal(
  input: {
    appealId: string;
    actorId: string;
    outcome: GradeAppealOutcome;
    reason: string;
  },
  deps: { prisma?: PrismaClient; now?: () => Date } = {},
): Promise<LearnerAppealProjection> {
  const db = deps.prisma ?? defaultPrisma;
  const reason = cleanReason(input.reason, "A resolution reason");
  const appeal = await db.gradeAppeal.findUnique({
    where: { id: input.appealId },
    include: {
      grade: {
        select: {
          id: true,
          submission: { select: { id: true, userId: true } },
        },
      },
    },
  });
  if (!appeal) throw new GradeAppealActionError(404, "Unknown appeal");
  if (appeal.status !== "open") {
    throw new GradeAppealActionError(409, "This appeal is already closed");
  }
  const resolvedAt = (deps.now ?? (() => new Date()))();

  const resolved = await db.$transaction(async (tx) => {
    const changed = await tx.gradeAppeal.updateMany({
      where: { id: appeal.id, status: "open" },
      data: {
        status: "resolved",
        outcome: input.outcome,
        resolvedBy: input.actorId,
        resolvedAt,
      },
    });
    if (changed.count !== 1) {
      throw new GradeAppealActionError(409, "This appeal is already closed");
    }
    if (appeal.holdId) {
      await tx.gradeHold.updateMany({
        where: { id: appeal.holdId, status: "open" },
        data: {
          status: "resolved",
          resolvedBy: input.actorId,
          resolution: reason,
          resolvedAt,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "grade.appeal.resolve",
        targetType: "grade",
        targetId: appeal.grade.id,
        before: {
          appealId: appeal.id,
          status: appeal.status,
          outcome: appeal.outcome,
        } as Prisma.InputJsonValue,
        after: {
          appealId: appeal.id,
          status: "resolved",
          outcome: input.outcome,
          resolution: reason,
        } as Prisma.InputJsonValue,
      },
    });
    await tx.notification.create({
      data: {
        userId: appeal.grade.submission.userId,
        kind: "grade-appeal-resolved",
        title: "Your grade appeal was reviewed",
        body: `Outcome: ${input.outcome.replaceAll("_", " ")}.`,
      },
    });
    return tx.gradeAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
  });
  return appealProjection(resolved);
}
