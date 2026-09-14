// The reviewer's wire contract: what a model is asked to return, and what the
// rest of the Shipyard is allowed to assume it got back.
//
// Everything here is pure Zod and pure types. No Prisma, no network, no S3 —
// the pipeline (worker/shipyard-jobs) imports these and does the persisting.
//
// The shapes exist in three layers and the names say which is which:
//   • `*Output`  — validated model output, straight off the wire.
//   • `ReasonView` (lib/shipyard/view-models) — what the student's spine
//     renders. A `reason` here is exactly a ReasonView, deliberately, so the
//     pipeline can store `reasons` with no translation step that could drift.
//   • `decideOutcome` (./verdict) — the trust rules from SPEC §6 applied on
//     top, which is where `needsHuman` is decided and never in the model.

import { z } from "zod";

/** SPEC §6: below this the review is queued for a human before it counts. */
export const CONFIDENCE_FLOOR = 0.7;

/** Outlier band, attempt 1: a wall of near-perfect scores is not a pass. */
export const OUTLIER_HIGH = 95;
/** Outlier band: a wall of near-zero scores is a broken read, not a return. */
export const OUTLIER_LOW = 5;

/** The flags a model may raise. Anything else is dropped as unknown. */
export const REVIEW_FLAGS = [
  "spam",
  "blank",
  "near_duplicate",
  "unsafe_content",
  "needs_human",
] as const;

export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

/**
 * One bar clause, judged. `criterion` is a rubric criterion id from
 * lib/shipyard/checkpoints.ts — never free text — because the student's spine
 * renders the note beside the clause the id names, and the instructor queue
 * sorts on it.
 */
export const reasonSchema = z.object({
  criterion: z.string().min(1),
  met: z.boolean(),
  /** Student-facing, 1–3 sentences, specific enough to act on. */
  note: z.string().min(1),
});

export type Reason = z.infer<typeof reasonSchema>;

/** "PASS", " return " and "Pass" are the same answer. */
const verdictWord = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(["pass", "return"]),
);

/**
 * The WIRE schema — deliberately tolerant where a strict one would throw away
 * a usable reply. `flags` is `string[]` here and is narrowed to ReviewFlag[]
 * by `parseVerdict`, because a model inventing a sixth flag is not a reason to
 * discard the five real ones and re-run the call.
 */
export const verdictOutputSchema = z.object({
  verdict: verdictWord,
  /** 0–1. `parseVerdict` clamps; the model is asked for two decimals. */
  confidence: z.number(),
  reasons: z.array(reasonSchema),
  /** criterionId -> 0–100, internal, never shown to a student. */
  rubricScores: z.record(z.string(), z.number()),
  /** Write-up vs evidence mismatches, in the reviewer's own words. */
  contradictions: z.array(z.string()),
  flags: z.array(z.string()),
  /** ≤ 60 words, warm, plain, no exclamation marks. */
  summaryForStudent: z.string(),
});

export type VerdictWire = z.infer<typeof verdictOutputSchema>;

/** What `parseVerdict` returns: the wire shape with the flags narrowed. */
export type VerdictOutput = Omit<VerdictWire, "flags"> & { flags: ReviewFlag[] };

/**
 * Pre-flight. Link liveness, extraction and near-duplicate detection are
 * computed in CODE (./preflight) — the model is only ever asked to classify
 * blank and spam, and only when the heuristics are ambiguous. This schema is
 * the merged result either way, so the pipeline has one shape to store.
 */
export const preflightOutputSchema = z.object({
  linkStatuses: z.array(
    z.object({
      url: z.string().min(1),
      alive: z.boolean(),
      status: z.number().int().optional(),
    }),
  ),
  isBlank: z.boolean(),
  isSpam: z.boolean(),
  /** The id of the prior submission this one duplicates, when it does. */
  nearDuplicateOf: z.string().optional(),
  extractedText: z.string(),
  notes: z.array(z.string()),
});

export type PreflightOutput = z.infer<typeof preflightOutputSchema>;

/** What the model is asked for in the cheap blank/spam classification. */
export const preflightClassificationSchema = z.object({
  isBlank: z.boolean(),
  isSpam: z.boolean(),
  note: z.string(),
});

export type PreflightClassification = z.infer<typeof preflightClassificationSchema>;

/**
 * The escalation second opinion. A full verdict plus the two fields a human
 * in the review queue actually reads first: does the second model agree, and
 * what should the human look at.
 */
export const escalationOutputSchema = verdictOutputSchema.extend({
  agreesWithFirstVerdict: z.boolean(),
  /** Addressed to the instructor, not the student. */
  humanNote: z.string(),
});

export type EscalationWire = z.infer<typeof escalationOutputSchema>;

export type EscalationOutput = VerdictOutput & {
  agreesWithFirstVerdict: boolean;
  humanNote: string;
};

/** The verdict half of `assembleReviewContext`'s prompt, ready for the gateway. */
export type BuiltPrompt = {
  system: string;
  user: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  )[];
};
