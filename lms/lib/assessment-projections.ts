import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { appealProjection, type LearnerAppealProjection } from "@/lib/grade-appeals";
import { reasonKeyForHold } from "@/lib/grade-holds";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import { parseScoringPolicy } from "@/lib/assessment-policies";
import {
  EXTERNAL_FINGERPRINT_PREFIX,
  SCREENSHOT_BLOCKED,
} from "@/lib/galleries";
import {
  fingerprintPublicationSource,
  parsePublicationPolicy,
  type PublicationPolicy,
} from "@/lib/publication-policy";
import {
  grantState,
  selectSubmissionVersions,
  type GrantState,
} from "@/lib/submission-versions";
import { scanSensitiveText } from "@/lib/evidence/sensitive-data";

type ProjectionDeps = { prisma?: PrismaClient };

export type LearnerAssessmentIdentity = {
  assessmentVersionId: string;
  version: number;
  checksumSha256: string;
  dataset: {
    id: string;
    slug: string;
    version: number;
    title: string;
    checksumSha256: string;
  } | null;
};

export type LearnerPublicationProjection = {
  ownerState: "not-consented" | "consented" | "revoked";
  ownerConsentAt: string | null;
  instructorState: "pending" | "approved" | "withheld" | "revoked";
  instructorReason: string | null;
  instructorDecidedAt: string | null;
};

export type LearnerSubmissionHistoryItem = {
  submissionId: string;
  version: number;
  attempt: number;
  lifecycle: string;
  submittedAt: string | null;
  createdAt: string;
  assessment: LearnerAssessmentIdentity | null;
  result: {
    status: string;
    scoreable: boolean;
    publishable: boolean;
    completedAt: string | null;
  } | null;
  feedback: LearnerAssessmentFeedbackProjection | null;
  latestGrade: {
    gradeId: string;
    state: "provisional" | "final";
    createdAt: string;
    appeals: LearnerAppealProjection[];
  } | null;
  workflowNominationEligible: boolean;
  publication: LearnerPublicationProjection | null;
};

export type LearnerAssessmentFeedbackProjection = {
  summaryMd: string;
  actionItems: string[];
  citations: { dimension: string; evidenceCount: number }[];
};

const forbiddenLearnerFeedback =
  /(answer.?key|confidence|evaluator|prompt.?log|raw.?log|run.?log|trust.?mrr)/i;
const secretAssignmentInFeedback =
  /(?:api[_-]?token|authorization|credential|password|secret|webhook[_-]?(?:key|token))\s*[:=]\s*\S+/i;

function safeLearnerFeedbackText(value: unknown, role: string): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (
    !text ||
    text.length > 10_000 ||
    forbiddenLearnerFeedback.test(text) ||
    secretAssignmentInFeedback.test(text)
  ) {
    return null;
  }
  return scanSensitiveText(text, role).length === 0 ? text : null;
}

/**
 * Allowlisted learner feedback only. Scores, confidence, flags, conflicts,
 * raw evidence ids and repair receipt ids in AssessmentResult JSON are never
 * copied into this shape.
 */
export function projectLearnerAssessmentFeedback(
  structuredFeedback: unknown,
  citations: unknown,
): LearnerAssessmentFeedbackProjection | null {
  if (!structuredFeedback || typeof structuredFeedback !== "object" || Array.isArray(structuredFeedback)) {
    return null;
  }
  const source = structuredFeedback as Record<string, unknown>;
  const summaryMd = safeLearnerFeedbackText(source.feedbackMd, "assessment-feedback");
  if (!summaryMd) return null;
  const actionItems = Array.isArray(source.actionItems)
    ? source.actionItems
        .slice(0, 20)
        .flatMap((item, index) => {
          const safe = safeLearnerFeedbackText(item, `assessment-action:${index}`);
          return safe ? [safe] : [];
        })
    : [];
  const citationProjection = Array.isArray(citations)
    ? citations.slice(0, 50).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        if (
          typeof row.dimension !== "string" ||
          !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(row.dimension) ||
          forbiddenLearnerFeedback.test(row.dimension) ||
          !Array.isArray(row.evidenceIds)
        ) {
          return [];
        }
        return [{ dimension: row.dimension, evidenceCount: row.evidenceIds.length }];
      })
    : [];
  return { summaryMd, actionItems, citations: citationProjection };
}

export type LearnerGrantProjection = {
  grantId: string;
  assessmentVersionId: string;
  kind: "improvement" | "repair";
  state: GrantState;
  targetVersion: number;
  targetAttempt: number;
  expiresAt: string;
  consumedAt: string | null;
};

export type LearnerAssignmentProjection = {
  assignment: {
    id: string;
    title: string;
    contractMode: "legacy" | "versioned";
  };
  activeAssessment: LearnerAssessmentIdentity | null;
  history: LearnerSubmissionHistoryItem[];
  latestSubmittedId: string | null;
  latestEvaluatedId: string | null;
  latestScoreableId: string | null;
  latestPublishableId: string | null;
  grants: LearnerGrantProjection[];
  workflow: {
    nominations: {
      nominationId: string;
      submissionId: string;
      status: "pending" | "accepted" | "rejected" | "withdrawn";
      createdAt: string;
      updatedAt: string;
    }[];
    selectedSubmissionId: string | null;
    selectedAt: string | null;
  };
};

function learnerPublication(
  decision: {
    ownerConsent: boolean;
    ownerConsentAt: Date | null;
    ownerRevokedAt: Date | null;
    instructorState: "pending" | "approved" | "withheld" | "revoked";
    instructorReason: string | null;
    instructorDecidedAt: Date | null;
  } | null,
): LearnerPublicationProjection | null {
  if (!decision) return null;
  return {
    ownerState: decision.ownerRevokedAt
      ? "revoked"
      : decision.ownerConsent
        ? "consented"
        : "not-consented",
    ownerConsentAt: decision.ownerConsentAt?.toISOString() ?? null,
    instructorState: decision.instructorState,
    instructorReason: decision.instructorReason,
    instructorDecidedAt: decision.instructorDecidedAt?.toISOString() ?? null,
  };
}

/**
 * Complete learner-safe state for one assignment. No evaluator config,
 * evidence locator, grade value/confidence, hold id, or publication fingerprint
 * is selected, so UI components cannot accidentally serialize those fields.
 */
export async function getLearnerAssignmentProjection(
  input: { userId: string; assignmentId: string; now?: Date },
  deps: ProjectionDeps = {},
): Promise<LearnerAssignmentProjection | null> {
  const db = deps.prisma ?? defaultPrisma;
  const [user, assignment] = await Promise.all([
    db.user.findUnique({ where: { id: input.userId }, select: { teamId: true } }),
    db.assignment.findUnique({
      where: { id: input.assignmentId },
      select: {
        id: true,
        title: true,
        contractMode: true,
        activeAssessmentVersion: {
          select: {
            id: true,
            version: true,
            checksumSha256: true,
            datasetRelease: {
              select: {
                id: true,
                slug: true,
                version: true,
                title: true,
                checksumSha256: true,
              },
            },
          },
        },
      },
    }),
  ]);
  if (!user || !assignment) return null;

  const ownerSubmissionClauses: Prisma.SubmissionWhereInput[] = [
    {
      assessmentVersionId: { not: null },
      ownerKind: "individual",
      ownerId: input.userId,
    },
    { assessmentVersionId: null, userId: input.userId },
  ];
  const ownerGrantClauses: Prisma.ResubmissionGrantWhereInput[] = [
    { ownerKind: "individual", ownerId: input.userId },
  ];
  if (user.teamId) {
    ownerSubmissionClauses.push(
      {
        assessmentVersionId: { not: null },
        ownerKind: "team",
        ownerId: user.teamId,
      },
      { assessmentVersionId: null, teamId: user.teamId },
    );
    ownerGrantClauses.push({ ownerKind: "team", ownerId: user.teamId });
  }

  const [submissions, grants, nominations, selection] = await Promise.all([
    db.submission.findMany({
      where: { assignmentId: input.assignmentId, OR: ownerSubmissionClauses },
      select: {
        id: true,
        version: true,
        attempt: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        assessmentVersion: {
          select: {
            id: true,
            version: true,
            checksumSha256: true,
            purpose: true,
            scoringPolicy: true,
            publicationPolicy: true,
            datasetRelease: {
              select: {
                id: true,
                slug: true,
                version: true,
                title: true,
                checksumSha256: true,
              },
            },
          },
        },
        assessmentResult: {
          select: {
            status: true,
            scoreable: true,
            publishable: true,
            completedAt: true,
            structuredFeedback: true,
            citations: true,
          },
        },
        grades: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            provisional: true,
            createdAt: true,
            appeals: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                gradeId: true,
                reason: true,
                status: true,
                outcome: true,
                createdAt: true,
                updatedAt: true,
                resolvedAt: true,
              },
            },
          },
        },
        publicationDecision: {
          select: {
            ownerConsent: true,
            ownerConsentAt: true,
            ownerRevokedAt: true,
            instructorState: true,
            instructorReason: true,
            instructorDecidedAt: true,
          },
        },
      },
    }),
    db.resubmissionGrant.findMany({
      where: { assignmentId: input.assignmentId, OR: ownerGrantClauses },
      orderBy: [{ targetVersion: "desc" }, { targetAttempt: "desc" }],
      select: {
        id: true,
        assessmentVersionId: true,
        kind: true,
        targetVersion: true,
        targetAttempt: true,
        expiresAt: true,
        consumedAt: true,
      },
    }),
    user.teamId
      ? db.teamWorkflowNomination.findMany({
          where: { teamId: user.teamId, assignmentId: input.assignmentId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            submissionId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    user.teamId
      ? db.teamWorkflowSelection.findUnique({
          where: {
            teamId_assignmentId: {
              teamId: user.teamId,
              assignmentId: input.assignmentId,
            },
          },
          select: { submissionId: true, updatedAt: true },
        })
      : Promise.resolve(null),
  ]);

  const selected = selectSubmissionVersions(
    submissions.map((submission) => ({
      ...submission,
      assessmentResult: submission.assessmentResult,
      grades: submission.grades,
    })),
  );
  const history: LearnerSubmissionHistoryItem[] = selected.history.map((submission) => {
    const grade = submission.grades[0] ?? null;
    const assessment = submission.assessmentVersion;
    return {
      submissionId: submission.id,
      version: submission.version,
      attempt: submission.attempt,
      lifecycle: submission.status,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      createdAt: submission.createdAt.toISOString(),
      assessment: assessment
        ? {
            assessmentVersionId: assessment.id,
            version: assessment.version,
            checksumSha256: assessment.checksumSha256,
            dataset: assessment.datasetRelease,
          }
        : null,
      result: submission.assessmentResult
        ? {
            status: submission.assessmentResult.status,
            scoreable: submission.assessmentResult.scoreable,
            publishable: submission.assessmentResult.publishable,
            completedAt: submission.assessmentResult.completedAt?.toISOString() ?? null,
          }
        : null,
      feedback: projectLearnerAssessmentFeedback(
        submission.assessmentResult?.structuredFeedback,
        submission.assessmentResult?.citations,
      ),
      latestGrade: grade
        ? {
            gradeId: grade.id,
            state: grade.provisional ? "provisional" : "final",
            createdAt: grade.createdAt.toISOString(),
            appeals: grade.appeals.map(appealProjection),
          }
        : null,
      workflowNominationEligible: Boolean(
        submission.status === "finalised" &&
          grade &&
          !grade.provisional &&
          assessment?.purpose === "graded" &&
          parseScoringPolicy(assessment.scoringPolicy)?.component === "workflow",
      ),
      publication: parsePublicationPolicy(assessment?.publicationPolicy)
        ? (learnerPublication(submission.publicationDecision) ?? {
            ownerState: "not-consented",
            ownerConsentAt: null,
            instructorState: "pending",
            instructorReason: null,
            instructorDecidedAt: null,
          })
        : null,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      contractMode: assignment.contractMode,
    },
    activeAssessment: assignment.activeAssessmentVersion
      ? {
          assessmentVersionId: assignment.activeAssessmentVersion.id,
          version: assignment.activeAssessmentVersion.version,
          checksumSha256: assignment.activeAssessmentVersion.checksumSha256,
          dataset: assignment.activeAssessmentVersion.datasetRelease,
        }
      : null,
    history,
    latestSubmittedId: selected.latestSubmitted?.id ?? null,
    latestEvaluatedId: selected.latestEvaluated?.id ?? null,
    latestScoreableId: selected.latestScoreable?.id ?? null,
    latestPublishableId: selected.latestPublishable?.id ?? null,
    grants: grants.map((grant) => ({
      grantId: grant.id,
      assessmentVersionId: grant.assessmentVersionId,
      kind: grant.kind,
      state: grantState(grant, input.now),
      targetVersion: grant.targetVersion,
      targetAttempt: grant.targetAttempt,
      expiresAt: grant.expiresAt.toISOString(),
      consumedAt: grant.consumedAt?.toISOString() ?? null,
    })),
    workflow: {
      nominations: nominations.map((nomination) => ({
        nominationId: nomination.id,
        submissionId: nomination.submissionId,
        status: nomination.status,
        createdAt: nomination.createdAt.toISOString(),
        updatedAt: nomination.updatedAt.toISOString(),
      })),
      selectedSubmissionId: selection?.submissionId ?? null,
      selectedAt: selection?.updatedAt.toISOString() ?? null,
    },
  };
}

export type InstructorGradeHoldProjection = {
  holdId: string;
  expectedUpdatedAt: string;
  cause: string;
  reason: string;
  createdAt: string;
  display: {
    submissionId: string;
    assignmentId: string;
    assignmentTitle: string;
    ownerName: string;
    sectionCode: string | null;
    version: number;
    attempt: number;
    lifecycle: string;
  };
};

export async function listInstructorGradeHoldProjections(
  input: { assignmentId?: string } = {},
  deps: ProjectionDeps = {},
): Promise<InstructorGradeHoldProjection[]> {
  const db = deps.prisma ?? defaultPrisma;
  const holds = await db.gradeHold.findMany({
    where: {
      status: "open",
      ...(input.assignmentId
        ? { submission: { assignmentId: input.assignmentId } }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      kind: true,
      code: true,
      reason: true,
      createdAt: true,
      updatedAt: true,
      submission: {
        select: {
          id: true,
          ownerKind: true,
          version: true,
          attempt: true,
          status: true,
          assignment: { select: { id: true, title: true } },
          user: { select: { name: true, section: { select: { code: true } } } },
          team: { select: { name: true, section: { select: { code: true } } } },
        },
      },
    },
  });
  return holds.map((hold) => ({
    holdId: hold.id,
    expectedUpdatedAt: hold.updatedAt.toISOString(),
    cause: reasonKeyForHold(hold),
    reason: hold.reason,
    createdAt: hold.createdAt.toISOString(),
    display: {
      submissionId: hold.submission.id,
      assignmentId: hold.submission.assignment.id,
      assignmentTitle: hold.submission.assignment.title,
      ownerName:
        hold.submission.ownerKind === "team"
          ? (hold.submission.team?.name ?? "Unknown team")
          : hold.submission.user.name,
      sectionCode:
        hold.submission.ownerKind === "team"
          ? (hold.submission.team?.section.code ?? null)
          : (hold.submission.user.section?.code ?? null),
      version: hold.submission.version,
      attempt: hold.submission.attempt,
      lifecycle: hold.submission.status,
    },
  }));
}

export type InstructorOpenAppealProjection = {
  appealId: string;
  gradeId: string;
  reason: string;
  openedAt: string;
  updatedAt: string;
  display: InstructorGradeHoldProjection["display"];
};

export async function listInstructorOpenAppealProjections(
  input: { assignmentId?: string } = {},
  deps: ProjectionDeps = {},
): Promise<InstructorOpenAppealProjection[]> {
  const db = deps.prisma ?? defaultPrisma;
  const appeals = await db.gradeAppeal.findMany({
    where: {
      status: "open",
      ...(input.assignmentId
        ? { grade: { submission: { assignmentId: input.assignmentId } } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      gradeId: true,
      reason: true,
      createdAt: true,
      updatedAt: true,
      grade: {
        select: {
          submission: {
            select: {
              id: true,
              ownerKind: true,
              version: true,
              attempt: true,
              status: true,
              assignment: { select: { id: true, title: true } },
              user: { select: { name: true, section: { select: { code: true } } } },
              team: { select: { name: true, section: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });
  return appeals.map((appeal) => {
    const submission = appeal.grade.submission;
    return {
      appealId: appeal.id,
      gradeId: appeal.gradeId,
      reason: appeal.reason,
      openedAt: appeal.createdAt.toISOString(),
      updatedAt: appeal.updatedAt.toISOString(),
      display: {
        submissionId: submission.id,
        assignmentId: submission.assignment.id,
        assignmentTitle: submission.assignment.title,
        ownerName:
          submission.ownerKind === "team"
            ? (submission.team?.name ?? "Unknown team")
            : submission.user.name,
        sectionCode:
          submission.ownerKind === "team"
            ? (submission.team?.section.code ?? null)
            : (submission.user.section?.code ?? null),
        version: submission.version,
        attempt: submission.attempt,
        lifecycle: submission.status,
      },
    };
  });
}

export type InstructorPublicationCandidate = {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  version: number;
  attempt: number;
  ownerName: string;
  wall: PublicationPolicy["wall"];
  resultStatus: string | null;
  publishable: boolean;
  previewReady: boolean;
  previewUrl: string | null;
  ownerState: LearnerPublicationProjection["ownerState"];
  instructorState: LearnerPublicationProjection["instructorState"];
  instructorReason: string | null;
  reviewCurrent: boolean;
};

function publicFingerprintReady(args: {
  policy: PublicationPolicy;
  screenshotS3Key: string | null;
}): boolean {
  const requiresMarker =
    args.policy.wall !== "app" &&
    args.policy.actions.some(
      (action) => action.kind === "external-url" && action.requireReviewedFingerprint,
    );
  return !requiresMarker || Boolean(args.screenshotS3Key?.startsWith(EXTERNAL_FINGERPRINT_PREFIX));
}

export async function listInstructorPublicationCandidates(
  input: { assignmentId?: string } = {},
  deps: ProjectionDeps = {},
): Promise<InstructorPublicationCandidate[]> {
  const db = deps.prisma ?? defaultPrisma;
  const submissions = await db.submission.findMany({
    where: {
      assessmentVersionId: { not: null },
      status: { not: "draft" },
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      version: true,
      attempt: true,
      ownerKind: true,
      fields: true,
      assignment: { select: { id: true, title: true } },
      user: { select: { name: true } },
      team: { select: { name: true } },
      assessmentVersion: {
        select: { publicationPolicy: true, publicSchema: true },
      },
      assessmentResult: { select: { status: true, publishable: true } },
      publicationDecision: {
        select: {
          ownerConsent: true,
          ownerConsentAt: true,
          ownerRevokedAt: true,
          instructorState: true,
          instructorReason: true,
          instructorDecidedAt: true,
          reviewedFingerprint: true,
          previewS3Key: true,
        },
      },
      evidence: {
        select: {
          id: true,
          fieldKey: true,
          fileRole: true,
          scanState: true,
          sha256: true,
          s3VersionId: true,
          byteCount: true,
        },
      },
      galleryItem: { select: { screenshotS3Key: true } },
    },
  });

  return submissions.flatMap((submission) => {
    const policy = parsePublicationPolicy(submission.assessmentVersion?.publicationPolicy);
    if (!policy) return [];
    const fields =
      submission.fields &&
      typeof submission.fields === "object" &&
      !Array.isArray(submission.fields)
        ? (submission.fields as Record<string, unknown>)
        : {};
    const screenshotS3Key = submission.galleryItem?.screenshotS3Key ?? null;
    const previewRef =
      submission.publicationDecision?.previewS3Key ?? screenshotS3Key;
    const referencedEvidence = selectReferencedEvidence({
      publicSchema: submission.assessmentVersion?.publicSchema,
      fields,
      evidence: submission.evidence,
    });
    const cleanPreview = referencedEvidence.some(
      (item) => item.fileRole === policy.previewRole && item.scanState === "clean",
    );
    const previewReady =
      cleanPreview ||
      (policy.wall === "app" &&
        Boolean(previewRef && previewRef !== SCREENSHOT_BLOCKED));
    const fingerprintReady = publicFingerprintReady({
      policy,
      screenshotS3Key: previewRef,
    });
    const currentFingerprint = fingerprintReady
      ? fingerprintPublicationSource({
          policy,
          fields,
          evidence: referencedEvidence.map((item) => ({
            role: item.fileRole,
            sha256: item.sha256,
            s3VersionId: item.s3VersionId,
            byteCount: item.byteCount,
          })),
          previewRef,
        })
      : null;
    const decision = learnerPublication(submission.publicationDecision);
    return [
      {
        submissionId: submission.id,
        assignmentId: submission.assignment.id,
        assignmentTitle: submission.assignment.title,
        version: submission.version,
        attempt: submission.attempt,
        ownerName:
          submission.ownerKind === "team"
            ? (submission.team?.name ?? "Unknown team")
            : submission.user.name,
        wall: policy.wall,
        resultStatus: submission.assessmentResult?.status ?? null,
        publishable: submission.assessmentResult?.publishable === true,
        previewReady,
        previewUrl: previewReady
          ? policy.wall === "app"
            ? `/api/gallery/image/${encodeURIComponent(submission.id)}`
            : `/api/gallery/evidence/${encodeURIComponent(submission.id)}/${encodeURIComponent(policy.previewRole)}`
          : null,
        ownerState: decision?.ownerState ?? "not-consented",
        instructorState: decision?.instructorState ?? "pending",
        instructorReason: decision?.instructorReason ?? null,
        reviewCurrent: Boolean(
          currentFingerprint &&
            submission.publicationDecision?.reviewedFingerprint === currentFingerprint,
        ),
      },
    ];
  });
}

export type InstructorWorkflowCandidate = {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  teamId: string;
  teamName: string;
  studentName: string;
  version: number;
  attempt: number;
  resultStatus: string | null;
  scoreable: boolean;
  hasFinalGrade: boolean;
  selectable: boolean;
  nominations: {
    nominationId: string;
    status: "pending" | "accepted" | "rejected" | "withdrawn";
    reason: string;
    createdAt: string;
  }[];
  selection: {
    selected: boolean;
    reason: string;
    selectedAt: string;
  } | null;
};

export async function listInstructorWorkflowCandidates(
  input: { assignmentId?: string } = {},
  deps: ProjectionDeps = {},
): Promise<InstructorWorkflowCandidate[]> {
  const db = deps.prisma ?? defaultPrisma;
  const submissions = await db.submission.findMany({
    where: {
      assessmentVersionId: { not: null },
      status: "finalised",
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      version: true,
      attempt: true,
      teamId: true,
      assignment: { select: { id: true, title: true } },
      user: { select: { name: true } },
      team: { select: { id: true, name: true } },
      assessmentVersion: { select: { purpose: true, scoringPolicy: true } },
      assessmentResult: { select: { status: true, scoreable: true } },
      grades: {
        where: { provisional: false },
        take: 1,
        select: { id: true },
      },
      workflowNominations: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, reason: true, createdAt: true },
      },
      workflowSelections: {
        take: 1,
        select: { reason: true, updatedAt: true },
      },
    },
  });

  return submissions.flatMap((submission) => {
    const policy = parseScoringPolicy(submission.assessmentVersion?.scoringPolicy);
    const teamId = submission.teamId ?? submission.team?.id ?? null;
    if (
      submission.assessmentVersion?.purpose !== "graded" ||
      policy?.component !== "workflow" ||
      !teamId
    ) {
      return [];
    }
    const selection = submission.workflowSelections[0] ?? null;
    const hasFinalGrade = submission.grades.length > 0;
    const scoreable = submission.assessmentResult?.scoreable === true;
    return [
      {
        submissionId: submission.id,
        assignmentId: submission.assignment.id,
        assignmentTitle: submission.assignment.title,
        teamId,
        teamName: submission.team?.name ?? "Unknown team",
        studentName: submission.user.name,
        version: submission.version,
        attempt: submission.attempt,
        resultStatus: submission.assessmentResult?.status ?? null,
        scoreable,
        hasFinalGrade,
        selectable: scoreable && hasFinalGrade,
        nominations: submission.workflowNominations.map((nomination) => ({
          nominationId: nomination.id,
          status: nomination.status,
          reason: nomination.reason,
          createdAt: nomination.createdAt.toISOString(),
        })),
        selection: selection
          ? {
              selected: true,
              reason: selection.reason,
              selectedAt: selection.updatedAt.toISOString(),
            }
          : null,
      },
    ];
  });
}
