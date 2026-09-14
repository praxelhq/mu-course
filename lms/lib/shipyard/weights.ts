// The grade's weights, as config rather than code (SPEC §7).
//
// `ShipyardWeights` is an append-only history: activating a new version writes
// a new row and deactivates the previous one, so a grade that says
// `weightsVersion: "v1"` can always be read back against the split that
// produced it. Rows are never edited in place and never deleted.
//
// Changing the weights re-scores the cohort — but only the grades nobody has
// signed. A finalised grade is never recomputed (docs/DECISIONS.md,
// 2026-09-15), so a weights change three weeks after finalisation cannot
// quietly move a number a student has already been given.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import { activeWeights, recomputeGradesForProducts, type RecomputeSummary } from "./grades";
import {
  assertValidWeights,
  GRADE_COMPONENT_KEYS,
  weightsSum,
  type GradeWeights,
} from "./scoring";

type Db = Prisma.TransactionClient | PrismaClient;

export { activeWeights };

/** One weights change re-scores at most this many products in-request. */
export const WEIGHTS_RECOMPUTE_CAP = 500;
/** Products per batch, so one activation is not one long transaction. */
export const WEIGHTS_RECOMPUTE_BATCH = 25;

export const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export type WeightsVersionRow = {
  id: string;
  version: string;
  weights: GradeWeights;
  active: boolean;
  createdAt: Date;
};

function parseWeights(value: unknown): GradeWeights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const out = {} as GradeWeights;
  for (const key of GRADE_COMPONENT_KEYS) {
    const w = row[key];
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) return null;
    out[key] = w;
  }
  return out;
}

/**
 * Validate a proposed split. Every component present, none negative, and the
 * four summing to 100 — a grade out of anything other than 100 is not a grade
 * anyone can read.
 */
export function validateWeightsInput(value: unknown): GradeWeights {
  const parsed = parseWeights(value);
  if (!parsed) {
    throw new ShipyardError(400, {
      error: "Give every component a number of zero or more.",
      components: [...GRADE_COMPONENT_KEYS],
    });
  }
  try {
    assertValidWeights(parsed);
  } catch {
    throw new ShipyardError(400, {
      error: `The four weights must add up to 100. These add up to ${weightsSum(parsed)}.`,
      sum: weightsSum(parsed),
    });
  }
  return parsed;
}

export function validateVersion(raw: unknown): string {
  const version = typeof raw === "string" ? raw.trim() : "";
  if (!VERSION_PATTERN.test(version)) {
    throw new ShipyardError(400, {
      error: "A version is a short label like v2 or 2026-09-autumn.",
    });
  }
  return version;
}

/** Every version ever activated, newest first, with the active one flagged. */
export async function listWeights(db: Db = defaultPrisma): Promise<WeightsVersionRow[]> {
  const rows = await db.shipyardWeights.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, weights: true, active: true, createdAt: true },
  });
  return rows.flatMap((row) => {
    const weights = parseWeights(row.weights);
    return weights ? [{ ...row, weights }] : [];
  });
}

export type ActivateWeightsResult = {
  version: string;
  weights: GradeWeights;
  previousVersion: string | null;
  recompute: RecomputeSummary;
};

/**
 * Create a new weights version and make it the active one, then re-score every
 * provisional grade against it.
 *
 * The write is one transaction (two active rows for even a moment would make
 * `activeWeights` non-deterministic); the recompute is deliberately outside it,
 * because it reads the tracker and a slow tracker must not hold a write lock.
 */
export async function activateWeights(
  input: { version: string; weights: GradeWeights; actorId: string },
  deps: { db?: PrismaClient; recompute?: boolean } = {},
): Promise<ActivateWeightsResult> {
  const db = deps.db ?? defaultPrisma;
  const version = validateVersion(input.version);
  const weights = validateWeightsInput(input.weights);

  const clash = await db.shipyardWeights.findUnique({
    where: { version },
    select: { id: true },
  });
  if (clash) {
    throw new ShipyardError(409, {
      error: `Weights version "${version}" already exists. Versions are history; pick a new label.`,
    });
  }

  const previous = await db.shipyardWeights.findFirst({
    where: { courseId: SHIPYARD_COURSE_ID, active: true },
    select: { version: true, weights: true },
  });

  await db.$transaction(async (tx) => {
    await tx.shipyardWeights.updateMany({
      where: { courseId: SHIPYARD_COURSE_ID, active: true },
      data: { active: false },
    });
    await tx.shipyardWeights.create({
      data: {
        courseId: SHIPYARD_COURSE_ID,
        version,
        weights: weights as unknown as Prisma.InputJsonValue,
        active: true,
      },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "shipyard.weights.activate",
      targetType: "ShipyardWeights",
      targetId: version,
      before: previous
        ? ({
            version: previous.version,
            weights: previous.weights,
          } as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      after: { version, weights } as unknown as Prisma.InputJsonValue,
    },
  });

  const recompute =
    deps.recompute === false
      ? { computed: 0, skipped: 0, failed: 0 }
      : await recomputeProvisionalGrades({ db });

  return {
    version,
    weights,
    previousVersion: previous?.version ?? null,
    recompute,
  };
}

/**
 * Re-score every grade nobody has signed. Capped and batched: 480 products is
 * 480 tracker reads, and an admin clicking "save weights" should not hold one
 * request open for all of them without a bound.
 */
export async function recomputeProvisionalGrades(
  deps: { db?: PrismaClient; limit?: number } = {},
): Promise<RecomputeSummary> {
  const db = deps.db ?? defaultPrisma;
  const limit = deps.limit ?? WEIGHTS_RECOMPUTE_CAP;

  const grades = await db.shipyardGrade.findMany({
    where: { courseId: SHIPYARD_COURSE_ID, provisional: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { productId: true },
  });

  const total: RecomputeSummary = { computed: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < grades.length; i += WEIGHTS_RECOMPUTE_BATCH) {
    const batch = grades.slice(i, i + WEIGHTS_RECOMPUTE_BATCH).map((g) => g.productId);
    const summary = await recomputeGradesForProducts(batch, { db });
    total.computed += summary.computed;
    total.skipped += summary.skipped;
    total.failed += summary.failed;
  }
  return total;
}
