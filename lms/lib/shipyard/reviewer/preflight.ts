// Pre-flight: everything that can be decided before a model is asked anything.
//
// SPEC §6 describes pre-flight as a cheap-tier model call on every submission.
// In practice three of its four jobs are not model work at all — link liveness
// is a HEAD request, text extraction is a parser, and near-duplicate detection
// is a set comparison — and the fourth, blank-or-spam, is unambiguous for all
// but a handful of submissions. So the heuristics run first and the model is
// asked only when they cannot decide. The budget in SPEC §6.5 still holds as
// an upper bound: we spend less than it, never more. (docs/DECISIONS.md,
// 2026-09-15.)
//
// Pure except for the injected `probe`. No Prisma, no network of its own.

import type { ShipyardCheckpointKey } from "@prisma/client";
import type { FieldSpec, SubmissionFields } from "../fields";
import type { BuiltPrompt, PreflightClassification, PreflightOutput } from "./schemas";
import { buildPreflightPrompt } from "./prompts";

/** A required text field shorter than this has not been answered. */
export const BLANK_FIELD_CHARS = 20;

/** Shingled Jaccard at or above this is the same submission again. */
export const NEAR_DUP_THRESHOLD = 0.9;
/** Word n-gram width. Five is long enough that ordinary phrasing collides rarely. */
export const SHINGLE_SIZE = 5;
/** Below this much total text the blank call is the model's, not ours. */
const AMBIGUOUS_TEXT_CEILING = 200;

export type LinkStatus = { url: string; alive: boolean; status?: number };

export type ProbeFn = (url: string) => Promise<{ alive: boolean; status?: number }>;

export type PriorSubmission = { id: string; text: string };

export type PreflightInput = {
  checkpointKey: ShipyardCheckpointKey;
  /** Already through ./anonymise. */
  fields: SubmissionFields;
  /** The checkpoint's field schema — which keys are URLs and which are required. */
  fieldSpecs: FieldSpec[];
  /** Text pulled out of attached PDFs and text files by ./context. */
  extractedText?: string;
  /**
   * The headless render's visible text, when there was one. Pre-flight does
   * not judge it — it only scans it for reviewer-contract language, because a
   * page the student controls is the easiest place to hide an instruction.
   */
  domText?: string;
  /**
   * Earlier submissions to compare against. The pipeline passes OTHER
   * students' submissions on the same checkpoint; a student's own resubmission
   * is supposed to look like the last one and must never be flagged.
   */
  priorSubmissions?: PriorSubmission[];
  /** The pipeline passes safe-fetch's `probeUrl`, wrapped. */
  probe: ProbeFn;
};

export type PreflightRun = {
  preflight: PreflightOutput;
  /** True when the heuristics could not call blank-or-spam and a model should. */
  ambiguous: boolean;
  ambiguityNotes: string[];
  /** The concatenated text the model would be shown, if it is asked. */
  text: string;
};

// ---------------------------------------------------------------------------
// The pure pieces
// ---------------------------------------------------------------------------

/** Every text value in the submission, joined — the blank/spam/dup input. */
export function submissionText(fields: SubmissionFields, extractedText = ""): string {
  const parts: string[] = [];
  for (const value of Object.values(fields ?? {})) {
    if (typeof value === "string") parts.push(value);
    else if (typeof value === "number") parts.push(String(value));
  }
  if (extractedText) parts.push(extractedText);
  return parts.join("\n").trim();
}

function normaliseForShingles(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function shingles(text: string, size: number = SHINGLE_SIZE): Set<string> {
  const words = normaliseForShingles(text);
  const out = new Set<string>();
  if (words.length === 0) return out;
  if (words.length < size) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + size <= words.length; i++) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

/** Jaccard over word shingles. 1 is identical, 0 shares nothing. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function findNearDuplicate(
  text: string,
  priors: PriorSubmission[],
  threshold: number = NEAR_DUP_THRESHOLD,
): { id: string; similarity: number } | null {
  const mine = shingles(text);
  if (mine.size === 0) return null;
  let best: { id: string; similarity: number } | null = null;
  for (const prior of priors) {
    const similarity = jaccard(mine, shingles(prior.text));
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: prior.id, similarity };
    }
  }
  return best;
}

/** Required text fields that came back effectively empty. */
export function blankFields(fields: SubmissionFields, specs: FieldSpec[]): string[] {
  const out: string[] = [];
  for (const spec of requiredTextSpecs(specs)) {
    const value = fields[spec.key];
    const length = typeof value === "string" ? value.trim().length : 0;
    if (length < BLANK_FIELD_CHARS) out.push(spec.key);
  }
  return out;
}

function requiredTextSpecs(specs: FieldSpec[]): FieldSpec[] {
  return specs.filter(
    (spec) => spec.required && (spec.kind === "text" || spec.kind === "textarea"),
  );
}

/**
 * Blank means NOTHING was answered — every required text field is under the
 * floor. One short field among several full ones is a bad answer, which is the
 * reviewer's job to return, not pre-flight's job to intercept. A product name
 * is legitimately ten characters long and must never make a submission blank.
 */
export function isBlankSubmission(fields: SubmissionFields, specs: FieldSpec[]): boolean {
  const required = requiredTextSpecs(specs);
  if (required.length === 0) return false;
  return blankFields(fields, specs).length === required.length;
}

const SPAM_PHRASES = [
  "buy followers",
  "click here to earn",
  "work from home and earn",
  "limited time offer",
  "make money fast",
  "crypto signals",
  "telegram channel for free",
  "whatsapp me for 100% guaranteed",
];

export type SpamSignal = { spam: boolean; confident: boolean; notes: string[] };

// ---------------------------------------------------------------------------
// Prompt injection, as a code-side finding
// ---------------------------------------------------------------------------

/**
 * Phrases that belong to the REVIEWER'S CONTRACT and have no business in a
 * student's answer, in the render of their page, or in a PDF they attached.
 *
 * This is a detector, not a filter: nothing is removed and nothing is
 * rejected. A submission that trips it goes to a human with the reason
 * attached, because "this looks like an attempt to instruct the reviewer" is
 * an accusation, and because the honest cases — a student building a product
 * ABOUT prompt injection, a screenshot of their own LLM app — are real and
 * deserve a person rather than a heuristic.
 *
 * Words like "verdict" and "confidence" are ordinary English, so each entry
 * below is a phrase with contract-shaped company around it, not a bare word.
 */
export const INJECTION_PHRASES: readonly RegExp[] = [
  /\bignore (?:all |any )?(?:the )?previous(?: instructions| prompts?| rules?)?\b/i,
  /\bignore (?:everything|anything) (?:above|before)\b/i,
  /\bdisregard (?:the |all )?(?:above|previous|prior|earlier)\b/i,
  /\bas the reviewer\b/i,
  /\byou are the reviewer\b/i,
  /\b(?:set|return|output|reply with|give)\s+(?:the\s+)?(?:a\s+)?verdict\b/i,
  /\bverdict\s*[:=]\s*["'`]?(?:pass|return)\b/i,
  /\brubric_?scores?\b/i,
  /\bsummary_?for_?student\b/i,
  /\bneeds_human\b/i,
  /\bconfidence\s*[:=]\s*(?:0?\.\d+|1(?:\.0+)?)\b/i,
  /\bsystem prompt\b/i,
  /\b(?:new|updated) instructions?\s*[:\-]/i,
  /<\s*\/\s*(?:submission|headless_render|extracted_text|tracker_signals|product|text)\b/i,
];

export type InjectionSignal = {
  suspected: boolean;
  /** Which fields or sources the phrases came from, for the human queue. */
  notes: string[];
};

export const INJECTION_REASON = "possible prompt injection";

/**
 * Scan every student-derived string for the phrases above. `sources` is a map
 * of a human-readable origin ("the render's visible text", "field: whyNow") to
 * the text, so the note names WHERE it was found — an instructor reading the
 * queue needs to know whether it came from the write-up or from the page.
 */
export function detectInjection(
  sources: Readonly<Record<string, string | null | undefined>>,
): InjectionSignal {
  const notes: string[] = [];
  for (const [origin, raw] of Object.entries(sources)) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const hits: string[] = [];
    for (const pattern of INJECTION_PHRASES) {
      const found = raw.match(pattern);
      if (found) hits.push(found[0].replace(/\s+/g, " ").trim().slice(0, 60));
      if (hits.length >= 3) break;
    }
    if (hits.length > 0) {
      notes.push(`${origin} contains reviewer-contract language: "${hits.join('", "')}"`);
    }
  }
  return { suspected: notes.length > 0, notes };
}

/**
 * A blunt instrument on purpose. It is allowed to say "obviously spam" and
 * "obviously not"; anything in between is handed to the model, which is the
 * only reason the model is ever called here.
 */
export function spamSignal(text: string): SpamSignal {
  const notes: string[] = [];
  const lowered = text.toLowerCase();
  const words = normaliseForShingles(text);
  const urls = text.match(/https?:\/\/\S+/g) ?? [];

  const phraseHits = SPAM_PHRASES.filter((p) => lowered.includes(p));
  if (phraseHits.length >= 2) {
    notes.push(`marketing phrases: ${phraseHits.join(", ")}`);
    return { spam: true, confident: true, notes };
  }

  // A wall of links with almost no prose around them.
  if (urls.length >= 5 && words.length < urls.length * 8) {
    notes.push(`${urls.length} links and only ${words.length} words around them`);
    return { spam: true, confident: true, notes };
  }

  // One long repeated token, the signature of keyboard filler.
  const unique = new Set(words);
  if (words.length >= 40 && unique.size <= words.length * 0.12) {
    notes.push(`${unique.size} distinct words in ${words.length}`);
    return { spam: true, confident: true, notes };
  }

  if (phraseHits.length === 1) {
    notes.push(`one marketing phrase ("${phraseHits[0]}") in otherwise ordinary text`);
    return { spam: false, confident: false, notes };
  }
  return { spam: false, confident: true, notes };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function urlValues(fields: SubmissionFields, specs: FieldSpec[]): string[] {
  const out: string[] = [];
  for (const spec of specs) {
    if (spec.kind !== "url") continue;
    const value = fields[spec.key];
    if (typeof value === "string" && value.trim() !== "") out.push(value.trim());
  }
  return out;
}

/**
 * The heuristic half. Always runs, costs nothing, and produces the whole
 * PreflightOutput except where `ambiguous` says the model should be asked.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightRun> {
  const notes: string[] = [];
  const text = submissionText(input.fields, input.extractedText);

  // 1 · Link liveness, one probe per URL field, in parallel.
  const urls = urlValues(input.fields, input.fieldSpecs);
  const linkStatuses: LinkStatus[] = await Promise.all(
    urls.map(async (url) => {
      try {
        const result = await input.probe(url);
        return { url, alive: result.alive, status: result.status };
      } catch (err) {
        notes.push(
          `${url} could not be reached: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { url, alive: false };
      }
    }),
  );
  for (const link of linkStatuses) {
    if (!link.alive) {
      notes.push(`${link.url} did not respond${link.status ? ` (${link.status})` : ""}`);
    }
  }

  // 2 · Blank.
  const blanks = blankFields(input.fields, input.fieldSpecs);
  const isBlank = isBlankSubmission(input.fields, input.fieldSpecs);
  if (blanks.length > 0) {
    notes.push(
      `required field${blanks.length === 1 ? "" : "s"} under ${BLANK_FIELD_CHARS} characters: ${blanks.join(", ")}`,
    );
  }

  // 3 · Spam.
  const spam = spamSignal(text);
  notes.push(...spam.notes);

  // 4 · Near-duplicate.
  const dup = findNearDuplicate(text, input.priorSubmissions ?? []);
  if (dup) {
    notes.push(`near-duplicate of submission ${dup.id} (similarity ${dup.similarity.toFixed(2)})`);
  }

  // 5 · Prompt injection. Never blocks — it routes to a human (SEC-3).
  const injectionSources: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    if (typeof value === "string") injectionSources[`field ${key}`] = value;
  }
  if (input.extractedText) injectionSources["the text extracted from attachments"] = input.extractedText;
  if (input.domText) injectionSources["the render's visible text"] = input.domText;
  const injection = detectInjection(injectionSources);
  notes.push(...injection.notes);

  const ambiguityNotes: string[] = [];
  if (!spam.confident) ambiguityNotes.push("the spam heuristic was inconclusive");
  if (!isBlank && text.length > 0 && text.length < AMBIGUOUS_TEXT_CEILING) {
    ambiguityNotes.push(
      `every required field is filled but the whole submission is only ${text.length} characters`,
    );
  }

  const preflight: PreflightOutput = {
    linkStatuses,
    isBlank,
    isSpam: spam.spam,
    nearDuplicateOf: dup?.id,
    suspectedInjection: injection.suspected || undefined,
    extractedText: input.extractedText ?? "",
    notes,
  };

  return { preflight, ambiguous: ambiguityNotes.length > 0, ambiguityNotes, text };
}

// ---------------------------------------------------------------------------
// The model half — only when the heuristics could not decide
// ---------------------------------------------------------------------------

export type PreflightModelCall = (
  prompt: BuiltPrompt,
) => Promise<PreflightClassification>;

/**
 * Ask the cheap tier to settle blank-or-spam. The call is INJECTED: this
 * module never imports the gateway, so the reviewer core stays testable with
 * no key and no network. The pipeline passes a closure over `callStructured`
 * with `task: "preflight"`.
 *
 * The model can only ever ADD a blank or spam finding, never remove one the
 * heuristics were confident about — a dead-obvious spam submission does not
 * get talked out of it by a cheap model.
 */
export async function classifyWithModel(
  run: PreflightRun,
  args: { checkpointKey: ShipyardCheckpointKey; call: PreflightModelCall },
): Promise<PreflightOutput> {
  if (!run.ambiguous) return run.preflight;

  const prompt = buildPreflightPrompt({
    checkpointKey: args.checkpointKey,
    text: run.text,
    ambiguityNotes: run.ambiguityNotes,
  });

  try {
    const classification = await args.call(prompt);
    return {
      ...run.preflight,
      isBlank: run.preflight.isBlank || classification.isBlank,
      isSpam: run.preflight.isSpam || classification.isSpam,
      notes: [...run.preflight.notes, `pre-flight classifier: ${classification.note}`],
    };
  } catch (err) {
    // A failed pre-flight call is not a failed review. The heuristics stand
    // and the verdict tier decides, as it would have anyway.
    return {
      ...run.preflight,
      notes: [
        ...run.preflight.notes,
        `pre-flight classifier unavailable: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
