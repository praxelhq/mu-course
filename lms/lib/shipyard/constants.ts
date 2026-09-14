// Shipyard (Course 2) constants. The Shipyard is a `courseId`-scoped mode of
// the Forge: there is no Course table yet, so the course id lives here and
// every Shipyard row defaults to it.

import type { ShipyardCheckpointKey } from "@prisma/client";

export const SHIPYARD_COURSE_ID = "course-2";

/** The fixed order of the six checkpoints. Index + 1 is `order` in the DB. */
export const CHECKPOINT_ORDER = [
  "idea",
  "design",
  "working",
  "money",
  "workflow",
  "launch",
] as const satisfies readonly ShipyardCheckpointKey[];

export type CheckpointKey = (typeof CHECKPOINT_ORDER)[number];

/** 1-based position of a checkpoint key in the fixed sequence. */
export function checkpointOrder(key: CheckpointKey): number {
  return CHECKPOINT_ORDER.indexOf(key) + 1;
}

// --- Route paths -----------------------------------------------------------

export const SHIPYARD_ROUTES = {
  /** The student spine: the vertical of six checkpoints. */
  student: "/shipyard",
  instructor: "/shipyard/instructor",
  admin: "/shipyard/admin",
  api: "/api/shipyard",
} as const;

// --- Queues ----------------------------------------------------------------

export const QUEUE_SHIPYARD_REVIEW = "shipyard.review";
export const QUEUE_SHIPYARD_REVIEW_DEAD = "shipyard.review.dead";
export const QUEUE_SHIPYARD_TRACKER_REFRESH = "shipyard.tracker-refresh";
export const QUEUE_SHIPYARD_GATE_SWEEP = "shipyard.gate-sweep";

export const SHIPYARD_QUEUES = [
  QUEUE_SHIPYARD_REVIEW,
  QUEUE_SHIPYARD_REVIEW_DEAD,
  QUEUE_SHIPYARD_TRACKER_REFRESH,
  QUEUE_SHIPYARD_GATE_SWEEP,
] as const;

/** SPEC §6: 15, not 5 — 480 deadline-night submissions drain in ~25 minutes. */
export const DEFAULT_SHIPYARD_REVIEW_CONCURRENCY = 15;
export const SHIPYARD_REVIEW_RETRY_LIMIT = 4;

/** Reviewer concurrency from the environment, floored at 1. */
export function shipyardReviewConcurrency(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = Number(env.SHIPYARD_REVIEW_CONCURRENCY);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_SHIPYARD_REVIEW_CONCURRENCY;
  return Math.floor(raw);
}

/** Headless render budget for a checkpoint 3 live URL. */
export const DEFAULT_RENDER_TIMEOUT_MS = 20_000;

export function renderTimeoutMs(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = Number(env.SHIPYARD_RENDER_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RENDER_TIMEOUT_MS;
  return Math.floor(raw);
}

/** Below this, a review is queued for a human before the pass counts. */
export const HUMAN_REVIEW_CONFIDENCE_THRESHOLD = 0.7;
