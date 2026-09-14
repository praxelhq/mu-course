// `pnpm eval:reviewer` — the fixture-agreement gate (SPEC §6.5, milestone M2.5).
//
// Fifty-five sample submissions with the verdict a human expects: ten each for
// the five checkpoints a model judges, and five for `workflow`, which is
// cleared by the tracker's run count alone and is reported as skipped rather
// than sent to a model. Every case is built through the REAL reviewer modules
// — anonymise, context, prompts, verdict — so a change to any of them shows up
// here, and each model is pinned with no fallback, because "agreement per
// model" is meaningless if the routing table's fallback answered half the
// calls.
//
// It is a RELEASE GATE (SPEC §1 rule 8): no bar, rubric, prompt or routing
// change reaches students until its numbers are recorded in docs/DECISIONS.md.
//
// Flags: --model <slug>  --checkpoint <key>  --limit <n>  --concurrency <n>
//
// Fifty-five cases against two models is 110 model calls, and serially that is
// most of an hour of wall clock for a run whose numbers are a release gate. So
// the cases for one model run with a small concurrency (4 by default) and a
// 429 is retried with backoff rather than recorded as a disagreement — a rate
// limit is a fact about the account, not about the model's judgement.
//
// Two honest limitations, stated here rather than buried:
//   1. A fixture image that is a `synthetic:` description rather than a real
//      PNG is passed to the model as a written description of what the photo
//      shows. Four fixtures carry real generated PNGs and exercise the vision
//      path properly.
//   2. With no OPENROUTER_API_KEY the run uses the deterministic fake
//      responder. That proves the harness, not the reviewer, and the output
//      says so at the top and the bottom.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ShipyardCheckpointKey } from "@prisma/client";
import { callStructured, isFakeMode } from "../lib/ai/openrouter";
import { __setOpenRouterFake, type FakeCallContext } from "../lib/ai/openrouter-fake";
import { resolveRoute } from "../lib/ai/router";
import { checkpointDefinition } from "../lib/shipyard/checkpoints";
import type { SubmissionFields } from "../lib/shipyard/fields";
import { assembleReviewContext, type SubmissionFile } from "../lib/shipyard/reviewer/context";
import { isModelReviewed, PROMPT_VERSION } from "../lib/shipyard/reviewer/prompts";
import { verdictOutputSchema, type VerdictOutput } from "../lib/shipyard/reviewer/schemas";
import { decideOutcome, parseVerdict } from "../lib/shipyard/reviewer/verdict";
import type { TrackerSignals } from "../lib/tracker/types";

const FIXTURES = resolve(__dirname, "..", "fixtures", "shipyard-reviewer");
const CASES_DIR = join(FIXTURES, "cases");
const LAST_RUN = join(FIXTURES, "last-run.json");
const LAST_RUN_MD = join(FIXTURES, "last-run.md");

/** SPEC §6.5: the gate. */
const MIN_AGREEMENT_WITH_EXPECTED = 0.85;
const MIN_AGREEMENT_BETWEEN_MODELS = 0.8;

type EvalCase = {
  id: string;
  checkpointKey: ShipyardCheckpointKey;
  expected: "pass" | "return";
  expectedUnmetCriteria: string[];
  fields: SubmissionFields;
  extractedText?: string;
  images?: { file: string }[];
  render?: { domText: string; screenshotNote: string };
  signals?: TrackerSignals;
  notes?: string;
};

type CaseResult = {
  id: string;
  checkpointKey: ShipyardCheckpointKey;
  expected: "pass" | "return";
  got: "pass" | "return" | "error";
  agreed: boolean;
  confidence: number;
  needsHuman: boolean;
  needsHumanReasons: string[];
  unmetCriteria: string[];
  expectedUnmetCriteria: string[];
  summaryForStudent: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const onlyModel = arg("model");
const onlyCheckpoint = arg("checkpoint");
const limit = Number(arg("limit") ?? Number.POSITIVE_INFINITY);
/** Small on purpose: four in flight is fast enough and stays under the
 *  per-account rate limits on both providers. */
const DEFAULT_CONCURRENCY = 4;
const concurrency = Math.max(1, Math.floor(Number(arg("concurrency") ?? DEFAULT_CONCURRENCY)) || DEFAULT_CONCURRENCY);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function loadCases(): EvalCase[] {
  const out: EvalCase[] = [];
  for (const dir of readdirSync(CASES_DIR).sort()) {
    if (onlyCheckpoint && dir !== onlyCheckpoint) continue;
    for (const file of readdirSync(join(CASES_DIR, dir)).sort()) {
      if (!file.endsWith(".json")) continue;
      out.push(JSON.parse(readFileSync(join(CASES_DIR, dir, file), "utf8")) as EvalCase);
    }
  }
  return out;
}

/**
 * A fixture image is either a real PNG on disk or a `synthetic:` description.
 * Real ones go through the ordinary file path so the vision half is genuinely
 * exercised; descriptions are handed to the model as text, clearly labelled.
 */
function splitImages(evalCase: EvalCase): {
  files: SubmissionFile[];
  described: string[];
} {
  const files: SubmissionFile[] = [];
  const described: string[] = [];
  for (const image of evalCase.images ?? []) {
    if (image.file.startsWith("synthetic:")) {
      described.push(image.file.slice("synthetic:".length).trim());
      continue;
    }
    const path = join(FIXTURES, image.file);
    files.push({
      key: image.file,
      contentType: image.file.endsWith(".png") ? "image/png" : "image/jpeg",
      bytes: readFileSync(path).length,
    });
  }
  return { files, described };
}

async function buildPrompt(evalCase: EvalCase) {
  const def = checkpointDefinition(evalCase.checkpointKey);
  const { files, described } = splitImages(evalCase);

  // The upload-kind fields hold S3 keys in production; in a fixture they hold
  // the same descriptions as `images`, so drop them rather than say it twice.
  const uploadKeys = new Set(
    def.fieldSchema.filter((f) => f.kind === "images" || f.kind === "files").map((f) => f.key),
  );
  const fields: SubmissionFields = {};
  for (const [key, value] of Object.entries(evalCase.fields)) {
    if (!uploadKeys.has(key)) fields[key] = value;
  }

  const ctx = await assembleReviewContext({
    checkpoint: {
      key: def.key,
      title: def.title,
      barMarkdown: def.barMarkdown,
      rubric: def.rubric,
      acceptsImages: def.acceptsImages,
      fieldSchema: def.fieldSchema,
    },
    submission: { fields, files },
    fetchFile: async (key) => readFileSync(join(FIXTURES, key)),
    render: evalCase.render ?? null,
    signals: evalCase.signals ?? null,
    attempt: 1,
    previousReasons: null,
  });

  if (described.length > 0) {
    ctx.prompt.user.unshift({
      type: "text",
      text:
        `[eval fixture] This submission carries ${described.length} image${described.length === 1 ? "" : "s"} that are not reproduced in the fixture set. ` +
        `Judge them from these descriptions as if you had looked at the photographs:\n` +
        described.map((d, i) => `  ${i + 1}. ${d}`).join("\n"),
    });
  }

  if (evalCase.extractedText) {
    ctx.prompt.user.push({
      type: "text",
      text: `<extracted_text_from_attachments>\n${evalCase.extractedText}\n</extracted_text_from_attachments>`,
    });
  }

  return ctx.prompt;
}

// ---------------------------------------------------------------------------
// The fake responder
// ---------------------------------------------------------------------------

let currentCase: EvalCase | null = null;

/**
 * The fake answers from the fixture's own expectation. That makes agreement
 * 100% by construction and measures nothing about a model — it exists so the
 * harness itself (loading, prompting, parsing, scoring, reporting) can be run
 * and trusted with no key and no spend.
 */
function installFake(): void {
  __setOpenRouterFake((ctx: FakeCallContext) => {
    const evalCase = currentCase!;
    const criteria = checkpointDefinition(evalCase.checkpointKey).rubric.criteria;
    const unmet = new Set(evalCase.expectedUnmetCriteria);
    const payload: VerdictOutput = {
      verdict: evalCase.expected,
      confidence: evalCase.expected === "pass" ? 0.86 : 0.88,
      reasons: criteria.map((c) => ({
        criterion: c.id,
        met: !unmet.has(c.id),
        note: unmet.has(c.id)
          ? `Fake reviewer: this fixture expects "${c.clause}" to be unmet.`
          : `Fake reviewer: this fixture expects "${c.clause}" to be met.`,
      })),
      rubricScores: Object.fromEntries(criteria.map((c) => [c.id, unmet.has(c.id) ? 25 : 78])),
      contradictions: [],
      flags: [],
      summaryForStudent:
        "Fake reviewer. No model was called; this verdict was read off the fixture's own expectation.",
    };
    const content = JSON.stringify(payload);
    return {
      content,
      modelUsed: ctx.models[0] ?? "fake",
      providerUsed: "fake",
      tokensIn: Math.round((ctx.system.length + ctx.userText.length) / 4),
      tokensOut: Math.round(content.length / 4),
    };
  });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Bounded-parallel map that keeps the results in the input's order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  width: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 4_000;

function isRateLimited(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|too many requests/i.test(text);
}

/**
 * One pinned call, retried on a 429 only. Every other failure is a real result
 * for this fixture and is reported as an error row rather than hidden.
 */
async function callWithRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimited(err) || attempt === RATE_LIMIT_RETRIES) break;
      const waitMs = RATE_LIMIT_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 500);
      process.stdout.write("r");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

async function runModel(model: string, cases: EvalCase[]): Promise<CaseResult[]> {
  // The fake responder reads a module-level `currentCase`, so a fake run stays
  // serial. A live run is the one that needs the wall clock back.
  const width = isFakeMode() ? 1 : concurrency;
  return mapWithConcurrency(cases, width, async (evalCase) => {
    if (width === 1) currentCase = evalCase;
    const criteria = checkpointDefinition(evalCase.checkpointKey).rubric.criteria.map((c) => c.id);
    const blank: CaseResult = {
      id: evalCase.id,
      checkpointKey: evalCase.checkpointKey,
      expected: evalCase.expected,
      got: "error",
      agreed: false,
      confidence: 0,
      needsHuman: false,
      needsHumanReasons: [],
      unmetCriteria: [],
      expectedUnmetCriteria: evalCase.expectedUnmetCriteria,
      summaryForStudent: "",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };

    try {
      const prompt = await buildPrompt(evalCase);
      const call = await callWithRateLimitRetry(() =>
        callStructured(
          {
            task: "eval",
            // Pinned: no fallback array, so this row is about THIS model.
            models: [model],
            system: prompt.system,
            user: prompt.user,
            schema: verdictOutputSchema,
            temperature: 0,
            maxTokens: 8192,
          },
          {},
        ),
      );
      const verdict = parseVerdict(call.raw, { criteria });
      const outcome = decideOutcome(verdict, { attempt: 1 });
      process.stdout.write(".");
      return {
        ...blank,
        got: verdict.verdict,
        agreed: verdict.verdict === evalCase.expected,
        confidence: verdict.confidence,
        needsHuman: outcome.needsHuman,
        needsHumanReasons: outcome.needsHumanReasons,
        unmetCriteria: verdict.reasons.filter((r) => !r.met).map((r) => r.criterion),
        summaryForStudent: verdict.summaryForStudent,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
        costUsd: call.costUsd,
      } satisfies CaseResult;
    } catch (err) {
      process.stdout.write("x");
      return { ...blank, error: err instanceof Error ? err.message : String(err) } satisfies CaseResult;
    }
  }).then((results) => {
    process.stdout.write("\n");
    return results;
  });
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function byCheckpoint(results: CaseResult[]): Record<string, { agreed: number; total: number }> {
  const out: Record<string, { agreed: number; total: number }> = {};
  for (const r of results) {
    out[r.checkpointKey] ??= { agreed: 0, total: 0 };
    out[r.checkpointKey].total++;
    if (r.agreed) out[r.checkpointKey].agreed++;
  }
  return out;
}

/**
 * The same run, written for a human. `last-run.json` is what a later script
 * diffs; this is what a reader opens next to docs/DECISIONS.md.
 */
function renderMarkdown(
  payload: Record<string, unknown>,
  byModel: Record<string, CaseResult[]>,
): string {
  const lines: string[] = [];
  const summary = payload.models_ as Record<string, Record<string, unknown>>;
  lines.push("# `pnpm eval:reviewer` — last run");
  lines.push("");
  lines.push(`- ran at: ${String(payload.ranAt)}`);
  lines.push(`- prompt version: ${String(payload.promptVersion)}`);
  lines.push(`- cases: ${String(payload.caseCount)} model-reviewed`);
  lines.push(`- responder: ${payload.fake ? "FAKE (no key) — not evidence about a model" : "live OpenRouter"}`);
  lines.push(`- gate: **${String(payload.gate)}**`);
  if (payload.crossAgreement !== null) {
    lines.push(`- inter-model agreement: **${String(payload.crossAgreement)}%**`);
  }
  lines.push("");
  lines.push("| model | agreement | mean confidence | queued for a human | tokens in | tokens out | USD |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [model, stat] of Object.entries(summary)) {
    lines.push(
      `| \`${model}\` | ${stat.agreement}% (${stat.agreedCount}/${stat.total}) | ${stat.meanConfidence} | ` +
        `${stat.queuedForHuman}/${stat.total} | ${stat.tokensIn} | ${stat.tokensOut} | $${Number(stat.costUsd).toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("## Per checkpoint");
  lines.push("");
  const keys = [...new Set(Object.values(byModel).flat().map((r) => r.checkpointKey))].sort();
  lines.push(`| model | ${keys.join(" | ")} |`);
  lines.push(`| --- | ${keys.map(() => "---").join(" | ")} |`);
  for (const [model, stat] of Object.entries(summary)) {
    const per = stat.perCheckpoint as Record<string, { agreed: number; total: number }>;
    lines.push(
      `| \`${model}\` | ` +
        keys
          .map((k) => {
            const cell = per[k];
            return cell ? `${cell.agreed}/${cell.total}` : "—";
          })
          .join(" | ") +
        " |",
    );
  }
  for (const [model, results] of Object.entries(byModel)) {
    const disagreements = results.filter((r) => !r.agreed && r.got !== "error");
    const errors = results.filter((r) => r.got === "error");
    lines.push("");
    lines.push(`## \`${model}\` — ${disagreements.length} disagreement${disagreements.length === 1 ? "" : "s"}`);
    lines.push("");
    if (disagreements.length === 0) lines.push("None.");
    for (const d of disagreements) {
      lines.push(`### ${d.id}`);
      lines.push("");
      lines.push(`- expected **${d.expected}**, got **${d.got}** at confidence ${d.confidence}`);
      lines.push(`- expected unmet: ${d.expectedUnmetCriteria.join(", ") || "(none)"}`);
      lines.push(`- model unmet: ${d.unmetCriteria.join(", ") || "(none)"}`);
      lines.push(`- queued for a human: ${d.needsHuman ? d.needsHumanReasons.join("; ") : "no"}`);
      lines.push(`- to the student: ${d.summaryForStudent}`);
      lines.push("");
    }
    if (errors.length > 0) {
      lines.push(`### errors (${errors.length})`);
      lines.push("");
      for (const e of errors) lines.push(`- \`${e.id}\`: ${e.error}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const fake = isFakeMode();
  if (fake) installFake();

  const all = loadCases();
  const reviewed = all.filter((c) => isModelReviewed(c.checkpointKey));
  const skipped = all.filter((c) => !isModelReviewed(c.checkpointKey));
  const cases = reviewed.slice(0, Number.isFinite(limit) ? limit : undefined);

  const routed = [...new Set(resolveRoute("eval").models)];
  const models = onlyModel ? [onlyModel] : routed;

  console.log("");
  console.log("pnpm eval:reviewer — the fixture-agreement gate");
  console.log(`prompt version ${PROMPT_VERSION}`);
  console.log(
    `${cases.length} model-reviewed cases across ${new Set(cases.map((c) => c.checkpointKey)).size} checkpoints, ` +
      `${skipped.length} metric-only cases skipped (${[...new Set(skipped.map((c) => c.checkpointKey))].join(", ") || "none"})`,
  );
  console.log(`models: ${models.join(", ")}`);
  console.log(`concurrency: ${fake ? 1 : concurrency}`);
  if (fake) {
    console.log("");
    console.log("!!! ".repeat(18));
    console.log("NO OPENROUTER_API_KEY — running against the deterministic FAKE responder.");
    console.log("The fake answers from each fixture's own expectation, so agreement will be");
    console.log("100% and measures NOTHING about either model. This run proves the harness");
    console.log("only. It does NOT satisfy the release gate in SPEC §1 rule 8.");
    console.log("!!! ".repeat(18));
  }
  console.log("");

  const byModel: Record<string, CaseResult[]> = {};
  for (const model of models) {
    console.log(`— ${model}`);
    byModel[model] = await runModel(model, cases);
  }

  const summary: Record<string, unknown> = {};
  let gateFailed = false;

  for (const model of models) {
    const results = byModel[model];
    const errors = results.filter((r) => r.got === "error");
    const agreed = results.filter((r) => r.agreed).length;
    const agreement = pct(agreed, results.length);
    const meanConfidence =
      results.length === 0
        ? 0
        : Math.round(
            (results.reduce((a, r) => a + r.confidence, 0) / results.length) * 100,
          ) / 100;
    const tokensIn = results.reduce((a, r) => a + r.tokensIn, 0);
    const tokensOut = results.reduce((a, r) => a + r.tokensOut, 0);
    const costUsd = Math.round(results.reduce((a, r) => a + r.costUsd, 0) * 1e6) / 1e6;
    const queued = results.filter((r) => r.needsHuman).length;

    console.log("");
    console.log(`=== ${model}`);
    console.log(`agreement with expected verdicts : ${agreement}%  (${agreed}/${results.length})`);
    for (const [key, stat] of Object.entries(byCheckpoint(results))) {
      console.log(`  ${key.padEnd(8)} ${String(pct(stat.agreed, stat.total)).padStart(5)}%  (${stat.agreed}/${stat.total})`);
    }
    console.log(`mean confidence                  : ${meanConfidence}`);
    console.log(`queued for a human               : ${queued}/${results.length}`);
    console.log(`tokens                           : ${tokensIn} in, ${tokensOut} out`);
    console.log(`cost                             : $${costUsd.toFixed(4)}`);
    if (errors.length > 0) {
      console.log(`errors                           : ${errors.length}`);
      for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
    }

    const disagreements = results.filter((r) => !r.agreed && r.got !== "error");
    if (disagreements.length > 0) {
      console.log("");
      console.log(`disagreements (${disagreements.length}):`);
      for (const d of disagreements) {
        console.log(`  ${d.id}`);
        console.log(`    expected ${d.expected}, got ${d.got} at confidence ${d.confidence}`);
        console.log(`    expected unmet: ${d.expectedUnmetCriteria.join(", ") || "(none)"}`);
        console.log(`    model unmet   : ${d.unmetCriteria.join(", ") || "(none)"}`);
        console.log(`    to the student: ${d.summaryForStudent}`);
      }
    }

    summary[model] = {
      agreement,
      agreedCount: agreed,
      total: results.length,
      perCheckpoint: byCheckpoint(results),
      meanConfidence,
      queuedForHuman: queued,
      tokensIn,
      tokensOut,
      costUsd,
      errors: errors.length,
      disagreements: disagreements.map((d) => ({
        id: d.id,
        expected: d.expected,
        got: d.got,
        confidence: d.confidence,
        summaryForStudent: d.summaryForStudent,
      })),
    };

    if (agreement < MIN_AGREEMENT_WITH_EXPECTED * 100) gateFailed = true;
  }

  // Agreement between the two models, case by case.
  let crossAgreement: number | null = null;
  if (models.length === 2) {
    const [a, b] = models;
    const byId = new Map(byModel[b].map((r) => [r.id, r]));
    let same = 0;
    let comparable = 0;
    for (const result of byModel[a]) {
      const other = byId.get(result.id);
      if (!other || result.got === "error" || other.got === "error") continue;
      comparable++;
      if (result.got === other.got) same++;
    }
    crossAgreement = pct(same, comparable);
    console.log("");
    console.log(`=== agreement between the two models: ${crossAgreement}%  (${same}/${comparable})`);
    if (crossAgreement < MIN_AGREEMENT_BETWEEN_MODELS * 100) gateFailed = true;
  }

  const payload = {
    ranAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    fake,
    models,
    caseCount: cases.length,
    skippedMetricOnly: skipped.map((c) => c.id),
    thresholds: {
      agreementWithExpected: MIN_AGREEMENT_WITH_EXPECTED,
      agreementBetweenModels: MIN_AGREEMENT_BETWEEN_MODELS,
    },
    crossAgreement,
    models_: summary,
    gate: fake ? "not-applicable-fake-responder" : gateFailed ? "failed" : "passed",
  };
  writeFileSync(LAST_RUN, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(LAST_RUN_MD, renderMarkdown(payload, byModel));
  console.log("");
  console.log(`wrote ${LAST_RUN} and ${LAST_RUN_MD}`);

  if (fake) {
    console.log("");
    console.log(
      "FAKE RUN — the harness works, and nothing here is evidence about a model. Set OPENROUTER_API_KEY and run again before recording numbers in docs/DECISIONS.md.",
    );
    process.exit(0);
  }

  if (gateFailed) {
    console.error("");
    console.error(
      `RELEASE GATE FAILED — every model must agree with the expected verdicts at ${MIN_AGREEMENT_WITH_EXPECTED * 100}% and the two models with each other at ${MIN_AGREEMENT_BETWEEN_MODELS * 100}%.`,
    );
    process.exit(1);
  }
  console.log("release gate passed. Record these numbers in docs/DECISIONS.md.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
