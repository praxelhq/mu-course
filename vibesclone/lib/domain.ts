import type { ProjectStatus } from "@prisma/client";

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["analyzing", "deleting"],
  analyzing: ["review", "failed", "deleting"],
  review: ["analyzing", "approved", "deleting"],
  approved: ["generating", "review", "deleting"],
  generating: ["complete", "failed", "review", "deleting"],
  complete: ["review", "generating", "deleting"],
  failed: ["analyzing", "generating", "deleting"],
  deleting: [],
};

export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Invalid project transition: ${from} -> ${to}`);
}

export function canGenerate(input: {
  status: ProjectStatus;
  approvedVersion: number | null;
  currentUnderstanding: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.approvedVersion === null) return { ok: false, reason: "Approve the Build Understanding first." };
  if (input.approvedVersion !== input.currentUnderstanding) return { ok: false, reason: "The current understanding has not been approved." };
  if (!(["approved", "complete", "failed"] as ProjectStatus[]).includes(input.status)) {
    return { ok: false, reason: "This project is not ready to generate." };
  }
  return { ok: true };
}
