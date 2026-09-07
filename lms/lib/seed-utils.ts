// Pure helpers for the deterministic seed (prisma/seed.ts). Kept here so the
// deterministic parts are unit-testable without a database.

/** Mulberry32 — tiny deterministic PRNG. Same seed, same sequence, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Partition `count` students into `teamCount` teams with sizes in [min, max].
 * Deterministic: remainder students go one-each to the first teams.
 * 60 students / 8 teams -> [8, 8, 8, 8, 7, 7, 7, 7].
 */
export function partitionTeams(
  count: number,
  teamCount: number,
  min = 6,
  max = 8,
): number[] {
  const base = Math.floor(count / teamCount);
  const remainder = count - base * teamCount;
  const sizes = Array.from({ length: teamCount }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
  for (const s of sizes) {
    if (s < min || s > max) {
      throw new Error(
        `partitionTeams(${count}, ${teamCount}): team size ${s} outside [${min}, ${max}]`,
      );
    }
  }
  return sizes;
}

/**
 * Allocate exactly 100 points across `n` recipients (a peer-review round).
 * Always sums to exactly 100; every share >= 1 when n <= 100.
 * With a constant rng (() => 0.5) the split is as equal as integers allow.
 */
export function allocatePoints(rng: () => number, n: number): number[] {
  if (n <= 0) throw new Error("allocatePoints: need at least one recipient");
  const weights = Array.from({ length: n }, () => 0.5 + rng());
  const total = weights.reduce((a, b) => a + b, 0);
  const points = weights.map((w) => Math.max(1, Math.floor((w / total) * 100)));
  let drift = 100 - points.reduce((a, b) => a + b, 0);
  let i = 0;
  while (drift !== 0) {
    if (drift > 0) {
      points[i % n] += 1;
      drift -= 1;
    } else if (points[i % n] > 1) {
      points[i % n] -= 1;
      drift += 1;
    }
    i += 1;
  }
  return points;
}
