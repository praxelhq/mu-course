// One product per student, for the whole course.
//
// A ShipyardProduct is created the first time a student opens the spine, not by
// the roster import: the portal has to work for a student who enrolled an hour
// ago, and a product row with no checkpoint states is a student whose spine
// renders six locked boxes and no way in. So creating the product and asking
// `recomputeGates` for the six ShipyardCheckpointState rows is one operation.
//
// The name and one-liner start EMPTY. A student names their product by clearing
// checkpoint 1 — `createSubmission` copies `productName`/`oneLiner` across — and
// until then the spine shows the placeholder rather than a name nobody chose.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { TrackerClient } from "@/lib/tracker/client";
import { CHECKPOINT_ORDER, SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import { recomputeGates, type CheckpointStateRow } from "./gate-state";

export type ProductRow = {
  id: string;
  userId: string;
  name: string;
  oneLiner: string;
  liveUrl: string | null;
  waitlistUrl: string | null;
  trackerProductId: string | null;
};

const productSelect = {
  id: true,
  userId: true,
  name: true,
  oneLiner: true,
  liveUrl: true,
  waitlistUrl: true,
  trackerProductId: true,
} as const;

function toProductRow(row: ProductRow & Record<string, unknown>): ProductRow {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    oneLiner: row.oneLiner,
    liveUrl: row.liveUrl,
    waitlistUrl: row.waitlistUrl,
    trackerProductId: row.trackerProductId,
  };
}

export type ProductDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
};

/**
 * The student's product, created on first sight. Idempotent: the hot path (a
 * returning student, polled every four seconds) is one indexed read.
 */
export async function ensureProduct(userId: string, deps: ProductDeps = {}): Promise<ProductRow> {
  const db = deps.db ?? defaultPrisma;

  const existing = await db.shipyardProduct.findUnique({
    where: { userId },
    select: { ...productSelect, _count: { select: { checkpointStates: true } } },
  });
  if (existing && existing._count.checkpointStates >= CHECKPOINT_ORDER.length) {
    return toProductRow(existing);
  }

  let product: ProductRow;
  if (existing) {
    product = toProductRow(existing);
  } else {
    try {
      product = await db.shipyardProduct.create({
        data: { courseId: SHIPYARD_COURSE_ID, userId, name: "", oneLiner: "" },
        select: productSelect,
      });
    } catch (err) {
      // Two first page-loads racing each other. The unique index on userId is
      // the arbiter; the loser re-reads the winner's row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await db.shipyardProduct.findUnique({
          where: { userId },
          select: productSelect,
        });
        if (!raced) throw err;
        product = raced;
      } else {
        throw err;
      }
    }
  }

  await recomputeGates(product.id, { db, tracker: deps.tracker, now: deps.now });
  return product;
}

/** Rename a product. Always allowed: a product's name is the student's. */
export async function renameProduct(
  productId: string,
  input: { name: string; oneLiner: string },
  deps: ProductDeps = {},
): Promise<ProductRow> {
  const db = deps.db ?? defaultPrisma;
  const name = input.name.trim();
  const oneLiner = input.oneLiner.trim();
  if (!name) throw new ShipyardError(400, { error: "Your product needs a name." });
  return db.shipyardProduct.update({
    where: { id: productId },
    data: { name, oneLiner },
    select: productSelect,
  });
}

// ---------------------------------------------------------------------------
// Connecting Shipped.money
// ---------------------------------------------------------------------------

/**
 * `ShipyardProduct.trackerProductId` stores the Shipped.money project SLUG —
 * what a student sees in their own project URL and what `lib/tracker/real.ts`
 * sends as `projectId` (docs/DECISIONS.md, 2026-09-14).
 */
const TRACKER_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

const SLUG_HELP =
  "Paste your Shipped.money project link — it looks like https://shipped.money/p/your-project — or just the project slug.";

/**
 * A project URL or a bare slug, and nothing else. Deliberately narrow: a
 * student who pastes their own dashboard URL, a cohort page, or somebody
 * else's project gets told so now rather than by a metric gate that never
 * clears three weeks later.
 */
export function parseTrackerSlug(raw: string): string {
  const value = raw.trim();
  if (!value) throw new ShipyardError(400, { error: SLUG_HELP });

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (TRACKER_SLUG.test(value)) return value;
    throw new ShipyardError(400, { error: SLUG_HELP });
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ShipyardError(400, { error: SLUG_HELP });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ShipyardError(400, { error: SLUG_HELP });
  }
  const parts = url.pathname.split("/").filter((p) => p !== "");
  if (parts.length !== 2 || parts[0] !== "p" || !TRACKER_SLUG.test(parts[1])) {
    throw new ShipyardError(400, { error: SLUG_HELP });
  }
  return parts[1];
}

export type ConnectTrackerResult = {
  trackerProductId: string;
  states: CheckpointStateRow[];
};

/**
 * Point a product at its Shipped.money project and recompute immediately, so a
 * student whose numbers already qualify sees the gate move on this request
 * rather than at the next sweep.
 */
export async function connectTracker(
  productId: string,
  url: string,
  deps: ProductDeps = {},
): Promise<ConnectTrackerResult> {
  const db = deps.db ?? defaultPrisma;
  const trackerProductId = parseTrackerSlug(url);

  const product = await db.shipyardProduct.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new ShipyardError(404, { error: "No product to connect." });

  await db.shipyardProduct.update({
    where: { id: productId },
    data: { trackerProductId },
  });
  const states = await recomputeGates(productId, {
    db,
    tracker: deps.tracker,
    now: deps.now,
  });
  return { trackerProductId, states };
}
