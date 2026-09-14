// The `shipyard.review` consumer.
//
// M2: `handleReviewSubmission` is now a thin wrapper over
// `runReviewPipeline` (lib/shipyard/review-pipeline.ts). Everything about a
// review — the render, the pre-flight, the model call, the trust rules,
// persistence — lives there, injected, so it can be tested without a queue and
// without a browser. This file is the queue's edge and nothing else.
//
// M1's STUB reviewer is KEPT, unwired, behind `SHIPYARD_STUB_REVIEWER=1`. It
// is what makes the demo walkable with no key and no spend, and the seed and
// the instructor's review-stub route still import `rubricClauses` from here.
// `[review:return]` in any field value forces a return under the stub. That is
// a demo affordance and NOTHING ELSE — the real reviewer never reads it.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/db";
import { parseFieldSpecs, type FieldSpec } from "../../lib/shipyard/fields";
import {
  completeReview,
  type CompleteReviewResult,
  type VerdictInput,
} from "../../lib/shipyard/review-complete";
import {
  runReviewPipeline,
  type ReviewPipelineDeps,
} from "../../lib/shipyard/review-pipeline";
import type { ReasonView } from "../../lib/shipyard/view-models";

export const STUB_RETURN_TOKEN = "[review:return]";
export const STUB_MODEL = "stub";

export type ReviewSubmissionDeps = ReviewPipelineDeps & {
  db?: PrismaClient;
  now?: Date;
  /** Test seam: the shared completion path. */
  complete?: typeof completeReview;
  /** Force the M1 stub reviewer. Defaults to `SHIPYARD_STUB_REVIEWER=1`. */
  stub?: boolean;
};

/** The demo's escape hatch: no key, no spend, a reviewer that passes on cue. */
export function stubReviewerEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.SHIPYARD_STUB_REVIEWER === "1";
}

type RubricCriterionRow = { id?: string; clause?: string };

/** The rubric's clauses, in order. Empty rubric still yields one reason. */
export function rubricClauses(rubric: unknown): string[] {
  const criteria =
    typeof rubric === "object" && rubric !== null && !Array.isArray(rubric)
      ? (rubric as { criteria?: unknown }).criteria
      : null;
  if (!Array.isArray(criteria)) return ["Meets the published bar"];
  const out: string[] = [];
  for (const item of criteria) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as RubricCriterionRow;
    if (typeof c.clause === "string" && c.clause !== "") out.push(c.clause);
    else if (typeof c.id === "string" && c.id !== "") out.push(c.id);
  }
  return out.length > 0 ? out : ["Meets the published bar"];
}

function hasReturnToken(fields: unknown): boolean {
  if (typeof fields !== "object" || fields === null) return false;
  for (const value of Object.values(fields as Record<string, unknown>)) {
    if (typeof value === "string" && value.includes(STUB_RETURN_TOKEN)) return true;
    if (Array.isArray(value)) {
      for (const v of value) if (typeof v === "string" && v.includes(STUB_RETURN_TOKEN)) return true;
    }
  }
  return false;
}

function requiredFieldBlank(specs: FieldSpec[] | null, fields: unknown): boolean {
  if (!specs) return false;
  const values =
    typeof fields === "object" && fields !== null && !Array.isArray(fields)
      ? (fields as Record<string, unknown>)
      : {};
  return specs.some((spec) => {
    if (!spec.required) return false;
    const value = values[spec.key];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

export const STUB_RETURN_NOTE = "Stub reviewer: this attempt was marked for return.";

/** The M1 reviewer, in full. Pure: no DB, no clock, no model. */
export function stubVerdict(args: {
  fields: unknown;
  rubric: unknown;
  gateType: "review" | "metric" | "both";
  fieldSpecs: FieldSpec[] | null;
}): VerdictInput {
  const judged = args.gateType === "review" || args.gateType === "both";
  const shouldReturn =
    hasReturnToken(args.fields) || (judged && requiredFieldBlank(args.fieldSpecs, args.fields));
  const clauses = rubricClauses(args.rubric);

  const reasons: ReasonView[] = clauses.map((clause, index) => ({
    criterion: clause,
    met: shouldReturn ? index !== 0 : true,
    note: shouldReturn && index === 0 ? STUB_RETURN_NOTE : "Met.",
  }));

  return {
    verdict: shouldReturn ? "return" : "pass",
    reasons,
    rubricScores: { stub: shouldReturn ? 0 : 100 },
    confidence: 1,
    modelUsed: STUB_MODEL,
    providerUsed: STUB_MODEL,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    reviewedBy: "ai",
    needsHuman: false,
  };
}

export type ReviewSubmissionOutcome =
  | { handled: false; reason: "missing" | "already-final" }
  | ({ handled: true; kind?: string } & CompleteReviewResult);

/**
 * Review one submission end to end. The real pipeline unless the stub is
 * explicitly switched on, in which case M1's behaviour is unchanged.
 */
export async function handleReviewSubmission(
  submissionId: string,
  deps: ReviewSubmissionDeps = {},
): Promise<ReviewSubmissionOutcome> {
  if (!(deps.stub ?? stubReviewerEnabled())) {
    return runReviewPipeline(submissionId, deps);
  }
  return handleWithStub(submissionId, deps);
}

/** M1's reviewer, kept whole for the no-key demo. */
export async function handleWithStub(
  submissionId: string,
  deps: ReviewSubmissionDeps = {},
): Promise<ReviewSubmissionOutcome> {
  const db = deps.db ?? defaultPrisma;
  const complete = deps.complete ?? completeReview;

  const submission = await db.shipyardSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      fields: true,
      checkpoint: { select: { rubric: true, gateType: true, fieldSchema: true } },
    },
  });
  if (!submission) return { handled: false, reason: "missing" };
  // A retry that arrives after a human already ruled must not overwrite them.
  if (submission.status === "passed" || submission.status === "returned") {
    return { handled: false, reason: "already-final" };
  }

  if (submission.status !== "in_review") {
    await db.shipyardSubmission.update({
      where: { id: submissionId },
      data: { status: "in_review" },
    });
  }

  const verdict = stubVerdict({
    fields: submission.fields,
    rubric: submission.checkpoint.rubric,
    gateType: submission.checkpoint.gateType,
    fieldSpecs: parseFieldSpecs(submission.checkpoint.fieldSchema),
  });

  const result = await complete(submissionId, verdict, { db, now: deps.now });
  return { handled: true, ...result };
}
