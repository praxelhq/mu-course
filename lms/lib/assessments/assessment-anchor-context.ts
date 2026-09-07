import type { AssessmentAnchorPack } from "./assessment-anchors";

/**
 * Render only processor-safe, authored abstracts and exact band/cap criteria.
 * Runtime parsing rejects protected answer-key fragments before this renderer
 * receives a pack. This function accepts no answer-key parameter and emits
 * only the validated, processor-safe anchor contract.
 */
export function renderAssessmentAnchorPolicy(
  pack: AssessmentAnchorPack,
  dimensionKeys: string[],
): string {
  const requested = new Set(dimensionKeys);
  const lines = [
    `Content address: sha256:${pack.contentSha256}`,
    "Use the exact authored bands below. Return each dimension's matching anchorBand key.",
  ];
  for (const dimension of pack.content.dimensions) {
    if (!requested.has(dimension.key)) continue;
    lines.push(`Dimension ${dimension.key}:`);
    for (const band of dimension.bands) {
      lines.push(
        `- Band ${band.key} (${band.min}-${band.max}): ${band.criteria.join(" ")}`,
      );
    }
    for (const cap of dimension.caps) {
      lines.push(
        `- Mandatory cap ${cap.key}: maximum ${cap.max} when any of [${cap.whenFlags.join(", ")}] is returned. ${cap.rationale}`,
      );
    }
    for (const example of dimension.safeExamples) {
      lines.push(
        `- Authored abstract example ${example.key} (${example.bandKey}): ${example.summary}`,
      );
    }
  }
  return lines.join("\n");
}
