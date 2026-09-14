// The faculty side of the Shipyard: one section's matrix, one student's file,
// and the human review queue.
//
// Everything here is an INDEXED read. The matrix is 60 students × 6
// checkpoints = 360 cells refreshed every eight seconds for eight sections at
// once, so it is deliberately five `findMany`s over indexed columns and a fold
// in memory — never a query per cell, never a per-student loop, and never a
// `loadSpine` per row (that would be 60 tracker calls for one page).
//
// It reads `ShipyardCheckpointState` and never re-derives the gate rule:
// `recomputeGates` is the only writer of that table (architecture §4), so the
// matrix and the student's own spine cannot disagree about who is where.

import { createHash } from "node:crypto";
import type { PrismaClient, ShipyardCheckpointKey } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { SHIPYARD_COURSE_ID } from "./constants";
import { parseStoredFiles, reasonViews, signalViews } from "./spine";
import type { CheckpointStateView, SignalView } from "./view-models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatrixCheckpoint = {
  id: string;
  key: ShipyardCheckpointKey;
  order: number;
  title: string;
};

/**
 * One square. `state` is the gate; `returned` and `inReview` are what the
 * student is currently holding inside an OPEN gate, which is the difference
 * between "has not started" and "is three attempts in" — the thing an
 * instructor scanning a section actually needs to see.
 */
export type MatrixCell = {
  checkpointId: string;
  state: CheckpointStateView;
  returned: boolean;
  inReview: boolean;
  attempts: number;
  passedAt: string | null;
  manuallyOpened: boolean;
};

export type MatrixRow = {
  userId: string;
  name: string;
  email: string;
  productName: string;
  cells: MatrixCell[];
};

export type CheckpointCounts = {
  checkpointId: string;
  passed: number;
  open: number;
  returned: number;
  inReview: number;
};

export type SectionSummary = {
  order: number;
  title: string;
  cleared: number;
  total: number;
};

export type SectionMatrix = {
  section: { id: string; code: string; name: string };
  checkpoints: MatrixCheckpoint[];
  rows: MatrixRow[];
  counts: CheckpointCounts[];
  /** "14 of 61 cleared checkpoint 3" — the one sentence above the grid. */
  summary: SectionSummary | null;
  /** Content hash for the 8s poll. */
  version: string;
};

export type InstructorDeps = { db?: PrismaClient };

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type SectionRef = { id: string; code: string; name: string };

export async function listSections(deps: InstructorDeps = {}): Promise<SectionRef[]> {
  const db = deps.db ?? defaultPrisma;
  return db.section.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

/**
 * Which section's matrix to show. An instructor pinned to a section lands on
 * their own; an admin, and an instructor with no section, land on the first.
 * A requested code always wins, because the tabs have to work for everybody.
 */
export function resolveSection(
  sections: SectionRef[],
  requestedCode: string | null,
  userSectionId: string | null,
): SectionRef | null {
  if (sections.length === 0) return null;
  if (requestedCode) {
    const wanted = sections.find((s) => s.code === requestedCode.toUpperCase());
    if (wanted) return wanted;
  }
  if (userSectionId) {
    const own = sections.find((s) => s.id === userSectionId);
    if (own) return own;
  }
  return sections[0];
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

/** A stable hash of every cell. Two identical matrices hash identically. */
export function matrixVersion(rows: MatrixRow[], checkpoints: MatrixCheckpoint[]): string {
  const payload = rows.map((r) => [
    r.userId,
    r.productName,
    ...checkpoints.map((c) => {
      const cell = r.cells.find((x) => x.checkpointId === c.id);
      if (!cell) return "-";
      return `${cell.state}${cell.returned ? "r" : ""}${cell.inReview ? "q" : ""}${cell.attempts}`;
    }),
  ]);
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export async function loadSectionMatrix(
  sectionId: string,
  deps: InstructorDeps = {},
): Promise<SectionMatrix | null> {
  const db = deps.db ?? defaultPrisma;

  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { id: true, code: true, name: true },
  });
  if (!section) return null;

  const [checkpoints, students] = await Promise.all([
    db.shipyardCheckpoint.findMany({
      where: { courseId: SHIPYARD_COURSE_ID },
      orderBy: { order: "asc" },
      select: { id: true, key: true, order: true, title: true },
    }),
    db.user.findMany({
      where: { sectionId, role: "student" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const userIds = students.map((s) => s.id);
  const products =
    userIds.length === 0
      ? []
      : await db.shipyardProduct.findMany({
          where: { userId: { in: userIds } },
          select: { id: true, userId: true, name: true },
        });
  const productByUser = new Map(products.map((p) => [p.userId, p]));
  const productIds = products.map((p) => p.id);

  const [states, submissions] = await Promise.all([
    productIds.length === 0
      ? []
      : db.shipyardCheckpointState.findMany({
          where: { productId: { in: productIds } },
          select: {
            productId: true,
            checkpointId: true,
            state: true,
            passedAt: true,
            manuallyOpenedBy: true,
          },
        }),
    productIds.length === 0
      ? []
      : db.shipyardSubmission.findMany({
          where: { productId: { in: productIds } },
          orderBy: { version: "asc" },
          select: { productId: true, checkpointId: true, status: true, version: true },
        }),
  ]);

  const cellKey = (productId: string, checkpointId: string) => `${productId}:${checkpointId}`;

  const stateByCell = new Map(states.map((s) => [cellKey(s.productId, s.checkpointId), s]));
  // Ordered by version, so the last write per cell IS the latest attempt.
  const latestByCell = new Map<string, (typeof submissions)[number]>();
  const attemptsByCell = new Map<string, number>();
  for (const s of submissions) {
    const k = cellKey(s.productId, s.checkpointId);
    latestByCell.set(k, s);
    attemptsByCell.set(k, (attemptsByCell.get(k) ?? 0) + 1);
  }

  const rows: MatrixRow[] = students.map((student) => {
    const product = productByUser.get(student.id) ?? null;
    const cells: MatrixCell[] = checkpoints.map((cp) => {
      if (!product) {
        // A student who has never opened the Shipyard has no product row yet;
        // their spine creates one on first sight. Until then checkpoint 1 is
        // open and the rest are locked — the same answer `loadSpine` gives.
        return {
          checkpointId: cp.id,
          state: cp.order === 1 ? "open" : "locked",
          returned: false,
          inReview: false,
          attempts: 0,
          passedAt: null,
          manuallyOpened: false,
        };
      }
      const k = cellKey(product.id, cp.id);
      const state = stateByCell.get(k);
      const latest = latestByCell.get(k);
      return {
        checkpointId: cp.id,
        state: state?.state ?? (cp.order === 1 ? "open" : "locked"),
        returned: latest?.status === "returned",
        inReview: latest?.status === "in_review" || latest?.status === "submitted",
        attempts: attemptsByCell.get(k) ?? 0,
        passedAt: state?.passedAt ? state.passedAt.toISOString() : null,
        manuallyOpened: Boolean(state?.manuallyOpenedBy),
      };
    });
    return {
      userId: student.id,
      name: student.name,
      email: student.email,
      productName: product?.name ?? "",
      cells,
    };
  });

  const counts: CheckpointCounts[] = checkpoints.map((cp) => {
    const tally = { checkpointId: cp.id, passed: 0, open: 0, returned: 0, inReview: 0 };
    for (const row of rows) {
      const cell = row.cells.find((c) => c.checkpointId === cp.id);
      if (!cell) continue;
      if (cell.state === "passed") tally.passed += 1;
      else if (cell.state === "open") {
        if (cell.inReview) tally.inReview += 1;
        else if (cell.returned) tally.returned += 1;
        else tally.open += 1;
      }
    }
    return tally;
  });

  return {
    section,
    checkpoints,
    rows,
    counts,
    summary: summariseSection(rows, checkpoints, counts),
    version: matrixVersion(rows, checkpoints),
  };
}

/**
 * The one sentence above the grid. It names the checkpoint the section is
 * actually standing at — the most common open one — rather than the first or
 * the last, because that is the one a class is about to be taught.
 */
export function summariseSection(
  rows: MatrixRow[],
  checkpoints: MatrixCheckpoint[],
  counts: CheckpointCounts[],
): SectionSummary | null {
  if (rows.length === 0 || checkpoints.length === 0) return null;
  const openTally = new Map<string, number>();
  for (const row of rows) {
    const open = checkpoints.find(
      (cp) => row.cells.find((c) => c.checkpointId === cp.id)?.state === "open",
    );
    const id = open?.id ?? checkpoints[checkpoints.length - 1].id;
    openTally.set(id, (openTally.get(id) ?? 0) + 1);
  }
  let bestId = checkpoints[0].id;
  let best = -1;
  for (const cp of checkpoints) {
    const n = openTally.get(cp.id) ?? 0;
    if (n > best) {
      best = n;
      bestId = cp.id;
    }
  }
  const cp = checkpoints.find((c) => c.id === bestId)!;
  const cleared = counts.find((c) => c.checkpointId === cp.id)?.passed ?? 0;
  return { order: cp.order, title: cp.title, cleared, total: rows.length };
}

// ---------------------------------------------------------------------------
// One student's file
// ---------------------------------------------------------------------------

export type StudentReviewView = {
  id: string;
  verdict: "pass" | "return";
  confidence: number;
  reasons: { criterion: string; met: boolean; note: string }[];
  modelUsed: string;
  providerUsed: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  reviewedBy: "ai" | "human";
  needsHuman: boolean;
  humanResolvedAt: string | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  screenshotKey: string | null;
  createdAt: string;
};

export type StudentSubmissionView = {
  id: string;
  version: number;
  status: "draft" | "submitted" | "in_review" | "returned" | "passed";
  submittedAt: string | null;
  fields: Record<string, unknown>;
  files: { key: string; name: string; contentType: string; bytes: number }[];
  reviews: StudentReviewView[];
};

export type StudentCheckpointView = {
  id: string;
  key: ShipyardCheckpointKey;
  order: number;
  title: string;
  gateType: "review" | "metric" | "both";
  state: CheckpointStateView;
  openedAt: string | null;
  passedAt: string | null;
  /** The staff member who opened it by hand: their name, not their id. */
  manuallyOpenedBy: string | null;
  signals: SignalView[] | null;
  submissions: StudentSubmissionView[];
};

export type StudentFile = {
  user: { id: string; name: string; email: string; sectionCode: string | null };
  product: {
    id: string;
    name: string;
    oneLiner: string;
    liveUrl: string | null;
    waitlistUrl: string | null;
    trackerProductId: string | null;
  } | null;
  checkpoints: StudentCheckpointView[];
  signalsRefreshedAt: string | null;
  /** M4 writes this. Null means "nobody has scored anything yet". */
  grade: null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function screenshotKeyOf(renderArtifacts: unknown): string | null {
  const r = asRecord(renderArtifacts);
  for (const key of ["screenshotKey", "screenshotS3Key"]) {
    const v = r[key];
    if (typeof v === "string" && v !== "") return v;
  }
  return null;
}

export type StudentFileDeps = InstructorDeps & { tracker?: TrackerClient };

/** Everything faculty may see about one student, in one screen's worth. */
export async function loadStudentFile(
  userId: string,
  deps: StudentFileDeps = {},
): Promise<StudentFile | null> {
  const db = deps.db ?? defaultPrisma;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, section: { select: { code: true } } },
  });
  if (!user) return null;

  const [checkpointRows, product] = await Promise.all([
    db.shipyardCheckpoint.findMany({
      where: { courseId: SHIPYARD_COURSE_ID },
      orderBy: { order: "asc" },
      select: {
        id: true,
        key: true,
        order: true,
        title: true,
        gateType: true,
        metricSignals: true,
      },
    }),
    db.shipyardProduct.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        oneLiner: true,
        liveUrl: true,
        waitlistUrl: true,
        trackerProductId: true,
      },
    }),
  ]);

  let signals: TrackerSignals | null = null;
  if (product && checkpointRows.some((c) => c.gateType !== "review")) {
    const tracker = deps.tracker ?? (await createTrackerClient());
    signals = await tracker.getCheckpointSignals(product.trackerProductId);
  }

  const [states, submissions] = await Promise.all([
    product
      ? db.shipyardCheckpointState.findMany({
          where: { productId: product.id },
          select: {
            checkpointId: true,
            state: true,
            openedAt: true,
            passedAt: true,
            manuallyOpenedBy: true,
          },
        })
      : [],
    product
      ? db.shipyardSubmission.findMany({
          where: { productId: product.id },
          orderBy: { version: "desc" },
          select: {
            id: true,
            checkpointId: true,
            status: true,
            version: true,
            submittedAt: true,
            fields: true,
            files: true,
            reviews: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                verdict: true,
                confidence: true,
                reasons: true,
                modelUsed: true,
                providerUsed: true,
                costUsd: true,
                tokensIn: true,
                tokensOut: true,
                reviewedBy: true,
                needsHuman: true,
                humanResolvedAt: true,
                overriddenBy: true,
                overrideReason: true,
                renderArtifacts: true,
                createdAt: true,
              },
            },
          },
        })
      : [],
  ]);

  type SubmissionRow = (typeof submissions)[number];
  // Resolve the escape hatch's actor to a name. "Opened by hand · user_x9f2"
  // is a fact nobody can act on; a name is a person to ask.
  const openerIds = [
    ...new Set(states.map((s) => s.manuallyOpenedBy).filter((v): v is string => Boolean(v))),
  ];
  const openerNames = new Map(
    openerIds.length === 0
      ? []
      : (
          await db.user.findMany({
            where: { id: { in: openerIds } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name] as const),
  );

  const stateBy = new Map(states.map((s) => [s.checkpointId, s]));
  const subsBy = new Map<string, SubmissionRow[]>();
  for (const s of submissions) {
    const list = subsBy.get(s.checkpointId);
    if (list) list.push(s);
    else subsBy.set(s.checkpointId, [s]);
  }

  const checkpoints: StudentCheckpointView[] = checkpointRows.map((cp) => {
    const state = stateBy.get(cp.id);
    const metricSignals = Array.isArray(cp.metricSignals)
      ? cp.metricSignals.filter((v): v is string => typeof v === "string")
      : [];
    return {
      id: cp.id,
      key: cp.key,
      order: cp.order,
      title: cp.title,
      gateType: cp.gateType,
      state: state?.state ?? (cp.order === 1 ? "open" : "locked"),
      openedAt: state?.openedAt?.toISOString() ?? null,
      passedAt: state?.passedAt?.toISOString() ?? null,
      manuallyOpenedBy: state?.manuallyOpenedBy
        ? (openerNames.get(state.manuallyOpenedBy) ?? state.manuallyOpenedBy)
        : null,
      signals: cp.gateType === "review" ? null : signalViews(metricSignals, signals),
      submissions: (subsBy.get(cp.id) ?? []).map((s) => ({
        id: s.id,
        version: s.version,
        status: s.status,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        fields: asRecord(s.fields),
        files: parseStoredFiles(s.files),
        reviews: s.reviews.map((r) => ({
          id: r.id,
          verdict: r.verdict,
          confidence: r.confidence,
          reasons: reasonViews(r.reasons),
          modelUsed: r.modelUsed,
          providerUsed: r.providerUsed,
          costUsd: r.costUsd,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          reviewedBy: r.reviewedBy,
          needsHuman: r.needsHuman,
          humanResolvedAt: r.humanResolvedAt?.toISOString() ?? null,
          overriddenBy: r.overriddenBy,
          overrideReason: r.overrideReason,
          screenshotKey: screenshotKeyOf(r.renderArtifacts),
          createdAt: r.createdAt.toISOString(),
        })),
      })),
    };
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      sectionCode: user.section?.code ?? null,
    },
    product,
    checkpoints,
    signalsRefreshedAt: signals?.fetchedAt ?? null,
    grade: null,
  };
}

// ---------------------------------------------------------------------------
// The human review queue
// ---------------------------------------------------------------------------

export type QueueEntry = {
  reviewId: string;
  submissionId: string;
  userId: string;
  studentName: string;
  sectionCode: string | null;
  productName: string;
  checkpointOrder: number;
  checkpointTitle: string;
  verdict: "pass" | "return";
  confidence: number;
  modelUsed: string;
  createdAt: string;
};

/**
 * Every review a human still has to look at: low confidence, an outlier, or a
 * disputed return. Newest first — a deadline night's backlog is read from the
 * top, and a two-day-old row is a different conversation.
 */
export async function loadReviewQueue(
  limit = 100,
  deps: InstructorDeps = {},
): Promise<QueueEntry[]> {
  const db = deps.db ?? defaultPrisma;
  const rows = await db.shipyardReview.findMany({
    where: { needsHuman: true, humanResolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      submissionId: true,
      verdict: true,
      confidence: true,
      modelUsed: true,
      createdAt: true,
      submission: {
        select: {
          checkpoint: { select: { order: true, title: true } },
          product: {
            select: {
              name: true,
              user: { select: { id: true, name: true, section: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    reviewId: r.id,
    submissionId: r.submissionId,
    userId: r.submission.product.user.id,
    studentName: r.submission.product.user.name,
    sectionCode: r.submission.product.user.section?.code ?? null,
    productName: r.submission.product.name,
    checkpointOrder: r.submission.checkpoint.order,
    checkpointTitle: r.submission.checkpoint.title,
    verdict: r.verdict,
    confidence: r.confidence,
    modelUsed: r.modelUsed,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One row per student, one column trio per checkpoint. The state and the date
 * it cleared answer "where is this person", the attempt count answers "how hard
 * was it" — and a spreadsheet is where a section head actually looks at both.
 */
export function matrixCsvRows(matrix: SectionMatrix): {
  headers: string[];
  rows: (string | number)[][];
} {
  const headers = ["Name", "Email", "Section", "Product"];
  for (const cp of matrix.checkpoints) {
    headers.push(`${cp.order}. ${cp.title} — state`);
    headers.push(`${cp.order}. ${cp.title} — passed at`);
    headers.push(`${cp.order}. ${cp.title} — attempts`);
  }

  const rows = matrix.rows.map((row) => {
    const out: (string | number)[] = [
      row.name,
      row.email,
      matrix.section.code,
      row.productName,
    ];
    for (const cp of matrix.checkpoints) {
      const cell = row.cells.find((c) => c.checkpointId === cp.id);
      const state = cell
        ? cell.state === "open" && cell.inReview
          ? "in review"
          : cell.state === "open" && cell.returned
            ? "returned"
            : cell.state
        : "";
      out.push(state, cell?.passedAt ?? "", cell?.attempts ?? 0);
    }
    return out;
  });

  return { headers, rows };
}
