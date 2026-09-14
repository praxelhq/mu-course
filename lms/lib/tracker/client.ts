// The only way this portal learns a student's real numbers.
//
// `TRACKER_MODE` chooses the implementation: "real" speaks HTTP to
// Shipped.money, "fake" reads the ShipyardTrackerOverride table so metric
// gates can be demonstrated with no live tracker. The default is "fake"
// whenever SHIPPED_MONEY_BASE_URL is unset, so a fresh checkout of this repo
// runs the whole gate story without credentials.

import type { TrackerSignals } from "./types";

export type CheckpointSignalsOptions = {
  /**
   * When given, the tracker is asked for this project ONLY IF it belongs to
   * this Shipped.money account, and answers a byte-identical not-found when it
   * does not (contract agreed 2026-09-15). It is a query parameter and is NOT
   * part of the HMAC string, which stays `${timestamp}:${projectId}`.
   *
   * A null answer is therefore ambiguous on its own — "not yours", "no such
   * project" and "the tracker is down" all look the same — so the only caller
   * that uses it (`connectTracker`) re-reads without it before deciding, and
   * the refresh path never uses it at all: disconnecting a student because a
   * webhook was late would be worse than the bug it closes.
   */
  ownerEmail?: string | null;
};

export interface TrackerClient {
  /**
   * Signals for one product, or null when the tracker cannot answer (no
   * tracker id, unreachable, malformed response, or — with `ownerEmail` —
   * a project that belongs to someone else). Never throws: an unreachable
   * tracker leaves gates where they are rather than failing a student's page.
   */
  getCheckpointSignals(
    trackerProductId: string | null | undefined,
    options?: CheckpointSignalsOptions,
  ): Promise<TrackerSignals | null>;
}

export type TrackerMode = "fake" | "real";

export function resolveTrackerMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TrackerMode {
  const raw = env.TRACKER_MODE?.trim().toLowerCase();
  if (raw === "real") return "real";
  if (raw === "fake") return "fake";
  // Unset: real only when a base URL is configured.
  return env.SHIPPED_MONEY_BASE_URL?.trim() ? "real" : "fake";
}

export async function createTrackerClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<TrackerClient> {
  if (resolveTrackerMode(env) === "real") {
    const { createRealTrackerClient } = await import("./real");
    return createRealTrackerClient(env);
  }
  const { createFakeTrackerClient } = await import("./fake");
  return createFakeTrackerClient();
}
