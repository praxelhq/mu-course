// The human half of the reviewer: the queue, the second opinion, the ruling.
//
// SPEC §6 says a low-confidence verdict, a contradiction, an outlier, and a
// disputed return all end up in front of a person. This module is everything
// that happens after that:
//
//   loadReviewQueue   what an instructor sees, newest first
//   escalateReview    a SECOND OPINION from the escalation tier, stored on the
//                     review's promptLog — advice for the human, never a verdict
//   disputeReview     the student's one appeal per return, which escalates
//   humanResolve      the ruling, which is the only thing that moves a gate
//                     once a review has been held
//
// Two rules worth stating plainly, because they are what make the queue safe:
//
//   * A second opinion NEVER changes a submission's status. It is written into
//     `promptLog.escalation` and `needsHuman` stays true. Only `humanResolve`
//     rules.
//   * `humanResolve` does not write a second ShipyardReview. It resolves the
//     one that is already there — recording the AI's original verdict inside
//     `promptLog.humanResolve` first — so a submission has exactly one review
//     per attempt and the audit trail reads in one place.

import { Prisma, type PrismaClient, type ShipyardVerdict } from "@prisma/client";
import { callStructured as defaultCallStructured } from "@/lib/ai/openrouter";
import { loadRouterState, saveRouterState, type RouterState } from "@/lib/ai/router";
import { prisma as defaultPrisma } from "@/lib/db";
import { getObjectBuffer } from "@/lib/s3";
import type { TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { ShipyardError } from "./errors";
import { parseFieldSpecs } from "./fields";
import { recomputeGates } from "./gate-state";
import { HELD_PASS_BODY } from "./review-complete";
import {
  asFields,
  asReasons,
  COST_FEATURE_ESCALATION,
  parseStoredFiles,
  REVIEWER_ACTOR,
  writeCostLog,
} from "./review-pipeline";
import { assembleReviewContext } from "./reviewer/context";
import { escalationOutputSchema, type EscalationOutput, type VerdictOutput } from "./reviewer/schemas";
import { parseEscalation } from "./reviewer/verdict";
import type { ReasonView } from "./view-models";

export const AUDIT_RESOLVE = "shipyard.review.resolve";
export const AUDIT_ESCALATE = "shipyard.review.escalate";
export const AUDIT_DISPUTE = "shipyard.review.dispute";

/** The instructor's own reason is appended under this criterion id. */
export const INSTRUCTOR_CRITERION = "instructor";
/** A student gets one appeal per review. A second is refused, not queued. */
export const DISPUTE_NOTE_MAX = 500;

export type EscalateDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
  call?: typeof defaultCallStructured;
  fetchFile?: (key: string) => Promise<Buffer>;
};

// ---------------------------------------------------------------------------
// Loading one review, with everything a human or a second model needs
// ---------------------------------------------------------------------------

const reviewSelect = {
  id: true,
  verdict: true,
  reasons: true,
  rubricScores: true,
  confidence: true,
  needsHuman: true,
  humanResolvedAt: true,
  overriddenBy: true,
  overrideReason: true,
  reviewedBy: true,
  modelUsed: true,
  providerUsed: true,
  promptLog: true,
  renderArtifacts: true,
  metricSignalsSeen: true,
  createdAt: true,
  submissionId: true,
  submission: {
    select: {
      id: true,
      status: true,
      version: true,
      fields: true,
      files: true,
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
          oneLiner: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              section: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
      checkpoint: {
        select: {
          id: true,
          key: true,
          order: true,
          title: true,
          barMarkdown: true,
          rubric: true,
          gateType: true,
          acceptsImages: true,
          fieldSchema: true,
        },
      },
    },
  },
} satisfies Prisma.ShipyardReviewSelect;

type LoadedReview = Prisma.ShipyardReviewGetPayload<{ select: typeof reviewSelect }>;

async function loadReview(db: PrismaClient, reviewId: string): Promise<LoadedReview> {
  const review = await db.shipyardReview.findUnique({
    where: { id: reviewId },
    select: reviewSelect,
  });
  if (!review) throw new ShipyardError(404, { error: "No such review." });
  return review;
}

function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The first verdict, as the escalation prompt wants it. The model's raw
 * `VerdictOutput` is not stored as such — the review row holds the pieces —
 * so it is reassembled from the columns and the promptLog.
 */
export function firstVerdictOf(review: LoadedReview): VerdictOutput {
  const log = asObject(review.promptLog);
  const scores = asObject(review.rubricScores);
  const rubricScores: Record<string, number> = {};
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === "number") rubricScores[key] = value;
  }
  return {
    verdict: review.verdict === "pass" ? "pass" : "return",
    confidence: review.confidence,
    reasons: asReasons(review.reasons),
    rubricScores,
    contradictions: asStringArray(log.contradictions),
    flags: asStringArray(log.flags).filter(
      (f): f is VerdictOutput["flags"][number] =>
        f === "spam" ||
        f === "blank" ||
        f === "near_duplicate" ||
        f === "unsafe_content" ||
        f === "needs_human",
    ),
    summaryForStudent:
      typeof log.summaryForStudent === "string"
        ? log.summaryForStudent
        : (asReasons(review.reasons).find((r) => !r.met)?.note ?? ""),
  };
}

// ---------------------------------------------------------------------------
// The second opinion
// ---------------------------------------------------------------------------

export type EscalationResult = {
  reviewId: string;
  escalation: EscalationOutput;
  modelUsed: string;
  providerUsed: string;
  costUsd: number;
};

/**
 * Run the escalation tier over the same evidence and store the answer beside
 * the first verdict. The render is REPLAYED from `renderArtifacts` rather than
 * re-run: a student's product may have changed since, and the point of a second
 * opinion is to look again at what the first reviewer looked at.
 */
export async function escalateReview(
  reviewId: string,
  args: { actorId: string; studentDispute?: string | null; extraReasons?: string[] },
  deps: EscalateDeps = {},
): Promise<EscalationResult> {
  const db = deps.db ?? defaultPrisma;
  const call = deps.call ?? defaultCallStructured;
  const now = deps.now ?? new Date();
  const review = await loadReview(db, reviewId);
  const submission = review.submission;
  const checkpoint = submission.checkpoint;

  const log = asObject(review.promptLog);
  const rubric = checkpoint.rubric as { criteria?: { id: string }[] } | null;
  const criteria = (rubric?.criteria ?? []).map((c) => c.id);
  const fetchFile = deps.fetchFile ?? ((key: string) => getObjectBuffer(key));
  const artifacts = asObject(review.renderArtifacts);

  const escalationReasons = [
    ...asStringArray(log.needsHumanReasons),
    ...(args.extraReasons ?? []),
  ];

  const screenshotKey =
    typeof artifacts.screenshotS3Key === "string" ? artifacts.screenshotS3Key : null;
  let screenshotPng: Buffer | null = null;
  if (screenshotKey) {
    screenshotPng = await fetchFile(screenshotKey).catch(() => null);
  }

  const context = await assembleReviewContext({
    checkpoint: {
      key: checkpoint.key,
      title: checkpoint.title,
      barMarkdown: checkpoint.barMarkdown,
      rubric: (checkpoint.rubric ?? { criteria: [], passRule: "all-criteria-met" }) as never,
      acceptsImages: checkpoint.acceptsImages,
      fieldSchema: parseFieldSpecs(checkpoint.fieldSchema) ?? [],
    },
    submission: { fields: asFields(submission.fields), files: parseStoredFiles(submission.files) },
    product: { name: submission.product.name, oneLiner: submission.product.oneLiner },
    student: {
      name: submission.product.user.name,
      email: submission.product.user.email,
      sectionCode: submission.product.user.section?.code ?? null,
      sectionName: submission.product.user.section?.name ?? null,
    },
    fetchFile,
    render:
      typeof artifacts.domText === "string"
        ? {
            domText: artifacts.domText,
            screenshotNote:
              typeof artifacts.notes === "object" && Array.isArray(artifacts.notes)
                ? artifacts.notes.join("; ")
                : "the render captured for the first review",
            screenshotPng,
          }
        : null,
    signals: (review.metricSignalsSeen ?? null) as TrackerSignals | null,
    attempt: submission.version,
    previousReasons: null,
    escalation: {
      firstVerdict: firstVerdictOf(review),
      escalationReasons,
      studentDispute: args.studentDispute ?? null,
    },
  });

  const routerState = await loadRouterState(db);
  const response = await call(
    {
      task: "escalation",
      system: context.prompt.system,
      user: context.prompt.user,
      schema: escalationOutputSchema,
      temperature: 0,
    },
    routerDeps(db, routerState),
  );
  await writeCostLog(db, COST_FEATURE_ESCALATION, submission.id, response);

  const escalation = parseEscalation(response.raw, { criteria });

  await db.shipyardReview.update({
    where: { id: reviewId },
    data: {
      // A second opinion never resolves anything; it is evidence for a human.
      needsHuman: true,
      promptLog: {
        ...log,
        escalation: {
          at: now.toISOString(),
          requestedBy: args.actorId,
          modelUsed: response.modelUsed,
          providerUsed: response.providerUsed,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          costUsd: response.costUsd,
          agreesWithFirstVerdict: escalation.agreesWithFirstVerdict,
          verdict: escalation.verdict,
          confidence: escalation.confidence,
          humanNote: escalation.humanNote,
          reasons: escalation.reasons,
          contradictions: escalation.contradictions,
          flags: escalation.flags,
          summaryForStudent: escalation.summaryForStudent,
          raw: response.raw,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: args.actorId,
      action: AUDIT_ESCALATE,
      targetType: "ShipyardReview",
      targetId: reviewId,
      before: { verdict: review.verdict, confidence: review.confidence },
      after: {
        agreesWithFirstVerdict: escalation.agreesWithFirstVerdict,
        verdict: escalation.verdict,
        modelUsed: response.modelUsed,
        costUsd: response.costUsd,
      },
    },
  });

  return {
    reviewId,
    escalation,
    modelUsed: response.modelUsed,
    providerUsed: response.providerUsed,
    costUsd: response.costUsd,
  };
}

function routerDeps(db: PrismaClient, state: RouterState) {
  return {
    routerState: state,
    onRouterState: async (next: RouterState) => {
      await saveRouterState(db, next, REVIEWER_ACTOR);
    },
  };
}

// ---------------------------------------------------------------------------
// The student's appeal
// ---------------------------------------------------------------------------

export type DisputeResult = EscalationResult & { disputedAt: string };

/**
 * One dispute per review, on a `return` only, by the student who owns it.
 *
 * The cap is per REVIEW rather than per student or per hour: an appeal is
 * about one specific verdict, a second appeal against the same verdict adds
 * nothing a human has not already been handed, and a student who resubmits
 * gets a new review and therefore a new appeal if they need one.
 */
export async function disputeReview(
  reviewId: string,
  args: { userId: string; note: string },
  deps: EscalateDeps = {},
): Promise<DisputeResult> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();
  const review = await loadReview(db, reviewId);

  if (review.submission.product.userId !== args.userId) {
    throw new ShipyardError(404, { error: "No such review." });
  }
  if (review.verdict !== "return") {
    throw new ShipyardError(409, {
      error: "Only a returned submission can be disputed.",
    });
  }
  const log = asObject(review.promptLog);
  if (log.dispute) {
    throw new ShipyardError(409, {
      error: "You have already disputed this review; an instructor has it.",
    });
  }
  const note = args.note.trim();
  if (note === "" || note.length > DISPUTE_NOTE_MAX) {
    throw new ShipyardError(400, {
      error: `Say what you think the reviewer got wrong, in ${DISPUTE_NOTE_MAX} characters or fewer.`,
    });
  }

  await db.shipyardReview.update({
    where: { id: reviewId },
    data: {
      needsHuman: true,
      promptLog: {
        ...log,
        dispute: { note, at: now.toISOString() },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: args.userId,
      action: AUDIT_DISPUTE,
      targetType: "ShipyardReview",
      targetId: reviewId,
      before: { verdict: review.verdict, needsHuman: review.needsHuman },
      after: { note, disputedAt: now.toISOString() },
    },
  });

  const escalated = await escalateReview(
    reviewId,
    {
      actorId: args.userId,
      studentDispute: note,
      extraReasons: ["the student disputes this return"],
    },
    deps,
  );
  return { ...escalated, disputedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// The ruling
// ---------------------------------------------------------------------------

export type HumanResolveResult = {
  reviewId: string;
  submissionId: string;
  productId: string;
  decision: ShipyardVerdict;
  status: "passed" | "returned";
  overrode: boolean;
  checkpointOrder: number;
  states: Awaited<ReturnType<typeof recomputeGates>>;
};

/**
 * An instructor's ruling on a queued review. This is the ONLY thing that
 * clears a gate a held pass left shut.
 */
export async function humanResolve(
  reviewId: string,
  args: { decision: ShipyardVerdict; reason: string; actorId: string },
  deps: EscalateDeps = {},
): Promise<HumanResolveResult> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();
  const review = await loadReview(db, reviewId);

  if (review.humanResolvedAt) {
    throw new ShipyardError(409, { error: "That review has already been resolved." });
  }
  const reason = args.reason.trim();
  if (reason === "") {
    throw new ShipyardError(400, { error: "A ruling needs a reason." });
  }

  const overrode = review.verdict !== args.decision;
  const status = args.decision === "pass" ? "passed" : "returned";
  const aiReasons = asReasons(review.reasons);
  const reasons: ReasonView[] =
    args.decision === "return"
      ? [...aiReasons, { criterion: INSTRUCTOR_CRITERION, met: false, note: reason }]
      : aiReasons;
  const log = asObject(review.promptLog);

  await db.$transaction(async (tx) => {
    await tx.shipyardReview.update({
      where: { id: reviewId },
      data: {
        verdict: args.decision,
        reasons: reasons as unknown as Prisma.InputJsonValue,
        // Resolved: the gate rule may count this review now.
        needsHuman: false,
        humanResolvedAt: now,
        overriddenBy: args.actorId,
        overrideReason: reason,
        // Only a DIFFERENT answer makes this a human's verdict. An instructor
        // confirming the model's call leaves the credit where it belongs.
        reviewedBy: overrode ? "human" : review.reviewedBy,
        promptLog: {
          ...log,
          humanResolve: {
            at: now.toISOString(),
            by: args.actorId,
            decision: args.decision,
            reason,
            aiVerdict: review.verdict,
            overrode,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.shipyardSubmission.update({
      where: { id: review.submissionId },
      data: { status },
    });
  });

  const states = await recomputeGates(review.submission.productId, {
    db,
    tracker: deps.tracker,
    now,
  });

  await db.auditLog.create({
    data: {
      actorId: args.actorId,
      action: AUDIT_RESOLVE,
      targetType: "ShipyardReview",
      targetId: reviewId,
      before: {
        verdict: review.verdict,
        needsHuman: review.needsHuman,
        submissionStatus: review.submission.status,
      },
      after: {
        verdict: args.decision,
        submissionStatus: status,
        overrode,
        reason,
      },
    },
  });

  try {
    await db.notification.create({
      data: {
        userId: review.submission.product.userId,
        kind: "shipyard.review",
        title: `Checkpoint ${review.submission.checkpoint.order} ${
          args.decision === "pass" ? "cleared" : "returned"
        }`,
        body:
          args.decision === "pass"
            ? "A reviewer looked at this and confirmed it. The next checkpoint is open."
            : reason,
      },
    });
  } catch (err) {
    console.error(
      `[shipyard] resolve notification failed for review ${reviewId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    reviewId,
    submissionId: review.submissionId,
    productId: review.submission.productId,
    decision: args.decision,
    status,
    overrode,
    checkpointOrder: review.submission.checkpoint.order,
    states,
  };
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export type QueueEntry = {
  reviewId: string;
  submissionId: string;
  createdAt: string;
  verdict: ShipyardVerdict;
  confidence: number;
  /** True when the reviewer passed it and the pass is being held (SPEC §6). */
  heldPass: boolean;
  needsHumanReasons: string[];
  modelUsed: string;
  student: { id: string; name: string | null; email: string; sectionCode: string | null };
  product: { id: string; name: string };
  checkpoint: { key: string; order: number; title: string };
  attempt: number;
  submissionStatus: string;
  summaryForStudent: string | null;
  disputed: { note: string; at: string } | null;
  escalation: {
    agreesWithFirstVerdict: boolean;
    verdict: string;
    humanNote: string;
    modelUsed: string;
  } | null;
};

/** What the human queue shows: unresolved, flagged reviews, newest first. */
export async function loadReviewQueue(
  args: { sectionId?: string | null; limit?: number } = {},
  deps: { db?: PrismaClient } = {},
): Promise<QueueEntry[]> {
  const db = deps.db ?? defaultPrisma;
  const rows = await db.shipyardReview.findMany({
    where: {
      needsHuman: true,
      humanResolvedAt: null,
      ...(args.sectionId
        ? { submission: { product: { user: { sectionId: args.sectionId } } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, args.limit ?? 200), 500),
    select: reviewSelect,
  });

  return rows.map((review) => {
    const log = asObject(review.promptLog);
    const escalation = asObject(log.escalation);
    const dispute = asObject(log.dispute);
    return {
      reviewId: review.id,
      submissionId: review.submissionId,
      createdAt: review.createdAt.toISOString(),
      verdict: review.verdict,
      confidence: review.confidence,
      heldPass: review.verdict === "pass",
      needsHumanReasons: asStringArray(log.needsHumanReasons),
      modelUsed: review.modelUsed,
      student: {
        id: review.submission.product.user.id,
        name: review.submission.product.user.name,
        email: review.submission.product.user.email,
        sectionCode: review.submission.product.user.section?.code ?? null,
      },
      product: { id: review.submission.product.id, name: review.submission.product.name },
      checkpoint: {
        key: review.submission.checkpoint.key,
        order: review.submission.checkpoint.order,
        title: review.submission.checkpoint.title,
      },
      attempt: review.submission.version,
      submissionStatus: review.submission.status,
      summaryForStudent:
        typeof log.summaryForStudent === "string" ? log.summaryForStudent : null,
      disputed:
        typeof dispute.note === "string"
          ? { note: dispute.note, at: String(dispute.at ?? "") }
          : null,
      escalation:
        typeof escalation.humanNote === "string"
          ? {
              agreesWithFirstVerdict: escalation.agreesWithFirstVerdict === true,
              verdict: String(escalation.verdict ?? ""),
              humanNote: escalation.humanNote,
              modelUsed: String(escalation.modelUsed ?? ""),
            }
          : null,
    };
  });
}

export { HELD_PASS_BODY };
