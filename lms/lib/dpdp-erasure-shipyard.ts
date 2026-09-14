// The Shipyard's half of DPDP export-and-delete.
//
// The Forge's erasure machinery (`lib/dpdp-erasure-prisma.ts`) is receipt-bound
// and exact-version-bound: no row is deleted until the precise S3 object
// version behind it is verifiably gone. Course 2 has to hold the same bar, so
// this module supplies the Shipyard's inventory and its FK-ordered cleanup and
// the existing machinery does the rest — one receipt tree, one write barrier,
// one audit row.
//
// Why it is a separate file: the erasure module is 2,400 lines of
// safety-critical sequencing, and the Shipyard's contribution is a list of
// tables and a list of object keys. Keeping them apart means a change to
// Course 2's schema never has to be made inside that sequencing.
//
// A Shipyard product's rows would in fact cascade away with the User row
// (ShipyardProduct.userId is onDelete: Cascade). That is not good enough: an
// erasure receipt has to SAY what it deleted, and a cascade deletes rows
// without deleting the S3 objects those rows point at. So the deletion is
// explicit and counted, and every file key is claimed by the object phase.

import type { Prisma, PrismaClient } from "@prisma/client";
import { SHIPYARD_COURSE_ID } from "./shipyard/constants";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Prisma.TransactionClient;

/** Shipyard tables a learner erasure must account for, in FK order. */
export const SHIPYARD_ERASURE_TABLES = [
  "ShipyardReview",
  "ShipyardSubmission",
  "ShipyardCheckpointState",
  "ShipyardGrade",
  "ShipyardTrackerOverride",
  "ShipyardProduct",
] as const;

export type ShipyardErasureCounts = {
  shipyardReviews: number;
  shipyardSubmissions: number;
  shipyardCheckpointStates: number;
  shipyardGrades: number;
  shipyardTrackerOverrides: number;
  shipyardProducts: number;
};

export const EMPTY_SHIPYARD_COUNTS: ShipyardErasureCounts = {
  shipyardReviews: 0,
  shipyardSubmissions: 0,
  shipyardCheckpointStates: 0,
  shipyardGrades: 0,
  shipyardTrackerOverrides: 0,
  shipyardProducts: 0,
};

// ---------------------------------------------------------------------------
// The object inventory
// ---------------------------------------------------------------------------

/** One S3 object a Shipyard row points at, and the row that points at it. */
export type ShipyardObjectRef = {
  key: string;
  databaseTable: string;
  databaseRecordId: string;
};

type SubmissionFileRow = { id: string; files: unknown };
type ReviewArtifactRow = { id: string; renderArtifacts: unknown };

/** The S3 keys inside one submission's `files` JSON. */
export function submissionFileKeys(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  const keys: string[] = [];
  for (const entry of files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key === "string" && key.trim()) keys.push(key.trim());
  }
  return keys;
}

/** The screenshot key on a checkpoint-3 review's render artifacts. */
export function reviewArtifactKeys(renderArtifacts: unknown): string[] {
  if (!renderArtifacts || typeof renderArtifacts !== "object" || Array.isArray(renderArtifacts)) {
    return [];
  }
  const key = (renderArtifacts as { screenshotS3Key?: unknown }).screenshotS3Key;
  return typeof key === "string" && key.trim() ? [key.trim()] : [];
}

/** Pure: rows in, object references out, deduplicated and stably ordered. */
export function shipyardObjectRefs(
  submissions: SubmissionFileRow[],
  reviews: ReviewArtifactRow[],
): ShipyardObjectRef[] {
  const refs: ShipyardObjectRef[] = [];
  const seen = new Set<string>();
  const push = (key: string, databaseTable: string, databaseRecordId: string) => {
    const identity = `${databaseTable}:${databaseRecordId}:${key}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    refs.push({ key, databaseTable, databaseRecordId });
  };
  for (const submission of submissions) {
    for (const key of submissionFileKeys(submission.files)) {
      push(key, "ShipyardSubmission", submission.id);
    }
  }
  for (const review of reviews) {
    for (const key of reviewArtifactKeys(review.renderArtifacts)) {
      push(key, "ShipyardReview", review.id);
    }
  }
  return refs.sort(
    (a, b) =>
      a.databaseTable.localeCompare(b.databaseTable) ||
      a.databaseRecordId.localeCompare(b.databaseRecordId) ||
      a.key.localeCompare(b.key),
  );
}

/** Every S3 object one student's Shipyard rows point at. */
export async function loadShipyardObjectRefs(
  tx: Tx,
  userId: string,
): Promise<ShipyardObjectRef[]> {
  const product = await tx.shipyardProduct.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!product) return [];

  const submissions = await tx.shipyardSubmission.findMany({
    where: { productId: product.id },
    orderBy: { id: "asc" },
    select: { id: true, files: true },
  });
  const reviews = await tx.shipyardReview.findMany({
    where: { submission: { productId: product.id } },
    orderBy: { id: "asc" },
    select: { id: true, renderArtifacts: true },
  });
  return shipyardObjectRefs(submissions, reviews);
}

// ---------------------------------------------------------------------------
// The cleanup
// ---------------------------------------------------------------------------

/**
 * Delete one student's whole Shipyard graph, in FK order, and count it.
 * Runs inside the erasure's database-cleanup transaction, before the User row.
 */
export async function deleteShipyardRows(
  tx: Tx,
  userId: string,
): Promise<ShipyardErasureCounts> {
  const product = await tx.shipyardProduct.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!product) return { ...EMPTY_SHIPYARD_COUNTS };

  const shipyardReviews = await tx.shipyardReview.deleteMany({
    where: { submission: { productId: product.id } },
  });
  const shipyardSubmissions = await tx.shipyardSubmission.deleteMany({
    where: { productId: product.id },
  });
  const shipyardCheckpointStates = await tx.shipyardCheckpointState.deleteMany({
    where: { productId: product.id },
  });
  const shipyardGrades = await tx.shipyardGrade.deleteMany({
    where: { productId: product.id },
  });
  const shipyardTrackerOverrides = await tx.shipyardTrackerOverride.deleteMany({
    where: { productId: product.id },
  });
  const shipyardProducts = await tx.shipyardProduct.deleteMany({
    where: { id: product.id, userId },
  });

  return {
    shipyardReviews: shipyardReviews.count,
    shipyardSubmissions: shipyardSubmissions.count,
    shipyardCheckpointStates: shipyardCheckpointStates.count,
    shipyardGrades: shipyardGrades.count,
    shipyardTrackerOverrides: shipyardTrackerOverrides.count,
    shipyardProducts: shipyardProducts.count,
  };
}

// ---------------------------------------------------------------------------
// The export bundle
// ---------------------------------------------------------------------------

export type ShipyardExportSection = {
  product: {
    id: string;
    name: string;
    oneLiner: string;
    liveUrl: string | null;
    waitlistUrl: string | null;
    trackerProductId: string | null;
    createdAt: Date;
  };
  submissions: {
    id: string;
    checkpointKey: string;
    status: string;
    version: number;
    fields: unknown;
    files: unknown;
    submittedAt: Date | null;
    createdAt: Date;
  }[];
  reviews: {
    id: string;
    submissionId: string;
    checkpointKey: string;
    verdict: string;
    reasons: unknown;
    rubricScores: unknown;
    confidence: number;
    metricSignalsSeen: unknown;
    renderArtifacts: unknown;
    /** SPEC §6: the full prompt and response are kept for audit, so they are
     *  the subject's data too and the export has to carry them. */
    promptLog: unknown;
    modelUsed: string;
    reviewedBy: string;
    createdAt: Date;
  }[];
  checkpointStates: {
    checkpointKey: string;
    state: string;
    openedAt: Date | null;
    passedAt: Date | null;
  }[];
  grade: {
    components: unknown;
    total: number;
    allCheckpointsCleared: boolean;
    weightsVersion: string;
    provisional: boolean;
    finalisedAt: Date | null;
  } | null;
  /** Every S3 key this student's Shipyard rows point at, named not proxied. */
  s3Keys: string[];
};

/** One student's whole Shipyard record, for the admin DPDP bundle. */
export async function loadShipyardExport(
  db: Db,
  userId: string,
): Promise<ShipyardExportSection | null> {
  const product = await db.shipyardProduct.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      oneLiner: true,
      liveUrl: true,
      waitlistUrl: true,
      trackerProductId: true,
      createdAt: true,
    },
  });
  if (!product) return null;

  const [submissions, reviews, states, grade] = await Promise.all([
    db.shipyardSubmission.findMany({
      where: { productId: product.id },
      orderBy: [{ checkpointId: "asc" }, { version: "asc" }],
      select: {
        id: true,
        status: true,
        version: true,
        fields: true,
        files: true,
        submittedAt: true,
        createdAt: true,
        checkpoint: { select: { key: true } },
      },
    }),
    db.shipyardReview.findMany({
      where: { submission: { productId: product.id } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        submissionId: true,
        verdict: true,
        reasons: true,
        rubricScores: true,
        confidence: true,
        metricSignalsSeen: true,
        renderArtifacts: true,
        promptLog: true,
        modelUsed: true,
        reviewedBy: true,
        createdAt: true,
        submission: { select: { checkpoint: { select: { key: true } } } },
      },
    }),
    db.shipyardCheckpointState.findMany({
      where: { productId: product.id },
      orderBy: { checkpoint: { order: "asc" } },
      select: {
        state: true,
        openedAt: true,
        passedAt: true,
        checkpoint: { select: { key: true } },
      },
    }),
    db.shipyardGrade.findUnique({
      where: { productId: product.id },
      select: {
        components: true,
        total: true,
        allCheckpointsCleared: true,
        weightsVersion: true,
        provisional: true,
        finalisedAt: true,
      },
    }),
  ]);

  const s3Keys = shipyardObjectRefs(
    submissions.map((s) => ({ id: s.id, files: s.files })),
    reviews.map((r) => ({ id: r.id, renderArtifacts: r.renderArtifacts })),
  ).map((ref) => ref.key);

  return {
    product,
    submissions: submissions.map((s) => ({
      id: s.id,
      checkpointKey: s.checkpoint.key,
      status: s.status,
      version: s.version,
      fields: s.fields,
      files: s.files,
      submittedAt: s.submittedAt,
      createdAt: s.createdAt,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      submissionId: r.submissionId,
      checkpointKey: r.submission.checkpoint.key,
      verdict: r.verdict,
      reasons: r.reasons,
      rubricScores: r.rubricScores,
      confidence: r.confidence,
      metricSignalsSeen: r.metricSignalsSeen,
      renderArtifacts: r.renderArtifacts,
      promptLog: r.promptLog,
      modelUsed: r.modelUsed,
      reviewedBy: r.reviewedBy,
      createdAt: r.createdAt,
    })),
    checkpointStates: states.map((s) => ({
      checkpointKey: s.checkpoint.key,
      state: s.state,
      openedAt: s.openedAt,
      passedAt: s.passedAt,
    })),
    grade,
    s3Keys: [...new Set(s3Keys)].sort(),
  };
}

// ---------------------------------------------------------------------------
// The Praxy payload — badges only, never numbers
// ---------------------------------------------------------------------------

/**
 * A badge is a VALIDATION: a thing that demonstrably happened. Every one of
 * these is derived from a cleared checkpoint and nothing else — never from a
 * grade, a rubric score, a payment total or a customer count.
 *
 * "first-paying-customer" is honest on those terms: the launch gate cannot
 * clear without at least one verified paying customer and no blocking flag
 * (SPEC §5), so clearing it IS the validation. The number stays in the LMS.
 */
export const SHIPYARD_BADGES: Record<string, string> = {
  idea: "validated-demand",
  design: "designed-before-building",
  working: "shipped-working-product",
  money: "payments-live",
  workflow: "workflow-automated",
  launch: "first-paying-customer",
};

/** Pure. Cleared checkpoint keys in, badge names out, in course order. */
export function shipyardBadges(clearedKeys: readonly string[]): string[] {
  const cleared = new Set(clearedKeys);
  const badges = Object.entries(SHIPYARD_BADGES)
    .filter(([key]) => cleared.has(key))
    .map(([, badge]) => badge);
  if (cleared.has("launch")) badges.push("shipyard-graduate");
  return badges;
}

export type ShipyardPraxyPayload = {
  product: { name: string; oneLiner: string; liveUrl: string | null };
  checkpointsCleared: { key: string; passedAt: string | null }[];
  badges: string[];
};

/**
 * The Shipyard branch of the Praxy export.
 *
 * SPEC §7 and the Forge's own invariant: "Grades and PCI never leave the LMS.
 * The Praxy export carries artifacts + badges only." So this returns what a
 * student built and what they demonstrably achieved — and no grade, no
 * component, no rubric score, no tracker money figure, no customer count.
 * `tests/shipyard-admin-dpdp.test.ts` asserts that, by shape.
 */
export async function loadShipyardPraxy(
  db: Db,
  userId: string,
): Promise<ShipyardPraxyPayload | null> {
  const product = await db.shipyardProduct.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      oneLiner: true,
      liveUrl: true,
      courseId: true,
    },
  });
  if (!product || product.courseId !== SHIPYARD_COURSE_ID) return null;

  const states = await db.shipyardCheckpointState.findMany({
    where: { productId: product.id, state: "passed" },
    orderBy: { checkpoint: { order: "asc" } },
    select: { passedAt: true, checkpoint: { select: { key: true } } },
  });

  const checkpointsCleared = states.map((s) => ({
    key: s.checkpoint.key as string,
    passedAt: s.passedAt?.toISOString() ?? null,
  }));

  return {
    product: { name: product.name, oneLiner: product.oneLiner, liveUrl: product.liveUrl },
    checkpointsCleared,
    badges: shipyardBadges(checkpointsCleared.map((c) => c.key)),
  };
}
