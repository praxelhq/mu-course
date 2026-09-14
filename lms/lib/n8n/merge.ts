// Folding a locally-read n8n run count into the tracker's signals.
//
// THE RULE, and it only goes one way: the tracker wins. `workflowRuns` from
// this portal's own n8n adapter is used ONLY when Shipped.money sent no number
// at all. The moment Shipped ships its own n8n source (SPEC §8.5 item 2), its
// count arrives non-null and this function becomes a no-op without a deploy.
//
// This lives here rather than in `lib/tracker` on purpose: the tracker client
// stays thin and speaks only to Shipped.money, so "what the tracker said" is
// never confused with "what we worked out ourselves".

import type { TrackerSignals } from "@/lib/tracker/types";
import { WORKFLOW_RUN_BAR } from "./client";

export type WorkflowRunMerge = {
  signals: TrackerSignals;
  /** True when the local count was actually used. */
  merged: boolean;
};

/** Pure. Returns the same object when there is nothing to merge. */
export function mergeWorkflowRunsDetailed(
  signals: TrackerSignals,
  runs: number | null | undefined,
): WorkflowRunMerge {
  const trackerKnows =
    typeof signals.workflowRuns === "number" && Number.isFinite(signals.workflowRuns);
  if (trackerKnows) return { signals, merged: false };
  if (typeof runs !== "number" || !Number.isFinite(runs) || runs < 0) {
    return { signals, merged: false };
  }

  const workflowRuns = Math.floor(runs);
  return {
    signals: {
      ...signals,
      workflowRuns,
      // The gate reads `workflowTenRuns`, so the derived boolean has to move
      // with the count or the number on the spine would contradict the gate.
      workflowTenRuns: workflowRuns >= WORKFLOW_RUN_BAR,
    },
    merged: true,
  };
}

/** `mergeWorkflowRunsDetailed`, for callers that only want the signals. */
export function mergeWorkflowRuns(
  signals: TrackerSignals,
  runs: number | null | undefined,
): TrackerSignals {
  return mergeWorkflowRunsDetailed(signals, runs).signals;
}
