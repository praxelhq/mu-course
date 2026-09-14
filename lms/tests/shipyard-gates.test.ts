import { describe, expect, it } from "vitest";
import {
  metricSignalsMet,
  resolveGates,
  type GateCheckpoint,
  type GateInput,
} from "@/lib/shipyard/gates";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";

const NOW = new Date("2026-09-14T12:00:00Z");
const EARLIER = new Date("2026-09-10T12:00:00Z");

const CHECKPOINTS: GateCheckpoint[] = [
  { id: "c1", key: "idea", order: 1, gateType: "review", metricSignals: [] },
  { id: "c2", key: "design", order: 2, gateType: "review", metricSignals: [] },
  { id: "c3", key: "working", order: 3, gateType: "review", metricSignals: [] },
  {
    id: "c4",
    key: "money",
    order: 4,
    gateType: "both",
    metricSignals: ["paymentsLive", "trackerConnected"],
  },
  { id: "c5", key: "workflow", order: 5, gateType: "metric", metricSignals: ["workflowTenRuns"] },
  {
    id: "c6",
    key: "launch",
    order: 6,
    gateType: "both",
    metricSignals: ["hasPayingCustomer", "noBlockingFlags"],
  },
];

function input(overrides: Partial<GateInput> = {}): GateInput {
  const reviewPassed: Record<string, Date | null> = {};
  const manualOpens: Record<string, Date | null> = {};
  for (const c of CHECKPOINTS) {
    reviewPassed[c.id] = null;
    manualOpens[c.id] = null;
  }
  return { checkpoints: CHECKPOINTS, reviewPassed, signals: null, manualOpens, ...overrides };
}

function passReviews(...ids: string[]): Record<string, Date | null> {
  const out: Record<string, Date | null> = {};
  for (const c of CHECKPOINTS) out[c.id] = ids.includes(c.id) ? EARLIER : null;
  return out;
}

function signals(overrides: Partial<TrackerSignals> = {}): TrackerSignals {
  return { ...emptySignals(NOW), ...overrides };
}

const CONNECTED = signals({ paymentsLive: true, trackerConnected: true });
const TEN_RUNS = signals({
  paymentsLive: true,
  trackerConnected: true,
  workflowTenRuns: true,
  workflowRuns: 11,
});
const PAYING = signals({
  paymentsLive: true,
  trackerConnected: true,
  workflowTenRuns: true,
  workflowRuns: 12,
  hasPayingCustomer: true,
  payingCustomers: 2,
  grossTotal: 9_800,
  netTotal: 9_200,
});

describe("resolveGates — sequential unlock", () => {
  it("opens checkpoint 1 on enrolment and locks everything after it", () => {
    const r = resolveGates(input(), NOW);
    expect(r.c1.state).toBe("open");
    expect(r.c1.reason).toBe("awaiting-review");
    for (const id of ["c2", "c3", "c4", "c5", "c6"]) {
      expect(r[id].state, id).toBe("locked");
      expect(r[id].reason, id).toBe("previous-not-passed");
    }
  });

  it("opens N the moment N-1 passes, one step at a time", () => {
    const afterOne = resolveGates(input({ reviewPassed: passReviews("c1") }), NOW);
    expect(afterOne.c1.state).toBe("passed");
    expect(afterOne.c1.reason).toBe("review-passed");
    expect(afterOne.c2.state).toBe("open");
    expect(afterOne.c3.state).toBe("locked");

    const afterTwo = resolveGates(input({ reviewPassed: passReviews("c1", "c2") }), NOW);
    expect(afterTwo.c2.state).toBe("passed");
    expect(afterTwo.c3.state).toBe("open");
    expect(afterTwo.c4.state).toBe("locked");
  });

  it("never skips a checkpoint: passing 3 without 2 leaves 3 locked", () => {
    const r = resolveGates(input({ reviewPassed: passReviews("c1", "c3") }), NOW);
    expect(r.c1.state).toBe("passed");
    expect(r.c2.state).toBe("open");
    expect(r.c3.state).toBe("locked");
    expect(r.c4.state).toBe("locked");
  });

  it("a passed prerequisite is required even when the later gate's metrics are met", () => {
    const r = resolveGates(input({ signals: PAYING }), NOW);
    // Every metric signal is true, but nothing before checkpoint 4 has passed.
    expect(r.c4.state).toBe("locked");
    expect(r.c5.state).toBe("locked");
    expect(r.c6.state).toBe("locked");
  });

  it("is order-independent: an unsorted checkpoint list resolves the same", () => {
    const shuffled = [...CHECKPOINTS].reverse();
    const r = resolveGates(
      input({ checkpoints: shuffled, reviewPassed: passReviews("c1", "c2") }),
      NOW,
    );
    expect(r.c2.state).toBe("passed");
    expect(r.c3.state).toBe("open");
    expect(r.c4.state).toBe("locked");
  });

  it("returns one resolution per checkpoint and nothing else", () => {
    const r = resolveGates(input(), NOW);
    expect(Object.keys(r).sort()).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
  });
});

describe("resolveGates — manual opens", () => {
  it("an instructor can open a locked checkpoint without its prerequisite", () => {
    const manualOpens: Record<string, Date | null> = { c3: EARLIER };
    const r = resolveGates(input({ manualOpens }), NOW);
    expect(r.c3.state).toBe("open");
    expect(r.c3.manuallyOpened).toBe(true);
    // The escape hatch opens ONE checkpoint; it does not pass it.
    expect(r.c4.state).toBe("locked");
  });

  it("a manual open on a reachable checkpoint is not flagged as manual", () => {
    const manualOpens: Record<string, Date | null> = { c1: EARLIER };
    const r = resolveGates(input({ manualOpens }), NOW);
    expect(r.c1.state).toBe("open");
    expect(r.c1.manuallyOpened).toBe(false);
  });

  it("a manually opened checkpoint still passes on its own terms", () => {
    const r = resolveGates(
      input({ manualOpens: { c3: EARLIER }, reviewPassed: passReviews("c3") }),
      NOW,
    );
    expect(r.c3.state).toBe("passed");
    expect(r.c4.state).toBe("open");
  });
});

describe("resolveGates — review gates", () => {
  it("passes only when a review passed it", () => {
    expect(resolveGates(input(), NOW).c1.state).toBe("open");
    expect(resolveGates(input({ reviewPassed: passReviews("c1") }), NOW).c1.state).toBe("passed");
  });

  it("ignores tracker signals entirely", () => {
    const r = resolveGates(input({ signals: PAYING }), NOW);
    expect(r.c1.state).toBe("open");
    expect(r.c1.reason).toBe("awaiting-review");
  });
});

describe("resolveGates — metric gates", () => {
  const throughFour = () => passReviews("c1", "c2", "c3", "c4");

  it("workflow stays open until the tenth run lands", () => {
    const nine = signals({
      paymentsLive: true,
      trackerConnected: true,
      workflowRuns: 9,
      workflowTenRuns: false,
    });
    const before = resolveGates(input({ reviewPassed: throughFour(), signals: nine }), NOW);
    expect(before.c4.state).toBe("passed");
    expect(before.c5.state).toBe("open");
    expect(before.c5.reason).toBe("awaiting-metrics");

    const after = resolveGates(input({ reviewPassed: throughFour(), signals: TEN_RUNS }), NOW);
    expect(after.c5.state).toBe("passed");
    expect(after.c5.reason).toBe("metric-passed");
    expect(after.c6.state).toBe("open");
  });

  it("a metric gate cannot clear with no signals at all", () => {
    const r = resolveGates(input({ reviewPassed: throughFour(), signals: null }), NOW);
    expect(r.c4.state).toBe("open");
    expect(r.c5.state).toBe("locked");
  });

  it("every required signal must be true, not just one", () => {
    const halfConnected = signals({ paymentsLive: true, trackerConnected: false });
    const r = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4"), signals: halfConnected }),
      NOW,
    );
    expect(r.c4.state).toBe("open");
    expect(r.c4.reason).toBe("awaiting-metrics");
  });

  it("an unknown signal name never clears a gate", () => {
    const typo: GateCheckpoint[] = [
      { id: "c1", key: "workflow", order: 1, gateType: "metric", metricSignals: ["workflowTenRun"] },
    ];
    const r = resolveGates(
      { checkpoints: typo, reviewPassed: {}, signals: PAYING, manualOpens: {} },
      NOW,
    );
    expect(r.c1.state).toBe("open");
  });

  it("a checkpoint with no required signals is trivially cleared on the metric half", () => {
    const empty: GateCheckpoint[] = [
      { id: "x", key: "workflow", order: 1, gateType: "metric", metricSignals: [] },
    ];
    const r = resolveGates(
      { checkpoints: empty, reviewPassed: {}, signals: null, manualOpens: {} },
      NOW,
    );
    expect(r.x.state).toBe("passed");
  });
});

describe("resolveGates — both gates", () => {
  it("needs the review AND the metrics", () => {
    const reviewOnly = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4"), signals: null }),
      NOW,
    );
    expect(reviewOnly.c4.state).toBe("open");
    expect(reviewOnly.c4.reason).toBe("awaiting-metrics");

    const metricOnly = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3"), signals: CONNECTED }),
      NOW,
    );
    expect(metricOnly.c4.state).toBe("open");
    expect(metricOnly.c4.reason).toBe("awaiting-review");

    const both = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4"), signals: CONNECTED }),
      NOW,
    );
    expect(both.c4.state).toBe("passed");
    expect(both.c4.reason).toBe("review-and-metric-passed");
  });

  it("with neither half, the reason names both", () => {
    const r = resolveGates(input({ reviewPassed: passReviews("c1", "c2", "c3") }), NOW);
    expect(r.c4.reason).toBe("awaiting-review-and-metrics");
  });

  it("launch clears on a paying customer with no flags", () => {
    const r = resolveGates(
      input({
        reviewPassed: passReviews("c1", "c2", "c3", "c4", "c6"),
        signals: PAYING,
      }),
      NOW,
    );
    expect(r.c5.state).toBe("passed");
    expect(r.c6.state).toBe("passed");
  });
});

describe("resolveGates — blocking flags", () => {
  const flagged = { ...PAYING, blockingFlags: ["self_payment_suspected"] };

  it("a blocking flag fails launch even with a paying customer", () => {
    const r = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4", "c6"), signals: flagged }),
      NOW,
    );
    expect(r.c6.state).not.toBe("passed");
  });

  it("a blocking flag makes every metric signal false, so money falls back too", () => {
    const r = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4"), signals: flagged }),
      NOW,
    );
    expect(r.c4.state).toBe("open");
    expect(r.c4.reason).toBe("blocked-by-flag");
    expect(r.c5.state).toBe("locked");
  });

  it("clearing the flag restores every gate it had failed", () => {
    const before = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4", "c6"), signals: flagged }),
      NOW,
    );
    const after = resolveGates(
      input({ reviewPassed: passReviews("c1", "c2", "c3", "c4", "c6"), signals: PAYING }),
      NOW,
    );
    expect(before.c4.state).toBe("open");
    expect(after.c4.state).toBe("passed");
    expect(after.c6.state).toBe("passed");
  });

  it("a review gate is untouched by a blocking flag", () => {
    const r = resolveGates(input({ reviewPassed: passReviews("c1"), signals: flagged }), NOW);
    expect(r.c1.state).toBe("passed");
    expect(r.c2.state).toBe("open");
    expect(r.c2.reason).toBe("awaiting-review");
  });
});

describe("metricSignalsMet", () => {
  it("reports each signal with the raw value behind it", () => {
    const checks = metricSignalsMet(["paymentsLive", "trackerConnected"], CONNECTED);
    expect(checks).toEqual([
      { name: "paymentsLive", met: true, value: true },
      { name: "trackerConnected", met: true, value: true },
    ]);
  });

  it("shows the run count, not just the boolean, for the workflow gate", () => {
    const nine = signals({ workflowRuns: 9, workflowTenRuns: false });
    const [check] = metricSignalsMet(["workflowTenRuns"], nine);
    expect(check.met).toBe(false);
    expect(check.value).toBe(9);
  });

  it("shows the customer count for the launch gate", () => {
    const [check] = metricSignalsMet(["hasPayingCustomer"], PAYING);
    expect(check.met).toBe(true);
    expect(check.value).toBe(2);
  });

  it("with no signals at all, everything is unmet with a null value", () => {
    const checks = metricSignalsMet(["paymentsLive", "workflowTenRuns"], null);
    expect(checks.every((c) => !c.met && c.value === null)).toBe(true);
  });

  it("a blocking flag zeroes every signal except noBlockingFlags, which explains it", () => {
    const flagged = { ...PAYING, blockingFlags: ["self_payment_suspected"] };
    const checks = metricSignalsMet(["hasPayingCustomer", "noBlockingFlags"], flagged);
    expect(checks[0]).toEqual({ name: "hasPayingCustomer", met: false, value: 2 });
    expect(checks[1]).toEqual({
      name: "noBlockingFlags",
      met: false,
      value: ["self_payment_suspected"],
    });
  });

  it("noBlockingFlags is met when the list is empty", () => {
    const [check] = metricSignalsMet(["noBlockingFlags"], PAYING);
    expect(check.met).toBe(true);
    expect(check.value).toEqual([]);
  });
});
