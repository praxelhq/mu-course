// Turning a model's reply into something a gate may be decided on.
//
// Two steps, deliberately separate:
//   parseVerdict   — the model's words, repaired, validated and normalised.
//                    Knows nothing about trust; only about shape.
//   decideOutcome  — SPEC §6's trust rules on top: confidence, contradictions,
//                    flags and outliers decide `needsHuman`, and a `pass` that
//                    needs a human does NOT clear the gate until it is resolved.
//
// Pure. No Prisma, no network. The pipeline calls both and persists the result.

import {
  CONFIDENCE_FLOOR,
  OUTLIER_HIGH,
  OUTLIER_LOW,
  REVIEW_FLAGS,
  escalationOutputSchema,
  verdictOutputSchema,
  type EscalationOutput,
  type Reason,
  type ReviewFlag,
  type VerdictOutput,
  type VerdictWire,
} from "./schemas";

/** The note a student sees when the reviewer simply did not address a clause. */
export const MISSING_CRITERION_NOTE =
  "The reviewer did not address this clause; a human will look.";

const SUMMARY_WORD_CAP = 60;

// ---------------------------------------------------------------------------
// Repairing the raw reply
// ---------------------------------------------------------------------------

/**
 * A tolerant JSON read, for the reply that arrives wrapped in prose or with a
 * trailing comma. Deliberately local rather than borrowed from Course 1's
 * `lib/ai/client`: importing that module would pull the Anthropic SDK into the
 * Shipyard's dependency graph, and the boundary test exists to stop exactly
 * that (docs/shipyard/ARCHITECTURE.md §1).
 */
export function extractJson(raw: unknown): unknown {
  if (raw !== null && typeof raw === "object") return raw;
  if (typeof raw !== "string") {
    throw new Error(`parseVerdict: expected an object or a string, got ${typeof raw}`);
  }

  const cleaned = raw.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("parseVerdict: no JSON object found in the reply");
  }
  const candidate = cleaned.slice(start, end + 1);

  const attempts = [
    candidate,
    stripTrailingCommas(candidate),
    escapeControlCharsInStrings(stripTrailingCommas(candidate)),
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `parseVerdict: reply was not JSON — ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** `,}` and `,]` — the single most common malformation across both models. */
function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/** A real newline inside a string literal. Models do this in long notes. */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && ch < " ") {
      out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export type ParseVerdictOptions = {
  /**
   * The rubric's criterion ids, in order. Supply them and the result is
   * guaranteed to cover exactly these: a reason for an id the rubric does not
   * have is dropped, and an id the model skipped comes back met=false with
   * MISSING_CRITERION_NOTE and a `needs_human` flag.
   */
  criteria?: readonly string[];
};

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/** ≤ 60 words, no exclamation marks. The bar says warm and plain, not loud. */
export function normaliseSummary(summary: string): string {
  const flattened = summary.replace(/\s+/g, " ").trim().replace(/!+/g, ".");
  const words = flattened.split(" ").filter(Boolean);
  if (words.length <= SUMMARY_WORD_CAP) return flattened;
  return `${words.slice(0, SUMMARY_WORD_CAP).join(" ").replace(/[,;:]$/, "")}…`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normaliseReasons(
  raw: Reason[],
  criteria: readonly string[] | undefined,
): { reasons: Reason[]; missing: string[]; dropped: string[] } {
  // First occurrence of a criterion wins: a model that repeats itself has said
  // its piece once, and a later contradictory entry is noise.
  const byId = new Map<string, Reason>();
  const dropped: string[] = [];
  for (const reason of raw) {
    const id = reason.criterion.trim();
    if (id === "") continue;
    if (criteria && !criteria.includes(id)) {
      dropped.push(id);
      continue;
    }
    if (byId.has(id)) continue;
    byId.set(id, { criterion: id, met: reason.met, note: reason.note.trim() });
  }

  if (!criteria) {
    return { reasons: [...byId.values()], missing: [], dropped };
  }

  const missing: string[] = [];
  const reasons: Reason[] = [];
  for (const id of criteria) {
    const found = byId.get(id);
    if (found) {
      reasons.push(found);
      continue;
    }
    missing.push(id);
    reasons.push({ criterion: id, met: false, note: MISSING_CRITERION_NOTE });
  }
  return { reasons, missing, dropped };
}

function normaliseScores(
  raw: Record<string, number>,
  criteria: readonly string[] | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = key.trim();
    if (id === "") continue;
    if (criteria && !criteria.includes(id)) continue;
    out[id] = Math.round(clamp(Number(value), 0, 100));
  }
  if (criteria) {
    for (const id of criteria) if (!(id in out)) out[id] = 0;
  }
  return out;
}

function normaliseFlags(raw: string[]): ReviewFlag[] {
  const allowed = new Set<string>(REVIEW_FLAGS);
  return uniqueStrings(raw).filter((f): f is ReviewFlag => allowed.has(f));
}

function normalise(parsed: VerdictWire, opts: ParseVerdictOptions): VerdictOutput {
  const { reasons, missing } = normaliseReasons(parsed.reasons, opts.criteria);
  const flags = normaliseFlags(parsed.flags);
  if (missing.length > 0 && !flags.includes("needs_human")) flags.push("needs_human");

  const rubricScores = normaliseScores(parsed.rubricScores, opts.criteria);
  // A clause the reviewer never addressed has no trustworthy score. Leaving
  // the model's number beside "the reviewer did not address this clause"
  // would put a contradiction in front of the instructor reading the queue.
  for (const id of missing) rubricScores[id] = 0;

  return {
    verdict: parsed.verdict,
    confidence: clamp(Number(parsed.confidence), 0, 1),
    reasons,
    rubricScores,
    contradictions: uniqueStrings(parsed.contradictions),
    flags,
    summaryForStudent: normaliseSummary(parsed.summaryForStudent),
  };
}

/**
 * Repair, validate, normalise. Throws only when there is no JSON object in the
 * reply at all or the shape is unusable — the caller (the gateway) retries once
 * with the validation error appended before giving up.
 */
export function parseVerdict(raw: unknown, opts: ParseVerdictOptions = {}): VerdictOutput {
  const json = extractJson(raw);
  const parsed = verdictOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`parseVerdict: ${parsed.error.message}`);
  }
  return normalise(parsed.data, opts);
}

/** The same, for the escalation tier's two extra fields. */
export function parseEscalation(
  raw: unknown,
  opts: ParseVerdictOptions = {},
): EscalationOutput {
  const json = extractJson(raw);
  const parsed = escalationOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`parseEscalation: ${parsed.error.message}`);
  }
  return {
    ...normalise(parsed.data, opts),
    agreesWithFirstVerdict: parsed.data.agreesWithFirstVerdict,
    humanNote: parsed.data.humanNote.trim(),
  };
}

// ---------------------------------------------------------------------------
// The trust rules
// ---------------------------------------------------------------------------

export type OutcomeContext = {
  /** 1 on a first submission. The perfect-score outlier rule is attempt 1 only. */
  attempt: number;
  /** The previous attempt's rubricScores, when there was one. */
  priorScores?: Record<string, number> | null;
};

export type Outcome = {
  verdict: "pass" | "return";
  /**
   * True means a human decides before this counts. A `pass` with
   * `needsHuman: true` is still returned as a pass — the PIPELINE holds the
   * gate closed until the review is resolved, so the reviewer's judgement is
   * recorded honestly and the student is not told they cleared anything.
   */
  needsHuman: boolean;
  /** Every rule that fired, in the order checked. Shown in the instructor queue. */
  needsHumanReasons: string[];
};

/** A jump this large from a returned attempt into a pass is worth a look. */
const SUSPICIOUS_SCORE_JUMP = 50;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function decideOutcome(v: VerdictOutput, ctx: OutcomeContext): Outcome {
  const reasons: string[] = [];
  const scores = Object.values(v.rubricScores);

  if (v.confidence < CONFIDENCE_FLOOR) {
    reasons.push(`confidence ${v.confidence.toFixed(2)} is below ${CONFIDENCE_FLOOR}`);
  }
  if (v.contradictions.length > 0) {
    reasons.push(
      `the write-up contradicts the evidence: ${v.contradictions.join(" | ")}`,
    );
  }
  if (v.flags.includes("needs_human")) {
    reasons.push("the reviewer flagged this for a human");
  }
  if (v.flags.includes("unsafe_content")) {
    reasons.push("the reviewer flagged unsafe content");
  }
  if (v.flags.includes("spam")) {
    reasons.push("the reviewer flagged spam, which scores zero on distribution and is never returned quietly");
  }
  if (scores.length > 0 && ctx.attempt <= 1 && scores.every((s) => s >= OUTLIER_HIGH)) {
    reasons.push(`every rubric score is ${OUTLIER_HIGH} or above on the first attempt`);
  }
  if (scores.length > 0 && scores.every((s) => s <= OUTLIER_LOW)) {
    reasons.push(`every rubric score is ${OUTLIER_LOW} or below, which reads as a failed read rather than a submission`);
  }
  if (v.verdict === "pass" && v.reasons.some((r) => !r.met)) {
    reasons.push(
      "the reviewer passed a submission while marking a bar clause unmet, which the pass rule does not allow",
    );
  }
  if (ctx.priorScores && Object.keys(ctx.priorScores).length > 0 && v.verdict === "pass") {
    const jump = mean(scores) - mean(Object.values(ctx.priorScores));
    if (jump >= SUSPICIOUS_SCORE_JUMP) {
      reasons.push(
        `scores jumped ${Math.round(jump)} points from the previous attempt into a pass`,
      );
    }
  }

  return { verdict: v.verdict, needsHuman: reasons.length > 0, needsHumanReasons: reasons };
}

/**
 * Does this verdict actually clear the gate? The one line the pipeline needs:
 * a pass that is waiting on a human has not cleared anything yet (SPEC §6).
 */
export function clearsGate(outcome: Outcome): boolean {
  return outcome.verdict === "pass" && !outcome.needsHuman;
}
