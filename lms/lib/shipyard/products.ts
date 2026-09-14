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
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
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
  /**
   * False when the tracker could not tell us whose project this is. The
   * connection is allowed — an older tracker must not lock the whole cohort
   * out of checkpoint 4 — and the fact is recorded on the audit row instead.
   */
  ownerVerified: boolean;
};

const TAKEN =
  "That Shipped.money project is already connected to another student";
const NOT_YOURS = "That project belongs to a different Shipped.money account";

/** Lower-cased, trimmed. The tracker normalises the same way. */
function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Every address that is this student: the canonical one and their aliases. */
export async function studentEmails(
  db: PrismaClient,
  userId: string,
): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailAliases: { select: { email: true }, take: 10 } },
  });
  if (!user) return [];
  const all = [user.email, ...user.emailAliases.map((a) => a.email)]
    .map(normaliseEmail)
    .filter((e) => e !== "");
  return [...new Set(all)];
}

/** How many owner-filtered probes one connect attempt is worth. */
const OWNER_PROBE_CAP = 4;

/**
 * Point a product at its Shipped.money project and recompute immediately, so a
 * student whose numbers already qualify sees the gate move on this request
 * rather than at the next sweep.
 *
 * Two refusals stand between a student and someone else's numbers:
 *
 *   409  the slug is already connected to another product in this course. The
 *        `@@unique([courseId, trackerProductId])` index is the real arbiter —
 *        the read below is only there to give a better sentence than a
 *        constraint violation would.
 *   403  the tracker says the project is not theirs. We ASK with the owner
 *        filter first (one request per address they own, capped); if nothing
 *        matches we read once more WITHOUT the filter to find out whether the
 *        project exists at all. A project that exists but refused every one of
 *        their addresses is somebody else's. A tracker that cannot answer
 *        either way is not a reason to refuse — the connection goes through
 *        with `ownerVerified: false` on the audit row.
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
    select: { id: true, userId: true },
  });
  if (!product) throw new ShipyardError(404, { error: "No product to connect." });

  const taken = await db.shipyardProduct.findFirst({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      trackerProductId,
      id: { not: productId },
    },
    select: { id: true },
  });
  if (taken) throw new ShipyardError(409, { error: TAKEN });

  const emails = await studentEmails(db, product.userId);
  const tracker = deps.tracker ?? (await createTrackerClient());

  let matched: TrackerSignals | null = null;
  for (const email of emails.slice(0, OWNER_PROBE_CAP)) {
    matched = await tracker.getCheckpointSignals(trackerProductId, { ownerEmail: email });
    if (matched) break;
  }

  let ownerVerified = matched !== null;
  if (!matched) {
    // Nothing matched. Does the project exist at all?
    const unfiltered = await tracker.getCheckpointSignals(trackerProductId);
    if (unfiltered) {
      // The secondary check, for a tracker that sends the field but ignores
      // the filter: if it names an owner and that owner is them, allow it.
      const named = normaliseEmail(unfiltered.ownerEmail);
      if (named && emails.includes(named)) ownerVerified = true;
      else throw new ShipyardError(403, { error: NOT_YOURS });
    }
    // else: the tracker cannot answer. Connect, and say so on the audit row.
  }

  try {
    await db.shipyardProduct.update({
      where: { id: productId },
      data: { trackerProductId },
    });
  } catch (err) {
    // The index is the arbiter; two students racing the same slug land here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ShipyardError(409, { error: TAKEN });
    }
    throw err;
  }

  await db.auditLog.create({
    data: {
      actorId: product.userId,
      action: "shipyard.tracker.connect",
      targetType: "ShipyardProduct",
      targetId: productId,
      after: {
        trackerProductId,
        ownerVerified,
        // An older tracker with no owner field: the connection is on record as
        // unverified so a dispute months later does not have to be guessed at.
        ownerEmailSeen: normaliseEmail(matched?.ownerEmail) || null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const states = await recomputeGates(productId, { db, tracker, now: deps.now });
  return { trackerProductId, states, ownerVerified };
}
