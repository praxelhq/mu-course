// The checkpoint editor's data layer.
//
// SPEC §3: "New checkpoints or changed bars are a row edit, not a code change."
// This module is where that promise is kept honest — every edit is validated
// against the same contracts the runtime reads (`lib/shipyard/fields.ts` for
// the form, `lib/shipyard/gates.ts` for the signal names), audit-logged
// before-and-after, and followed by a gate recompute when the edit could have
// moved somebody's gate.
//
// The dangerous edits are `gateType` and `metricSignals`: turning a `review`
// checkpoint into a `both`, or adding a required signal, changes the answer
// `resolveGates` gives for all 480 students at once. So those edits sweep every
// product afterwards rather than waiting fifteen minutes for the cron.

import { Prisma, type PrismaClient, type ShipyardCheckpointKey } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { isMetricSignalName, METRIC_SIGNAL_NAMES } from "@/lib/tracker/types";
import type { TrackerClient } from "@/lib/tracker/client";
import {
  CHECKPOINT_DEFINITIONS,
  checkpointDefinition,
  type CheckpointRubric,
} from "./checkpoints";
import { CHECKPOINT_ORDER, SHIPYARD_COURSE_ID } from "./constants";
import { ShipyardError } from "./errors";
import { parseFieldSpecs, type FieldSpec } from "./fields";
import { recomputeGates } from "./gate-state";

type Db = PrismaClient;

export const GATE_TYPES = ["review", "metric", "both"] as const;
export type GateType = (typeof GATE_TYPES)[number];

/** One sweep after an edit touches at most this many products in-request. */
export const CHECKPOINT_SWEEP_CAP = 500;
export const CHECKPOINT_SWEEP_BATCH = 25;

// ---------------------------------------------------------------------------
// Validators — pure, and the same ones the seed's definitions satisfy
// ---------------------------------------------------------------------------

function bad(error: string, extra: Record<string, unknown> = {}): never {
  throw new ShipyardError(400, { error, ...extra });
}

/**
 * A rubric is a list of criteria the reviewer scores against, each tied to a
 * clause of the published bar. Ids must be unique because they are the keys of
 * `ShipyardReview.rubricScores` — a duplicate id silently loses a score, and a
 * renamed id silently loses every score already stored under the old one.
 */
export function validateRubric(value: unknown): CheckpointRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    bad("A rubric is an object with a `criteria` list.");
  }
  const raw = value as Record<string, unknown>;
  const criteria = raw.criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    bad("A rubric needs at least one criterion.");
  }

  const seen = new Set<string>();
  const parsed = criteria.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      bad(`Criterion ${index + 1} is not an object.`);
    }
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) bad(`Criterion ${index + 1} needs an id.`);
    if (seen.has(id)) bad(`Two criteria share the id "${id}". Ids must be unique.`);
    seen.add(id);

    const clause = typeof row.clause === "string" ? row.clause.trim() : "";
    if (!clause) bad(`Criterion "${id}" needs the bar clause it judges.`);

    const weight = typeof row.weight === "number" ? row.weight : Number.NaN;
    if (!Number.isFinite(weight) || weight < 0) {
      bad(`Criterion "${id}" needs a weight of zero or more.`);
    }
    const passThreshold =
      typeof row.passThreshold === "string" ? row.passThreshold.trim() : "";

    return { id, clause, weight, passThreshold };
  });

  const total = parsed.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) bad("The criteria weights are all zero; nothing would be scored.");

  return { criteria: parsed, passRule: "all-criteria-met" };
}

/** The form spec, parsed by the one interpreter that reads it at runtime. */
export function validateFieldSchema(value: unknown): FieldSpec[] {
  const parsed = parseFieldSpecs(value);
  if (!parsed) {
    bad("The field schema does not match the submit-form contract.");
  }
  if (parsed.length === 0) {
    bad("A checkpoint needs at least one field for a student to fill in.");
  }
  const seen = new Set<string>();
  for (const field of parsed) {
    if (seen.has(field.key)) bad(`Two fields share the key "${field.key}".`);
    seen.add(field.key);
  }
  return parsed;
}

/** Only the signals the tracker actually reports. A typo never clears a gate. */
export function validateMetricSignals(value: unknown): string[] {
  if (!Array.isArray(value)) bad("Metric signals are a list of signal names.");
  const names = (value as unknown[]).map((v) => (typeof v === "string" ? v.trim() : ""));
  const unknown = names.filter((n) => !isMetricSignalName(n));
  if (unknown.length > 0) {
    bad(`Unknown tracker signal: ${unknown.join(", ")}.`, {
      known: [...METRIC_SIGNAL_NAMES],
    });
  }
  return [...new Set(names)];
}

export function validateGateType(value: unknown): GateType {
  if (typeof value !== "string" || !(GATE_TYPES as readonly string[]).includes(value)) {
    bad(`A gate is one of ${GATE_TYPES.join(", ")}.`);
  }
  return value as GateType;
}

/**
 * A metric or `both` gate with no signals would be cleared by nothing at all,
 * and a pure `review` gate with signals would read them and ignore them. Both
 * are configuration that lies about itself, so both are refused.
 */
export function assertGateConsistency(gateType: GateType, metricSignals: string[]): void {
  if (gateType === "review" && metricSignals.length > 0) {
    bad("A review gate reads no tracker signals. Clear them, or make it `both`.");
  }
  if (gateType !== "review" && metricSignals.length === 0) {
    bad(`A ${gateType} gate needs at least one tracker signal to clear it.`);
  }
}

// ---------------------------------------------------------------------------
// The patch
// ---------------------------------------------------------------------------

export type CheckpointPatch = {
  title?: unknown;
  barMarkdown?: unknown;
  rubric?: unknown;
  gateType?: unknown;
  acceptsImages?: unknown;
  fieldSchema?: unknown;
  metricSignals?: unknown;
  deadlineAt?: unknown;
  resubmitWindowHours?: unknown;
  resubmitCooldownMinutes?: unknown;
};

export type NormalisedPatch = {
  title?: string;
  barMarkdown?: string;
  rubric?: CheckpointRubric;
  gateType?: GateType;
  acceptsImages?: boolean;
  fieldSchema?: FieldSpec[];
  metricSignals?: string[];
  deadlineAt?: Date | null;
  resubmitWindowHours?: number;
  resubmitCooldownMinutes?: number;
};

export const PATCHABLE_KEYS = [
  "title",
  "barMarkdown",
  "rubric",
  "gateType",
  "acceptsImages",
  "fieldSchema",
  "metricSignals",
  "deadlineAt",
  "resubmitWindowHours",
  "resubmitCooldownMinutes",
] as const;

function positiveInt(value: unknown, label: string, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || Math.floor(n) !== n) {
    bad(`${label} is a whole number between 0 and ${max}.`);
  }
  return n;
}

/**
 * Validate a patch against the row it will be applied to, so gate consistency
 * is checked on the RESULT — changing `gateType` alone, with the signals
 * already on the row, has to be legal.
 */
export function validateCheckpointPatch(
  patch: CheckpointPatch,
  current: { gateType: GateType; metricSignals: string[] },
): NormalisedPatch {
  const unknownKeys = Object.keys(patch).filter(
    (k) => !(PATCHABLE_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0) {
    bad(`Not editable here: ${unknownKeys.join(", ")}.`, {
      editable: [...PATCHABLE_KEYS],
    });
  }

  const out: NormalisedPatch = {};

  if (patch.title !== undefined) {
    const title = typeof patch.title === "string" ? patch.title.trim() : "";
    if (!title || title.length > 160) bad("A title is 1 to 160 characters.");
    out.title = title;
  }
  if (patch.barMarkdown !== undefined) {
    const bar = typeof patch.barMarkdown === "string" ? patch.barMarkdown.trim() : "";
    if (bar.length < 40) {
      bad("The bar is what a student reads before submitting. Write it out in full.");
    }
    out.barMarkdown = bar;
  }
  if (patch.rubric !== undefined) out.rubric = validateRubric(patch.rubric);
  if (patch.gateType !== undefined) out.gateType = validateGateType(patch.gateType);
  if (patch.acceptsImages !== undefined) {
    if (typeof patch.acceptsImages !== "boolean") bad("acceptsImages is true or false.");
    out.acceptsImages = patch.acceptsImages;
  }
  if (patch.fieldSchema !== undefined) out.fieldSchema = validateFieldSchema(patch.fieldSchema);
  if (patch.metricSignals !== undefined) {
    out.metricSignals = validateMetricSignals(patch.metricSignals);
  }
  if (patch.deadlineAt !== undefined) {
    if (patch.deadlineAt === null) {
      out.deadlineAt = null;
    } else {
      const date = new Date(String(patch.deadlineAt));
      if (Number.isNaN(date.getTime())) bad("A deadline is an ISO date, or null.");
      out.deadlineAt = date;
    }
  }
  if (patch.resubmitWindowHours !== undefined) {
    out.resubmitWindowHours = positiveInt(patch.resubmitWindowHours, "The resubmit window", 8_760);
  }
  if (patch.resubmitCooldownMinutes !== undefined) {
    out.resubmitCooldownMinutes = positiveInt(
      patch.resubmitCooldownMinutes,
      "The cooldown",
      10_080,
    );
  }

  assertGateConsistency(
    out.gateType ?? current.gateType,
    out.metricSignals ?? current.metricSignals,
  );
  return out;
}

/** An edit that could move a gate for somebody: the sweep is not optional. */
export function patchMovesGates(patch: NormalisedPatch, current: {
  gateType: GateType;
  metricSignals: string[];
}): boolean {
  if (patch.gateType !== undefined && patch.gateType !== current.gateType) return true;
  if (patch.metricSignals === undefined) return false;
  const before = [...current.metricSignals].sort().join(",");
  const after = [...patch.metricSignals].sort().join(",");
  return before !== after;
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

export type CheckpointAdminRow = {
  id: string;
  key: ShipyardCheckpointKey;
  order: number;
  title: string;
  barMarkdown: string;
  rubric: unknown;
  gateType: GateType;
  acceptsImages: boolean;
  fieldSchema: unknown;
  metricSignals: string[];
  deadlineAt: Date | null;
  resubmitWindowHours: number;
  resubmitCooldownMinutes: number;
  updatedAt: Date;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const checkpointSelect = {
  id: true,
  key: true,
  order: true,
  title: true,
  barMarkdown: true,
  rubric: true,
  gateType: true,
  acceptsImages: true,
  fieldSchema: true,
  metricSignals: true,
  deadlineAt: true,
  resubmitWindowHours: true,
  resubmitCooldownMinutes: true,
  updatedAt: true,
} as const;

function toAdminRow(row: {
  [K in keyof typeof checkpointSelect]: unknown;
}): CheckpointAdminRow {
  return {
    ...(row as unknown as CheckpointAdminRow),
    metricSignals: asStringArray(row.metricSignals),
  };
}

/** All six, in course order, with everything the editor renders. */
export async function listCheckpoints(db: Db = defaultPrisma): Promise<CheckpointAdminRow[]> {
  const rows = await db.shipyardCheckpoint.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    orderBy: { order: "asc" },
    select: checkpointSelect,
  });
  return rows.map(toAdminRow);
}

export function isCheckpointKey(value: string): value is ShipyardCheckpointKey {
  return (CHECKPOINT_ORDER as readonly string[]).includes(value);
}

export type CheckpointEditResult = {
  checkpoint: CheckpointAdminRow;
  /** Null when the edit could not have moved anyone's gate. */
  sweep: { products: number; failed: number } | null;
};

export type CheckpointAdminDeps = {
  db?: Db;
  tracker?: TrackerClient;
  now?: Date;
  /** Test seam: skip the (slow) cohort-wide gate sweep. */
  sweep?: boolean;
};

async function loadForEdit(db: Db, key: ShipyardCheckpointKey): Promise<CheckpointAdminRow> {
  const row = await db.shipyardCheckpoint.findUnique({
    where: { courseId_key: { courseId: SHIPYARD_COURSE_ID, key } },
    select: checkpointSelect,
  });
  if (!row) throw new ShipyardError(404, { error: `No checkpoint "${key}".` });
  return toAdminRow(row);
}

function auditSnapshot(row: CheckpointAdminRow): Record<string, unknown> {
  return {
    title: row.title,
    barMarkdown: row.barMarkdown,
    rubric: row.rubric,
    gateType: row.gateType,
    acceptsImages: row.acceptsImages,
    fieldSchema: row.fieldSchema,
    metricSignals: row.metricSignals,
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
    resubmitWindowHours: row.resubmitWindowHours,
    resubmitCooldownMinutes: row.resubmitCooldownMinutes,
  };
}

function patchToData(patch: NormalisedPatch): Prisma.ShipyardCheckpointUpdateInput {
  const data: Prisma.ShipyardCheckpointUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.barMarkdown !== undefined) data.barMarkdown = patch.barMarkdown;
  if (patch.rubric !== undefined) {
    data.rubric = patch.rubric as unknown as Prisma.InputJsonValue;
  }
  if (patch.gateType !== undefined) data.gateType = patch.gateType;
  if (patch.acceptsImages !== undefined) data.acceptsImages = patch.acceptsImages;
  if (patch.fieldSchema !== undefined) {
    data.fieldSchema = patch.fieldSchema as unknown as Prisma.InputJsonValue;
  }
  if (patch.metricSignals !== undefined) {
    data.metricSignals = patch.metricSignals as unknown as Prisma.InputJsonValue;
  }
  if (patch.deadlineAt !== undefined) data.deadlineAt = patch.deadlineAt;
  if (patch.resubmitWindowHours !== undefined) {
    data.resubmitWindowHours = patch.resubmitWindowHours;
  }
  if (patch.resubmitCooldownMinutes !== undefined) {
    data.resubmitCooldownMinutes = patch.resubmitCooldownMinutes;
  }
  return data;
}

/** Edit one checkpoint. Validated, audit-logged, and swept if gates can move. */
export async function editCheckpoint(
  key: ShipyardCheckpointKey,
  patch: CheckpointPatch,
  actorId: string,
  deps: CheckpointAdminDeps = {},
): Promise<CheckpointEditResult> {
  const db = deps.db ?? defaultPrisma;
  const before = await loadForEdit(db, key);
  const normalised = validateCheckpointPatch(patch, {
    gateType: before.gateType,
    metricSignals: before.metricSignals,
  });
  if (Object.keys(normalised).length === 0) {
    throw new ShipyardError(400, { error: "Nothing to change." });
  }

  const updated = toAdminRow(
    await db.shipyardCheckpoint.update({
      where: { id: before.id },
      data: patchToData(normalised),
      select: checkpointSelect,
    }),
  );

  await db.auditLog.create({
    data: {
      actorId,
      action: "shipyard.checkpoint.edit",
      targetType: "ShipyardCheckpoint",
      targetId: before.id,
      before: auditSnapshot(before) as unknown as Prisma.InputJsonValue,
      after: {
        ...auditSnapshot(updated),
        changed: Object.keys(normalised),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const moves = patchMovesGates(normalised, {
    gateType: before.gateType,
    metricSignals: before.metricSignals,
  });
  const sweep = moves && deps.sweep !== false ? await recomputeGatesForAllProducts(deps) : null;

  return { checkpoint: updated, sweep };
}

/**
 * Put a checkpoint back to the definition in `lib/shipyard/checkpoints.ts`.
 * The escape hatch for an edit that went wrong: the code is the known-good
 * copy of every bar, and nobody should have to retype one from a git diff.
 */
export async function resetCheckpointToSeed(
  key: ShipyardCheckpointKey,
  actorId: string,
  deps: CheckpointAdminDeps = {},
): Promise<CheckpointEditResult> {
  const db = deps.db ?? defaultPrisma;
  const before = await loadForEdit(db, key);
  const definition = checkpointDefinition(key);

  const updated = toAdminRow(
    await db.shipyardCheckpoint.update({
      where: { id: before.id },
      data: {
        title: definition.title,
        barMarkdown: definition.barMarkdown,
        rubric: definition.rubric as unknown as Prisma.InputJsonValue,
        gateType: definition.gateType,
        acceptsImages: definition.acceptsImages,
        fieldSchema: definition.fieldSchema as unknown as Prisma.InputJsonValue,
        metricSignals: definition.metricSignals as unknown as Prisma.InputJsonValue,
        resubmitWindowHours: definition.resubmitWindowHours,
        resubmitCooldownMinutes: definition.resubmitCooldownMinutes,
      },
      select: checkpointSelect,
    }),
  );

  await db.auditLog.create({
    data: {
      actorId,
      action: "shipyard.checkpoint.reset-to-seed",
      targetType: "ShipyardCheckpoint",
      targetId: before.id,
      before: auditSnapshot(before) as unknown as Prisma.InputJsonValue,
      after: auditSnapshot(updated) as unknown as Prisma.InputJsonValue,
    },
  });

  const moves = patchMovesGates(
    { gateType: updated.gateType, metricSignals: updated.metricSignals },
    { gateType: before.gateType, metricSignals: before.metricSignals },
  );
  const sweep = moves && deps.sweep !== false ? await recomputeGatesForAllProducts(deps) : null;

  return { checkpoint: updated, sweep };
}

/** The seeded definitions, so the editor can show what "reset" would write. */
export function seedDefinitions() {
  return CHECKPOINT_DEFINITIONS.map((d) => ({
    key: d.key,
    order: d.order,
    title: d.title,
    gateType: d.gateType,
    metricSignals: d.metricSignals,
  }));
}

/**
 * Re-decide every product's gates after a definition changed.
 *
 * Batched and capped. This is the expensive half of a checkpoint edit — a
 * cohort of 480 is 480 recomputes — so it runs after the write has committed
 * and its failures are counted rather than raised: the fifteen-minute sweep
 * (`worker/shipyard-jobs/gate-sweep.ts`) is the backstop.
 */
export async function recomputeGatesForAllProducts(
  deps: CheckpointAdminDeps & { limit?: number } = {},
): Promise<{ products: number; failed: number }> {
  const db = deps.db ?? defaultPrisma;
  const limit = deps.limit ?? CHECKPOINT_SWEEP_CAP;

  const products = await db.shipyardProduct.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true },
  });

  let failed = 0;
  for (let i = 0; i < products.length; i += CHECKPOINT_SWEEP_BATCH) {
    const batch = products.slice(i, i + CHECKPOINT_SWEEP_BATCH);
    for (const product of batch) {
      try {
        await recomputeGates(product.id, {
          db,
          tracker: deps.tracker,
          now: deps.now,
        });
      } catch (err) {
        failed += 1;
        console.error(
          `[shipyard-checkpoint] gate recompute failed for ${product.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return { products: products.length, failed };
}
