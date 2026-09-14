// The Course 2 grade, assembled from the things that already happened.
//
// `lib/shipyard/scoring.ts` owns the formula and is pure. This module owns
// where its inputs come from: two reviewer verdicts, the tracker's verified
// numbers, and the six gate states. It is the only writer of `ShipyardGrade`.
//
// THE RULES THAT LIVE HERE (SPEC §7, docs/DECISIONS.md 2026-09-15)
//   • A FINALISED grade is never recomputed. Once faculty have signed a
//     number, a later tracker refresh or re-review must not move it silently;
//     `computeProductGrade` returns the stored row and says it skipped.
//   • Product quality reads the LATEST PASSED review of checkpoints 3 and 6,
//     or the latest human-resolved one — a pass that is still waiting on a
//     human is not yet a score.
//   • Every metric input is the tracker's Verified tier. No student-typed
//     field reaches a component, exactly as no student-typed field reaches a
//     gate.
//   • A blocking flag from the tracker, or spam found by the reviewer, scores
//     distribution zero. The gate and the grade agree about integrity.
//   • Nothing is ever NaN. A student halfway through the course has zeros and
//     nulls, not holes.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import type { CheckpointRubric } from "./checkpoints";
import { SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import {
  computeGrade,
  deriveComponents,
  GRADE_COMPONENT_KEYS,
  WEIGHTS_V1,
  WEIGHTS_VERSION_V1,
  WORKFLOW_TARGETS,
  type ComponentInputs,
  type GradeComponentKey,
  type GradeWeights,
} from "./scoring";
import type { GradeLineView, ReasonView } from "./view-models";

type Db = Prisma.TransactionClient | PrismaClient;

export type GradeDeps = {
  db?: Db;
  tracker?: TrackerClient;
  /** Skip the tracker call when the caller already has fresh signals. */
  signals?: TrackerSignals | null;
  now?: Date;
};

/** The checkpoints whose reviews feed a component. */
const PRODUCT_QUALITY_CHECKPOINTS = ["working", "launch"] as const;

/**
 * The launch rubric's distribution half. SPEC §7 scores "getting real users,
 * done well and honestly" — so the criteria that judge the launch itself, the
 * channels, the first customer's arrival, and whether any of it was spam.
 * `numbers-agree` and `learning` judge honesty of reporting and reflection;
 * they belong to product quality's half of the launch review, not this one.
 */
export const LAUNCH_DISTRIBUTION_CRITERIA = [
  "launch-account",
  "channels",
  "first-customer",
  "no-spam",
] as const;

export const GRADE_COMPONENT_LABELS: Record<GradeComponentKey, string> = {
  productQuality: "Product quality",
  realNumbers: "Real numbers",
  workflow: "Workflow",
  distribution: "Distribution and launch",
};

export const GRADE_COMPONENT_SOURCES: Record<GradeComponentKey, string> = {
  productQuality: "Reviewer · checkpoints 3 and 6",
  realNumbers: "Shipped.money · Verified only",
  workflow: "Shipped.money",
  distribution: "Reviewer + Shipped.money",
};

// ---------------------------------------------------------------------------
// Pure: reviewer rubric scores → component inputs
// ---------------------------------------------------------------------------

export type ReviewFacts = {
  reviewId: string;
  createdAt: Date;
  /** Internal per-criterion scores, keyed by rubric criterion id. */
  rubricScores: Record<string, number>;
  /** The checkpoint's rubric, for the criterion weights. Null if unreadable. */
  rubric: CheckpointRubric | null;
  reasons: ReasonView[];
};

export type GradeFacts = {
  /** Checkpoint 3's scoring review, or null if it has not passed yet. */
  working: ReviewFacts | null;
  /** Checkpoint 6's scoring review, or null. */
  launch: ReviewFacts | null;
  /** The tracker's Verified signals, or null when it cannot answer. */
  signals: TrackerSignals | null;
  allCheckpointsCleared: boolean;
};

const clamp100 = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Read a numeric rubric score, or null when it is absent or not a number. */
function scoreOf(scores: Record<string, number>, id: string): number | null {
  const value = scores[id];
  return typeof value === "number" && Number.isFinite(value) ? clamp100(value) : null;
}

/**
 * One 0–100 number out of a review's per-criterion scores.
 *
 * `overall` wins when the reviewer supplied it (the stub and the seed both do).
 * Otherwise it is the rubric-weighted mean of the criteria that ARE scored, so
 * a reviewer that skipped a criterion does not drag the student to zero for a
 * gap in its own output. Returns null when nothing is scorable.
 */
export function overallRubricScore(
  scores: Record<string, number>,
  rubric: CheckpointRubric | null,
  only?: readonly string[],
): number | null {
  if (!only) {
    const overall = scoreOf(scores, "overall");
    if (overall !== null) return overall;
  }
  const criteria = (rubric?.criteria ?? []).filter((c) => !only || only.includes(c.id));
  let weighted = 0;
  let weight = 0;
  for (const criterion of criteria) {
    const score = scoreOf(scores, criterion.id);
    if (score === null) continue;
    const w = Number.isFinite(criterion.weight) && criterion.weight > 0 ? criterion.weight : 0;
    weighted += score * w;
    weight += w;
  }
  if (weight > 0) return round2(weighted / weight);

  // No rubric to weight by (or a restricted set nobody scored): a plain mean of
  // whatever numeric scores exist, so a usable review is never thrown away.
  const ids = only ?? Object.keys(scores);
  const values = ids
    .filter((id) => id !== "overall")
    .map((id) => scoreOf(scores, id))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return only ? scoreOf(scores, "overall") : null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** The reviewer said this launch was spam: a zeroed `no-spam` or an unmet one. */
export function reviewFlaggedSpam(facts: ReviewFacts | null): boolean {
  if (!facts) return false;
  const score = scoreOf(facts.rubricScores, "no-spam");
  if (score !== null && score <= 0) return true;
  return facts.reasons.some((r) => r.criterion === "no-spam" && r.met === false);
}

/**
 * Workflow runs, as a number. The tracker sends the count once it has a
 * workflow source; until then all we know is whether ten were reached, and the
 * bar itself is the honest floor to score.
 */
export function workflowRunsFrom(signals: TrackerSignals | null): number {
  if (!signals) return 0;
  if (typeof signals.workflowRuns === "number" && Number.isFinite(signals.workflowRuns)) {
    return Math.max(0, Math.floor(signals.workflowRuns));
  }
  return signals.workflowTenRuns ? WORKFLOW_TARGETS.bar : 0;
}

/** Turn what happened into the pure formula's inputs. Never produces NaN. */
export function gradeInputsFrom(facts: GradeFacts): ComponentInputs {
  const blockingFlagged = (facts.signals?.blockingFlags.length ?? 0) > 0;
  return {
    workingRubricScore: facts.working
      ? overallRubricScore(facts.working.rubricScores, facts.working.rubric)
      : null,
    launchRubricScore: facts.launch
      ? overallRubricScore(facts.launch.rubricScores, facts.launch.rubric)
      : null,
    launchDistributionScore: facts.launch
      ? overallRubricScore(
          facts.launch.rubricScores,
          facts.launch.rubric,
          LAUNCH_DISTRIBUTION_CRITERIA,
        )
      : null,
    payingCustomers: facts.signals?.payingCustomers ?? 0,
    grossTotal: facts.signals?.grossTotal ?? 0,
    workflowRuns: workflowRunsFrom(facts.signals),
    // The tracker's integrity call and the reviewer's both zero distribution.
    spamFlagged: blockingFlagged || reviewFlaggedSpam(facts.launch),
  };
}

// ---------------------------------------------------------------------------
// The stored components JSON
// ---------------------------------------------------------------------------

/** One component as it is stored on the grade row and rendered on the line. */
export type ComponentEvidence = {
  raw: number;
  weight: number;
  weighted: number;
  /** Where the number came from, in the words the student reads. */
  source: string;
  /** The exact inputs behind `raw`, so a grade can be explained later. */
  inputs: Record<string, unknown>;
};

export type GradeComponents = Record<GradeComponentKey, ComponentEvidence>;

function componentInputsBreakdown(
  key: GradeComponentKey,
  inputs: ComponentInputs,
  facts: GradeFacts,
): Record<string, unknown> {
  switch (key) {
    case "productQuality":
      return {
        workingRubricScore: inputs.workingRubricScore,
        launchRubricScore: inputs.launchRubricScore,
        workingReviewId: facts.working?.reviewId ?? null,
        launchReviewId: facts.launch?.reviewId ?? null,
      };
    case "realNumbers":
      return {
        payingCustomers: inputs.payingCustomers,
        grossTotal: inputs.grossTotal,
        currency: facts.signals?.currency ?? "USD",
        signalsFetchedAt: facts.signals?.fetchedAt ?? null,
      };
    case "workflow":
      return {
        workflowRuns: inputs.workflowRuns,
        workflowTenRuns: facts.signals?.workflowTenRuns ?? false,
      };
    case "distribution":
      return {
        launchDistributionScore: inputs.launchDistributionScore,
        payingCustomers: inputs.payingCustomers,
        spamFlagged: inputs.spamFlagged,
        blockingFlags: facts.signals?.blockingFlags ?? [],
      };
  }
}

export type ComputedGrade = {
  components: GradeComponents;
  total: number;
  allCheckpointsCleared: boolean;
  weightsVersion: string;
};

/** The whole formula, from facts to the row that will be stored. */
export function buildGrade(
  facts: GradeFacts,
  weights: GradeWeights,
  weightsVersion: string,
): ComputedGrade {
  const inputs = gradeInputsFrom(facts);
  const raws = deriveComponents(inputs);
  const grade = computeGrade({
    components: raws,
    weights,
    allCheckpointsCleared: facts.allCheckpointsCleared,
  });

  const components = {} as GradeComponents;
  for (const key of GRADE_COMPONENT_KEYS) {
    components[key] = {
      ...grade.components[key],
      source: GRADE_COMPONENT_SOURCES[key],
      inputs: componentInputsBreakdown(key, inputs, facts),
    };
  }
  return {
    components,
    total: grade.total,
    allCheckpointsCleared: grade.allCheckpointsCleared,
    weightsVersion,
  };
}

// ---------------------------------------------------------------------------
// The grade line the UI renders
// ---------------------------------------------------------------------------

export type StoredGrade = {
  components: unknown;
  total: number;
  allCheckpointsCleared: boolean;
  provisional: boolean;
  weightsVersion?: string;
  finalisedBy?: string | null;
  finalisedAt?: Date | null;
};

function parseComponents(value: unknown): Partial<Record<GradeComponentKey, ComponentEvidence>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<Record<GradeComponentKey, ComponentEvidence>>;
}

/**
 * The typed contract the spine and `/shipyard/grade` render.
 *
 * A student with no computed grade still gets the LINE — four labelled
 * components with their weights and no numbers — because "how this is scored"
 * is course content they should be able to read from week one.
 */
export function gradeLineView(grade: StoredGrade | null, weights: GradeWeights): GradeLineView {
  const stored = grade ? parseComponents(grade.components) : {};
  return {
    provisional: grade ? grade.provisional : true,
    // Who signed it off and when — rendered by the faculty drill-down, and by
    // the student's own line once it stops being provisional.
    finalisedAt: grade?.finalisedAt ? grade.finalisedAt.toISOString() : null,
    finalisedBy: grade?.finalisedBy ?? null,
    weightsVersion: grade?.weightsVersion ?? null,
    allCheckpointsCleared: grade?.allCheckpointsCleared ?? false,
    total: grade ? round2(grade.total) : null,
    components: GRADE_COMPONENT_KEYS.map((key) => {
      const row = stored[key];
      return {
        key,
        label: GRADE_COMPONENT_LABELS[key],
        raw: typeof row?.raw === "number" ? row.raw : null,
        weight: typeof row?.weight === "number" ? row.weight : weights[key],
        weighted: typeof row?.weighted === "number" ? row.weighted : null,
        source: typeof row?.source === "string" ? row.source : GRADE_COMPONENT_SOURCES[key],
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Reading the facts out of the database
// ---------------------------------------------------------------------------

function asRubricScores(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function asRubric(value: unknown): CheckpointRubric | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const criteria = (value as { criteria?: unknown }).criteria;
  if (!Array.isArray(criteria)) return null;
  return value as CheckpointRubric;
}

function asReasons(value: unknown): ReasonView[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is ReasonView =>
      Boolean(r) && typeof r === "object" && typeof (r as ReasonView).criterion === "string",
  );
}

/**
 * The review that scores a checkpoint: the most recent PASS that actually
 * counted, or failing that the most recent review a human resolved.
 *
 * A `pass` still marked `needsHuman` has not cleared the gate (DECISIONS,
 * 2026-09-15), so it must not score either — the student's number would move
 * before the instructor had agreed with it.
 */
export function selectScoringReview<
  T extends { verdict: string; needsHuman: boolean; humanResolvedAt: Date | null },
>(reviews: T[]): T | null {
  const newestFirst = [...reviews];
  return (
    newestFirst.find((r) => r.verdict === "pass" && !r.needsHuman) ??
    newestFirst.find((r) => r.humanResolvedAt !== null) ??
    null
  );
}

export type ActiveWeights = { version: string; weights: GradeWeights };

function asWeights(value: unknown): GradeWeights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const out = {} as GradeWeights;
  for (const key of GRADE_COMPONENT_KEYS) {
    const w = row[key];
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) return null;
    out[key] = w;
  }
  return out;
}

/**
 * The active weights row, or the seeded v1 split. Weights are config (SPEC §7),
 * but a portal with no weights row must still be able to show a grade line.
 */
export async function activeWeights(db: Db = defaultPrisma): Promise<ActiveWeights> {
  const row = await db.shipyardWeights.findFirst({
    where: { courseId: SHIPYARD_COURSE_ID, active: true },
    orderBy: { createdAt: "desc" },
    select: { version: true, weights: true },
  });
  const parsed = row ? asWeights(row.weights) : null;
  if (row && parsed) return { version: row.version, weights: parsed };
  return { version: WEIGHTS_VERSION_V1, weights: WEIGHTS_V1 };
}

/** Everything the formula needs about one product, read in four queries. */
export async function loadGradeFacts(
  productId: string,
  deps: GradeDeps = {},
): Promise<GradeFacts> {
  const db = deps.db ?? defaultPrisma;

  const product = await db.shipyardProduct.findUnique({
    where: { id: productId },
    select: { id: true, trackerProductId: true },
  });
  if (!product) throw new ShipyardError(404, { error: `No product ${productId}.` });

  const reviews = await db.shipyardReview.findMany({
    where: {
      submission: { productId, checkpoint: { key: { in: [...PRODUCT_QUALITY_CHECKPOINTS] } } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      verdict: true,
      needsHuman: true,
      humanResolvedAt: true,
      rubricScores: true,
      reasons: true,
      createdAt: true,
      submission: {
        select: { checkpoint: { select: { key: true, rubric: true } } },
      },
    },
  });

  const factsFor = (key: (typeof PRODUCT_QUALITY_CHECKPOINTS)[number]): ReviewFacts | null => {
    const chosen = selectScoringReview(
      reviews.filter((r) => r.submission.checkpoint.key === key),
    );
    if (!chosen) return null;
    return {
      reviewId: chosen.id,
      createdAt: chosen.createdAt,
      rubricScores: asRubricScores(chosen.rubricScores),
      rubric: asRubric(chosen.submission.checkpoint.rubric),
      reasons: asReasons(chosen.reasons),
    };
  };

  const states = await db.shipyardCheckpointState.findMany({
    where: { productId },
    select: { state: true },
  });
  const checkpointCount = await db.shipyardCheckpoint.count({
    where: { courseId: SHIPYARD_COURSE_ID },
  });
  const allCheckpointsCleared =
    checkpointCount > 0 &&
    states.length >= checkpointCount &&
    states.every((s) => s.state === "passed");

  let signals: TrackerSignals | null = deps.signals ?? null;
  if (signals === null && deps.signals === undefined) {
    const tracker = deps.tracker ?? (await createTrackerClient());
    signals = await tracker.getCheckpointSignals(product.trackerProductId);
  }

  return {
    working: factsFor("working"),
    launch: factsFor("launch"),
    signals,
    allCheckpointsCleared,
  };
}

// ---------------------------------------------------------------------------
// computeProductGrade — the only writer of ShipyardGrade
// ---------------------------------------------------------------------------

export type GradeRow = {
  id: string;
  productId: string;
  components: unknown;
  total: number;
  allCheckpointsCleared: boolean;
  weightsVersion: string;
  provisional: boolean;
  finalisedBy: string | null;
  finalisedAt: Date | null;
};

export type GradeComputation = {
  productId: string;
  /**
   * Null only when there is nothing to score yet and no row was created. A
   * student at checkpoint 1 with no reviewer score, no tracker numbers and no
   * workflow runs has not earned a 0.0 — they have not been scored at all, and
   * `gradeLineView(null, …)` renders exactly that (DECISIONS, 2026-09-15).
   */
  grade: GradeRow | null;
  /** True when a finalised grade was returned untouched, or nothing changed. */
  skipped: boolean;
  /** True when the product had no scorable input and no row was written. */
  empty?: boolean;
};

/**
 * Is there anything here to score?
 *
 * "TOTAL 0.0" and "not yet scored" are different statements, and after an
 * admin recompute every student at checkpoint 1 was shown the first when the
 * second was true. A component with no input contributes 0 to the formula,
 * which is right — but four of them summing to a stored zero is a grade, and a
 * grade is a claim about work that has not happened yet.
 */
export function hasGradeInput(facts: GradeFacts): boolean {
  if (facts.working !== null || facts.launch !== null) return true;
  if (facts.allCheckpointsCleared) return true;
  const signals = facts.signals;
  if (!signals) return false;
  return (
    signals.payingCustomers > 0 ||
    signals.grossTotal > 0 ||
    workflowRunsFrom(signals) > 0 ||
    signals.blockingFlags.length > 0
  );
}

const gradeSelect = {
  id: true,
  productId: true,
  components: true,
  total: true,
  allCheckpointsCleared: true,
  weightsVersion: true,
  provisional: true,
  finalisedBy: true,
  finalisedAt: true,
} as const;

/**
 * Recompute and persist one product's grade.
 *
 * A finalised grade is returned exactly as stored, with `skipped: true`. That
 * is the whole point of finalising: the number faculty signed does not move
 * because a student's tracker ticked over afterwards.
 *
 * The `provisional` check and the write are ONE statement. Reading the flag,
 * spending a second on the tracker, and then upserting meant a recompute that
 * started before faculty signed could land after they had — and the signed
 * number was silently replaced by one computed from older facts (C6). The
 * write is therefore an `updateMany` fenced on `provisional: true`: if the row
 * was finalised while we were working it matches nothing, nothing is written,
 * and the result says it skipped.
 */
export async function computeProductGrade(
  productId: string,
  deps: GradeDeps = {},
): Promise<GradeComputation> {
  const db = deps.db ?? defaultPrisma;

  const existing = await db.shipyardGrade.findUnique({
    where: { productId },
    select: gradeSelect,
  });
  if (existing && !existing.provisional) {
    return { productId, grade: existing, skipped: true };
  }

  const facts = await loadGradeFacts(productId, deps);

  // Nothing to score and nothing stored: leave the line empty rather than
  // writing a zero a student would read as a mark.
  if (!existing && !hasGradeInput(facts)) {
    return { productId, grade: null, skipped: true, empty: true };
  }

  const { version, weights } = await activeWeights(db);
  const computed = buildGrade(facts, weights, version);
  const data = {
    components: computed.components as unknown as Prisma.InputJsonValue,
    total: computed.total,
    allCheckpointsCleared: computed.allCheckpointsCleared,
    weightsVersion: computed.weightsVersion,
  };

  if (existing) {
    const { count } = await db.shipyardGrade.updateMany({
      where: { productId, provisional: true },
      data,
    });
    const grade = await db.shipyardGrade.findUnique({ where: { productId }, select: gradeSelect });
    // count === 0 means it was finalised between our read and our write.
    return { productId, grade, skipped: count === 0 };
  }

  try {
    const grade = await db.shipyardGrade.create({
      data: { courseId: SHIPYARD_COURSE_ID, productId, provisional: true, ...data },
      select: gradeSelect,
    });
    return { productId, grade, skipped: false };
  } catch (err) {
    // Another worker created the row first. Theirs is at least as fresh as
    // ours would have been; read it back rather than race it again.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const grade = await db.shipyardGrade.findUnique({ where: { productId }, select: gradeSelect });
      return { productId, grade, skipped: true };
    }
    throw err;
  }
}

export type RecomputeSummary = {
  computed: number;
  skipped: number;
  failed: number;
};

/** Recompute a list of products, one at a time, never failing the batch. */
export async function recomputeGradesForProducts(
  productIds: readonly string[],
  deps: GradeDeps = {},
): Promise<RecomputeSummary> {
  const summary: RecomputeSummary = { computed: 0, skipped: 0, failed: 0 };
  // One tracker client for the whole batch: 500 products must not open 500
  // clients, and the fake client reads a table per call either way.
  const tracker = deps.tracker ?? (deps.signals === undefined ? await createTrackerClient() : undefined);
  for (const productId of productIds) {
    try {
      const result = await computeProductGrade(productId, { ...deps, tracker });
      if (result.skipped) summary.skipped += 1;
      else summary.computed += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(
        `[shipyard-grades] ${productId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Reads for the UI
// ---------------------------------------------------------------------------

/**
 * The grade line for one product, for the spine and `/shipyard/grade`.
 * Never throws for a product that has no grade yet: it returns the empty line.
 */
export async function loadGradeLine(
  productId: string,
  deps: GradeDeps = {},
): Promise<GradeLineView> {
  const db = deps.db ?? defaultPrisma;
  const [grade, weights] = await Promise.all([
    db.shipyardGrade.findUnique({ where: { productId }, select: gradeSelect }),
    activeWeights(db),
  ]);
  return gradeLineView(grade, weights.weights);
}

/** The same line, addressed by student. Null when they have no product yet. */
export async function loadGradeLineForUser(
  userId: string,
  deps: GradeDeps = {},
): Promise<GradeLineView> {
  const db = deps.db ?? defaultPrisma;
  const product = await db.shipyardProduct.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!product) return null;
  return loadGradeLine(product.id, deps);
}

// ---------------------------------------------------------------------------
// Hook points for the pipeline
// ---------------------------------------------------------------------------

async function bestEffort(
  productId: string,
  reason: string,
  deps: GradeDeps,
): Promise<GradeComputation | null> {
  try {
    return await computeProductGrade(productId, deps);
  } catch (err) {
    // A grade is a derived number: it can be rebuilt by the next trigger or by
    // the admin recompute. It must never fail the verdict or the gate that
    // caused it.
    console.error(
      `[shipyard-grades] ${reason} recompute failed for ${productId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Call after `completeReview` has recorded a verdict — a new checkpoint 3 or
 * launch score is the only thing that moves product quality.
 * Best-effort: never throws.
 */
export function onReviewCompleted(
  productId: string,
  deps: GradeDeps = {},
): Promise<GradeComputation | null> {
  return bestEffort(productId, "review", deps);
}

/**
 * Call after `recomputeGates` — new tracker numbers move three components and
 * a newly-passed sixth checkpoint moves the graduation condition.
 * Best-effort: never throws.
 */
export function onGatesRecomputed(
  productId: string,
  deps: GradeDeps = {},
): Promise<GradeComputation | null> {
  return bestEffort(productId, "gates", deps);
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

export type FinaliseTarget = { userId?: string; sectionId?: string };

export type FinaliseResult = {
  finalised: { productId: string; userId: string; total: number }[];
  /** Products left provisional because they have not cleared every gate. */
  refused: { productId: string; userId: string; reason: "not-graduated" | "no-grade" }[];
};

export const FINALISE_CAP = 500;

/**
 * Sign one product's grade, or a whole section's.
 *
 * Only a product with `allCheckpointsCleared` may be finalised, because the
 * graduation condition is what the number means. `force` exists for the
 * genuine edge cases faculty meet (a withdrawal, a medical case) and is
 * audit-logged like everything else here.
 */
export async function finaliseGrades(
  target: FinaliseTarget & { reason: string; force?: boolean; actorId: string },
  deps: GradeDeps = {},
): Promise<FinaliseResult> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();

  if (!target.userId && !target.sectionId) {
    throw new ShipyardError(400, { error: "Name a student or a section to finalise." });
  }

  const products = await db.shipyardProduct.findMany({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      ...(target.userId ? { userId: target.userId } : {}),
      ...(target.sectionId ? { user: { sectionId: target.sectionId } } : {}),
    },
    take: FINALISE_CAP,
    orderBy: { id: "asc" },
    select: { id: true, userId: true, grade: { select: gradeSelect } },
  });
  if (products.length === 0) {
    throw new ShipyardError(404, { error: "No products matched." });
  }

  const result: FinaliseResult = { finalised: [], refused: [] };
  for (const product of products) {
    const grade = product.grade;
    if (!grade) {
      result.refused.push({ productId: product.id, userId: product.userId, reason: "no-grade" });
      continue;
    }
    if (!grade.allCheckpointsCleared && !target.force) {
      result.refused.push({
        productId: product.id,
        userId: product.userId,
        reason: "not-graduated",
      });
      continue;
    }
    if (!grade.provisional) {
      // Already signed. Finalising twice is a no-op, not an error: an admin
      // finalising a section must not fail because one student was done early.
      result.finalised.push({
        productId: product.id,
        userId: product.userId,
        total: grade.total,
      });
      continue;
    }

    await db.shipyardGrade.update({
      where: { productId: product.id },
      data: { provisional: false, finalisedBy: target.actorId, finalisedAt: now },
    });
    await db.auditLog.create({
      data: {
        actorId: target.actorId,
        action: "shipyard.grade.finalise",
        targetType: "ShipyardGrade",
        targetId: grade.id,
        before: {
          provisional: true,
          total: grade.total,
          allCheckpointsCleared: grade.allCheckpointsCleared,
        } as unknown as Prisma.InputJsonValue,
        after: {
          provisional: false,
          total: grade.total,
          allCheckpointsCleared: grade.allCheckpointsCleared,
          weightsVersion: grade.weightsVersion,
          userId: product.userId,
          sectionId: target.sectionId ?? null,
          forced: Boolean(target.force),
          reason: target.reason,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    result.finalised.push({
      productId: product.id,
      userId: product.userId,
      total: grade.total,
    });
  }

  return result;
}

/** Product ids for an admin recompute: one student, one section, or all. */
export async function productIdsForRecompute(
  scope: { userId?: string; sectionId?: string; all?: boolean },
  deps: GradeDeps = {},
): Promise<string[]> {
  const db = deps.db ?? defaultPrisma;
  if (!scope.userId && !scope.sectionId && !scope.all) {
    throw new ShipyardError(400, { error: "Name a student, a section, or all." });
  }
  const rows = await db.shipyardProduct.findMany({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      ...(scope.userId ? { userId: scope.userId } : {}),
      ...(scope.sectionId ? { user: { sectionId: scope.sectionId } } : {}),
    },
    take: FINALISE_CAP,
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
