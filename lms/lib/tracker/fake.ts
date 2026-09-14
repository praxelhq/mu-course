// The fake tracker: signals come from the ShipyardTrackerOverride table.
//
// This exists so the whole metric-gate story — payments going live, the tenth
// workflow run landing at midnight, a self-payment flag failing Launch — can
// be demonstrated and tested with no live tracker. It is a demo affordance,
// and it refuses to write when TRACKER_MODE=real, because a metric gate that
// an admin could clear by hand would not be a metric gate.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { emptySignals, trackerSignalsSchema, type TrackerSignals } from "./types";
import { resolveTrackerMode, type TrackerClient } from "./client";

type Db = Pick<PrismaClient, "shipyardTrackerOverride">;

/**
 * In fake mode the tracker id IS the product id: the seed sets
 * `trackerProductId` to the ShipyardProduct id so no extra mapping is needed.
 */
export function createFakeTrackerClient(db: Db = defaultPrisma): TrackerClient {
  return {
    async getCheckpointSignals(trackerProductId) {
      if (!trackerProductId) return null;
      const row = await db.shipyardTrackerOverride.findUnique({
        where: { productId: trackerProductId },
        select: { signals: true, updatedAt: true },
      });
      // No override row means a product nobody has connected: all-false, zero.
      if (!row) return emptySignals();
      const parsed = trackerSignalsSchema.safeParse(row.signals);
      if (!parsed.success) {
        console.error(`[tracker:fake] malformed override for ${trackerProductId}`);
        return emptySignals(row.updatedAt);
      }
      return parsed.data;
    },
  };
}

export class FakeTrackerDisabledError extends Error {
  constructor() {
    super("Fake tracker signals cannot be set while TRACKER_MODE=real");
    this.name = "FakeTrackerDisabledError";
  }
}

/**
 * Set (or merge into) one product's fake signals. Refused outright in real
 * mode. `updatedBy` is the acting admin, kept for the audit trail.
 */
export async function setFakeSignals(
  productId: string,
  partial: Partial<TrackerSignals>,
  updatedBy: string,
  options: {
    db?: Db;
    env?: Readonly<Record<string, string | undefined>>;
  } = {},
): Promise<TrackerSignals> {
  const env = options.env ?? process.env;
  if (resolveTrackerMode(env) === "real") throw new FakeTrackerDisabledError();
  const db = options.db ?? defaultPrisma;

  const existing = await db.shipyardTrackerOverride.findUnique({
    where: { productId },
    select: { signals: true },
  });
  const base = trackerSignalsSchema.safeParse(existing?.signals);
  const merged = trackerSignalsSchema.parse({
    ...(base.success ? base.data : emptySignals()),
    ...partial,
    fetchedAt: new Date().toISOString(),
    source: "verified" as const,
  });

  await db.shipyardTrackerOverride.upsert({
    where: { productId },
    create: { productId, signals: merged, updatedBy },
    update: { signals: merged, updatedBy },
  });
  return merged;
}
