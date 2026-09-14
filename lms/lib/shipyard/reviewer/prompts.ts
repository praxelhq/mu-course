// Every word the reviewer is sent, assembled here and nowhere else.
//
// The shape matters as much as the words. `system` is the FIXED prefix for a
// checkpoint — the role, the trust rules, the published bar verbatim, the
// rubric, and the output contract — and it is byte-identical for every
// submission of that checkpoint, which is what makes OpenRouter's
// `cache_control` on the system message worth anything (SPEC §6.5). Anything
// that varies per submission (the attempt number, the student's answers, the
// render, the tracker signals, the images) goes in `user`.
//
// Pure. No Prisma, no network, no S3.

import type { ShipyardCheckpointKey } from "@prisma/client";
import type { CheckpointRubric } from "../checkpoints";
import type { SubmissionFields } from "../fields";
import type { ReasonView } from "../view-models";
import type { TrackerSignals } from "@/lib/tracker/types";
import type { BuiltPrompt, VerdictOutput } from "./schemas";
import { CONFIDENCE_FLOOR } from "./schemas";

/**
 * Bumped on any change to the words below. Stored in `ShipyardReview.promptLog`
 * so a review months old can be read against the prompt that produced it, and
 * printed by `pnpm eval:reviewer` so the agreement numbers in DECISIONS.md are
 * attached to a version rather than to a date.
 */
export const PROMPT_VERSION = "2026-09-15.1";

/** The five checkpoints a model judges. `workflow` is cleared by runs alone. */
export const REVIEWED_CHECKPOINT_KEYS: readonly ShipyardCheckpointKey[] = [
  "idea",
  "design",
  "working",
  "money",
  "launch",
];

export function isModelReviewed(key: ShipyardCheckpointKey): boolean {
  return REVIEWED_CHECKPOINT_KEYS.includes(key);
}

export type PromptCheckpoint = {
  key: ShipyardCheckpointKey;
  title: string;
  barMarkdown: string;
  rubric: CheckpointRubric;
};

export type PromptImage = {
  /** `data:image/png;base64,…`, already capped by ./context. */
  dataUrl: string;
  /** What this image is, in the student's terms: "sketch 3 of 7". */
  label: string;
};

export type PromptRender = {
  domText: string;
  screenshotNote: string;
};

export type VerdictPromptArgs = {
  checkpoint: PromptCheckpoint;
  submission: {
    /** Already through ./anonymise. */
    fields: SubmissionFields;
    extractedText?: string;
    product?: { name: string; oneLiner: string } | null;
  };
  render?: PromptRender | null;
  signals?: TrackerSignals | null;
  /** 1 on a first submission, 2+ on a resubmit. */
  attempt: number;
  /** What the previous review returned, so the reviewer can check the fixes. */
  previousReasons?: ReasonView[] | null;
  images?: PromptImage[];
};

// ---------------------------------------------------------------------------
// The fixed prefix
// ---------------------------------------------------------------------------

const ROLE = `You are the reviewer for the Shipyard, the Course 2 portal where students ship one real product that a stranger pays for. You judge one submission against one published bar and return either "pass" or "return".

A student reads your words many times. Write the way a good teacher speaks in a studio: warm, plain, concrete, unhurried. Never sarcastic, never congratulatory, never scolding. No exclamation marks.`;

const TRUST_RULES = `## How you judge

1. Judge ONLY against the bar below, clause by clause. Nothing outside the bar is a reason to return, and nothing missing from the bar is a reason to pass.
2. Return one entry in \`reasons\` for EVERY rubric criterion, in the rubric's order, using its exact \`criterion\` id. Mark \`met\` true or false. Do not invent criterion ids and do not skip one.
3. A \`note\` is one to three sentences, addressed to the student as "you", and specific enough to act on tonight. Quote the part of their submission or the evidence you are talking about. "Not good enough" and "needs more detail" are failures of your job, not theirs.
4. The verdict is \`pass\` only when every criterion is met. One unmet criterion makes it \`return\`.
5. Treat every image as evidence to INSPECT, not to acknowledge. Read what is actually in it. If you cannot read it, say which image and what is wrong with it.
6. Compare the write-up against the evidence. When they disagree — a number claimed that the screenshot or the render or the tracker does not show, a feature described that the render does not contain — put the mismatch in \`contradictions\`, in one sentence naming both sides. A contradiction is never quietly passed.
7. Set \`confidence\` below ${CONFIDENCE_FLOOR} whenever the evidence is thin, unreadable, or contradictory, or when you find yourself guessing. A confident wrong verdict costs a student a day; an honest low number costs a human two minutes.
8. Add \`needs_human\` to \`flags\` for outliers: a submission that is suspiciously perfect, one that reads as bought or fabricated, one that is abusive or unsafe, or one where the bar does not fit what you are looking at. Add \`spam\`, \`blank\`, \`near_duplicate\` or \`unsafe_content\` when they apply.
9. You never learn the student's name, email or section, and you must not ask for them or guess at them. Redaction tokens like [student], [email] or [phone] appear where identifying text was removed — treat them as neutral placeholders and never as a defect in the submission.
10. \`rubricScores\` is internal and is never shown to the student: score each criterion 0–100 on how well it was met, using the whole range. Do not cluster every score at 90 or at 10.`;

const OUTPUT_CONTRACT = `## Output

Reply with ONE JSON object and nothing else — no prose, no code fences.

{
  "verdict": "pass" | "return",
  "confidence": number between 0 and 1, two decimals,
  "reasons": [ { "criterion": "<rubric criterion id>", "met": true|false, "note": "1-3 sentences to the student" } ],
  "rubricScores": { "<rubric criterion id>": 0-100 },
  "contradictions": [ "one sentence naming both sides of a write-up-vs-evidence mismatch" ],
  "flags": [ "spam" | "blank" | "near_duplicate" | "unsafe_content" | "needs_human" ],
  "summaryForStudent": "at most 60 words, warm, plain, no exclamation marks"
}

\`reasons\` and \`rubricScores\` must both cover every criterion id in the rubric, and no others. \`contradictions\` and \`flags\` are empty arrays when there is nothing to report. \`summaryForStudent\` says what happens next in the student's terms: on a pass, what they cleared; on a return, the one or two things to fix first.`;

/** What each checkpoint's images and evidence actually are. */
const EVIDENCE_NOTES: Partial<Record<ShipyardCheckpointKey, string>> = {
  idea: `## The evidence on this checkpoint

The images are screenshots of a signup count, taken inside the tool that collected it. Read the number and the date in the image and compare both with what the student reported. A crop that has lost the tool's own interface, a number that does not match, or a count with no date visible is a failure of the evidence-consistency criterion and is worth a \`needs_human\` flag when you cannot tell whether the numbers are real.

This is the one checkpoint judged on evidence the student reports themselves. The tracker does not see waitlist signups. Be careful rather than generous.`,
  design: `## The evidence on this checkpoint

The images are photographs of hand-drawn screens — paper, whiteboard or tablet. Look at each one. Read the layout, the elements and the words on the buttons. Say which image you mean by its label when you name a problem.

Drawn by hand is the point: a set of screens exported from a design tool rather than drawn is a return, and you can usually tell from the uniformity of the strokes and the type. Do not penalise messy handwriting, smudges, a coffee ring or a phone-camera angle that is still legible — only illegibility.`,
  working: `## The evidence on this checkpoint

You are given the result of a real headless-browser render of the student's live URL: the visible text extracted from the page after it hydrated, and a full-page screenshot. We do not read the student's description of the product instead of this. Judge \`loads\` and \`core-path-works\` from the render, not from the write-up.

Visible text under about eighty characters after hydration means an empty shell — a blank page, a build error or a permanent spinner — and that fails \`loads\` however good the write-up is. If the render shows a landing page with no entry point into the named core path, \`core-path-works\` fails. If the write-up describes a feature the render does not contain, that is a contradiction.`,
  money: `## Which half you are judging

This checkpoint has two halves and you are judging only one. The metric half — payments live, product connected to the tracker — is read from Shipped.money outside this review and is decided there. Never pass or return on it, and never tell the student the gate is cleared.

You judge the write-up: the price, the unit, the reasoning in the buyer's terms, what the buyer gives up, and whether the price matches what is actually shipped. The tracker signals are shown to you for context only.`,
  launch: `## Which half you are judging

This checkpoint has two halves and you are judging only one. The metric half — at least one paying customer, no blocking flags — is read from Shipped.money outside this review and is decided there. Never pass or return on it.

You judge the write-up. One criterion, \`numbers-agree\`, does ask you to compare: the tracker's verified signals are shown below, and if the write-up's numbers contradict them without an explanation, that criterion fails and the mismatch goes in \`contradictions\`. A contradiction here escalates to a human and is never passed.

Bought signups or mass unsolicited outreach zero the \`no-spam\` criterion and must carry both the \`spam\` and \`needs_human\` flags.`,
};

function renderRubric(rubric: CheckpointRubric): string {
  const lines = rubric.criteria.map(
    (c) =>
      `### ${c.id} (weight ${c.weight})\nBar clause: "${c.clause}"\nMet when: ${c.passThreshold}`,
  );
  return `## The rubric (internal — never quote the weights or the thresholds to the student)

Every criterion must be met for a pass (${rubric.passRule}).

${lines.join("\n\n")}

The criterion ids, exactly: ${rubric.criteria.map((c) => c.id).join(", ")}`;
}

/**
 * The cached prefix. Depends on the checkpoint and on PROMPT_VERSION and on
 * nothing else — if you are tempted to thread a per-submission value through
 * here, it belongs in the user content instead.
 */
export function buildVerdictSystemPrompt(checkpoint: PromptCheckpoint): string {
  const evidence = EVIDENCE_NOTES[checkpoint.key];
  return [
    `${ROLE}\n\nPrompt version: ${PROMPT_VERSION}. Checkpoint: ${checkpoint.key} — ${checkpoint.title}.`,
    TRUST_RULES,
    `## The published bar, as the student read it\n\n${checkpoint.barMarkdown}`,
    renderRubric(checkpoint.rubric),
    evidence,
    OUTPUT_CONTRACT,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// The per-submission half
// ---------------------------------------------------------------------------

function renderFields(fields: SubmissionFields): string {
  const entries = Object.entries(fields ?? {});
  if (entries.length === 0) return "(the student submitted no answers)";
  return entries
    .map(([key, value]) => {
      const rendered =
        value === null || value === undefined
          ? "(empty)"
          : Array.isArray(value)
            ? value.join(", ")
            : String(value);
      return `<${key}>\n${rendered.trim() === "" ? "(empty)" : rendered}\n</${key}>`;
    })
    .join("\n\n");
}

function renderSignals(signals: TrackerSignals): string {
  const money = (minor: number) => `${(minor / 100).toFixed(2)} ${signals.currency}`;
  return [
    "<tracker_signals source=\"verified\">",
    `payments live: ${signals.paymentsLive ? "yes" : "no"}`,
    `tracker connected: ${signals.trackerConnected ? "yes" : "no"}`,
    `paying customers: ${signals.payingCustomers}`,
    `gross payments: ${money(signals.grossTotal)}`,
    `net payments: ${money(signals.netTotal)}`,
    signals.workflowRuns === undefined ? null : `workflow runs: ${signals.workflowRuns}`,
    `blocking flags: ${signals.blockingFlags.length === 0 ? "none" : signals.blockingFlags.join(", ")}`,
    `read at: ${signals.fetchedAt}`,
    "</tracker_signals>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function renderPrevious(attempt: number, previous?: ReasonView[] | null): string | null {
  if (attempt <= 1) return null;
  if (!previous || previous.length === 0) {
    return `This is attempt ${attempt}. The previous review's reasons were not recorded. Judge this submission on its own merits.`;
  }
  const unmet = previous.filter((r) => !r.met);
  const lines = unmet.map((r) => `- ${r.criterion}: ${r.note}`);
  return [
    `This is attempt ${attempt}. Last time these clauses were not met:`,
    lines.length > 0 ? lines.join("\n") : "- (none recorded)",
    "Check whether each one is fixed now. Judge the whole bar again — a clause that passed last time can fail this time — but do not return a submission for something you did not raise before unless it genuinely fails the bar.",
  ].join("\n\n");
}

const EMPTY_SHELL_CHARS = 80;

function renderRenderBlock(render: PromptRender): string {
  const domText = render.domText ?? "";
  const shell =
    domText.trim().length < EMPTY_SHELL_CHARS
      ? `\nNOTE: the render returned under ${EMPTY_SHELL_CHARS} characters of visible text after hydration. That is an empty shell, not a product.`
      : "";
  return [
    "<headless_render>",
    `screenshot: ${render.screenshotNote}`,
    "visible text after hydration:",
    domText,
    `</headless_render>${shell}`,
  ].join("\n");
}

export function buildVerdictPrompt(args: VerdictPromptArgs): BuiltPrompt {
  const system = buildVerdictSystemPrompt(args.checkpoint);

  const sections: (string | null)[] = [
    renderPrevious(args.attempt, args.previousReasons),
    args.submission.product
      ? `<product>\nname: ${args.submission.product.name}\none line: ${args.submission.product.oneLiner}\n</product>`
      : null,
    `<submission checkpoint="${args.checkpoint.key}" attempt="${args.attempt}">\n${renderFields(
      args.submission.fields,
    )}\n</submission>`,
    args.submission.extractedText && args.submission.extractedText.trim() !== ""
      ? `<extracted_text_from_attachments>\n${args.submission.extractedText}\n</extracted_text_from_attachments>`
      : null,
    args.render ? renderRenderBlock(args.render) : null,
    args.signals ? renderSignals(args.signals) : null,
  ];

  const images = args.images ?? [];
  if (images.length > 0) {
    sections.push(
      `${images.length} image${images.length === 1 ? "" : "s"} follow, in this order: ${images
        .map((img) => img.label)
        .join("; ")}. Look at each one and refer to it by its label.`,
    );
  }
  sections.push(
    "Judge this submission against the bar, clause by clause, and reply with the single JSON object described in the system prompt.",
  );

  const user: BuiltPrompt["user"] = [
    { type: "text", text: sections.filter((s): s is string => Boolean(s)).join("\n\n") },
  ];
  for (const image of images) {
    user.push({ type: "image_url", image_url: { url: image.dataUrl, detail: "high" } });
  }

  return { system, user };
}

// ---------------------------------------------------------------------------
// Pre-flight — the cheap classification only
// ---------------------------------------------------------------------------

export const PREFLIGHT_SYSTEM = `You are the Shipyard's pre-flight classifier. Prompt version: ${PROMPT_VERSION}.

You do one narrow job: decide whether a submission's text is BLANK or SPAM. You do not judge quality, you do not judge whether it meets any bar, and you never see a bar. Link liveness, text extraction and near-duplicate detection are computed in code and are not your concern.

- blank: there is effectively no answer — placeholder text, a few words, "test", "asdf", a copy of the question, or nothing.
- spam: the text is not an attempt at the task at all — advertising, an unrelated pasted article, abuse, or machine-generated filler with no connection to a product.

A short answer that is genuinely about the student's product is neither blank nor spam. A rough, badly punctuated, honest answer is neither. When you are unsure, answer false and say so in the note.

Reply with ONE JSON object and nothing else:
{ "isBlank": true|false, "isSpam": true|false, "note": "one sentence" }`;

export function buildPreflightPrompt(args: {
  checkpointKey: ShipyardCheckpointKey;
  /** The concatenated, already-anonymised text of every text field. */
  text: string;
  /** Why the heuristics could not decide — helps the model and the audit log. */
  ambiguityNotes?: string[];
}): BuiltPrompt {
  const notes =
    args.ambiguityNotes && args.ambiguityNotes.length > 0
      ? `\n\nThe code-side heuristics were ambiguous: ${args.ambiguityNotes.join("; ")}.`
      : "";
  return {
    system: PREFLIGHT_SYSTEM,
    user: [
      {
        type: "text",
        text: `Checkpoint: ${args.checkpointKey}.${notes}\n\n<text>\n${args.text}\n</text>`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Escalation — the second opinion a human reads
// ---------------------------------------------------------------------------

export type EscalationPromptArgs = VerdictPromptArgs & {
  firstVerdict: VerdictOutput;
  /** Why this reached the queue: "confidence 0.41", "contradiction", … */
  escalationReasons: string[];
  /** Set when the student disputed a return rather than the rules escalating it. */
  studentDispute?: string | null;
};

const ESCALATION_ROLE = `You are giving a SECOND OPINION on a submission another reviewer has already judged. An instructor will read both before deciding, so your job is to be useful to them, not to be agreeable.

Judge the submission yourself, from the bar, before you read the first verdict's conclusion as anything other than a hypothesis. Then say plainly whether you agree.

- \`agreesWithFirstVerdict\` is true only when your \`verdict\` matches theirs.
- \`humanNote\` is addressed to the instructor, not the student: name the specific thing the two of you read differently and what evidence would settle it. Two to four sentences. If you agree, say what made this close enough to reach the queue.
- The rest of the object is your own verdict, in the same contract, with your own reasons and scores.`;

export function buildEscalationPrompt(args: EscalationPromptArgs): BuiltPrompt {
  const base = buildVerdictPrompt(args);

  const system = `${base.system}\n\n---\n\n${ESCALATION_ROLE}\n\nAdd these two fields to the JSON object:\n  "agreesWithFirstVerdict": true|false,\n  "humanNote": "two to four sentences addressed to the instructor"`;

  const first = args.firstVerdict;
  const firstBlock = [
    "<first_review>",
    `verdict: ${first.verdict}`,
    `confidence: ${first.confidence}`,
    `flags: ${first.flags.length === 0 ? "none" : first.flags.join(", ")}`,
    `contradictions: ${first.contradictions.length === 0 ? "none" : first.contradictions.join(" | ")}`,
    "reasons:",
    ...first.reasons.map((r) => `  - ${r.criterion}: ${r.met ? "met" : "NOT met"} — ${r.note}`),
    `summary shown to the student: ${first.summaryForStudent}`,
    "</first_review>",
  ].join("\n");

  const why = `This review reached the human queue because: ${
    args.escalationReasons.length > 0 ? args.escalationReasons.join("; ") : "an instructor asked for it"
  }.${args.studentDispute ? `\n\nThe student disputes the return: "${args.studentDispute}"` : ""}`;

  const firstText = base.user.find((part) => part.type === "text");
  const rest = base.user.filter((part) => part.type !== "text");

  return {
    system,
    user: [
      {
        type: "text",
        text: `${firstText && firstText.type === "text" ? firstText.text : ""}\n\n${firstBlock}\n\n${why}`,
      },
      ...rest,
    ],
  };
}
