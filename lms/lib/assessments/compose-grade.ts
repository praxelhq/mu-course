import type { DimensionScore } from "./types";

export type ComposedArtifactGrade = {
  rubricScores: Record<string, DimensionScore>;
  total: number;
  conflicts: string[];
};

function clampScore(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

/**
 * Merge deterministic and model-assessed dimensions. A deterministic score is
 * authoritative for its dimension; model output may explain but never replace
 * it. The total is always recomputed server-side.
 */
export function composeArtifactGrade(args: {
  deterministic: Record<string, DimensionScore>;
  subjective: Record<string, DimensionScore>;
  dimensions: Array<string | { key: string; max: number }>;
}): ComposedArtifactGrade {
  const conflicts: string[] = [];
  const rubricScores: Record<string, DimensionScore> = {};

  for (const configuredDimension of args.dimensions) {
    const key =
      typeof configuredDimension === "string" ? configuredDimension : configuredDimension.key;
    const max = typeof configuredDimension === "string" ? 10 : configuredDimension.max;
    const deterministic = args.deterministic[key];
    const subjective = args.subjective[key];
    if (deterministic) {
      if (subjective && clampScore(subjective.score, max) !== clampScore(deterministic.score, max)) {
        conflicts.push(key);
      }
      rubricScores[key] = {
        score: clampScore(deterministic.score, max),
        rationale: deterministic.rationale,
      };
    } else {
      rubricScores[key] = {
        score: clampScore(subjective?.score ?? 0, max),
        rationale: subjective?.rationale ?? "No assessable evidence was returned.",
      };
    }
  }

  return {
    rubricScores,
    total: Object.values(rubricScores).reduce((sum, dimension) => sum + dimension.score, 0),
    conflicts,
  };
}
