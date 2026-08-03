// Peer Contribution Index, pure functions. NO DB imports here: data in,
// numbers out. The formula is frozen (docs/build/01_scoring_methodology.md §5):
//
//   PCI = (points received ÷ (100 × (team size − 1))) × team size
//
// then the two checkpoints combine 40/60 toward checkpoint 2, and ONLY the
// combined value is clipped to [0.70, 1.20].
//
// Note on the doc's "equal share → 1.0" anchor: under the literal formula the
// 1.0 anchor is receiving a 1/teamSize fraction of the eligible pool
// (100 × (teamSize − 1)); a team whose reviewers all split perfectly evenly
// across their teamSize−1 teammates computes to teamSize/(teamSize−1)
// (≈1.14–1.20), which the clip band absorbs. The formula is implemented
// verbatim — the frozen doc wins.

export const PCI_MIN = 0.7;
export const PCI_MAX = 1.2;

/** Checkpoint-2 weight in the combine (checkpoint 1 gets the remainder). */
export const CP2_WEIGHT = 0.6;

/** Raw (unclipped) PCI for one checkpoint. */
export function pciForCheckpoint(input: { pointsReceived: number; teamSize: number }): number {
  const { pointsReceived, teamSize } = input;
  if (teamSize < 2) throw new Error("pciForCheckpoint: teamSize must be at least 2");
  return (pointsReceived / (100 * (teamSize - 1))) * teamSize;
}

export type CombinedPci = {
  /** The final multiplier, clipped to [0.70, 1.20]. */
  pci: number;
  /** True when NO checkpoint data exists — the 1.0 is a neutral placeholder. */
  pending: boolean;
};

function clip(value: number): number {
  return Math.min(PCI_MAX, Math.max(PCI_MIN, value));
}

/**
 * Combine the two checkpoint PCIs, weighted 40/60 toward checkpoint 2 (§5:
 * "it reflects the fuller picture"). A missing checkpoint falls back to the
 * other alone; neither → neutral 1.0 flagged pending. Clipping happens AFTER
 * combining — never per checkpoint.
 */
export function combinePci(input: { cp1?: number | null; cp2?: number | null }): CombinedPci {
  const cp1 = input.cp1 ?? null;
  const cp2 = input.cp2 ?? null;
  if (cp1 === null && cp2 === null) return { pci: 1.0, pending: true };
  if (cp1 === null) return { pci: clip(cp2!), pending: false };
  if (cp2 === null) return { pci: clip(cp1), pending: false };
  return { pci: clip((1 - CP2_WEIGHT) * cp1 + CP2_WEIGHT * cp2), pending: false };
}

/** Default tolerance (in points) for the near-identical allocation detector. */
export const NEAR_IDENTICAL_TOLERANCE = 2;

/**
 * §5 safeguard — team-level detector: true when EVERY reviewer's allocation
 * spread (max − min across the points they handed out) is within tolerance.
 * That pattern can be a genuinely equal team or a pact; it is NEVER
 * auto-resolved — instructor surface only. No data → false (nothing to flag).
 */
export function nearIdenticalFlag(
  allocations: readonly (readonly number[])[],
  tolerance: number = NEAR_IDENTICAL_TOLERANCE,
): boolean {
  if (allocations.length === 0) return false;
  return allocations.every((points) => {
    if (points.length === 0) return true;
    return Math.max(...points) - Math.min(...points) <= tolerance;
  });
}
