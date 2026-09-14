import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  buildGrade,
  gradeInputsFrom,
  gradeLineView,
  GRADE_COMPONENT_SOURCES,
  LAUNCH_DISTRIBUTION_CRITERIA,
  overallRubricScore,
  reviewFlaggedSpam,
  selectScoringReview,
  workflowRunsFrom,
  type GradeFacts,
  type ReviewFacts,
} from "@/lib/shipyard/grades";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { WEIGHTS_V1 } from "@/lib/shipyard/scoring";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";

const LAUNCH_RUBRIC = checkpointDefinition("launch").rubric;
const WORKING_RUBRIC = checkpointDefinition("working").rubric;

function review(scores: Record<string, number>, over: Partial<ReviewFacts> = {}): ReviewFacts {
  return {
    reviewId: "syrev_test",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    rubricScores: scores,
    rubric: LAUNCH_RUBRIC,
    reasons: [],
    ...over,
  };
}

function signals(over: Partial<TrackerSignals> = {}): TrackerSignals {
  return { ...emptySignals(new Date("2026-09-01T00:00:00.000Z")), ...over };
}

const facts = (over: Partial<GradeFacts> = {}): GradeFacts => ({
  working: null,
  launch: null,
  signals: null,
  allCheckpointsCleared: false,
  ...over,
});

// ---------------------------------------------------------------------------
// Reading a review's scores
// ---------------------------------------------------------------------------

describe("overallRubricScore", () => {
  it("prefers an explicit overall, as the stub reviewer and the seed write it", () => {
    expect(overallRubricScore({ overall: 78, "no-spam": 0 }, LAUNCH_RUBRIC)).toBe(78);
  });

  it("falls back to the rubric-weighted mean of the criteria that were scored", () => {
    // channels 25 + first-customer 25, scored 80 and 40 → (80*25 + 40*25)/50.
    const score = overallRubricScore(
      { channels: 80, "first-customer": 40 },
      LAUNCH_RUBRIC,
    );
    expect(score).toBe(60);
  });

  it("does not punish a student for a criterion the reviewer skipped", () => {
    // One perfect criterion out of six is 100, not 100/6.
    expect(overallRubricScore({ channels: 100 }, LAUNCH_RUBRIC)).toBe(100);
  });

  it("returns null when there is nothing numeric to score", () => {
    expect(overallRubricScore({}, LAUNCH_RUBRIC)).toBeNull();
    expect(overallRubricScore({ channels: Number.NaN }, LAUNCH_RUBRIC)).toBeNull();
  });

  it("restricts to the distribution criteria when asked", () => {
    const scores = {
      "launch-account": 100,
      channels: 100,
      "first-customer": 100,
      "no-spam": 100,
      // These two are NOT distribution and must not move the answer.
      "numbers-agree": 0,
      learning: 0,
    };
    expect(overallRubricScore(scores, LAUNCH_RUBRIC, LAUNCH_DISTRIBUTION_CRITERIA)).toBe(100);
  });

  it("clamps a reviewer that returned something outside 0–100", () => {
    expect(overallRubricScore({ overall: 140 }, LAUNCH_RUBRIC)).toBe(100);
    expect(overallRubricScore({ overall: -20 }, LAUNCH_RUBRIC)).toBe(0);
  });
});

describe("selectScoringReview", () => {
  const row = (over: Partial<{ verdict: string; needsHuman: boolean; humanResolvedAt: Date | null; id: string }>) => ({
    id: "a",
    verdict: "pass",
    needsHuman: false,
    humanResolvedAt: null as Date | null,
    ...over,
  });

  it("takes the newest pass that actually counted", () => {
    const chosen = selectScoringReview([
      row({ id: "newest-return", verdict: "return" }),
      row({ id: "newest-pass" }),
      row({ id: "older-pass" }),
    ]);
    expect(chosen?.id).toBe("newest-pass");
  });

  it("does not score a pass that is still waiting on a human", () => {
    const chosen = selectScoringReview([
      row({ id: "pending", needsHuman: true }),
      row({ id: "counted" }),
    ]);
    expect(chosen?.id).toBe("counted");
  });

  it("falls back to the newest human-resolved review when nothing passed", () => {
    const chosen = selectScoringReview([
      row({ id: "returned", verdict: "return" }),
      row({ id: "resolved", verdict: "return", humanResolvedAt: new Date() }),
    ]);
    expect(chosen?.id).toBe("resolved");
  });

  it("is null when there is nothing to score", () => {
    expect(selectScoringReview([])).toBeNull();
    expect(selectScoringReview([row({ verdict: "return" })])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

describe("gradeInputsFrom", () => {
  it("gives a student with nothing yet zeros and nulls, never NaN", () => {
    const inputs = gradeInputsFrom(facts());
    expect(inputs).toEqual({
      workingRubricScore: null,
      launchRubricScore: null,
      launchDistributionScore: null,
      payingCustomers: 0,
      grossTotal: 0,
      workflowRuns: 0,
      spamFlagged: false,
    });
    const grade = buildGrade(facts(), WEIGHTS_V1, "v1");
    expect(Number.isNaN(grade.total)).toBe(false);
    expect(grade.total).toBe(0);
    for (const component of Object.values(grade.components)) {
      expect(Number.isFinite(component.raw)).toBe(true);
      expect(Number.isFinite(component.weighted)).toBe(true);
    }
  });

  it("reads the tracker's own run count, and falls back to the bar", () => {
    expect(workflowRunsFrom(signals({ workflowRuns: 17 }))).toBe(17);
    expect(
      workflowRunsFrom(signals({ workflowRuns: undefined, workflowTenRuns: true })),
    ).toBe(10);
    expect(
      workflowRunsFrom(signals({ workflowRuns: undefined, workflowTenRuns: false })),
    ).toBe(0);
    expect(workflowRunsFrom(null)).toBe(0);
  });

  it("zeroes distribution when the tracker raised a blocking flag", () => {
    const strong = facts({
      launch: review({ overall: 90, channels: 90, "first-customer": 90 }),
      signals: signals({ payingCustomers: 8, grossTotal: 9_000 }),
    });
    const clean = buildGrade(strong, WEIGHTS_V1, "v1");
    expect(clean.components.distribution.raw).toBeGreaterThan(0);

    const flagged = buildGrade(
      { ...strong, signals: signals({ ...strong.signals!, blockingFlags: ["self_payment"] }) },
      WEIGHTS_V1,
      "v1",
    );
    expect(flagged.components.distribution.raw).toBe(0);
    expect(flagged.components.distribution.weighted).toBe(0);
    // The other components still read the numbers: the flag fails the GATE and
    // zeroes distribution; it does not retroactively unbuild the product.
    expect(flagged.components.productQuality.raw).toBe(
      clean.components.productQuality.raw,
    );
  });

  it("zeroes distribution when the reviewer found spam", () => {
    expect(reviewFlaggedSpam(review({ "no-spam": 0 }))).toBe(true);
    expect(
      reviewFlaggedSpam(
        review({ overall: 70 }, { reasons: [{ criterion: "no-spam", met: false, note: "bought" }] }),
      ),
    ).toBe(true);
    expect(reviewFlaggedSpam(review({ "no-spam": 100 }))).toBe(false);
    expect(reviewFlaggedSpam(null)).toBe(false);

    const grade = buildGrade(
      facts({
        launch: review({ "launch-account": 90, channels: 90, "first-customer": 90, "no-spam": 0 }),
        signals: signals({ payingCustomers: 5, grossTotal: 5_000 }),
      }),
      WEIGHTS_V1,
      "v1",
    );
    expect(grade.components.distribution.raw).toBe(0);
  });

  it("averages the two reviewed checkpoints for product quality", () => {
    const grade = buildGrade(
      facts({
        working: review({ overall: 60 }, { rubric: WORKING_RUBRIC }),
        launch: review({ overall: 80 }),
      }),
      WEIGHTS_V1,
      "v1",
    );
    expect(grade.components.productQuality.raw).toBe(70);
    expect(grade.components.productQuality.weighted).toBe(21); // 70 × 30/100
    expect(grade.components.productQuality.source).toBe(
      GRADE_COMPONENT_SOURCES.productQuality,
    );
    expect(grade.components.productQuality.inputs).toMatchObject({
      workingRubricScore: 60,
      launchRubricScore: 80,
    });
  });

  it("carries the graduation condition through untouched", () => {
    expect(buildGrade(facts(), WEIGHTS_V1, "v1").allCheckpointsCleared).toBe(false);
    expect(
      buildGrade(facts({ allCheckpointsCleared: true }), WEIGHTS_V1, "v1")
        .allCheckpointsCleared,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The line the UI renders
// ---------------------------------------------------------------------------

describe("gradeLineView", () => {
  it("renders the empty line for a student with no grade yet", () => {
    const view = gradeLineView(null, WEIGHTS_V1);
    expect(view).not.toBeNull();
    expect(view!.provisional).toBe(true);
    expect(view!.total).toBeNull();
    expect(view!.components.map((c) => c.key)).toEqual([
      "productQuality",
      "realNumbers",
      "workflow",
      "distribution",
    ]);
    expect(view!.components.map((c) => c.label)).toEqual([
      "Product quality",
      "Real numbers",
      "Workflow",
      "Distribution and launch",
    ]);
    expect(view!.components.map((c) => c.source)).toEqual([
      "Reviewer · checkpoints 3 and 6",
      "Shipped.money · Verified only",
      "Shipped.money",
      "Reviewer + Shipped.money",
    ]);
    // The weights are course content: readable before a single submission.
    expect(view!.components.map((c) => c.weight)).toEqual([30, 30, 20, 20]);
    for (const component of view!.components) {
      expect(component.raw).toBeNull();
      expect(component.weighted).toBeNull();
    }
  });

  it("renders a computed grade, and says when it is no longer provisional", () => {
    const computed = buildGrade(
      facts({
        working: review({ overall: 90 }, { rubric: WORKING_RUBRIC }),
        launch: review({ overall: 70 }),
        signals: signals({ payingCustomers: 10, grossTotal: 10_000, workflowRuns: 30 }),
        allCheckpointsCleared: true,
      }),
      WEIGHTS_V1,
      "v1",
    );
    const view = gradeLineView(
      {
        components: computed.components,
        total: computed.total,
        allCheckpointsCleared: true,
        provisional: false,
      },
      WEIGHTS_V1,
    )!;
    expect(view.provisional).toBe(false);
    expect(view.allCheckpointsCleared).toBe(true);
    expect(view.total).toBe(computed.total);
    expect(view.total).toBeGreaterThan(0);
    // The line adds up to the total, which is the one thing a student checks.
    const summed = view.components.reduce((sum, c) => sum + (c.weighted ?? 0), 0);
    expect(Math.abs(summed - view.total!)).toBeLessThan(0.05);
  });

  it("survives a components blob it cannot read", () => {
    const view = gradeLineView(
      { components: "not json", total: 0, allCheckpointsCleared: false, provisional: true },
      WEIGHTS_V1,
    )!;
    expect(view.components).toHaveLength(4);
    expect(view.components.every((c) => c.raw === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live DB: recompute against the seeded world
// ---------------------------------------------------------------------------

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

describe.skipIf(!live)("computeProductGrade (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let productId: string | null = null;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    if ((await prisma.shipyardCheckpoint.count()) !== 6) return;
    // A seeded student who cleared every checkpoint: the complete case.
    const complete = await prisma.shipyardProduct.findFirst({
      where: {
        id: { startsWith: "syp_" },
        checkpointStates: { some: {}, none: { state: { not: "passed" } } },
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    productId = complete?.id ?? null;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("scores a fully-cleared seeded product and stores the breakdown", async () => {
    if (!productId) return;
    const { computeProductGrade } = await import("@/lib/shipyard/grades");
    const { grade, skipped } = await computeProductGrade(productId);

    expect(skipped).toBe(false);
    expect(grade.provisional).toBe(true);
    expect(grade.allCheckpointsCleared).toBe(true);
    expect(grade.weightsVersion).toBe("v1");
    expect(grade.total).toBeGreaterThan(0);

    const components = grade.components as Record<string, Record<string, unknown>>;
    for (const key of ["productQuality", "realNumbers", "workflow", "distribution"]) {
      expect(components[key], key).toBeTruthy();
      expect(typeof components[key].raw).toBe("number");
      expect(typeof components[key].weighted).toBe("number");
      expect(typeof components[key].source).toBe("string");
      expect(components[key].inputs).toBeTruthy();
    }
    // The launch review passed, so product quality read a real score.
    expect(components.productQuality.raw as number).toBeGreaterThan(0);
  });

  it("never recomputes a finalised grade", async () => {
    if (!productId) return;
    const { computeProductGrade } = await import("@/lib/shipyard/grades");
    await computeProductGrade(productId);

    await prisma.shipyardGrade.update({
      where: { productId },
      data: {
        provisional: false,
        finalisedBy: "test",
        finalisedAt: new Date(),
        total: 42.5,
      },
    });

    const after = await computeProductGrade(productId);
    expect(after.skipped).toBe(true);
    expect(after.grade.total).toBe(42.5);
    expect(after.grade.provisional).toBe(false);

    const stored = await prisma.shipyardGrade.findUnique({ where: { productId } });
    expect(stored?.total).toBe(42.5);

    // Put it back so a re-run of this file starts where it started.
    await prisma.shipyardGrade.update({
      where: { productId },
      data: { provisional: true, finalisedBy: null, finalisedAt: null },
    });
    await computeProductGrade(productId);
  });

  it("gives a grade line for the same product", async () => {
    if (!productId) return;
    const { loadGradeLine } = await import("@/lib/shipyard/grades");
    const line = await loadGradeLine(productId);
    expect(line).not.toBeNull();
    expect(line!.components).toHaveLength(4);
    expect(line!.provisional).toBe(true);
  });
});
