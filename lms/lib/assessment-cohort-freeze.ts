import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  canonicalFrozenMembership,
  chooseLatestFrozenCohortCandidates,
  selectFrozenOutlierHolds,
  type FrozenMembershipCandidate,
  type FrozenMembershipItem,
} from "@/lib/grade-holds";

export class CohortFreezeActionError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "CohortFreezeActionError";
    this.status = status;
  }
}

function hashMembership(membership: FrozenMembershipItem[]): string {
  return createHash("sha256").update(JSON.stringify(membership)).digest("hex");
}

export function parseFrozenMembership(value: Prisma.JsonValue): FrozenMembershipItem[] {
  if (!Array.isArray(value)) return [];
  const members: FrozenMembershipItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      (row.ownerKind !== "individual" && row.ownerKind !== "team") ||
      typeof row.ownerId !== "string" ||
      typeof row.submissionId !== "string" ||
      typeof row.gradeId !== "string"
    ) {
      continue;
    }
    members.push({
      ownerKind: row.ownerKind,
      ownerId: row.ownerId,
      submissionId: row.submissionId,
      gradeId: row.gradeId,
    });
  }
  return canonicalFrozenMembership(members.map((member) => ({ ...member, total: 0 })));
}

export type FrozenCohortResult = {
  id: string;
  assessmentVersionId: string;
  sectionId: string;
  cutoffAt: Date;
  frozenAt: Date;
  membershipHash: string;
  memberCount: number;
  membership: FrozenMembershipItem[];
  outlierHoldCount: number;
  existing: boolean;
};

/**
 * Close one assessment-version/section cohort after its published cutoff and
 * persist both exact membership and its percentile holds in one transaction.
 */
export async function freezeAssessmentCohort(
  input: {
    assessmentVersionId: string;
    sectionId: string;
    actorId: string;
  },
  deps: { prisma?: PrismaClient; now?: () => Date } = {},
): Promise<FrozenCohortResult> {
  const db = deps.prisma ?? defaultPrisma;
  const now = (deps.now ?? (() => new Date()))();
  const version = await db.assessmentVersion.findUnique({
    where: { id: input.assessmentVersionId },
    select: {
      id: true,
      purpose: true,
      publishedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          contractMode: true,
          dueAt: true,
          sectionIds: true,
        },
      },
    },
  });
  if (!version) throw new CohortFreezeActionError(404, "Unknown assessment version");
  if (version.assignment.contractMode !== "versioned" || !version.publishedAt) {
    throw new CohortFreezeActionError(400, "Only a published versioned assessment can freeze");
  }
  if (version.purpose === "formative") {
    throw new CohortFreezeActionError(400, "Formative feedback does not enter grade finalisation");
  }
  if (!version.assignment.sectionIds.includes(input.sectionId)) {
    throw new CohortFreezeActionError(404, "Unknown assessment section");
  }
  const cutoffAt = version.assignment.dueAt;
  if (!cutoffAt) {
    throw new CohortFreezeActionError(400, "A published submission cutoff is required");
  }
  if (now < cutoffAt) {
    throw new CohortFreezeActionError(409, "The assessment cohort cannot freeze before cutoff");
  }

  const existing = await db.assessmentCohortFreeze.findUnique({
    where: {
      assessmentVersionId_sectionId: {
        assessmentVersionId: version.id,
        sectionId: input.sectionId,
      },
    },
  });
  if (existing) {
    return {
      ...existing,
      membership: parseFrozenMembership(existing.membership),
      outlierHoldCount: await db.gradeHold.count({ where: { cohortFreezeId: existing.id } }),
      existing: true,
    };
  }

  const submissions = await db.submission.findMany({
    where: {
      assessmentVersionId: version.id,
      status: { in: ["submitted", "grading", "graded"] },
      submittedAt: { not: null, lte: cutoffAt },
      OR: [
        { ownerKind: "individual", user: { sectionId: input.sectionId } },
        { ownerKind: "team", team: { sectionId: input.sectionId } },
      ],
    },
    select: {
      id: true,
      ownerKind: true,
      ownerId: true,
      version: true,
      attempt: true,
      status: true,
      submittedAt: true,
      assessmentResult: { select: { id: true } },
      grades: {
        where: { provisional: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, total: true },
      },
    },
    orderBy: [
      { version: "desc" },
      { attempt: "desc" },
      { submittedAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const selection = chooseLatestFrozenCohortCandidates(
    submissions.map((submission) => ({
      ownerKind: submission.ownerKind,
      ownerId: submission.ownerId,
      submissionId: submission.id,
      status: submission.status,
      grade: submission.grades[0] ?? null,
      assessmentResultId: submission.assessmentResult?.id ?? null,
    })),
  );
  if (selection.blockedOwnerKeys.length > 0) {
    throw new CohortFreezeActionError(
      409,
      `Cohort grading is incomplete for ${selection.blockedOwnerKeys.length} owner(s)`,
    );
  }
  const candidates: Array<
    FrozenMembershipCandidate & { assessmentResultId: string | null }
  > = selection.candidates;
  const membership = canonicalFrozenMembership(candidates);
  const membershipHash = hashMembership(membership);
  const outliers = selectFrozenOutlierHolds(candidates);
  const candidateBySubmission = new Map(candidates.map((row) => [row.submissionId, row]));

  try {
    return await db.$transaction(
      async (tx) => {
        const frozen = await tx.assessmentCohortFreeze.create({
          data: {
            assessmentVersionId: version.id,
            sectionId: input.sectionId,
            cutoffAt,
            frozenAt: now,
            frozenBy: input.actorId,
            membership: membership as unknown as Prisma.InputJsonValue,
            membershipHash,
            memberCount: membership.length,
          },
        });
        if (outliers.length > 0) {
          await tx.gradeHold.createMany({
            data: outliers.map((outlier) => ({
              submissionId: outlier.submissionId,
              gradeId: outlier.gradeId,
              assessmentResultId:
                candidateBySubmission.get(outlier.submissionId)?.assessmentResultId ?? null,
              cohortFreezeId: frozen.id,
              kind: "outlier" as const,
              code: outlier.code,
              reason:
                outlier.code === "percentile-high"
                  ? "Frozen cohort top-five-percent outlier requires instructor review."
                  : "Frozen cohort bottom-five-percent outlier requires instructor review.",
              createdBy: input.actorId,
            })),
            skipDuplicates: true,
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            action: "assessment.cohort.freeze",
            targetType: "assessmentVersion",
            targetId: version.id,
            after: {
              freezeId: frozen.id,
              sectionId: input.sectionId,
              cutoffAt: cutoffAt.toISOString(),
              membershipHash,
              memberCount: membership.length,
              outlierHoldCount: outliers.length,
            } as Prisma.InputJsonValue,
          },
        });
        return {
          id: frozen.id,
          assessmentVersionId: version.id,
          sectionId: input.sectionId,
          cutoffAt,
          frozenAt: now,
          membershipHash,
          memberCount: membership.length,
          membership,
          outlierHoldCount: outliers.length,
          existing: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CohortFreezeActionError(409, "This assessment cohort is already frozen");
    }
    throw error;
  }
}
