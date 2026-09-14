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

type OverrideDb = Pick<PrismaClient, "shipyardTrackerOverride">;
type Db = OverrideDb & Pick<PrismaClient, "shipyardProduct">;

function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * In fake mode the tracker id IS the product id: the seed sets
 * `trackerProductId` to the ShipyardProduct id so no extra mapping is needed.
 *
 * It honours the real tracker's ownership contract so the demo exercises the
 * same code path: `ownerEmail` on the way out is the product owner's address,
 * and an `ownerEmail` on the way IN that does not match answers null, exactly
 * as Shipped.money's byte-identical not-found does.
 */
export function createFakeTrackerClient(db: Db = defaultPrisma): TrackerClient {
  return {
    async getCheckpointSignals(trackerProductId, options) {
      if (!trackerProductId) return null;

      const product = await db.shipyardProduct.findUnique({
        where: { id: trackerProductId },
        select: { user: { select: { email: true } } },
      });
      const ownerEmail = normaliseEmail(product?.user.email) || null;

      const asked = normaliseEmail(options?.ownerEmail);
      // The filter only bites when the fake tracker knows whose project it is.
      if (asked && ownerEmail && asked !== ownerEmail) return null;

      const row = await db.shipyardTrackerOverride.findUnique({
        where: { productId: trackerProductId },
        select: { signals: true, updatedAt: true },
      });
      // No override row means a product nobody has connected: all-false, zero.
      if (!row) return { ...emptySignals(), ownerEmail };
      const parsed = trackerSignalsSchema.safeParse(row.signals);
      if (!parsed.success) {
        console.error(`[tracker:fake] malformed override for ${trackerProductId}`);
        return { ...emptySignals(row.updatedAt), ownerEmail };
      }
      return { ...parsed.data, ownerEmail: parsed.data.ownerEmail ?? ownerEmail };
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
    db?: OverrideDb;
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
