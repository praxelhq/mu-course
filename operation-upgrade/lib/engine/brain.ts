import { QUESTION, type Outcome } from "@/lib/content/documents";

/// Given the pile of documents a student indexed, what does the company brain
/// actually say? First matching outcome wins, so the content file reads top to
/// bottom as "worst case first".
export function askBrain(indexed: readonly string[], questionId: string): Outcome {
  const q = QUESTION.get(questionId);
  if (!q) throw new Error(`unknown question ${questionId}`);
  const has = (id: string) => indexed.includes(id);

  for (const outcome of q.outcomes) {
    const requiresOk = (outcome.requires ?? []).every(has);
    const excludesOk = (outcome.excludes ?? []).every((id) => !has(id));
    if (requiresOk && excludesOk) return outcome;
  }
  // The content files always end with an unconditional outcome.
  return q.outcomes[q.outcomes.length - 1];
}

export type BrainReport = {
  asked: number;
  right: number;
  harmful: number;
  /// Question ids whose answer would embarrass the student in front of Cutesh.
  harmfulIds: string[];
};

export function brainReport(indexed: readonly string[], asked: readonly string[]): BrainReport {
  let right = 0;
  const harmfulIds: string[] = [];
  for (const id of asked) {
    const o = askBrain(indexed, id);
    if (o.verdict === "right") right += 1;
    if (o.verdict === "wrong" || o.verdict === "leaked" || o.verdict === "fooled") harmfulIds.push(id);
  }
  return { asked: asked.length, right, harmful: harmfulIds.length, harmfulIds };
}
