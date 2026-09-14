// Gate resolution for the Shipyard, as one pure function.
//
// This is the only place the rule lives (docs/shipyard/ARCHITECTURE.md §4).
// Nothing here touches the database or the clock beyond the `now` it is given,
// so the whole of it is unit-testable.
//
// THE RULE
//   Sequential unlock : checkpoint 1 is open on enrolment; checkpoint N is
//                       reachable iff N-1 is passed, or an instructor opened N
//                       by hand.
//   review  gate      : passed iff a review has passed it.
//   metric  gate      : passed iff every required signal is true in the
//                       tracker's VERIFIED signals — and a blocking flag makes
//                       every metric signal false, so a gamed payment cannot
//                       clear Launch.
//   both    gate      : both halves.
//   A checkpoint that is not reachable is `locked`; reachable and not passed is
//   `open`.
//   passed is STICKY   : a checkpoint that has already passed (its stored
//                       `passedAt` is set) stays passed whatever the tracker
//                       says today. A refund, a re-connected product or a
//                       five-second outage is NEW INFORMATION ABOUT TODAY, not
//                       a retraction of something a student did — and un-passing
//                       one checkpoint re-locks every checkpoint after it.
//   so is the METRIC    half of a `both` gate: once the signals verified it,
//                       `metricClearedAt` is stamped and the half stays cleared
//                       while the write-up catches up. Without that the row
//                       said "cleared at 09:14" and the state said
//                       "awaiting-metrics" in the same breath.

import type { ShipyardCheckpointKey, ShipyardGateState, ShipyardGateType } from "@prisma/client";
import type { MetricSignalName, TrackerSignals } from "@/lib/tracker/types";

export type GateCheckpoint = {
  id: string;
  key: ShipyardCheckpointKey;
  order: number;
  gateType: ShipyardGateType;
  /** Required tracker signal names. Ignored for a pure `review` gate. */
  metricSignals: string[];
};

export type GateInput = {
  checkpoints: GateCheckpoint[];
  /** checkpointId -> when a review passed it, or null. */
  reviewPassed: Record<string, Date | null>;
  /** Null when the tracker is unreachable or the product is not connected. */
  signals: TrackerSignals | null;
  /** checkpointId -> when an instructor opened it by hand, or null. */
  manualOpens: Record<string, Date | null>;
  /**
   * checkpointId -> when this checkpoint FIRST passed, or null: the stored
   * `ShipyardCheckpointState.passedAt`. A checkpoint listed here is passed, full
   * stop — no signal read, no blocking flag and no missing tracker can take it
   * back. Optional so a caller with no history (the seed, a what-if) resolves
   * from scratch exactly as before.
   */
  alreadyPassed?: Record<string, Date | null>;
  /**
   * checkpointId -> when the METRIC half was first verified true, or null: the
   * stored `ShipyardCheckpointState.metricClearedAt`. The same rule as
   * `alreadyPassed`, one level down, and for the same reason: a `both` gate
   * pairs a write-up with a signal, the row already records "this half cleared
   * at 09:14", and re-reading the signal live meant the row and the state could
   * disagree — cleared on the row, `awaiting-metrics` in the reason. A half a
   * student reached stays reached (SPEC §5 "store which cleared when").
   * Optional, so a caller with no history resolves from scratch as before.
   */
  metricAlreadyCleared?: Record<string, Date | null>;
};

/**
 * Why a checkpoint is in the state it is in. The reason always explains the
 * STATE, so the student spine can render it directly:
 *   locked -> previous-not-passed
 *   open   -> awaiting-*, tracker-unreachable when we could not read the
 *             numbers at all, or blocked-by-flag when the tracker raised one
 *   passed -> which half (or halves) cleared it
 *
 * `awaiting-metrics` and `tracker-unreachable` are different facts and a
 * student deserves both: the first says the numbers are in and not there yet,
 * the second says we have no numbers to show. Neither ever means "you lost it".
 */
export type GateReason =
  | "previous-not-passed"
  | "awaiting-review"
  | "awaiting-metrics"
  | "awaiting-review-and-metrics"
  | "tracker-unreachable"
  | "blocked-by-flag"
  | "review-passed"
  | "metric-passed"
  | "review-and-metric-passed";

export type GateResolution = {
  state: ShipyardGateState;
  reason: GateReason;
  /** True when this checkpoint is reachable only because a human opened it. */
  manuallyOpened: boolean;
};

export type SignalCheck = {
  name: string;
  met: boolean;
  /** The raw value behind the signal, for the student-facing live line. */
  value: boolean | number | string[] | null;
};

/**
 * `noBlockingFlags` is derived, not reported: the tracker sends the flag list
 * and the portal turns it into a signal.
 */
function signalValue(name: string, signals: TrackerSignals): boolean | number | string[] | null {
  switch (name as MetricSignalName) {
    case "paymentsLive":
      return signals.paymentsLive;
    case "trackerConnected":
      return signals.trackerConnected;
    case "workflowTenRuns":
      return signals.workflowRuns ?? signals.workflowTenRuns;
    case "hasPayingCustomer":
      return signals.payingCustomers > 0 ? signals.payingCustomers : signals.hasPayingCustomer;
    case "noBlockingFlags":
      return signals.blockingFlags;
    default:
      return null;
  }
}

function rawSignalMet(name: string, signals: TrackerSignals): boolean {
  switch (name as MetricSignalName) {
    case "paymentsLive":
      return signals.paymentsLive;
    case "trackerConnected":
      return signals.trackerConnected;
    case "workflowTenRuns":
      return signals.workflowTenRuns;
    case "hasPayingCustomer":
      return signals.hasPayingCustomer;
    case "noBlockingFlags":
      return signals.blockingFlags.length === 0;
    default:
      // An unknown signal name is never met. A checkpoint cannot be cleared by
      // a typo in its own configuration.
      return false;
  }
}

/**
 * Per-signal detail for the student's spine and the instructor drill-down.
 * A blocking flag makes every signal unmet EXCEPT `noBlockingFlags`, which is
 * the one that explains why.
 */
export function metricSignalsMet(
  required: string[],
  signals: TrackerSignals | null,
): SignalCheck[] {
  if (!signals) {
    return required.map((name) => ({ name, met: false, value: null }));
  }
  const blocked = signals.blockingFlags.length > 0;
  return required.map((name) => {
    const raw = rawSignalMet(name, signals);
    const met = name === "noBlockingFlags" ? raw : raw && !blocked;
    return { name, met, value: signalValue(name, signals) };
  });
}

/** Every required signal met. An empty requirement list is trivially met. */
function metricHalfCleared(required: string[], signals: TrackerSignals | null): boolean {
  if (required.length === 0) return true;
  if (!signals) return false;
  return metricSignalsMet(required, signals).every((s) => s.met);
}

function passedState(
  gateType: ShipyardGateType,
  reviewCleared: boolean,
  metricCleared: boolean,
): { passed: boolean; reason: GateReason } {
  switch (gateType) {
    case "review":
      return reviewCleared
        ? { passed: true, reason: "review-passed" }
        : { passed: false, reason: "awaiting-review" };
    case "metric":
      return metricCleared
        ? { passed: true, reason: "metric-passed" }
        : { passed: false, reason: "awaiting-metrics" };
    case "both": {
      if (reviewCleared && metricCleared) {
        return { passed: true, reason: "review-and-metric-passed" };
      }
      if (reviewCleared) return { passed: false, reason: "awaiting-metrics" };
      if (metricCleared) return { passed: false, reason: "awaiting-review" };
      return { passed: false, reason: "awaiting-review-and-metrics" };
    }
  }
}

/** The reason a checkpoint that has ALREADY passed is passed. */
function stickyReason(gateType: ShipyardGateType): GateReason {
  switch (gateType) {
    case "review":
      return "review-passed";
    case "metric":
      return "metric-passed";
    case "both":
      return "review-and-metric-passed";
  }
}

/**
 * Resolve every checkpoint's gate for one student, in one pass.
 * Pure: the same input and the same `now` always give the same answer.
 */
export function resolveGates(
  input: GateInput,
  now: Date = new Date(),
): Record<string, GateResolution> {
  void now; // the rule has no time component today; deadlines will need it
  const ordered = [...input.checkpoints].sort((a, b) => a.order - b.order);
  const out: Record<string, GateResolution> = {};
  const blocked = (input.signals?.blockingFlags.length ?? 0) > 0;

  // Checkpoint 1 is open on enrolment, so the chain starts "passed".
  let previousPassed: boolean = true;

  for (const cp of ordered) {
    const manualOpen = input.manualOpens[cp.id] != null;
    const manuallyOpened: boolean = manualOpen && !previousPassed;

    // Stickiness is checked FIRST, ahead of the signals, the blocking flags and
    // even the sequential chain: a checkpoint that passed cannot un-pass, so a
    // checkpoint after it can never be re-locked by a number that moved.
    if (input.alreadyPassed?.[cp.id] != null) {
      out[cp.id] = { state: "passed", reason: stickyReason(cp.gateType), manuallyOpened };
      previousPassed = true;
      continue;
    }

    const reviewCleared = cp.gateType === "metric" ? true : input.reviewPassed[cp.id] != null;
    const metricCleared =
      cp.gateType === "review"
        ? true
        : input.metricAlreadyCleared?.[cp.id] != null ||
          metricHalfCleared(cp.metricSignals, input.signals);
    const verdict = passedState(cp.gateType, reviewCleared, metricCleared);
    const reachable: boolean = previousPassed || manualOpen;

    if (!reachable) {
      out[cp.id] = { state: "locked", reason: "previous-not-passed", manuallyOpened: false };
    } else if (verdict.passed) {
      out[cp.id] = { state: "passed", reason: verdict.reason, manuallyOpened };
    } else {
      // Name a blocking flag specifically: "awaiting-metrics" would hide why
      // every signal suddenly reads false. Say "tracker-unreachable" when we
      // read nothing at all and the metric half is the only thing outstanding —
      // "awaiting-metrics" there would report a number we never saw.
      let reason: GateReason = verdict.reason;
      if (blocked && cp.gateType !== "review" && !metricCleared) {
        reason = "blocked-by-flag";
      } else if (input.signals === null && verdict.reason === "awaiting-metrics") {
        reason = "tracker-unreachable";
      }
      out[cp.id] = { state: "open", reason, manuallyOpened };
    }

    // The NEXT checkpoint is reachable only if this one actually passed here.
    previousPassed = reachable && verdict.passed;
  }

  return out;
}
