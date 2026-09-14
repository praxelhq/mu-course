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
 * a student's history because the tracker was briefly unreachable.
 *
 * `state` is now write-once in the same direction: the stored `passedAt` goes
 * back into `resolveGates` as `alreadyPassed`, so a row that reads `passed`
 * can never be rewritten to `open` or `locked` by a signal that moved after
 * the fact. Everything else is still re-decided from scratch on every run.
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

  const existing = await db.shipyardCheckpointState.findMany({
    where: { productId },
  });
  const byCheckpoint = new Map(existing.map((s) => [s.checkpointId, s]));

  const manualOpens: Record<string, Date | null> = {};
  // What this product has ALREADY cleared. Feeding it back into the resolver is
  // what makes `passed` one-way: without it every run re-decides a cleared gate
  // from today's signals, and a refund or an unreachable tracker un-passes a
  // checkpoint and re-locks every checkpoint behind it.
  const alreadyPassed: Record<string, Date | null> = {};
  for (const c of checkpoints) {
    const row = byCheckpoint.get(c.id);
    manualOpens[c.id] = row?.manuallyOpenedBy ? (row.openedAt ?? row.updatedAt) : null;
    // A row already stamped `passed` counts even if it predates `passedAt`;
    // its last write is the best date we have, and it is stamped from here on.
    alreadyPassed[c.id] = row?.passedAt ?? (row?.state === "passed" ? row.updatedAt : null);
  }

  const needsSignals = checkpoints.some((c) => c.gateType !== "review");
  let signals: TrackerSignals | null = deps.signals ?? null;
  if (signals === null && needsSignals && deps.signals === undefined) {
    const tracker = deps.tracker ?? (await createTrackerClient());
    signals = await tracker.getCheckpointSignals(product.trackerProductId);
  }

  const resolved = resolveGates(
    { checkpoints, reviewPassed, signals, manualOpens, alreadyPassed },
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
      update: { state: r.state, openedAt, passedAt, reviewClearedAt, metricClearedAt },
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
