import { describe, expect, it } from "vitest";

// U15 — Peer Contribution Index, pure functions (written RED-FIRST: this file
// existed and failed before lib/scoring/pci.ts did).
//
// The frozen methodology (docs/build/01_scoring_methodology.md §5) fixes the
// formula verbatim:
//
//   PCI = (points received ÷ (100 × (team size − 1))) × team size
//
// and anchors "an exactly equal share of every teammate's 100 points" at
// PCI 1.0. Under the literal formula, the 1.0 anchor corresponds to receiving
// a 1/teamSize fraction of the eligible pool (100 × (teamSize − 1)), i.e.
// pointsReceived = 100 × (teamSize − 1) / teamSize. A reviewer that splits
// their 100 points perfectly evenly across their teamSize−1 teammates hands
// each slightly MORE than that (100/(n−1) > 100·(n−1)/n / (n−1)), so a
// perfectly-even team computes to n/(n−1) (≈1.14–1.20), which the 0.70–1.20
// clip band tolerates. Both facts are pinned below.

import { combinePci, nearIdenticalFlag, pciForCheckpoint } from "../lib/scoring/pci";

describe("pciForCheckpoint", () => {
  it("equal share of the pool (1/teamSize of 100·(n−1)) → exactly 1.0 for sizes 6, 7, 8", () => {
    for (const teamSize of [6, 7, 8]) {
      const pointsReceived = (100 * (teamSize - 1)) / teamSize; // the 1.0 anchor
      expect(pciForCheckpoint({ pointsReceived, teamSize })).toBeCloseTo(1.0, 10);
    }
  });

  it("a perfectly even split across n−1 teammates computes to n/(n−1)", () => {
    // n=6: each of 5 reviewers gives 100/5=20 → received 100 → (100/500)·6 = 1.2
    expect(pciForCheckpoint({ pointsReceived: 100, teamSize: 6 })).toBeCloseTo(1.2, 10);
    // n=8: 7 reviewers × 100/7 → received 100 → (100/700)·8 = 8/7
    expect(pciForCheckpoint({ pointsReceived: 100, teamSize: 8 })).toBeCloseTo(8 / 7, 10);
  });

  it("skew below: half the equal-pool share → 0.5 (raw, pre-clip)", () => {
    // n=6 anchor is 83.333…; half of it → 0.5
    expect(pciForCheckpoint({ pointsReceived: (100 * 5) / 6 / 2, teamSize: 6 })).toBeCloseTo(0.5, 10);
  });

  it("skew above: 1.5× the equal-pool share → 1.5 (raw, pre-clip)", () => {
    expect(
      pciForCheckpoint({ pointsReceived: ((100 * 5) / 6) * 1.5, teamSize: 6 }),
    ).toBeCloseTo(1.5, 10);
  });

  it("zero points received → 0 (raw; clipping happens only in combinePci)", () => {
    expect(pciForCheckpoint({ pointsReceived: 0, teamSize: 7 })).toBe(0);
  });
});

describe("combinePci", () => {
  it("weights 40/60 toward checkpoint 2: cp1=0.8, cp2=1.1 → 0.98 (pre-clip, inside the band)", () => {
    // 0.4×0.8 + 0.6×1.1 = 0.32 + 0.66 = 0.98
    const r = combinePci({ cp1: 0.8, cp2: 1.1 });
    expect(r.pci).toBeCloseTo(0.98, 10);
    expect(r.pending).toBe(false);
  });

  it("missing cp2 → cp1 alone", () => {
    const r = combinePci({ cp1: 1.05 });
    expect(r.pci).toBeCloseTo(1.05, 10);
    expect(r.pending).toBe(false);
  });

  it("missing cp1 → cp2 alone", () => {
    const r = combinePci({ cp2: 0.9 });
    expect(r.pci).toBeCloseTo(0.9, 10);
    expect(r.pending).toBe(false);
  });

  it("neither checkpoint → 1.0 with the pending marker", () => {
    const r = combinePci({});
    expect(r.pci).toBe(1.0);
    expect(r.pending).toBe(true);
  });

  it("clips AFTER combining: values computing to 0.5 clip to 0.70", () => {
    // both checkpoints 0.5 → combined 0.5 → clipped up to the 0.70 floor
    expect(combinePci({ cp1: 0.5, cp2: 0.5 }).pci).toBe(0.7);
    // single-checkpoint fallback also clips
    expect(combinePci({ cp1: 0.5 }).pci).toBe(0.7);
  });

  it("clips values computing to 1.5 down to 1.20", () => {
    expect(combinePci({ cp1: 1.5, cp2: 1.5 }).pci).toBe(1.2);
    expect(combinePci({ cp2: 1.5 }).pci).toBe(1.2);
  });

  it("clip is applied after the 40/60 combine, not per checkpoint", () => {
    // cp1=0.4 (would clip to 0.7 alone), cp2=1.4 (would clip to 1.2 alone).
    // Correct: combine first → 0.4×0.4 + 0.6×1.4 = 0.16 + 0.84 = 1.0 (no clip).
    // Wrong (clip-then-combine) would give 0.4×0.7 + 0.6×1.2 = 1.0 too — so
    // use asymmetric values: cp1=0.4, cp2=1.0 → combined 0.76 (in band).
    // Clip-first would give 0.4×0.7+0.6×1.0 = 0.88. Pin 0.76.
    expect(combinePci({ cp1: 0.4, cp2: 1.0 }).pci).toBeCloseTo(0.76, 10);
  });

  it("boundary values 0.70 and 1.20 pass through untouched", () => {
    expect(combinePci({ cp1: 0.7, cp2: 0.7 }).pci).toBeCloseTo(0.7, 10);
    expect(combinePci({ cp1: 1.2, cp2: 1.2 }).pci).toBeCloseTo(1.2, 10);
  });
});

describe("nearIdenticalFlag", () => {
  it("flags a team where EVERY reviewer's allocation spread is within tolerance", () => {
    // 4-member team, each reviewer allocates near-evenly across 3 teammates.
    const allocations = [
      [34, 33, 33],
      [33, 34, 33],
      [33, 33, 34],
      [34, 34, 32], // spread 2 — still within the default tolerance
    ];
    expect(nearIdenticalFlag(allocations)).toBe(true);
  });

  it("does NOT flag when any one reviewer differentiates beyond tolerance", () => {
    const allocations = [
      [34, 33, 33],
      [50, 30, 20], // spread 30
      [33, 33, 34],
      [33, 34, 33],
    ];
    expect(nearIdenticalFlag(allocations)).toBe(false);
  });

  it("respects a custom tolerance", () => {
    const allocations = [
      [40, 30, 30],
      [30, 40, 30],
    ];
    expect(nearIdenticalFlag(allocations)).toBe(false); // spread 10 > 2
    expect(nearIdenticalFlag(allocations, 10)).toBe(true);
  });

  it("no allocations at all → false (no data is not a suspicious pattern)", () => {
    expect(nearIdenticalFlag([])).toBe(false);
  });

  it("single-recipient allocations (team of 2) have spread 0 → flagged", () => {
    expect(nearIdenticalFlag([[100], [100]])).toBe(true);
  });
});
