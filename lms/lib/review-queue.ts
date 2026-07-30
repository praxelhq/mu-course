import { Prisma, type SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reviewThresholdFrom } from "@/lib/ai/grading";
import {
  buildBulkHoldResolutionPreview,
  deriveUnresolvedGradeHolds,
  evaluateFinalisationEligibility,
  reasonKeyForHold,
  type BulkHoldSelection,
  type GradeHoldSnapshot,
} from "@/lib/grade-holds";
import { parseFrozenMembership } from "@/lib/assessment-cohort-freeze";

// Human-oversight core, testable against the seed:
//   getReviewQueue     → provisional grades needing review (low confidence,
//                        flags, and the DYNAMIC top/bottom-5% percentile
//                        outliers — computed here at render time, never at
//                        grade time; see docs/DECISIONS.md)
//   overrideGrade      → one-click instructor override (reason REQUIRED),
//                        audited before/after, student notified
//   finaliseAssignment → batch flip provisional→final, re-running the
//                        percentile check: unreviewed grades that are NOW
//                        outliers are excluded and returned for review
//
// "Latest" everywhere means: the newest grade of the newest submission
// version per frozen ownerKind/ownerId for versioned work. Historical legacy
// rows retain the userId/teamId fallback. A v2 resubmission supersedes v1,
// exactly like the matrix and the dashboard.

export type ReviewReason =
  | "low-confidence"
  | "percentile-high"
  | "percentile-low"
  | (string & {}); // grade flags pass through verbatim (link-dead, …)

export type RubricScoreMap = Record<string, { score: number; rationale: string }>;

export type ReviewQueueItem = {
  gradeId: string;
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  typeTitle: string;
  typeSlug: string;
  version: number;
  submissionStatus: SubmissionStatus;
  studentName: string;
  sectionCode: string | null;
  teamName: string | null;
  total: number;
  confidence: number;
  rubricScores: RubricScoreMap;
  feedbackMd: string;
  flags: string[];
  reasons: ReviewReason[];
  gradeCreatedAt: Date;
};

/** Percentile band: ceil(n·0.05) each side, so any n≥2 flags ≥1 high + 1 low. */
export function percentileBandSize(n: number): number {
  if (n < 2) return 0;
  return Math.ceil(n * 0.05);
}

type Candidate = {
  submission: {
    id: string;
    assignmentId: string;
    userId: string;
    teamId: string | null;
    assessmentVersionId: string | null;
    ownerKind: "individual" | "team" | null;
    ownerId: string | null;
    version: number;
    status: SubmissionStatus;
    assignment: {
      title: string;
      contractMode: "legacy" | "versioned";
      assignmentType: { title: string; slug: string };
    };
    user: { name: string; section: { code: string } | null };
    team: { name: string } | null;
    assessmentResult: { purpose: "graded" | "formative"; status: string } | null;
  };
  grade: {
    id: string;
    total: number;
    confidence: number;
    rubricScores: Prisma.JsonValue;
    feedbackMd: string;
    flags: string[];
    provisional: boolean;
    gradedBy: string;
    overriddenBy: string | null;
    createdAt: Date;
    appeals: { status: "open" | "resolved" | "withdrawn" }[];
    holds: Array<{
      id: string;
      kind: "low_confidence" | "flag" | "outlier" | "repair" | "appeal";
      code: string;
      status: "open" | "resolved";
      updatedAt: Date;
    }>;
  };
};

export type ReviewQueueCandidateIdentity = {
  id: string;
  assignmentId: string;
  userId: string;
  teamId: string | null;
  assessmentVersionId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
};

/**
 * Version-bound submissions group only by their frozen owner identity. The
 * submitter/team fallback is exclusively for historical unversioned rows.
 * A malformed version-bound row remains isolated for human review instead of
 * merging into another learner's candidate.
 */
export function reviewQueueCandidateIdentityKey(
  submission: ReviewQueueCandidateIdentity,
): string {
  if (submission.assessmentVersionId !== null) {
    return submission.ownerKind && submission.ownerId
      ? JSON.stringify([
          "versioned",
          submission.assignmentId,
          submission.ownerKind,
          submission.ownerId,
        ])
      : JSON.stringify(["versioned-unbound", submission.assignmentId, submission.id]);
  }
  return JSON.stringify([
    "legacy",
    submission.assignmentId,
    submission.teamId ?? submission.userId,
  ]);
}

/**
 * Latest provisional grade per owner per assignment. One batched query; rows
 * arrive version-desc/createdAt-desc so the first immutable versioned-owner
 * key (or explicit legacy fallback key) wins.
 */
async function provisionalCandidates(assignmentId?: string): Promise<Candidate[]> {
  const subs = await prisma.submission.findMany({
    where: {
      ...(assignmentId ? { assignmentId } : {}),
      grades: { some: {} },
    },
    select: {
      id: true,
      assignmentId: true,
      userId: true,
      teamId: true,
      assessmentVersionId: true,
      ownerKind: true,
      ownerId: true,
      version: true,
      status: true,
      assignment: {
        select: {
          title: true,
          contractMode: true,
          assignmentType: { select: { title: true, slug: true } },
        },
      },
      user: { select: { name: true, section: { select: { code: true } } } },
      team: { select: { name: true } },
      assessmentResult: { select: { purpose: true, status: true } },
      grades: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          total: true,
          confidence: true,
          rubricScores: true,
          feedbackMd: true,
          flags: true,
          provisional: true,
          gradedBy: true,
          overriddenBy: true,
          createdAt: true,
          appeals: { select: { status: true } },
          holds: {
            select: {
              id: true,
              kind: true,
              code: true,
              status: true,
              updatedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });

  const latest = new Map<string, Candidate>();
  for (const s of subs) {
    const grade = s.grades[0];
    if (!grade) continue;
    const key = reviewQueueCandidateIdentityKey(s);
    if (!latest.has(key)) {
      const { grades, ...submission } = s;
      void grades;
      latest.set(key, { submission, grade });
    }
  }
  return [...latest.values()].filter((c) => c.grade.provisional);
}

/**
 * Percentile membership over one assignment's candidate totals. Returns the
 * grade ids in the top and bottom ceil(n·0.05) (n≥2; n=1 flags nothing).
 */
function percentileOutliers(candidates: Candidate[]): { high: Set<string>; low: Set<string> } {
  const sorted = [...candidates].sort((a, b) => a.grade.total - b.grade.total);
  const k = percentileBandSize(sorted.length);
  const low = new Set(sorted.slice(0, k).map((c) => c.grade.id));
  const high = new Set(sorted.slice(sorted.length - k).map((c) => c.grade.id));
  return { high, low };
}

export async function getReviewQueue(
  opts: { assignmentId?: string } = {},
): Promise<ReviewQueueItem[]> {
  const [config, candidates] = await Promise.all([
    prisma.configKV.findUnique({ where: { key: "grading_defaults" } }),
    provisionalCandidates(opts.assignmentId),
  ]);
  const threshold = reviewThresholdFrom(config?.value);

  const byAssignment = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.submission.assignment.contractMode !== "legacy") continue;
    const list = byAssignment.get(c.submission.assignmentId) ?? [];
    list.push(c);
    byAssignment.set(c.submission.assignmentId, list);
  }
  const outliers = new Map<string, { high: Set<string>; low: Set<string> }>();
  for (const [assignmentId, list] of byAssignment) {
    outliers.set(assignmentId, percentileOutliers(list));
  }

  const items: ReviewQueueItem[] = [];
  for (const c of candidates) {
    let reasons: ReviewReason[] = [];
    if (c.submission.assignment.contractMode === "versioned") {
      if (c.submission.assessmentResult?.purpose === "formative") continue;
      reasons = deriveUnresolvedGradeHolds({
        confidence: c.grade.confidence,
        confidenceThreshold: threshold,
        flags: c.grade.flags,
        persisted: c.grade.holds.map((hold) => ({
          id: hold.id,
          reasonKey: reasonKeyForHold(hold),
          status: hold.status,
          updatedAt: hold.updatedAt,
        })),
        hasOpenAppeal: c.grade.appeals.some((appeal) => appeal.status === "open"),
        repairRequired: c.submission.assessmentResult?.status === "repair_required",
      });
    } else {
      if (c.grade.confidence < threshold) reasons.push("low-confidence");
      for (const flag of c.grade.flags) reasons.push(flag);
      const bands = outliers.get(c.submission.assignmentId)!;
      if (bands.high.has(c.grade.id)) reasons.push("percentile-high");
      if (bands.low.has(c.grade.id)) reasons.push("percentile-low");
    }
    if (reasons.length === 0) continue;

    items.push({
      gradeId: c.grade.id,
      submissionId: c.submission.id,
      assignmentId: c.submission.assignmentId,
      assignmentTitle: c.submission.assignment.title,
      typeTitle: c.submission.assignment.assignmentType.title,
      typeSlug: c.submission.assignment.assignmentType.slug,
      version: c.submission.version,
      submissionStatus: c.submission.status,
      studentName: c.submission.user.name,
      sectionCode: c.submission.user.section?.code ?? null,
      teamName: c.submission.team?.name ?? null,
      total: c.grade.total,
      confidence: c.grade.confidence,
      rubricScores: parseRubricScores(c.grade.rubricScores),
      feedbackMd: c.grade.feedbackMd,
      flags: c.grade.flags,
      reasons,
      gradeCreatedAt: c.grade.createdAt,
    });
  }

  // Escalation-worthy first: more reasons, then lowest confidence, then age.
  items.sort(
    (a, b) =>
      b.reasons.length - a.reasons.length ||
      a.confidence - b.confidence ||
      a.gradeCreatedAt.getTime() - b.gradeCreatedAt.getTime(),
  );
  return items;
}

/** Grade.rubricScores JSON → per-dimension {score, rationale} map (defensive). */
export function parseRubricScores(json: Prisma.JsonValue): RubricScoreMap {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
  const out: RubricScoreMap = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (value && typeof value === "object" && typeof (value as { score?: unknown }).score === "number") {
      const v = value as { score: number; rationale?: unknown };
      out[key] = { score: v.score, rationale: typeof v.rationale === "string" ? v.rationale : "" };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Override
// ---------------------------------------------------------------------------

/** Typed failure for API routes: 400 (bad input) or 404 (unknown grade). */
export class ReviewActionError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "ReviewActionError";
    this.status = status;
  }
}

export type OverrideGradeInput = {
  gradeId: string;
  actorId: string;
  /** Per-dimension score edits; unmentioned dimensions keep their scores. */
  rubricScores?: Record<string, number>;
  /** Explicit total; when omitted with rubricScores, the total is recomputed. */
  total?: number;
  feedbackMd?: string;
  reason: string;
};

export async function overrideGrade(input: OverrideGradeInput): Promise<{ total: number }> {
  const reason = input.reason?.trim();
  if (!reason) throw new ReviewActionError(400, "A reason is required to override a grade");

  const grade = await prisma.grade.findUnique({
    where: { id: input.gradeId },
    include: {
      submission: {
        select: { id: true, userId: true, assignment: { select: { title: true } } },
      },
    },
  });
  if (!grade) throw new ReviewActionError(404, "Unknown grade");

  const before = {
    rubricScores: grade.rubricScores,
    total: grade.total,
    confidence: grade.confidence,
    feedbackMd: grade.feedbackMd,
    flags: grade.flags,
    gradedBy: grade.gradedBy,
    provisional: grade.provisional,
    overriddenBy: grade.overriddenBy,
    overrideReason: grade.overrideReason,
  };

  // Merge score edits onto the existing per-dimension map.
  const scores = parseRubricScores(grade.rubricScores);
  if (input.rubricScores) {
    for (const [key, score] of Object.entries(input.rubricScores)) {
      if (!Number.isFinite(score) || score < 0) {
        throw new ReviewActionError(400, `Invalid score for "${key}"`);
      }
      scores[key] = { score, rationale: scores[key]?.rationale ?? "" };
    }
  }
  const recomputed = Object.values(scores).reduce((sum, d) => sum + d.score, 0);
  const total = input.total ?? (input.rubricScores ? recomputed : grade.total);

  const after = {
    ...before,
    rubricScores: scores,
    total,
    feedbackMd: input.feedbackMd?.trim() ? input.feedbackMd : grade.feedbackMd,
    gradedBy: "human",
    overriddenBy: input.actorId,
    overrideReason: reason,
  };

  await prisma.$transaction([
    prisma.grade.update({
      where: { id: grade.id },
      data: {
        rubricScores: scores as unknown as Prisma.InputJsonValue,
        total,
        feedbackMd: after.feedbackMd,
        gradedBy: "human",
        overriddenBy: input.actorId,
        overrideReason: reason,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "grade.override",
        targetType: "grade",
        targetId: grade.id,
        before: before as unknown as Prisma.InputJsonValue,
        after: after as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.notification.create({
      data: {
        userId: grade.submission.userId,
        kind: "grade-updated",
        title: "Your grade was reviewed and updated",
        body: `An instructor reviewed your "${grade.submission.assignment.title}" grade and updated it. The new total is ${total}.`,
      },
    }),
  ]);

  return { total };
}

// ---------------------------------------------------------------------------
// Batch finalise
// ---------------------------------------------------------------------------

export type NewlyFlaggedGrade = {
  gradeId: string;
  submissionId: string;
  studentName: string;
  total: number;
  reason: "percentile-high" | "percentile-low";
};

export type FinalisePlan = {
  /** Submissions (with their latest grade id) that will be finalised. */
  batch: { submissionId: string; gradeId: string }[];
  /** Unreviewed grades that are NOW percentile outliers — held for review. */
  newlyFlagged: NewlyFlaggedGrade[];
};

export type VersionedHeldGrade = {
  gradeId: string;
  submissionId: string;
  studentName: string;
  total: number;
  reasons: string[];
};

export type VersionedExcludedGrade = {
  gradeId: string;
  submissionId: string;
  reason: "not-in-frozen-cohort";
};

type VersionedFinalisePlan = FinalisePlan & {
  held: VersionedHeldGrade[];
  excluded: VersionedExcludedGrade[];
};

type ReviewDb = typeof prisma | Prisma.TransactionClient;

async function planVersionedFinalise(
  db: ReviewDb,
  assignmentId: string,
): Promise<VersionedFinalisePlan> {
  const [assignment, thresholdConfig, freezes, submissions] = await Promise.all([
    db.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, contractMode: true, dueAt: true },
    }),
    db.configKV.findUnique({ where: { key: "grading_defaults" } }),
    db.assessmentCohortFreeze.findMany({
      where: { assessmentVersion: { assignmentId } },
      select: {
        id: true,
        assessmentVersionId: true,
        sectionId: true,
        membership: true,
      },
    }),
    db.submission.findMany({
      where: { assignmentId, status: "graded", grades: { some: { provisional: true } } },
      select: {
        id: true,
        assessmentVersionId: true,
        ownerKind: true,
        user: { select: { name: true, sectionId: true } },
        team: { select: { sectionId: true } },
        assessmentResult: { select: { purpose: true, status: true } },
        grades: {
          where: { provisional: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            total: true,
            confidence: true,
            flags: true,
            appeals: { select: { status: true } },
            holds: {
              select: {
                id: true,
                kind: true,
                code: true,
                status: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);
  if (!assignment) throw new ReviewActionError(404, "Unknown assignment");
  if (assignment.contractMode !== "versioned") {
    throw new ReviewActionError(400, "Assignment does not use versioned finalisation");
  }
  if (!assignment.dueAt) {
    throw new ReviewActionError(400, "A published submission cutoff is required");
  }
  if (new Date() < assignment.dueAt) {
    throw new ReviewActionError(409, "Grades cannot be finalised before the cohort cutoff");
  }

  const threshold = reviewThresholdFrom(thresholdConfig?.value);
  const freezeByVersionSection = new Map(
    freezes.map((freeze) => [
      `${freeze.assessmentVersionId}:${freeze.sectionId}`,
      {
        id: freeze.id,
        members: new Set(
          parseFrozenMembership(freeze.membership).map(
            (member) => `${member.submissionId}:${member.gradeId}`,
          ),
        ),
      },
    ]),
  );
  const batch: FinalisePlan["batch"] = [];
  const held: VersionedHeldGrade[] = [];
  const excluded: VersionedExcludedGrade[] = [];
  const missingFreezes = new Set<string>();

  for (const submission of submissions) {
    const grade = submission.grades[0];
    if (!grade || !submission.assessmentVersionId || !submission.ownerKind) continue;
    const sectionId =
      submission.ownerKind === "team"
        ? submission.team?.sectionId
        : submission.user.sectionId;
    if (!sectionId) {
      throw new ReviewActionError(409, "A versioned grade has no canonical cohort section");
    }
    const freezeKey = `${submission.assessmentVersionId}:${sectionId}`;
    const freeze = freezeByVersionSection.get(freezeKey);
    if (!freeze) {
      missingFreezes.add(freezeKey);
      continue;
    }
    if (!freeze.members.has(`${submission.id}:${grade.id}`)) {
      excluded.push({
        gradeId: grade.id,
        submissionId: submission.id,
        reason: "not-in-frozen-cohort",
      });
      continue;
    }
    const persisted: GradeHoldSnapshot[] = grade.holds.map((hold) => ({
      id: hold.id,
      reasonKey: reasonKeyForHold(hold),
      status: hold.status,
      updatedAt: hold.updatedAt,
    }));
    const unresolvedReasons = deriveUnresolvedGradeHolds({
      confidence: grade.confidence,
      confidenceThreshold: threshold,
      flags: grade.flags,
      persisted,
      hasOpenAppeal: grade.appeals.some((appeal) => appeal.status === "open"),
      repairRequired: submission.assessmentResult?.status === "repair_required",
    });
    const eligibility = evaluateFinalisationEligibility({
      purpose: submission.assessmentResult?.purpose ?? "graded",
      versioned: true,
      cohortFrozen: true,
      unresolvedReasons,
    });
    if (!eligibility.eligible) {
      held.push({
        gradeId: grade.id,
        submissionId: submission.id,
        studentName: submission.user.name,
        total: grade.total,
        reasons:
          eligibility.reason === "unresolved-holds"
            ? eligibility.unresolvedReasons
            : [eligibility.reason],
      });
      continue;
    }
    batch.push({ submissionId: submission.id, gradeId: grade.id });
  }

  if (missingFreezes.size > 0) {
    throw new ReviewActionError(
      409,
      `Cohort membership must be frozen before finalisation (${missingFreezes.size} missing)`,
    );
  }
  return { batch, newlyFlagged: [], held, excluded };
}

/**
 * The finalise plan for an assignment: every graded-status submission's
 * latest grade, MINUS grades that the re-run percentile check flags as
 * outliers and that no human has reviewed yet (overriddenBy null). Superseded
 * older versions finalise with the batch but never participate in ranking.
 */
async function planFinalise(assignmentId: string): Promise<FinalisePlan> {
  // Everything graded-status (including superseded versions) with its latest grade.
  const gradedSubs = await prisma.submission.findMany({
    where: { assignmentId, status: "graded", grades: { some: {} } },
    select: {
      id: true,
      grades: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });

  // Percentile re-run over the SAME candidate set the queue ranks: latest
  // version per owner, provisional grades only.
  const candidates = (await provisionalCandidates(assignmentId)).filter(
    (c) => c.submission.status === "graded",
  );
  const { high, low } = percentileOutliers(candidates);

  const newlyFlagged: NewlyFlaggedGrade[] = [];
  for (const c of candidates) {
    if (c.grade.overriddenBy !== null) continue; // human-reviewed → finalises
    const reason = high.has(c.grade.id)
      ? ("percentile-high" as const)
      : low.has(c.grade.id)
        ? ("percentile-low" as const)
        : null;
    if (!reason) continue;
    newlyFlagged.push({
      gradeId: c.grade.id,
      submissionId: c.submission.id,
      studentName: c.submission.user.name,
      total: c.grade.total,
      reason,
    });
  }

  const heldSubmissionIds = new Set(newlyFlagged.map((f) => f.submissionId));
  const batch = gradedSubs
    .filter((s) => !heldSubmissionIds.has(s.id))
    .map((s) => ({ submissionId: s.id, gradeId: s.grades[0].id }));

  return { batch, newlyFlagged };
}

/** Dry-run for the confirm dialog: how many finalise, who gets held back. */
export async function previewFinalise(
  assignmentId: string,
): Promise<{
  count: number;
  newlyFlagged: NewlyFlaggedGrade[];
  held?: VersionedHeldGrade[];
  excluded?: VersionedExcludedGrade[];
}> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { contractMode: true },
  });
  if (!assignment) throw new ReviewActionError(404, "Unknown assignment");
  if (assignment.contractMode === "versioned") {
    const plan = await planVersionedFinalise(prisma, assignmentId);
    return {
      count: plan.batch.length,
      newlyFlagged: plan.newlyFlagged,
      held: plan.held,
      excluded: plan.excluded,
    };
  }
  const plan = await planFinalise(assignmentId);
  return { count: plan.batch.length, newlyFlagged: plan.newlyFlagged };
}

export async function finaliseAssignment(input: {
  assignmentId: string;
  actorId: string;
}): Promise<{
  finalised: number;
  newlyFlagged: NewlyFlaggedGrade[];
  held?: VersionedHeldGrade[];
  excluded?: VersionedExcludedGrade[];
}> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true, contractMode: true },
  });
  if (!assignment) throw new ReviewActionError(404, "Unknown assignment");

  if (assignment.contractMode === "versioned") {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const plan = await planVersionedFinalise(tx, input.assignmentId);
          const submissionIds = plan.batch.map((row) => row.submissionId);
          const gradeIds = plan.batch.map((row) => row.gradeId);
          const gradesChanged = await tx.grade.updateMany({
            where: { id: { in: gradeIds }, provisional: true },
            data: { provisional: false },
          });
          const submissionsChanged = await tx.submission.updateMany({
            where: { id: { in: submissionIds }, status: "graded" },
            data: { status: "finalised" },
          });
          if (
            gradesChanged.count !== gradeIds.length ||
            submissionsChanged.count !== submissionIds.length
          ) {
            throw new ReviewActionError(
              409,
              "The finalisation preview is stale; refresh and confirm again",
            );
          }
          await tx.auditLog.create({
            data: {
              actorId: input.actorId,
              action: "assignment.finalise",
              targetType: "assignment",
              targetId: input.assignmentId,
              after: {
                contractMode: "versioned",
                finalised: plan.batch.length,
                submissionIds,
                gradeIds,
                held: plan.held,
                excluded: plan.excluded,
              } as unknown as Prisma.InputJsonValue,
            },
          });
          return {
            finalised: plan.batch.length,
            newlyFlagged: plan.newlyFlagged,
            held: plan.held,
            excluded: plan.excluded,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ReviewActionError(
          409,
          "The cohort changed during finalisation; refresh and confirm again",
        );
      }
      throw error;
    }
  }

  const plan = await planFinalise(input.assignmentId);
  const submissionIds = plan.batch.map((b) => b.submissionId);
  const gradeIds = plan.batch.map((b) => b.gradeId);

  await prisma.$transaction([
    prisma.grade.updateMany({
      where: { id: { in: gradeIds } },
      data: { provisional: false },
    }),
    prisma.submission.updateMany({
      where: { id: { in: submissionIds } },
      data: { status: "finalised" },
    }),
    prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "assignment.finalise",
        targetType: "assignment",
        targetId: input.assignmentId,
        after: {
          finalised: plan.batch.length,
          submissionIds,
          gradeIds,
          newlyFlagged: plan.newlyFlagged,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return { finalised: plan.batch.length, newlyFlagged: plan.newlyFlagged };
}

// ---------------------------------------------------------------------------
// Explicit selected-row hold resolution
// ---------------------------------------------------------------------------

const MAX_BULK_HOLD_SELECTIONS = 200;

export type BulkHoldResolutionResult = {
  selectedCount: number;
  readyCount: number;
  impactedGradeIds: string[];
  resolved: { holdId: string; gradeId: string | null }[];
  failures: {
    holdId: string;
    reason:
      | "not-visible"
      | "cause-mismatch"
      | "stale"
      | "already-resolved"
      | "duplicate-selection";
  }[];
};

export async function resolveSelectedGradeHolds(input: {
  cause: string;
  selected: BulkHoldSelection[];
  actorId: string;
  reason?: string;
  confirmed: boolean;
}): Promise<BulkHoldResolutionResult> {
  const cause = input.cause.trim();
  if (!cause) throw new ReviewActionError(400, "A hold cause is required");
  if (cause === "appeal") {
    throw new ReviewActionError(400, "Appeals require an individual recorded outcome");
  }
  if (input.selected.length === 0) {
    throw new ReviewActionError(400, "Select at least one visible hold row");
  }
  if (input.selected.length > MAX_BULK_HOLD_SELECTIONS) {
    throw new ReviewActionError(
      400,
      `Select no more than ${MAX_BULK_HOLD_SELECTIONS} visible hold rows`,
    );
  }
  const selectedIds = [...new Set(input.selected.map((selection) => selection.holdId))];
  const rows = await prisma.gradeHold.findMany({
    where: { id: { in: selectedIds } },
    select: {
      id: true,
      gradeId: true,
      submissionId: true,
      kind: true,
      code: true,
      status: true,
      updatedAt: true,
    },
  });
  const preview = buildBulkHoldResolutionPreview({
    cause,
    selected: input.selected,
    visibleRows: rows.map((row) => ({
      id: row.id,
      reasonKey: reasonKeyForHold(row),
      status: row.status,
      updatedAt: row.updatedAt,
    })),
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const impactedGradeIds = [
    ...new Set(
      preview.ready.flatMap((selection) => {
        const gradeId = rowById.get(selection.holdId)?.gradeId;
        return gradeId ? [gradeId] : [];
      }),
    ),
  ];
  const result: BulkHoldResolutionResult = {
    selectedCount: input.selected.length,
    readyCount: preview.ready.length,
    impactedGradeIds,
    resolved: [],
    failures: [...preview.failures],
  };
  if (!input.confirmed) return result;

  const resolution = input.reason?.trim() ?? "";
  if (!resolution) {
    throw new ReviewActionError(400, "A resolution reason is required after confirmation");
  }
  if (resolution.length > 2_000) {
    throw new ReviewActionError(400, "Resolution reason must be 2,000 characters or fewer");
  }

  const updatedRows =
    preview.ready.length === 0
      ? []
      : await prisma.$transaction(async (tx) => {
          const updated = await tx.gradeHold.updateManyAndReturn({
            where: {
              status: "open",
              OR: preview.ready.map((selection) => ({
                id: selection.holdId,
                updatedAt: new Date(selection.expectedUpdatedAt),
              })),
            },
            data: {
              status: "resolved",
              resolvedBy: input.actorId,
              resolution,
              resolvedAt: new Date(),
            },
            select: {
              id: true,
              gradeId: true,
            },
          });
          const updatedIds = new Set(updated.map((row) => row.id));
          const auditRows: Prisma.AuditLogCreateManyInput[] = preview.ready.flatMap(
            (selection) => {
              if (!updatedIds.has(selection.holdId)) return [];
              const row = rowById.get(selection.holdId)!;
              return [
                {
                  actorId: input.actorId,
                  action: "grade.hold.resolve",
                  targetType: row.gradeId ? "grade" : "gradeHold",
                  targetId: row.gradeId ?? row.id,
                  before: {
                    holdId: row.id,
                    cause,
                    status: "open",
                    expectedUpdatedAt: selection.expectedUpdatedAt,
                  } as Prisma.InputJsonValue,
                  after: {
                    holdId: row.id,
                    cause,
                    status: "resolved",
                    resolution,
                  } as Prisma.InputJsonValue,
                },
              ];
            },
          );
          if (auditRows.length > 0) {
            await tx.auditLog.createMany({ data: auditRows });
          }
          return updated;
        });

  const updatedIds = new Set(updatedRows.map((row) => row.id));
  for (const selection of preview.ready) {
    const row = rowById.get(selection.holdId)!;
    if (updatedIds.has(row.id)) {
      result.resolved.push({ holdId: row.id, gradeId: row.gradeId });
    } else {
      result.failures.push({ holdId: row.id, reason: "stale" });
    }
  }
  result.readyCount = result.resolved.length;
  result.impactedGradeIds = [
    ...new Set(result.resolved.flatMap((row) => (row.gradeId ? [row.gradeId] : []))),
  ];
  return result;
}
