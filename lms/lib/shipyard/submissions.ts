// Creating one submission: every refusal a student can meet, in one place.
//
// The order of the guards is the order a student experiences them, and each one
// answers a different question:
//   404  you have no product / no such checkpoint
//   409  that checkpoint is not open, is already cleared, or is already in review
//   400  your answers do not meet the field schema, or a link is dead
//   429  you are inside the resubmit cooldown (and here is when it lifts)
// Only after all of those does anything get written.
//
// Link liveness runs HERE, at submit time, and not only in the worker: a dead
// waitlist URL is the single most common reason a checkpoint 1 attempt comes
// back, and a student who learns that ninety seconds later has burnt an attempt
// and a cooldown on a typo. The worker still re-checks — the page could have
// gone down in between — but the cheap check happens while the form is open.

import { Prisma, type PrismaClient, type ShipyardCheckpointKey } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { probeUrl, SafeFetchBlockedError, type SafeFetchOptions } from "@/lib/net/safe-fetch";
import { headObject, s3Configured } from "@/lib/s3";
import { SHIPYARD_COURSE_ID } from "./constants";
import { cooldownRemaining, nextAllowedResubmitAt } from "./cooldown";
import { ShipyardError } from "./errors";
import {
  parseFieldSpecs,
  validateSubmissionFields,
  type FieldSpec,
  type SubmissionFields,
} from "./fields";
import { enqueueShipyardReview } from "./queue";
import { keyPrefixForProduct } from "./uploads";

/** Typed submit failure. `body` is the JSON the route returns verbatim. */
export class SubmissionError extends ShipyardError {
  constructor(status: number, body: { error: string } & Record<string, unknown>) {
    super(status, body);
    this.name = "SubmissionError";
  }
}

export type SubmissionFileInput = {
  key: string;
  name: string;
  contentType: string;
  bytes: number;
};

export type CreateSubmissionInput = {
  userId: string;
  checkpointKey: ShipyardCheckpointKey;
  fields: unknown;
  files?: unknown;
  now?: Date;
};

export type CreateSubmissionDeps = {
  db?: PrismaClient;
  /** Test seam: replaces the safe-fetch liveness probe. */
  probe?: (url: string) => Promise<{ ok: boolean; status: number }>;
  /** Test seam: replaces the S3 existence check. */
  headObject?: (key: string) => Promise<unknown>;
  /** Test seam: replaces `s3Configured()`. */
  storageConfigured?: () => boolean;
  /** Test seam: replaces the best-effort enqueue. */
  enqueue?: (submissionId: string) => Promise<unknown>;
};

export type CreateSubmissionResult = {
  submissionId: string;
  status: "submitted";
  version: number;
  nextAllowedResubmitAt: string;
};

const PROBE_TIMEOUT_MS = 8_000;

// A file input is a client claim about an object it has already PUT. Every part
// of it is re-derived or re-checked below; none of it is trusted as written.
const fileInputShape = {
  key: (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 1024,
  name: (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 300,
  contentType: (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200,
  bytes: (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0,
};

function parseFileInputs(raw: unknown): SubmissionFileInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SubmissionError(400, { error: "files must be a list of uploaded files." });
  }
  if (raw.length > 50) {
    throw new SubmissionError(400, { error: "That is more files than a checkpoint accepts." });
  }
  return raw.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new SubmissionError(400, { error: "Each file needs a key, a name, a type and a size." });
    }
    const f = item as Record<string, unknown>;
    for (const [field, ok] of Object.entries(fileInputShape)) {
      if (!ok(f[field])) {
        throw new SubmissionError(400, { error: `A file is missing a valid ${field}.` });
      }
    }
    return {
      key: f.key as string,
      name: f.name as string,
      contentType: f.contentType as string,
      bytes: f.bytes as number,
    };
  });
}

/** Keys referenced anywhere in a submission: the file list and file-kind fields. */
export function collectFileKeys(specs: FieldSpec[], values: SubmissionFields, files: SubmissionFileInput[]): string[] {
  const keys = new Set<string>();
  for (const f of files) keys.add(f.key);
  for (const spec of specs) {
    if (spec.kind !== "files" && spec.kind !== "images") continue;
    const value = values[spec.key];
    if (!Array.isArray(value)) continue;
    for (const key of value) if (typeof key === "string" && key !== "") keys.add(key);
  }
  return [...keys];
}

async function defaultProbe(url: string): Promise<{ ok: boolean; status: number }> {
  const options: SafeFetchOptions = { timeoutMs: PROBE_TIMEOUT_MS };
  // HEAD first, GET when the host refuses HEAD — same rule as the Forge crawl.
  const res = await probeUrl(url, options, (r) => r.status === 405 || r.status === 501);
  return { ok: res.ok, status: res.status };
}

/**
 * Submit (or resubmit) one checkpoint. Returns the new submission's id; the
 * verdict arrives later, from the queue.
 */
export async function createSubmission(
  input: CreateSubmissionInput,
  deps: CreateSubmissionDeps = {},
): Promise<CreateSubmissionResult> {
  const db = deps.db ?? defaultPrisma;
  const now = input.now ?? new Date();

  // --- The product and the checkpoint ---------------------------------------
  const product = await db.shipyardProduct.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (!product) {
    throw new SubmissionError(404, { error: "You do not have a product in the Shipyard yet." });
  }

  const checkpoint = await db.shipyardCheckpoint.findUnique({
    where: { courseId_key: { courseId: SHIPYARD_COURSE_ID, key: input.checkpointKey } },
    select: {
      id: true,
      key: true,
      order: true,
      fieldSchema: true,
      resubmitCooldownMinutes: true,
    },
  });
  if (!checkpoint) {
    throw new SubmissionError(404, { error: "No such checkpoint." });
  }

  // --- The gate --------------------------------------------------------------
  const state = await db.shipyardCheckpointState.findUnique({
    where: { productId_checkpointId: { productId: product.id, checkpointId: checkpoint.id } },
    select: { state: true },
  });
  if (state?.state === "passed") {
    throw new SubmissionError(409, { error: "That checkpoint is already cleared." });
  }
  if (!state || state.state === "locked") {
    throw new SubmissionError(409, { error: "That checkpoint is not open." });
  }

  // --- The answers -----------------------------------------------------------
  const specs = parseFieldSpecs(checkpoint.fieldSchema);
  if (!specs) {
    throw new SubmissionError(500, { error: "This checkpoint's form is misconfigured." });
  }
  const validated = validateSubmissionFields(specs, input.fields);
  if (!validated.ok) {
    throw new SubmissionError(400, {
      error: "Some answers need fixing before this can be submitted.",
      errors: validated.errors,
    });
  }
  const values = validated.values;

  // --- In review, and the cooldown -------------------------------------------
  const prior = await db.shipyardSubmission.findMany({
    where: { productId: product.id, checkpointId: checkpoint.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, submittedAt: true },
  });
  const latest = prior[0] ?? null;
  if (latest && (latest.status === "submitted" || latest.status === "in_review")) {
    throw new SubmissionError(409, {
      error: "That checkpoint is already in review. Wait for the verdict before resubmitting.",
    });
  }
  if (latest?.submittedAt) {
    const fence = nextAllowedResubmitAt(latest.submittedAt, checkpoint.resubmitCooldownMinutes);
    const cooldown = cooldownRemaining(now, fence);
    if (!cooldown.allowed) {
      throw new SubmissionError(429, {
        error: `You can resubmit in ${cooldown.humanText}.`,
        nextAllowedResubmitAt: fence.toISOString(),
        humanText: cooldown.humanText,
      });
    }
  }

  // --- The files -------------------------------------------------------------
  const files = parseFileInputs(input.files);
  const prefix = keyPrefixForProduct(product.id);
  const keys = collectFileKeys(specs, values, files);
  for (const key of keys) {
    // Prefix, not ownership lookup: every Shipyard key is minted by the presign
    // route under the product it belongs to, so the prefix IS the owner.
    if (!key.startsWith(prefix)) {
      throw new SubmissionError(400, { error: "One of those files does not belong to your product." });
    }
  }
  const storageOn = (deps.storageConfigured ?? s3Configured)();
  if (storageOn) {
    const head = deps.headObject ?? headObject;
    for (const file of files) {
      try {
        await head(file.key);
      } catch {
        throw new SubmissionError(400, {
          error: `We cannot find "${file.name}" in storage. Upload it again before submitting.`,
        });
      }
    }
  }

  // --- Link liveness ---------------------------------------------------------
  const probe = deps.probe ?? defaultProbe;
  for (const spec of specs) {
    if (spec.kind !== "url") continue;
    const value = values[spec.key];
    if (typeof value !== "string" || value === "") continue;
    let result: { ok: boolean; status: number };
    try {
      result = await probe(value);
    } catch (err) {
      if (err instanceof SafeFetchBlockedError) {
        throw new SubmissionError(400, {
          error: `${spec.label}: that address is not reachable from here.`,
          field: spec.key,
        });
      }
      throw new SubmissionError(400, {
        error: `${spec.label}: we could not load that link. Check it opens in a private window.`,
        field: spec.key,
      });
    }
    if (!result.ok) {
      throw new SubmissionError(400, {
        error: `${spec.label}: that link returned ${result.status}. Publish the page and try again.`,
        field: spec.key,
      });
    }
  }

  // --- Write -----------------------------------------------------------------
  const version = (latest?.version ?? 0) + 1;
  const fence = nextAllowedResubmitAt(now, checkpoint.resubmitCooldownMinutes);

  const created = await db.$transaction(async (tx) => {
    const submission = await tx.shipyardSubmission.create({
      data: {
        courseId: SHIPYARD_COURSE_ID,
        productId: product.id,
        checkpointId: checkpoint.id,
        status: "submitted",
        fields: values as unknown as Prisma.InputJsonValue,
        files: files as unknown as Prisma.InputJsonValue,
        version,
        submittedAt: now,
        nextAllowedResubmitAt: fence,
      },
      select: { id: true },
    });

    // Earlier attempts are left exactly as they are: a `returned` v1 beside a
    // `submitted` v2 is the history, and a student re-reads the old reasons
    // while the new attempt is in the queue.
    const patch: Prisma.ShipyardProductUpdateInput = {};
    if (checkpoint.key === "idea") {
      if (typeof values.productName === "string") patch.name = values.productName;
      if (typeof values.oneLiner === "string") patch.oneLiner = values.oneLiner;
      if (typeof values.waitlistUrl === "string") patch.waitlistUrl = values.waitlistUrl;
    }
    if (checkpoint.key === "working" && typeof values.liveUrl === "string") {
      patch.liveUrl = values.liveUrl;
    }
    if (Object.keys(patch).length > 0) {
      await tx.shipyardProduct.update({ where: { id: product.id }, data: patch });
    }

    return submission;
  });

  // Best effort, deliberately outside the transaction: the submission is saved
  // whether or not the queue is up.
  const enqueue = deps.enqueue ?? enqueueShipyardReview;
  await enqueue(created.id);

  return {
    submissionId: created.id,
    status: "submitted",
    version,
    nextAllowedResubmitAt: fence.toISOString(),
  };
}
