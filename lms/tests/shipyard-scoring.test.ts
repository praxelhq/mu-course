import { describe, expect, it } from "vitest";
import {
  assertValidWeights,
  computeGrade,
  deriveComponents,
  GRADE_COMPONENT_KEYS,
  WEIGHTS_V1,
  WEIGHTS_VERSION_V1,
  weightsSum,
  workflowScore,
  type ComponentInputs,
  type GradeWeights,
} from "@/lib/shipyard/scoring";
import {
  cooldownRemaining,
  nextAllowedResubmitAt,
} from "@/lib/shipyard/cooldown";

const inputs = (over: Partial<ComponentInputs> = {}): ComponentInputs => ({
  workingRubricScore: null,
  launchRubricScore: null,
  launchDistributionScore: null,
  payingCustomers: 0,
  grossTotal: 0,
  workflowRuns: 0,
  spamFlagged: false,
  ...over,
});

describe("weights v1", () => {
  it("is exactly the SPEC §7 split and sums to 100", () => {
    expect(WEIGHTS_V1).toEqual({
      productQuality: 30,
      realNumbers: 30,
      workflow: 20,
      distribution: 20,
    });
    expect(weightsSum(WEIGHTS_V1)).toBe(100);
    expect(WEIGHTS_VERSION_V1).toBe("v1");
    expect(() => assertValidWeights(WEIGHTS_V1)).not.toThrow();
  });

  it("rejects weights that do not sum to 100, and negative weights", () => {
    expect(() =>
      assertValidWeights({ productQuality: 30, realNumbers: 30, workflow: 20, distribution: 10 }),
    ).toThrow(/sum to 100/);
    expect(() =>
      assertValidWeights({ productQuality: 110, realNumbers: 0, workflow: 0, distribution: -10 }),
    ).toThrow(/non-negative/);
    expect(() =>
      assertValidWeights({
        productQuality: Number.NaN,
        realNumbers: 30,
        workflow: 20,
        distribution: 20,
      } as GradeWeights),
    ).toThrow();
  });

  it("accepts a rounded custom split that still sums to 100", () => {
    const custom: GradeWeights = {
      productQuality: 33.33,
      realNumbers: 33.33,
      workflow: 33.34,
      distribution: 0,
    };
    expect(() => assertValidWeights(custom)).not.toThrow();
  });
});

describe("computeGrade", () => {
  it("breaks each component into raw, weight and weighted contribution", () => {
    const grade = computeGrade({
      components: { productQuality: 80, realNumbers: 50, workflow: 100, distribution: 60 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: true,
    });
    expect(grade.components.productQuality).toEqual({ raw: 80, weight: 30, weighted: 24 });
    expect(grade.components.realNumbers).toEqual({ raw: 50, weight: 30, weighted: 15 });
    expect(grade.components.workflow).toEqual({ raw: 100, weight: 20, weighted: 20 });
    expect(grade.components.distribution).toEqual({ raw: 60, weight: 20, weighted: 12 });
    expect(grade.total).toBe(71);
  });

  it("totals 100 when every component is full and 0 when none is", () => {
    const full = computeGrade({
      components: { productQuality: 100, realNumbers: 100, workflow: 100, distribution: 100 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: true,
    });
    expect(full.total).toBe(100);
    const none = computeGrade({
      components: { productQuality: 0, realNumbers: 0, workflow: 0, distribution: 0 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: false,
    });
    expect(none.total).toBe(0);
  });

  it("clamps raw scores into 0–100 rather than letting them leak into the total", () => {
    const grade = computeGrade({
      components: { productQuality: 140, realNumbers: -20, workflow: 100, distribution: 0 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: false,
    });
    expect(grade.components.productQuality.raw).toBe(100);
    expect(grade.components.realNumbers.raw).toBe(0);
    expect(grade.total).toBe(50);
  });

  it("keeps the graduation condition separate from the total", () => {
    const cleared = computeGrade({
      components: { productQuality: 10, realNumbers: 10, workflow: 10, distribution: 10 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: true,
    });
    const notCleared = computeGrade({
      components: { productQuality: 90, realNumbers: 90, workflow: 90, distribution: 90 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: false,
    });
    expect(cleared.graduationEligible).toBe(true);
    expect(cleared.total).toBe(10);
    expect(notCleared.graduationEligible).toBe(false);
    expect(notCleared.total).toBe(90);
  });

  it("refuses to grade against invalid weights", () => {
    expect(() =>
      computeGrade({
        components: { productQuality: 50, realNumbers: 50, workflow: 50, distribution: 50 },
        weights: { productQuality: 25, realNumbers: 25, workflow: 25, distribution: 20 },
        allCheckpointsCleared: true,
      }),
    ).toThrow(/sum to 100/);
  });

  it("covers every component key exactly once", () => {
    const grade = computeGrade({
      components: { productQuality: 1, realNumbers: 2, workflow: 3, distribution: 4 },
      weights: WEIGHTS_V1,
      allCheckpointsCleared: false,
    });
    expect(Object.keys(grade.components).sort()).toEqual([...GRADE_COMPONENT_KEYS].sort());
  });
});

describe("workflowScore", () => {
  it("is zero at no runs, 80 at the bar of ten, and 100 well past it", () => {
    expect(workflowScore(0)).toBe(0);
    expect(workflowScore(5)).toBe(40);
    expect(workflowScore(10)).toBe(80);
    expect(workflowScore(20)).toBe(90);
    expect(workflowScore(30)).toBe(100);
    expect(workflowScore(1000)).toBe(100);
  });

  it("is monotonic and never negative", () => {
    let previous = -1;
    for (const runs of [0, 1, 3, 9, 10, 11, 25, 30, 200]) {
      const score = workflowScore(runs);
      expect(score).toBeGreaterThanOrEqual(previous);
      expect(score).toBeGreaterThanOrEqual(0);
      previous = score;
    }
    expect(workflowScore(Number.NaN)).toBe(0);
    expect(workflowScore(-5)).toBe(0);
  });
});

describe("deriveComponents", () => {
  it("scores a student with nothing at all as zero everywhere", () => {
    expect(deriveComponents(inputs())).toEqual({
      productQuality: 0,
      realNumbers: 0,
      workflow: 0,
      distribution: 0,
    });
  });

  it("averages the two product reviews, and skips a missing one", () => {
    expect(deriveComponents(inputs({ workingRubricScore: 70 })).productQuality).toBe(70);
    expect(
      deriveComponents(inputs({ workingRubricScore: 70, launchRubricScore: 90 })).productQuality,
    ).toBe(80);
  });

  it("rewards the first paying customer far more than the hundredth", () => {
    const one = deriveComponents(inputs({ payingCustomers: 1 })).realNumbers;
    const two = deriveComponents(inputs({ payingCustomers: 2 })).realNumbers;
    const fifty = deriveComponents(inputs({ payingCustomers: 50 })).realNumbers;
    const hundred = deriveComponents(inputs({ payingCustomers: 100 })).realNumbers;
    expect(one).toBeGreaterThan(0);
    expect(two - one).toBeGreaterThan(hundred - fifty);
  });

  it("is monotonic in customers, gross payments and runs", () => {
    const grow = (over: Partial<ComponentInputs>[]) =>
      over.map((o) => deriveComponents(inputs(o)));
    const byCustomers = grow([
      { payingCustomers: 0 },
      { payingCustomers: 1 },
      { payingCustomers: 5 },
      { payingCustomers: 40 },
    ]).map((c) => c.realNumbers);
    const byGross = grow([
      { grossTotal: 0 },
      { grossTotal: 500 },
      { grossTotal: 5_000 },
      { grossTotal: 90_000 },
    ]).map((c) => c.realNumbers);
    const byRuns = grow([
      { workflowRuns: 0 },
      { workflowRuns: 4 },
      { workflowRuns: 10 },
      { workflowRuns: 60 },
    ]).map((c) => c.workflow);
    for (const series of [byCustomers, byGross, byRuns]) {
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
      }
    }
  });

  it("saturates each half of realNumbers at its target and stays there", () => {
    const atTarget = deriveComponents(
      inputs({ payingCustomers: 10, grossTotal: 10_000 }),
    ).realNumbers;
    const wayPast = deriveComponents(
      inputs({ payingCustomers: 400, grossTotal: 900_000 }),
    ).realNumbers;
    expect(atTarget).toBe(100);
    expect(wayPast).toBe(100);
  });

  it("spam scores distribution zero whatever the write-up said", () => {
    const honest = deriveComponents(
      inputs({ launchDistributionScore: 95, payingCustomers: 5 }),
    ).distribution;
    const spam = deriveComponents(
      inputs({ launchDistributionScore: 95, payingCustomers: 5, spamFlagged: true }),
    ).distribution;
    expect(honest).toBeGreaterThan(60);
    expect(spam).toBe(0);
  });

  it("a great launch story with nobody at the end of it cannot score full marks", () => {
    const storyOnly = deriveComponents(inputs({ launchDistributionScore: 100 })).distribution;
    expect(storyOnly).toBe(70);
    const withReach = deriveComponents(
      inputs({ launchDistributionScore: 100, payingCustomers: 10 }),
    ).distribution;
    expect(withReach).toBe(100);
  });

  it("feeds computeGrade to a sensible end-of-course total", () => {
    const components = deriveComponents({
      workingRubricScore: 82,
      launchRubricScore: 88,
      launchDistributionScore: 84,
      payingCustomers: 6,
      grossTotal: 7_400,
      workflowRuns: 18,
      spamFlagged: false,
    });
    const grade = computeGrade({
      components,
      weights: WEIGHTS_V1,
      allCheckpointsCleared: true,
    });
    expect(grade.total).toBeGreaterThan(60);
    expect(grade.total).toBeLessThanOrEqual(100);
    expect(grade.graduationEligible).toBe(true);
  });
});

describe("cooldown", () => {
  const last = new Date("2026-09-14T12:00:00Z");

  it("puts the fence exactly the cooldown after the last submission", () => {
    expect(nextAllowedResubmitAt(last, 15).toISOString()).toBe("2026-09-14T12:15:00.000Z");
    expect(nextAllowedResubmitAt(last, 0).toISOString()).toBe(last.toISOString());
    expect(nextAllowedResubmitAt(last, -5).toISOString()).toBe(last.toISOString());
    expect(nextAllowedResubmitAt(last, Number.NaN).toISOString()).toBe(last.toISOString());
  });

  it("refuses inside the window and allows at or after the fence", () => {
    const fence = nextAllowedResubmitAt(last, 15);
    const inside = cooldownRemaining(new Date("2026-09-14T12:11:30Z"), fence);
    expect(inside.allowed).toBe(false);
    expect(inside.remainingMs).toBe(210_000);
    expect(inside.humanText).toBe("4 minutes");

    expect(cooldownRemaining(fence, fence).allowed).toBe(true);
    expect(cooldownRemaining(new Date("2026-09-14T12:20:00Z"), fence).allowed).toBe(true);
  });

  it("never reports zero while still refusing", () => {
    const fence = nextAllowedResubmitAt(last, 15);
    const nearly = cooldownRemaining(new Date("2026-09-14T12:14:59.500Z"), fence);
    expect(nearly.allowed).toBe(false);
    expect(nearly.humanText).toBe("1 second");
  });

  it("reads plainly across seconds, minutes and hours", () => {
    const at = (iso: string) => cooldownRemaining(last, new Date(iso)).humanText;
    expect(at("2026-09-14T12:00:01Z")).toBe("1 second");
    expect(at("2026-09-14T12:00:45Z")).toBe("45 seconds");
    expect(at("2026-09-14T12:01:00Z")).toBe("1 minute");
    expect(at("2026-09-14T12:30:00Z")).toBe("30 minutes");
    expect(at("2026-09-14T13:00:00Z")).toBe("1 hour");
    expect(at("2026-09-14T15:30:00Z")).toBe("4 hours"); // rounded up, never short
  });

  it("a missing fence means no cooldown is running", () => {
    expect(cooldownRemaining(last, null)).toEqual({
      allowed: true,
      remainingMs: 0,
      humanText: "now",
    });
    expect(cooldownRemaining(last, undefined).allowed).toBe(true);
  });
});
