// The DB side of gate resolution: load what `resolveGates` needs, run the pure
// function, and write the answer into ShipyardCheckpointState.
//
// ShipyardCheckpointState is written HERE and nowhere else (architecture §4).
// Every route and page reads that table rather than re-deriving the rule, so a
// student's spine and an instructor's matrix can never disagree.
//
// Called on every submit, on every tracker refresh, and from the low-frequency
// gate sweep — so a student who lands their tenth workflow run at midnight
// sees the gate open without resubmitting anything.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { SHIPYARD_COURSE_ID } from "./constants";
import { resolveGates, type GateCheckpoint, type GateResolution } from "./gates";

type Db = Prisma.TransactionClient | PrismaClient;

export type RecomputeDeps = {
  db?: Db;
  tracker?: TrackerClient;
  now?: Date;
  /** Skip the tracker call when the caller already has fresh signals. */
  signals?: TrackerSignals | null;
};

export type CheckpointStateRow = {
  checkpointId: string;
  key: GateCheckpoint["key"];
  order: number;
  state: GateResolution["state"];
  reason: GateResolution["reason"];
  openedAt: Date | null;
  passedAt: Date | null;
  reviewClearedAt: Date | null;
  metricClearedAt: Date | null;
  manuallyOpenedBy: string | null;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Recompute and persist every checkpoint state for one product.
 *
 * `openedAt`, `passedAt`, `reviewClearedAt` and `metricClearedAt` are stamped
 * the FIRST time each becomes true and never moved afterwards: they are the
 * record of when a student got there, and a later recompute must not rewrite
 * a student's history because the tracker was briefly unreachable. A column
 * whose value computes to null is now OMITTED from the update rather than
 * written, so two recomputes racing can never blank a date the other just set.
 *
 * `state` is write-once in the same direction: the stored `passedAt` goes back
 * into `resolveGates` as `alreadyPassed`, so a row that reads `passed` can
 * never be rewritten to `open` or `locked` by a signal that moved after the
 * fact. `metricClearedAt` goes back the same way (`metricAlreadyCleared`): a
 * `both` gate whose metric half was once verified-true keeps that half, so a
 * student whose payments were live in the morning is not told at four o'clock
 * that the half they already cleared has come undone (DECISIONS, 2026-09-15).
 *
 * The read and the write are one serialised unit. Everything up to the write —
 * including the tracker call, which is a network round trip — happens OUTSIDE
 * it, and then a transaction takes `pg_advisory_xact_lock` on the product so
 * the submit path, the refresh callback and the fifteen-minute sweep cannot
 * interleave a read-then-upsert with each other. A caller that is ALREADY in a
 * transaction (the tests, the seed) is run inline: its own transaction is the
 * unit, and nesting one inside it would deadlock.
 */
export async function recomputeGates(
  productId: string,
  deps: RecomputeDeps = {},
): Promise<CheckpointStateRow[]> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();

  const product = await db.shipyardProduct.findUnique({
    where: { id: productId },
    select: { id: true, trackerProductId: true },
  });
  if (!product) throw new Error(`recomputeGates: no product ${productId}`);

  const checkpointRows = await db.shipyardCheckpoint.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    orderBy: { order: "asc" },
    select: { id: true, key: true, order: true, gateType: true, metricSignals: true },
  });
  const checkpoints: GateCheckpoint[] = checkpointRows.map((c) => ({
    id: c.id,
    key: c.key,
    order: c.order,
    gateType: c.gateType,
    metricSignals: asStringArray(c.metricSignals),
  }));

  // The tracker read is deliberately outside the lock: it is a network call,
  // and a slow Shipped.money must never hold a write lock on a student's gates
  // on a deadline night.
  const needsSignals = checkpoints.some((c) => c.gateType !== "review");
  let signals: TrackerSignals | null = deps.signals ?? null;
  if (signals === null && needsSignals && deps.signals === undefined) {
    const tracker = deps.tracker ?? (await createTrackerClient());
    signals = await tracker.getCheckpointSignals(product.trackerProductId);
  }

  const write = (tx: Db) => persistGates(tx, productId, checkpoints, signals, now);

  if (isTransactionClient(db)) return write(db);
  return (db as PrismaClient).$transaction(async (tx) => write(tx), { timeout: 30_000 });
}

/** A `Prisma.TransactionClient` has no `$transaction` of its own. */
function isTransactionClient(db: Db): boolean {
  return typeof (db as PrismaClient).$transaction !== "function";
}

/** The serialised half: lock, read what is stored, resolve, write. */
async function persistGates(
  db: Db,
  productId: string,
  checkpoints: GateCheckpoint[],
  signals: TrackerSignals | null,
  now: Date,
): Promise<CheckpointStateRow[]> {
  // One writer per product at a time. `hashtext` gives the 32-bit key the
  // advisory lock wants; a collision between two product ids costs one of them
  // a short wait and nothing else.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;

  // A checkpoint's review half is cleared by the EARLIEST passing review, so a
  // later resubmission cannot move the date a student cleared it.
  const passedReviews = await db.shipyardReview.findMany({
    where: { verdict: "pass", needsHuman: false, submission: { productId } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, submission: { select: { checkpointId: true } } },
  });
  const reviewPassed: Record<string, Date | null> = {};
  for (const c of checkpoints) reviewPassed[c.id] = null;
  for (const r of passedReviews) {
    const cid = r.submission.checkpointId;
    if (reviewPassed[cid] == null) reviewPassed[cid] = r.createdAt;
  }

  const existing = await db.shipyardCheckpointState.findMany({ where: { productId } });
  const byCheckpoint = new Map(existing.map((s) => [s.checkpointId, s]));

  const manualOpens: Record<string, Date | null> = {};
  // What this product has ALREADY cleared. Feeding it back into the resolver is
  // what makes `passed` one-way: without it every run re-decides a cleared gate
  // from today's signals, and a refund or an unreachable tracker un-passes a
  // checkpoint and re-locks every checkpoint behind it.
  const alreadyPassed: Record<string, Date | null> = {};
  const metricAlreadyCleared: Record<string, Date | null> = {};
  for (const c of checkpoints) {
    const row = byCheckpoint.get(c.id);
    manualOpens[c.id] = row?.manuallyOpenedBy ? (row.openedAt ?? row.updatedAt) : null;
    // A row already stamped `passed` counts even if it predates `passedAt`;
    // its last write is the best date we have, and it is stamped from here on.
    alreadyPassed[c.id] = row?.passedAt ?? (row?.state === "passed" ? row.updatedAt : null);
    metricAlreadyCleared[c.id] = row?.metricClearedAt ?? null;
  }

  const resolved = resolveGates(
    { checkpoints, reviewPassed, signals, manualOpens, alreadyPassed, metricAlreadyCleared },
    now,
  );

  const out: CheckpointStateRow[] = [];
  for (const c of checkpoints) {
    const r = resolved[c.id];
    const prior = byCheckpoint.get(c.id);
    const reviewHalfCleared = c.gateType === "metric" ? false : reviewPassed[c.id] != null;
    const metricHalfCleared =
      c.gateType === "review"
        ? false
        : r.state === "passed" || (r.state === "open" && r.reason === "awaiting-review");

    const openedAt = prior?.openedAt ?? (r.state === "locked" ? null : now);
    const passedAt = prior?.passedAt ?? (r.state === "passed" ? now : null);
    const reviewClearedAt =
      prior?.reviewClearedAt ?? (reviewHalfCleared ? (reviewPassed[c.id] ?? now) : null);
    const metricClearedAt = prior?.metricClearedAt ?? (metricHalfCleared ? now : null);

    // A date we computed as null is a date we do not know yet, NOT a date to
    // erase. Omitting the column leaves whatever a concurrent writer stamped
    // between our read and this write (C9).
    const stamps = {
      ...(openedAt ? { openedAt } : {}),
      ...(passedAt ? { passedAt } : {}),
      ...(reviewClearedAt ? { reviewClearedAt } : {}),
      ...(metricClearedAt ? { metricClearedAt } : {}),
    };

    await db.shipyardCheckpointState.upsert({
      where: { productId_checkpointId: { productId, checkpointId: c.id } },
      create: {
        courseId: SHIPYARD_COURSE_ID,
        productId,
        checkpointId: c.id,
        state: r.state,
        openedAt,
        passedAt,
        reviewClearedAt,
        metricClearedAt,
      },
      update: { state: r.state, ...stamps },
    });

    out.push({
      checkpointId: c.id,
      key: c.key,
      order: c.order,
      state: r.state,
      reason: r.reason,
      openedAt,
      passedAt,
      reviewClearedAt,
      metricClearedAt,
      manuallyOpenedBy: prior?.manuallyOpenedBy ?? null,
    });
  }

  return out;
}
