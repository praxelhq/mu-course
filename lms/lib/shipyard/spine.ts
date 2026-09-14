// The student spine, assembled once, server-side.
//
// Everything `app/shipyard` renders arrives as one `SpineView` (see
// view-models.ts). This module is the only thing that turns Shipyard rows into
// that shape, so the page, the 4s poll and the instructor drill-down can never
// disagree about what a student's spine says.
//
// Nothing is stripped here: this is the student's OWN data, and the one thing
// the Shipyard hides from students — a checkpoint's internal rubric — is simply
// never selected. `barMarkdown` is published, `rubric` is not.
//
// `spineVersion` is the poll's content hash. It covers the things that change
// the picture (gate states, submission status and version, review verdicts,
// tracker signals) and deliberately NOT `now` or the presigned file URLs, both
// of which move on every call and would make every poll a false positive.

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import { CHECKPOINT_ORDER, SHIPYARD_COURSE_ID } from "./constants";
import { parseFieldSpecs, type FieldSpec } from "./fields";
import { metricSignalsMet } from "./gates";
import type {
  CheckpointView,
  FieldSpecView,
  ReasonView,
  ReviewView,
  SignalView,
  SpineView,
  SubmissionView,
} from "./view-models";

/** SPEC §4: the honest expectation, shown while anything is in the queue. */
export const QUEUE_NOTE = "usually under two minutes, longer on deadline nights";

export const WORKFLOW_RUNS_BAR = 10;

// ---------------------------------------------------------------------------
// Pure mappers (unit-tested with fixtures; no DB, no clock)
// ---------------------------------------------------------------------------

/** Human labels for the tracker signals a checkpoint may require. */
export const SIGNAL_LABELS: Record<string, string> = {
  paymentsLive: "Payments live",
  trackerConnected: "Tracker connected",
  workflowTenRuns: "Workflow runs",
  hasPayingCustomer: "Paying customers",
  noBlockingFlags: "No blocking flags",
};

/** Display-ready, already formatted: "7 of 10", "yes", "none". */
export function formatSignalValue(name: string, signals: TrackerSignals | null): string {
  if (!signals) return "not read yet";
  switch (name) {
    case "paymentsLive":
      return signals.paymentsLive ? "yes" : "no";
    case "trackerConnected":
      return signals.trackerConnected ? "yes" : "no";
    case "workflowTenRuns": {
      const runs = signals.workflowRuns ?? (signals.workflowTenRuns ? WORKFLOW_RUNS_BAR : 0);
      return `${runs} of ${WORKFLOW_RUNS_BAR}`;
    }
    case "hasPayingCustomer":
      return String(signals.payingCustomers);
    case "noBlockingFlags":
      return signals.blockingFlags.length === 0 ? "none" : signals.blockingFlags.join(", ");
    default:
      return "—";
  }
}

/**
 * The per-signal strip under a metric or `both` checkpoint. `met` is null — not
 * false — when the tracker has not answered: "we have not read this yet" and
 * "you have not done this" are different sentences, and only one of them is a
 * reason to keep working.
 */
export function signalViews(required: string[], signals: TrackerSignals | null): SignalView[] {
  return metricSignalsMet(required, signals).map((check) => ({
    name: check.name,
    label: SIGNAL_LABELS[check.name] ?? check.name,
    met: signals ? check.met : null,
    value: formatSignalValue(check.name, signals),
  }));
}

/**
 * Stored review reasons, in either shape the database holds: the view-model's
 * own `{criterion, met, note}` (written by `completeReview`) and the seed's
 * richer `{criterionId, clause, what, fix}`. Both land as ReasonView so the UI
 * only ever sees one.
 */
export function reasonViews(raw: unknown): ReasonView[] {
  if (!Array.isArray(raw)) return [];
  const out: ReasonView[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.criterion === "string") {
      out.push({
        criterion: r.criterion,
        met: r.met === true,
        note: typeof r.note === "string" ? r.note : "",
      });
      continue;
    }
    const criterion =
      typeof r.clause === "string"
        ? r.clause
        : typeof r.criterionId === "string"
          ? r.criterionId
          : null;
    if (criterion === null) continue;
    const note = [r.what, r.fix]
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .join(" ");
    // A stored reason with no explicit `met` is a clause that was NOT met —
    // that is the only reason a reviewer writes one down.
    out.push({ criterion, met: r.met === true, note });
  }
  return out;
}

/** A checkpoint's field schema, as the submit form wants it. */
export function fieldSpecViews(specs: FieldSpec[] | null): FieldSpecView[] {
  if (!specs) return [];
  return specs.map((s) => ({
    key: s.key,
    label: s.label,
    kind: s.kind,
    required: s.required,
    ...(s.help !== undefined ? { help: s.help } : {}),
    ...(s.maxFiles !== undefined ? { maxFiles: s.maxFiles } : {}),
    // The view carries the HTML `accept` attribute, not the array.
    ...(s.accept && s.accept.length > 0 ? { accept: s.accept.join(",") } : {}),
  }));
}

export type StoredFile = { key: string; name: string; contentType: string; bytes: number };

/** `ShipyardSubmission.files` as stored: [{ key, name, contentType, bytes }]. */
export function parseStoredFiles(raw: unknown): StoredFile[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredFile[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const f = item as Record<string, unknown>;
    if (typeof f.key !== "string" || f.key === "") continue;
    out.push({
      key: f.key,
      name: typeof f.name === "string" && f.name !== "" ? f.name : f.key.split("/").pop()!,
      contentType: typeof f.contentType === "string" ? f.contentType : "application/octet-stream",
      bytes: typeof f.bytes === "number" && Number.isFinite(f.bytes) ? f.bytes : 0,
    });
  }
  return out;
}

/**
 * Where the student is standing: the lowest OPEN checkpoint, or one past the
 * end when every one of them is cleared.
 */
export function currentOrderFrom(
  checkpoints: readonly Pick<CheckpointView, "order" | "state">[],
): number {
  const byOrder = [...checkpoints].sort((a, b) => a.order - b.order);
  const open = byOrder.find((c) => c.state === "open");
  if (open) return open.order;
  const unpassed = byOrder.find((c) => c.state !== "passed");
  if (unpassed) return unpassed.order;
  return CHECKPOINT_ORDER.length + 1;
}

/**
 * A stable content hash of everything that changes the picture. `now` and the
 * freshly-signed file URLs are excluded on purpose — both move every call, and
 * a version that always changes turns a 4s poll into a 4s full page refresh.
 */
export function spineVersion(view: SpineView): string {
  const payload = {
    product: view.product
      ? {
          id: view.product.id,
          name: view.product.name,
          oneLiner: view.product.oneLiner,
          liveUrl: view.product.liveUrl,
        }
      : null,
    currentOrder: view.currentOrder,
    grade: view.grade ? { total: view.grade.total, provisional: view.grade.provisional } : null,
    checkpoints: [...view.checkpoints]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: c.id,
        state: c.state,
        openedAt: c.openedAt,
        passedAt: c.passedAt,
        attempts: c.attempts,
        signalsRefreshedAt: c.signalsRefreshedAt,
        signals: c.signals ? c.signals.map((s) => [s.name, s.met, s.value]) : null,
        submission: c.latestSubmission
          ? {
              id: c.latestSubmission.id,
              status: c.latestSubmission.status,
              version: c.latestSubmission.version,
              submittedAt: c.latestSubmission.submittedAt,
              nextAllowedResubmitAt: c.latestSubmission.nextAllowedResubmitAt,
              queuePosition: c.latestSubmission.queuePosition,
              review: c.latestSubmission.review
                ? {
                    verdict: c.latestSubmission.review.verdict,
                    createdAt: c.latestSubmission.review.createdAt,
                    pendingHuman: c.latestSubmission.review.pendingHuman,
                  }
                : null,
            }
          : null,
      })),
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

export type LoadSpineOptions = {
  now?: Date;
  db?: PrismaClient;
  tracker?: TrackerClient;
  /** Skip the tracker call when the caller already has fresh signals. */
  signals?: TrackerSignals | null;
  /** Test seam; defaults to a short-TTL presignGet when S3 is configured. */
  presign?: (key: string) => Promise<string | undefined>;
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function defaultPresign(): ((key: string) => Promise<string | undefined>) | null {
  if (!s3Configured()) return null;
  return async (key: string) => {
    try {
      return await presignGet(key);
    } catch {
      // A signing failure must not take the whole spine down; the file simply
      // renders without a link.
      return undefined;
    }
  };
}

/** Build the entire student spine for one user. */
export async function loadSpine(userId: string, opts: LoadSpineOptions = {}): Promise<SpineView> {
  const db = opts.db ?? defaultPrisma;
  const now = opts.now ?? new Date();

  const checkpointRows = await db.shipyardCheckpoint.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      order: true,
      title: true,
      barMarkdown: true,
      gateType: true,
      metricSignals: true,
      fieldSchema: true,
      deadlineAt: true,
      resubmitWindowHours: true,
      resubmitCooldownMinutes: true,
    },
  });

  const product = await db.shipyardProduct.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      oneLiner: true,
      liveUrl: true,
      trackerProductId: true,
    },
  });

  // Signals are read once per spine, not once per checkpoint: three metric
  // gates must never mean three tracker calls.
  const needsSignals = checkpointRows.some((c) => c.gateType !== "review");
  let signals: TrackerSignals | null = opts.signals ?? null;
  if (product && needsSignals && opts.signals === undefined) {
    const tracker = opts.tracker ?? (await createTrackerClient());
    signals = await tracker.getCheckpointSignals(product.trackerProductId);
  }

  const states = product
    ? await db.shipyardCheckpointState.findMany({
        where: { productId: product.id },
        select: { checkpointId: true, state: true, openedAt: true, passedAt: true },
      })
    : [];
  const stateByCheckpoint = new Map(states.map((s) => [s.checkpointId, s]));

  const submissions = product
    ? await db.shipyardSubmission.findMany({
        where: { productId: product.id },
        orderBy: { version: "asc" },
        select: {
          id: true,
          checkpointId: true,
          status: true,
          version: true,
          fields: true,
          files: true,
          submittedAt: true,
          nextAllowedResubmitAt: true,
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              verdict: true,
              reasons: true,
              confidence: true,
              createdAt: true,
              needsHuman: true,
              humanResolvedAt: true,
              modelUsed: true,
            },
          },
        },
      })
    : [];

  const byCheckpoint = new Map<string, (typeof submissions)[number][]>();
  for (const s of submissions) {
    const list = byCheckpoint.get(s.checkpointId);
    if (list) list.push(s);
    else byCheckpoint.set(s.checkpointId, [s]);
  }

  const presign = opts.presign ?? defaultPresign();

  const checkpoints: CheckpointView[] = [];
  for (const cp of checkpointRows) {
    const attemptsList = byCheckpoint.get(cp.id) ?? [];
    const latest = attemptsList.length > 0 ? attemptsList[attemptsList.length - 1] : null;
    const state = stateByCheckpoint.get(cp.id);

    let latestSubmission: SubmissionView | null = null;
    if (latest) {
      const review = latest.reviews[0];
      const reviewView: ReviewView | null = review
        ? {
            verdict: review.verdict,
            reasons: reasonViews(review.reasons),
            confidence: review.confidence,
            createdAt: review.createdAt.toISOString(),
            pendingHuman: review.needsHuman && review.humanResolvedAt === null,
            ...(review.modelUsed ? { modelUsed: review.modelUsed } : {}),
          }
        : null;

      const files = parseStoredFiles(latest.files);
      const fileViews = await Promise.all(
        files.map(async (f) => {
          const url = presign ? await presign(f.key) : undefined;
          return url === undefined ? f : { ...f, url };
        }),
      );

      latestSubmission = {
        id: latest.id,
        status: latest.status,
        version: latest.version,
        submittedAt: iso(latest.submittedAt),
        nextAllowedResubmitAt: iso(latest.nextAllowedResubmitAt),
        queuePosition:
          latest.status === "in_review"
            ? await queuePositionOf(db, latest.id, latest.submittedAt)
            : null,
        review: reviewView,
        fields:
          typeof latest.fields === "object" && latest.fields !== null && !Array.isArray(latest.fields)
            ? (latest.fields as Record<string, unknown>)
            : {},
        files: fileViews,
      };
    }

    const metricSignals = Array.isArray(cp.metricSignals)
      ? cp.metricSignals.filter((v): v is string => typeof v === "string")
      : [];

    checkpoints.push({
      id: cp.id,
      key: cp.key,
      order: cp.order,
      title: cp.title,
      barMarkdown: cp.barMarkdown,
      gateType: cp.gateType,
      // No product yet means the student has just arrived: checkpoint 1 is open
      // on enrolment (SPEC §5) and everything after it is locked.
      state: state?.state ?? (cp.order === 1 ? "open" : "locked"),
      openedAt: iso(state?.openedAt),
      passedAt: iso(state?.passedAt),
      deadlineAt: iso(cp.deadlineAt),
      resubmitWindowHours: cp.resubmitWindowHours,
      resubmitCooldownMinutes: cp.resubmitCooldownMinutes,
      fields: fieldSpecViews(parseFieldSpecs(cp.fieldSchema)),
      signals: cp.gateType === "review" ? null : signalViews(metricSignals, signals),
      signalsRefreshedAt: cp.gateType === "review" ? null : (signals?.fetchedAt ?? null),
      latestSubmission,
      attempts: attemptsList.length,
    });
  }

  return {
    product: product
      ? {
          id: product.id,
          name: product.name,
          oneLiner: product.oneLiner,
          liveUrl: product.liveUrl,
        }
      : null,
    checkpoints,
    currentOrder: currentOrderFrom(checkpoints),
    // M4 writes the grade line; until then the spine says nothing rather than
    // showing a total nobody computed.
    grade: null,
    queueNote: QUEUE_NOTE,
    now: now.toISOString(),
  };
}

/**
 * Place in the review queue, counted COURSE-WIDE rather than per section: the
 * reviewer is one pool of 15 workers draining one queue, so "you are 4th" has
 * to mean 4th in that queue or it is a number that does not predict anything.
 */
async function queuePositionOf(
  db: PrismaClient,
  submissionId: string,
  submittedAt: Date | null,
): Promise<number | null> {
  if (!submittedAt) return null;
  const ahead = await db.shipyardSubmission.count({
    where: {
      courseId: SHIPYARD_COURSE_ID,
      status: { in: ["submitted", "in_review"] },
      submittedAt: { lt: submittedAt },
      id: { not: submissionId },
    },
  });
  return ahead + 1;
}
