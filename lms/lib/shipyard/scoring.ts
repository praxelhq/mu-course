// The Course 2 grade: four weighted components and one graduation condition.
// Pure — this module decides what every student's grade is, so it never reads
// the clock, the database, or the environment.
//
// SPEC §7. Weights live in a versioned row so they change by config, not code;
// `WEIGHTS_V1` below is the seeded default and the fallback.

export const GRADE_COMPONENT_KEYS = [
  "productQuality",
  "realNumbers",
  "workflow",
  "distribution",
] as const;

export type GradeComponentKey = (typeof GRADE_COMPONENT_KEYS)[number];

export type GradeWeights = Record<GradeComponentKey, number>;

/** SPEC §7, exactly. Weights must sum to 100. */
export const WEIGHTS_V1: GradeWeights = {
  productQuality: 30,
  realNumbers: 30,
  workflow: 20,
  distribution: 20,
};

export const WEIGHTS_VERSION_V1 = "v1";

export function weightsSum(weights: GradeWeights): number {
  return GRADE_COMPONENT_KEYS.reduce((total, key) => total + weights[key], 0);
}

export function assertValidWeights(weights: GradeWeights): void {
  for (const key of GRADE_COMPONENT_KEYS) {
    const w = weights[key];
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`weight ${key} must be a non-negative number`);
    }
  }
  const sum = weightsSum(weights);
  // Float tolerance: a weights editor that writes 33.33/33.33/33.34 is fine.
  if (Math.abs(sum - 100) > 1e-6) {
    throw new Error(`weights must sum to 100, got ${sum}`);
  }
}

// ---------------------------------------------------------------------------
// computeGrade
// ---------------------------------------------------------------------------

export type ComponentBreakdown = { raw: number; weight: number; weighted: number };

export type Grade = {
  components: Record<GradeComponentKey, ComponentBreakdown>;
  /** 0–100. The sum of the weighted contributions. */
  total: number;
  allCheckpointsCleared: boolean;
  /** The graduation condition — a gate on the grade, not a weight. */
  graduationEligible: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp100 = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

export function computeGrade(args: {
  components: Record<GradeComponentKey, number>;
  weights: GradeWeights;
  allCheckpointsCleared: boolean;
}): Grade {
  assertValidWeights(args.weights);
  const components = {} as Record<GradeComponentKey, ComponentBreakdown>;
  let total = 0;
  for (const key of GRADE_COMPONENT_KEYS) {
    const raw = clamp100(args.components[key]);
    const weight = args.weights[key];
    const weighted = (raw * weight) / 100;
    components[key] = { raw: round2(raw), weight, weighted: round2(weighted) };
    total += weighted;
  }
  return {
    components,
    total: round2(total),
    allCheckpointsCleared: args.allCheckpointsCleared,
    // Today these are the same thing. They are separate fields because the
    // grade line renders them separately, and because a future condition
    // (an integrity hold, say) would land here and not in the boolean above.
    graduationEligible: args.allCheckpointsCleared,
  };
}

// ---------------------------------------------------------------------------
// deriveComponents — raw 0–100 scores from reviewer scores and live numbers
// ---------------------------------------------------------------------------

export type ComponentInputs = {
  /** Reviewer's overall rubric score for checkpoint 3, 0–100. */
  workingRubricScore: number | null;
  /** Reviewer's overall rubric score for the launch write-up, 0–100. */
  launchRubricScore: number | null;
  /** The launch rubric's distribution criteria alone, 0–100. */
  launchDistributionScore: number | null;
  /** Tracker, verified. */
  payingCustomers: number;
  grossTotal: number;
  workflowRuns: number;
  /** Set by the reviewer or an instructor. Spam scores distribution zero. */
  spamFlagged: boolean;
};

/**
 * The course rewards the first real customer far more than the hundredth, so
 * the money and customer curves are logarithmic: doubling from 1 to 2 moves
 * the score more than doubling from 50 to 100. Both are monotonic and both
 * saturate at a target that a strong student reaches, not a heroic one.
 */
export const REAL_NUMBERS_TARGETS = {
  /** Paying customers that score full marks on the customer half. */
  customers: 10,
  /** Gross payments in USD cents (verified) for full marks: $100. */
  gross: 10_000,
} as const;

/** The workflow bar is ten runs; past it the score keeps rising, slowly. */
export const WORKFLOW_TARGETS = {
  /** Runs that clear the gate and score 80. */
  bar: 10,
  /** Runs beyond the bar that reach 100. */
  beyondBar: 20,
} as const;

function logScore(value: number, target: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp100(100 * (Math.log1p(value) / Math.log1p(target)));
}

/** Monotonic, piecewise linear: 0 at zero runs, 80 at the bar, 100 well past. */
export function workflowScore(runs: number): number {
  if (!Number.isFinite(runs) || runs <= 0) return 0;
  const { bar, beyondBar } = WORKFLOW_TARGETS;
  if (runs <= bar) return round2((80 * runs) / bar);
  return round2(80 + 20 * Math.min(1, (runs - bar) / beyondBar));
}

/**
 * Turn reviewer scores and live tracker numbers into the four raw components.
 *
 * productQuality — the mean of the two reviewer scores that judge the product
 *   itself (checkpoint 3 and launch). A missing score is skipped rather than
 *   counted as zero, so a student mid-course is not punished for not having
 *   reached the launch review yet.
 * realNumbers    — half customers, half gross payments, both on a log curve
 *   (see REAL_NUMBERS_TARGETS). Verified tracker data only.
 * workflow       — the run count alone, via `workflowScore`.
 * distribution   — 70% the launch write-up's distribution criteria, 30% the
 *   customer reach that write-up produced, so a good story with nobody at the
 *   end of it cannot score full marks. Spam zeroes it outright (SPEC §7).
 *
 * Every component is monotonic in every input: no student is ever better off
 * with fewer customers, fewer runs, or a worse review.
 */
export function deriveComponents(inputs: ComponentInputs): Record<GradeComponentKey, number> {
  const productScores = [inputs.workingRubricScore, inputs.launchRubricScore].filter(
    (s): s is number => typeof s === "number" && Number.isFinite(s),
  );
  const productQuality =
    productScores.length === 0
      ? 0
      : round2(productScores.reduce((a, b) => a + clamp100(b), 0) / productScores.length);

  const customerScore = logScore(inputs.payingCustomers, REAL_NUMBERS_TARGETS.customers);
  const grossScore = logScore(inputs.grossTotal, REAL_NUMBERS_TARGETS.gross);
  const realNumbers = round2(0.5 * customerScore + 0.5 * grossScore);

  const workflow = workflowScore(inputs.workflowRuns);

  const distribution = inputs.spamFlagged
    ? 0
    : round2(0.7 * clamp100(inputs.launchDistributionScore ?? 0) + 0.3 * customerScore);

  return { productQuality, realNumbers, workflow, distribution };
}
