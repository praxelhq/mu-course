// Refreshing one product's real numbers, on purpose rather than on a timer.
//
// Three things call this:
//   • `POST /api/shipyard/tracker/refresh`      — Shipped.money, when a
//     project's numbers change (no Clerk session; a signed service call).
//   • `POST /api/shipyard/tracker/refresh-mine` — the student, from the
//     "Refresh" affordance on the signal strip.
//   • `refreshAllConnected`                     — a sweep for the worker.
//
// It is the one place the n8n fallback is folded in (SPEC §8.5 item 2): the
// tracker client stays thin and speaks only to Shipped.money, and the decision
// "does this portal count the runs itself?" is made here, once.
//
// A tracker that cannot answer changes NOTHING. `recomputeGates` re-decides
// every gate from the signals it is handed, so passing it a null would read as
// "every metric signal is false" and flip a cleared money gate back to open on
// a five-second network blip. So a null read returns the stored states
// untouched (docs/DECISIONS.md, 2026-09-15).

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  countSuccessfulExecutions,
  n8nConfigured,
  workflowTags,
  type WorkflowTagRead,
} from "@/lib/n8n/client";
import { mergeWorkflowRunsDetailed } from "@/lib/n8n/merge";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { SHIPYARD_COURSE_ID } from "./constants";
import { recomputeGates, type CheckpointStateRow } from "./gate-state";
import { ShipyardError } from "./errors";
import { onGatesRecomputed } from "./grades";

// ---------------------------------------------------------------------------
// The service-to-service callback's signature
// ---------------------------------------------------------------------------

/** Seconds either side of now that a callback's timestamp may sit. */
export const CALLBACK_WINDOW_SECONDS = 300;

/** The same scheme `lib/tracker/real.ts` signs its own requests with. */
export function signRefreshCallback(token: string, timestamp: string, slug: string): string {
  return createHmac("sha256", token).update(`${timestamp}:${slug}`).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // Compare fixed-width digests so the comparison itself leaks no length.
  const leftHash = createHmac("sha256", "shipyard-compare").update(left).digest();
  const rightHash = createHmac("sha256", "shipyard-compare").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export type CallbackAuth = {
  authorization: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * Bearer token AND signature AND a fresh timestamp. The token alone is not
 * enough: a leaked bearer replayed from somewhere else still fails the HMAC,
 * and a captured request stops working after five minutes.
 *
 * Pure, and deliberately returns one boolean: every failure is the same 401,
 * because telling a caller WHICH half of its credentials was wrong is telling
 * an attacker which half to keep.
 */
export function verifyRefreshCallback(
  auth: CallbackAuth,
  slug: string,
  token: string,
  now: Date = new Date(),
): boolean {
  if (!token) return false;
  const bearer = auth.authorization?.trim() ?? "";
  if (!bearer.toLowerCase().startsWith("bearer ")) return false;
  if (!constantTimeEquals(bearer.slice(7).trim(), token)) return false;

  const timestamp = auth.timestamp?.trim() ?? "";
  if (!/^\d{1,15}$/.test(timestamp)) return false;
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (skew > CALLBACK_WINDOW_SECONDS) return false;

  const signature = auth.signature?.trim().toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  return constantTimeEquals(signature, signRefreshCallback(token, timestamp, slug));
}

export function serviceToken(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.SHIPPED_MONEY_SERVICE_TOKEN?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// The refresh itself
// ---------------------------------------------------------------------------

export type RefreshDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
  env?: Readonly<Record<string, string | undefined>>;
  /** Test seam for the n8n adapter; defaults to the real executions read. */
  countRuns?: (workflowId: string) => Promise<number | null>;
  /** Test seam for the workflow's tag read; defaults to `GET /workflows/<id>`. */
  readTags?: (workflowId: string) => Promise<WorkflowTagRead>;
  /** Test seam: skip the grade recompute hook. */
  recomputeGrade?: boolean;
};

export type RefreshResult = {
  productId: string;
  /** Null when the tracker could not answer; nothing was changed. */
  signals: TrackerSignals | null;
  states: CheckpointStateRow[];
  /** True when this portal's own n8n count filled in `workflowRuns`. */
  workflowRunsFromN8n: boolean;
  /** Set when the tracker named an owner who is not this student. */
  ownerMismatch?: boolean;
  /** Anything worth showing a human: an ignored n8n workflow, a disconnect. */
  notes?: string[];
};

/** The tag a student puts on their n8n workflow so this portal will count it. */
export function shipyardWorkflowTag(productId: string): string {
  return `shipyard:${productId}`;
}

export type WorkflowRunDecision = { count: true } | { count: false; note: string };

/**
 * May this portal count this workflow's runs towards this product?
 *
 * The workflow id on checkpoint 5 is a string a student types, and n8n's
 * executions API answers for any id on the shared instance — so the id alone
 * counted a classmate's runs, or a course-wide demo workflow's (SEC-2). n8n
 * exposes no owner we can read, so the student proves it the only way the API
 * allows: by tagging the workflow `shipyard:<their product id>`, which only
 * someone who can edit that workflow can do.
 *
 * Fails CLOSED when the tags cannot be read. The tag IS the evidence; without
 * it there is none. The cost is one refresh that does not move the count, and
 * the count is read fresh on the next one, so nothing is lost.
 */
export function decideWorkflowRuns(
  workflowId: string,
  productId: string,
  tags: WorkflowTagRead,
): WorkflowRunDecision {
  const wanted = shipyardWorkflowTag(productId);
  if (!tags.known) {
    return {
      count: false,
      note: `n8n could not confirm the tags on workflow ${workflowId}, so its runs were not counted this time.`,
    };
  }
  if (!tags.tags.includes(wanted)) {
    return {
      count: false,
      note: `n8n workflow ${workflowId} is not tagged ${wanted}, so its runs were not counted. Add that tag in n8n and refresh.`,
    };
  }
  return { count: true };
}

/**
 * The workflow id a student typed on checkpoint 5.
 *
 * `n8nWorkflowId` is an optional field on the workflow checkpoint's schema.
 * Checkpoint 5 is metric-only — nothing a student types there is ever reviewed
 * or ever clears the gate — so this is a LOOKUP KEY, not evidence: it says
 * which workflow to count, and the count still comes from n8n.
 */
export async function workflowIdForProduct(
  productId: string,
  db: PrismaClient = defaultPrisma,
): Promise<string | null> {
  const submission = await db.shipyardSubmission.findFirst({
    where: { productId, checkpoint: { key: "workflow" } },
    orderBy: { version: "desc" },
    select: { fields: true },
  });
  const fields = submission?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const value = (fields as Record<string, unknown>).n8nWorkflowId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Every stored state row, untouched, with the reason set to
 * `tracker-unreachable`. A null read is "no new information", not "not met" —
 * `lib/shipyard/gates` says the same thing from the other side.
 */
async function storedStates(
  db: PrismaClient,
  productId: string,
): Promise<CheckpointStateRow[]> {
  const states = await db.shipyardCheckpointState.findMany({
    where: { productId },
    orderBy: { checkpoint: { order: "asc" } },
    select: {
      checkpointId: true,
      state: true,
      openedAt: true,
      passedAt: true,
      reviewClearedAt: true,
      metricClearedAt: true,
      manuallyOpenedBy: true,
      checkpoint: { select: { key: true, order: true } },
    },
  });
  return states.map((s) => ({
    checkpointId: s.checkpointId,
    key: s.checkpoint.key,
    order: s.checkpoint.order,
    state: s.state,
    reason: "tracker-unreachable",
    openedAt: s.openedAt,
    passedAt: s.passedAt,
    reviewClearedAt: s.reviewClearedAt,
    metricClearedAt: s.metricClearedAt,
    manuallyOpenedBy: s.manuallyOpenedBy,
  }));
}

/** Read the tracker (plus n8n when it has to), then re-decide every gate. */
export async function refreshTrackerForProduct(
  productId: string,
  deps: RefreshDeps = {},
): Promise<RefreshResult> {
  const db = deps.db ?? defaultPrisma;
  const env = deps.env ?? process.env;

  const product = await db.shipyardProduct.findUnique({
    where: { id: productId },
    select: {
      id: true,
      trackerProductId: true,
      userId: true,
      user: { select: { email: true, emailAliases: { select: { email: true }, take: 10 } } },
    },
  });
  if (!product) throw new ShipyardError(404, { error: `No product ${productId}.` });

  const tracker = deps.tracker ?? (await createTrackerClient(env));
  // Read WITHOUT the owner filter on purpose. A filtered read answers null for
  // "not yours", "no such project" and "the tracker is down" alike, and acting
  // on the third by disconnecting a student would hand a five-second outage the
  // power to undo their connection. So the owner is checked against the field
  // in the response, which is unambiguous when it is there and absent when the
  // tracker is old — and absent is not an accusation.
  const read = await tracker.getCheckpointSignals(product.trackerProductId);

  if (!read) {
    // Unreachable, unconnected, or malformed. Leave every gate exactly where
    // it is and say so; the caller renders "we could not reach the tracker".
    return {
      productId,
      signals: null,
      workflowRunsFromN8n: false,
      states: await storedStates(db, productId),
    };
  }

  // --- Whose project is this? ----------------------------------------------
  const owned = [product.user.email, ...product.user.emailAliases.map((a) => a.email)]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
  const namedOwner = (read.ownerEmail ?? "").trim().toLowerCase();
  if (namedOwner && !owned.includes(namedOwner)) {
    // The tracker says this project belongs to someone else. Disconnect it
    // rather than keep reading another student's verified numbers, leave every
    // gate exactly where it is, and put the fact on the audit trail — a
    // connection that is taken away has to be reconstructable.
    await db.shipyardProduct.update({
      where: { id: productId },
      data: { trackerProductId: null },
    });
    await db.auditLog.create({
      data: {
        actorId: product.userId,
        action: "shipyard.tracker.owner-mismatch",
        targetType: "ShipyardProduct",
        targetId: productId,
        before: { trackerProductId: product.trackerProductId } as unknown as Prisma.InputJsonValue,
        after: {
          trackerProductId: null,
          ownerEmailSeen: namedOwner,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      productId,
      signals: null,
      states: await storedStates(db, productId),
      workflowRunsFromN8n: false,
      ownerMismatch: true,
      notes: [
        "That Shipped.money project belongs to a different account, so it has been disconnected.",
      ],
    };
  }

  let signals = read;
  let workflowRunsFromN8n = false;
  const notes: string[] = [];
  const trackerKnowsRuns =
    typeof read.workflowRuns === "number" && Number.isFinite(read.workflowRuns);

  if (!trackerKnowsRuns && (deps.countRuns || n8nConfigured(env))) {
    const workflowId = await workflowIdForProduct(productId, db);
    if (workflowId) {
      const tags = deps.readTags
        ? await deps.readTags(workflowId)
        : await workflowTags(workflowId, { env });
      const decision = decideWorkflowRuns(workflowId, productId, tags);
      if (!decision.count) {
        notes.push(decision.note);
      } else {
        const runs = deps.countRuns
          ? await deps.countRuns(workflowId)
          : await countSuccessfulExecutions(workflowId, { env });
        const merged = mergeWorkflowRunsDetailed(read, runs);
        signals = merged.signals;
        workflowRunsFromN8n = merged.merged;
      }
    }
  }

  const states = await recomputeGates(productId, { db, signals, now: deps.now });
  if (deps.recomputeGrade !== false) {
    await onGatesRecomputed(productId, { db, signals, now: deps.now });
  }

  return { productId, signals, states, workflowRunsFromN8n, notes };
}

/** Find a connected product by its Shipped.money slug. */
export async function productIdForSlug(
  slug: string,
  db: PrismaClient = defaultPrisma,
): Promise<string | null> {
  const product = await db.shipyardProduct.findFirst({
    where: { courseId: SHIPYARD_COURSE_ID, trackerProductId: slug },
    select: { id: true },
  });
  return product?.id ?? null;
}

export const REFRESH_ALL_LIMIT = 200;

export type RefreshAllResult = { refreshed: number; unreachable: number; failed: number };

/**
 * Refresh every connected product, least-recently-refreshed first.
 *
 * There is no `lastRefreshedAt` column and this milestone adds none: the
 * ordering proxy is `ShipyardCheckpointState.updatedAt`, which `recomputeGates`
 * touches on every single refresh, so the product whose oldest state row is
 * oldest is exactly the product refreshed longest ago. It costs an index scan
 * on a column that already exists, and it is self-correcting — a product that
 * fails stays at the front of the queue instead of being skipped for an hour.
 */
export async function refreshAllConnected(
  deps: RefreshDeps = {},
  options: { limit?: number } = {},
): Promise<RefreshAllResult> {
  const db = deps.db ?? defaultPrisma;
  const limit = options.limit ?? REFRESH_ALL_LIMIT;
  const tracker = deps.tracker ?? (await createTrackerClient(deps.env ?? process.env));

  const rows = await db.shipyardCheckpointState.findMany({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      product: { trackerProductId: { not: null } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit * 6,
    select: { productId: true },
  });

  const productIds: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.productId)) continue;
    seen.add(row.productId);
    productIds.push(row.productId);
    if (productIds.length >= limit) break;
  }

  const result: RefreshAllResult = { refreshed: 0, unreachable: 0, failed: 0 };
  for (const productId of productIds) {
    try {
      const refreshed = await refreshTrackerForProduct(productId, { ...deps, tracker });
      if (refreshed.signals) result.refreshed += 1;
      else result.unreachable += 1;
    } catch (err) {
      result.failed += 1;
      console.error(
        `[shipyard-refresh] ${productId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}
