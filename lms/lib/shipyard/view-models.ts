// The typed contract between the Shipyard data layer and its UI.
//
// Everything the student spine renders arrives as one `SpineView`. The UI
// imports ONLY from this file — it never reaches for Prisma types — so the
// data layer (gates, submissions, tracker signals, scoring) can land behind
// it without touching a single component. Until then `spine-mock.ts` fills
// the same shape.
//
// Rules encoded here, from docs/shipyard/SPEC.md §4–§5 and §7:
//   • A checkpoint is locked | open | passed and nothing else; the gate
//     decision is made server-side by resolveGate, never re-derived in a view.
//   • `signals` is non-null only for metric/both gates, and only ever carries
//     tracker-Verified values. No student-typed field feeds it.
//   • A grade line is provisional until faculty finalise it, and
//     `allCheckpointsCleared` is a graduation gate, not a weighted component.

/** Gate state for one checkpoint, for one student. */
export type CheckpointStateView = "locked" | "open" | "passed";

/**
 * One live signal read from Shipped.money. `met: null` means the tracker has
 * not answered yet (not connected, or the refresh failed) — render it as
 * unknown, never as "not met".
 */
export type SignalView = {
  name: string;
  label: string;
  met: boolean | null;
  /** Display-ready, already formatted: "7 of 10", "yes", "₹0". */
  value: string;
};

/** One clause of the published bar, and whether this submission met it. */
export type ReasonView = { criterion: string; met: boolean; note: string };

export type ReviewView = {
  verdict: "pass" | "return";
  reasons: ReasonView[];
  /** 0–1. Below 0.7 the review is queued for a human before it counts. */
  confidence: number;
  createdAt: string;
  pendingHuman: boolean;
  modelUsed?: string;
};

export type SubmissionView = {
  id: string;
  status: "draft" | "submitted" | "in_review" | "returned" | "passed";
  /** Increments on every resubmit; history is kept server-side. */
  version: number;
  submittedAt: string | null;
  /** Cooldown floor. Null once the student may resubmit. */
  nextAllowedResubmitAt: string | null;
  /** Place in the review queue while `in_review`, else null. */
  queuePosition: number | null;
  review: ReviewView | null;
  fields: Record<string, unknown>;
  files: { key: string; name: string; contentType: string; bytes: number; url?: string }[];
};

/** One input in a checkpoint's field schema (a DB row, not code). */
export type FieldSpecView = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "url" | "number" | "files" | "images";
  required: boolean;
  help?: string;
  maxFiles?: number;
  accept?: string;
};

export type CheckpointView = {
  id: string;
  key: "idea" | "design" | "working" | "money" | "workflow" | "launch";
  /** 1–6, fixed order. */
  order: number;
  title: string;
  /** The published bar, student-facing, rendered as markdown. */
  barMarkdown: string;
  gateType: "review" | "metric" | "both";
  state: CheckpointStateView;
  openedAt: string | null;
  passedAt: string | null;
  deadlineAt: string | null;
  resubmitWindowHours: number;
  resubmitCooldownMinutes: number;
  fields: FieldSpecView[];
  /** Non-null only for metric/both gates. */
  signals: SignalView[] | null;
  /** When the tracker last answered for this checkpoint. */
  signalsRefreshedAt: string | null;
  latestSubmission: SubmissionView | null;
  attempts: number;
};

export type GradeLineView = {
  provisional: boolean;
  /** The graduation condition (SPEC §7) — a gate on the grade, not a weight. */
  allCheckpointsCleared: boolean;
  total: number | null;
  components: {
    key: string;
    label: string;
    raw: number | null;
    weight: number;
    weighted: number | null;
    source: string;
  }[];
} | null;

export type SpineView = {
  product: { id: string; name: string; oneLiner: string; liveUrl: string | null } | null;
  checkpoints: CheckpointView[];
  /** Order of the checkpoint the student is standing at (1–6). */
  currentOrder: number;
  grade: GradeLineView;
  /** Honest queue expectation, e.g. "usually under two minutes". */
  queueNote: string;
  /** Server clock at render — every countdown is measured from this. */
  now: string;
};
