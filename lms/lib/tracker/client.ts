// The only way this portal learns a student's real numbers.
//
// `TRACKER_MODE` chooses the implementation: "real" speaks HTTP to
// Shipped.money, "fake" reads the ShipyardTrackerOverride table so metric
// gates can be demonstrated with no live tracker. The default is "fake"
// whenever SHIPPED_MONEY_BASE_URL is unset, so a fresh checkout of this repo
// runs the whole gate story without credentials.

import { demoModeSet } from "@/lib/auth/test-login";
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

/** Said once per process, not once per read. */
let fakeInProductionWarned = false;

/**
 * Which tracker answers a gate.
 *
 * In development the default is generous: no base URL means the fake, so a
 * fresh checkout runs the whole gate story with no credentials.
 *
 * In PRODUCTION it fails closed. The fake reads `ShipyardTrackerOverride`, a
 * table an admin can write, so a production instance that quietly fell back to
 * it would turn every metric gate — payments live, a paying customer, no
 * blocking flag — into something staff could set by hand, which is exactly
 * what a metric gate is defined not to be (SEC-5). So `fake` in production
 * needs BOTH an explicit `TRACKER_MODE=fake` AND no `SHIPPED_MONEY_BASE_URL`
 * configured: a missing variable, a typo'd mode, or a base URL sitting beside
 * `TRACKER_MODE=fake` all resolve to `real`, which fails loudly rather than
 * clearing gates from a table.
 *
 * `DEMO_MODE` is the sanctioned exception: a disposable demo instance has no
 * real students and the fake IS its tracker.
 */
export function resolveTrackerMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TrackerMode {
  const raw = env.TRACKER_MODE?.trim().toLowerCase();
  const baseUrl = env.SHIPPED_MONEY_BASE_URL?.trim() ?? "";

  if (env.NODE_ENV === "production" && !demoModeSet(env)) {
    const explicitlyFake = raw === "fake" && baseUrl === "";
    if (!explicitlyFake) return "real";
    if (!fakeInProductionWarned) {
      fakeInProductionWarned = true;
      console.warn(
        "[tracker] WARNING: running the FAKE tracker in production. Metric gates are being " +
          "decided from the ShipyardTrackerOverride table, not from Shipped.money. Set " +
          "SHIPPED_MONEY_BASE_URL and TRACKER_MODE=real.",
      );
    }
    return "fake";
  }

  if (raw === "real") return "real";
  if (raw === "fake") return "fake";
  // Unset outside production: real only when a base URL is configured.
  return baseUrl ? "real" : "fake";
}

/** Test seam: the production warning is once per process, not once per call. */
export function resetTrackerModeWarning(): void {
  fakeInProductionWarned = false;
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
