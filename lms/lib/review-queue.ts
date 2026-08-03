import type { Prisma, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reviewThresholdFrom } from "@/lib/ai/grading";

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
// version per owner (userId, or teamId for team-based assignments) — a v2
// resubmission supersedes v1, exactly like the matrix and the dashboard.

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
    version: number;
    status: SubmissionStatus;
    assignment: {
      title: string;
      assignmentType: { title: string; slug: string };
    };
    user: { name: string; section: { code: string } | null };
    team: { name: string } | null;
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
  };
};

/**
 * Latest provisional grade per owner (user or team) per assignment. One
 * batched query; rows arrive version-desc/createdAt-desc so the first row
 * per (assignment, owner) key wins.
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
      version: true,
      status: true,
      assignment: {
        select: { title: true, assignmentType: { select: { title: true, slug: true } } },
      },
      user: { select: { name: true, section: { select: { code: true } } } },
      team: { select: { name: true } },
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
        },
      },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });

  const latest = new Map<string, Candidate>();
  for (const s of subs) {
    const grade = s.grades[0];
    if (!grade) continue;
    const key = `${s.assignmentId}:${s.teamId ?? s.userId}`;
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
    const reasons: ReviewReason[] = [];
    if (c.grade.confidence < threshold) reasons.push("low-confidence");
    for (const flag of c.grade.flags) reasons.push(flag);
    const bands = outliers.get(c.submission.assignmentId)!;
    if (bands.high.has(c.grade.id)) reasons.push("percentile-high");
    if (bands.low.has(c.grade.id)) reasons.push("percentile-low");
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
  readonly status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
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
): Promise<{ count: number; newlyFlagged: NewlyFlaggedGrade[] }> {
  const plan = await planFinalise(assignmentId);
  return { count: plan.batch.length, newlyFlagged: plan.newlyFlagged };
}

export async function finaliseAssignment(input: {
  assignmentId: string;
  actorId: string;
}): Promise<{ finalised: number; newlyFlagged: NewlyFlaggedGrade[] }> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true },
  });
  if (!assignment) throw new ReviewActionError(404, "Unknown assignment");

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
