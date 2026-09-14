// What the term has cost so far, and what state the router is in.
//
// Two sources, deliberately, because they answer different questions:
//
//   • `ShipyardReview` carries the VERDICT spend, attached to the submission
//     and the checkpoint it bought. It is what "checkpoint 3 costs more than
//     checkpoint 1" is computed from.
//   • `CostLog` carries EVERY model call, verdicts included, plus the
//     pre-flight classifications and escalation second opinions that have no
//     review row of their own. It is what a monthly total is computed from.
//
// Totalling only reviews would under-count by the pre-flight and escalation
// tiers; totalling only CostLog would lose the checkpoint dimension, because a
// CostLog row names a submission and not a checkpoint. So the meter reads both
// and says which number came from where — SPEC §6.5's table is per-tier, and a
// banner that cannot be reconciled with it is worse than no banner.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { listDeadLetterJobs } from "@/lib/queue";
import {
  effectiveProfile,
  loadRouterState,
  MODEL_PRICES,
  resolveRoute,
  type RouterState,
  type RouterTask,
} from "@/lib/ai/router";
import { QUEUE_SHIPYARD_REVIEW_DEAD, SHIPYARD_COURSE_ID } from "./constants";

/** How far back the daily series runs. Two weeks reads on one screen. */
export const COST_DAYS = 14;

export type CostBucket = {
  label: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export type CostMeter = {
  generatedAt: string;
  /** Every model call: verdicts, pre-flight, escalations, evals. */
  totals: CostBucket;
  byModel: CostBucket[];
  byFeature: CostBucket[];
  /** Verdict spend only — CostLog cannot see a checkpoint, ShipyardReview can. */
  byCheckpoint: CostBucket[];
  byDay: CostBucket[];
  reviews: {
    total: number;
    passed: number;
    returned: number;
    needsHumanOpen: number;
    heldPasses: number;
    disputed: number;
    meanConfidence: number;
    verdictCostUsd: number;
  };
  deadLetter: { queue: string; count: number; submissionIds: string[] };
  router: RouterState & {
    /** True while the kill-switch has fired and no Haiku call will be made. */
    killSwitchActive: boolean;
    effectiveProfile: string;
    routes: Record<RouterTask, string[]>;
    prices: typeof MODEL_PRICES;
  };
};

function emptyBucket(label: string): CostBucket {
  return { label, calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
}

function add(
  into: Map<string, CostBucket>,
  label: string,
  row: { tokensIn?: number | null; tokensOut?: number | null; costUsd: number },
): void {
  const bucket = into.get(label) ?? emptyBucket(label);
  bucket.calls += 1;
  bucket.tokensIn += row.tokensIn ?? 0;
  bucket.tokensOut += row.tokensOut ?? 0;
  bucket.costUsd += row.costUsd;
  into.set(label, bucket);
}

function rounded(buckets: Iterable<CostBucket>): CostBucket[] {
  return [...buckets]
    .map((b) => ({ ...b, costUsd: Math.round(b.costUsd * 1e6) / 1e6 }))
    .sort((a, b) => b.costUsd - a.costUsd || a.label.localeCompare(b.label));
}

/** UTC day key, so a night-time deadline does not straddle two buckets. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `days` UTC days, oldest first, including days with no spend. */
export function daySeries(now: Date, days: number = COST_DAYS): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return out;
}

export type CostMeterDeps = {
  db?: PrismaClient;
  now?: Date;
  /** Test seam: the dead-letter listing (pg-boss is not up in a unit test). */
  deadLetter?: typeof listDeadLetterJobs;
};

export async function loadCostMeter(deps: CostMeterDeps = {}): Promise<CostMeter> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - COST_DAYS * 86_400_000);

  // --- Every model call ------------------------------------------------------
  const costRows = await db.costLog.findMany({
    where: { feature: { startsWith: "shipyard." } },
    select: {
      feature: true,
      model: true,
      provider: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      createdAt: true,
    },
  });

  const totals = emptyBucket("all shipyard model calls");
  const byModel = new Map<string, CostBucket>();
  const byFeature = new Map<string, CostBucket>();
  const byDay = new Map<string, CostBucket>();
  for (const key of daySeries(now)) byDay.set(key, emptyBucket(key));

  for (const row of costRows) {
    totals.calls += 1;
    totals.tokensIn += row.tokensIn ?? 0;
    totals.tokensOut += row.tokensOut ?? 0;
    totals.costUsd += row.costUsd;
    add(byModel, row.model ?? "(unknown)", row);
    add(byFeature, row.feature, row);
    if (row.createdAt >= since) {
      const key = dayKey(row.createdAt);
      if (byDay.has(key)) add(byDay, key, row);
    }
  }
  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;

  // --- Verdicts, which are the only rows that know a checkpoint --------------
  const reviews = await db.shipyardReview.findMany({
    where: { courseId: SHIPYARD_COURSE_ID },
    select: {
      verdict: true,
      confidence: true,
      needsHuman: true,
      humanResolvedAt: true,
      promptLog: true,
      modelUsed: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      submission: { select: { checkpoint: { select: { key: true, order: true } } } },
    },
  });

  const byCheckpoint = new Map<string, CostBucket>();
  let passed = 0;
  let returned = 0;
  let needsHumanOpen = 0;
  let heldPasses = 0;
  let disputed = 0;
  let confidenceSum = 0;
  let verdictCostUsd = 0;

  for (const review of reviews) {
    if (review.verdict === "pass") passed++;
    else returned++;
    if (review.needsHuman && review.humanResolvedAt === null) {
      needsHumanOpen++;
      if (review.verdict === "pass") heldPasses++;
    }
    const log = review.promptLog;
    if (typeof log === "object" && log !== null && !Array.isArray(log) && "dispute" in log) {
      disputed++;
    }
    confidenceSum += review.confidence;
    verdictCostUsd += review.costUsd;
    const checkpoint = review.submission.checkpoint;
    add(byCheckpoint, `${checkpoint.order} · ${checkpoint.key}`, review);
  }

  // --- The jobs nobody could review -----------------------------------------
  const deadJobs = await (deps.deadLetter ?? listDeadLetterJobs)<{ submissionId?: string }>(
    QUEUE_SHIPYARD_REVIEW_DEAD,
  );

  // --- The router -----------------------------------------------------------
  const state = await loadRouterState(db);
  const profile = effectiveProfile(state);
  const tasks: RouterTask[] = ["preflight", "verdict", "escalation", "eval"];
  const routes = Object.fromEntries(
    tasks.map((task) => [task, [...resolveRoute(task, profile).models]]),
  ) as Record<RouterTask, string[]>;

  return {
    generatedAt: now.toISOString(),
    totals,
    byModel: rounded(byModel.values()),
    byFeature: rounded(byFeature.values()),
    byCheckpoint: rounded(byCheckpoint.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    // The daily series stays in date order, not cost order: it is a line.
    byDay: [...byDay.values()].map((b) => ({
      ...b,
      costUsd: Math.round(b.costUsd * 1e6) / 1e6,
    })),
    reviews: {
      total: reviews.length,
      passed,
      returned,
      needsHumanOpen,
      heldPasses,
      disputed,
      meanConfidence:
        reviews.length === 0 ? 0 : Math.round((confidenceSum / reviews.length) * 100) / 100,
      verdictCostUsd: Math.round(verdictCostUsd * 1e6) / 1e6,
    },
    deadLetter: {
      queue: QUEUE_SHIPYARD_REVIEW_DEAD,
      count: deadJobs.length,
      submissionIds: deadJobs
        .map((job) => job.data?.submissionId)
        .filter((id): id is string => typeof id === "string"),
    },
    router: {
      ...state,
      killSwitchActive: state.anthropicExhausted,
      effectiveProfile: profile,
      routes,
      prices: MODEL_PRICES,
    },
  };
}
