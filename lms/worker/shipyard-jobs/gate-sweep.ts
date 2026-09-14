// The `shipyard.gate-sweep` consumer.
//
// A metric gate is cleared by numbers arriving at Shipped.money, and nothing
// the student does in this portal causes that to be noticed. SPEC §5: "a
// student who lands their tenth workflow run at midnight sees the gate open
// without resubmitting anything." This is the job that makes that true.
//
// It only looks at products whose CURRENT open checkpoint is metric or `both` —
// a student waiting on a review has nothing a tracker read could change — and
// it is capped, so one sweep can never turn into 480 tracker calls plus 2,880
// upserts on a single tick.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/db";
import { createTrackerClient, type TrackerClient } from "../../lib/tracker/client";
import { SHIPYARD_COURSE_ID } from "../../lib/shipyard/constants";
import { recomputeGates } from "../../lib/shipyard/gate-state";

/** Every fifteen minutes: often enough to feel live, cheap enough to ignore. */
export const GATE_SWEEP_CRON = "*/15 * * * *";
export const GATE_SWEEP_LIMIT = 500;

export type GateSweepDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
  limit?: number;
};

export type GateSweepResult = { examined: number; changed: number; failed: number };

export async function sweepMetricGates(deps: GateSweepDeps = {}): Promise<GateSweepResult> {
  const db = deps.db ?? defaultPrisma;
  const limit = deps.limit ?? GATE_SWEEP_LIMIT;
  const tracker = deps.tracker ?? (await createTrackerClient());

  const rows = await db.shipyardCheckpointState.findMany({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      state: "open",
      checkpoint: { gateType: { in: ["metric", "both"] } },
      // Nothing to read for a product that never connected its tracker.
      product: { trackerProductId: { not: null } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { productId: true, checkpointId: true, state: true },
  });

  const productIds = [...new Set(rows.map((r) => r.productId))];
  let changed = 0;
  let failed = 0;

  for (const productId of productIds) {
    try {
      const before = new Map(rows.filter((r) => r.productId === productId).map((r) => [r.checkpointId, r.state]));
      const after = await recomputeGates(productId, { db, tracker, now: deps.now });
      if (after.some((s) => before.has(s.checkpointId) && before.get(s.checkpointId) !== s.state)) {
        changed += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(
        `[shipyard-sweep] recompute failed for ${productId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { examined: productIds.length, changed, failed };
}
