// The AI reviewer, end to end (SPEC §6).
//
// `worker/shipyard-jobs/review-submission.ts` is a three-line wrapper around
// this function, and every seam that touches the world — the database, the
// tracker, S3, the model gateway, the headless browser, the URL probe, the
// clock — arrives as an injected dependency. That is what makes the whole
// pipeline testable with a fake model and no network, and it is why the
// reviewer core in `lib/shipyard/reviewer/` never imports Prisma: this module
// is the only place the two halves meet.
//
// The sequence, and why it is in this order:
//
//   1 · load           the submission, its checkpoint, its product, and the
//                      student whose identity we are about to strip
//   2 · informational  `workflow` is cleared by the tracker's run count alone,
//                      so its write-up is recorded and never sent to a model
//   3 · render         checkpoint 3 (and anything else carrying a `liveUrl`)
//                      is judged from a real browser, not from a fetch
//   4 · context        extract → anonymise → images → prompt
//   5 · pre-flight     link liveness, blank, spam, near-duplicate, in code
//   6 · classify       one cheap model call, only when 5 could not decide
//   7 · short-circuit  blank / spam / near-duplicate never reach the verdict
//   8 · verdict        one structured call on the verdict tier
//   9 · parse          repair, validate, normalise against the rubric
//  10 · decide         SPEC §6's trust rules → needsHuman
//  11 · persist        `completeReview`, the one path a verdict takes
//
// Everything that costs money writes a CostLog row as well as its fields on
// the review, so the admin meter can aggregate by feature and by model without
// unioning two different shapes.

import type { PrismaClient } from "@prisma/client";
import { callStructured as defaultCallStructured } from "@/lib/ai/openrouter";
import {
  effectiveProfile,
  loadRouterState,
  resolveRoute,
  saveRouterState,
  type RouterState,
} from "@/lib/ai/router";
import { prisma as defaultPrisma } from "@/lib/db";
import { probeUrl, type SafeFetchOptions } from "@/lib/net/safe-fetch";
import {
  getObjectBuffer,
  keyForShipyardRender,
  putObject as defaultPutObject,
  s3Configured as defaultS3Configured,
} from "@/lib/s3";
import { createTrackerClient, type TrackerClient } from "@/lib/tracker/client";
import type { TrackerSignals } from "@/lib/tracker/types";
import type { CheckpointRubric } from "./checkpoints";
import { parseFieldSpecs, type FieldSpec, type SubmissionFields } from "./fields";
import {
  completeReview as defaultCompleteReview,
  type CompleteReviewResult,
  type VerdictInput,
} from "./review-complete";
import { assembleReviewContext, type SubmissionFile } from "./reviewer/context";
import {
  classifyWithModel,
  runPreflight,
  type PreflightRun,
  type ProbeFn,
} from "./reviewer/preflight";
import { isModelReviewed, PROMPT_VERSION } from "./reviewer/prompts";
import {
  renderLiveProduct,
  renderTimeoutFromEnv,
  type RenderResult,
} from "./reviewer/render";
import {
  preflightClassificationSchema,
  verdictOutputSchema,
  type BuiltPrompt,
  type PreflightOutput,
  type VerdictOutput,
} from "./reviewer/schemas";
import { decideOutcome, parseVerdict, type Outcome } from "./reviewer/verdict";
import type { ReasonView } from "./view-models";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type ReviewPipelineDeps = {
  db?: PrismaClient;
  tracker?: TrackerClient;
  now?: Date;
  /** The model gateway. Tests pass a fake; production passes nothing. */
  call?: typeof defaultCallStructured;
  /** The headless render. Worker-only in production; injected in tests. */
  render?: typeof renderLiveProduct;
  /** Whole-object S3 read, for images and PDFs. */
  fetchFile?: (key: string) => Promise<Buffer>;
  /** Where the render screenshot is stored. */
  putObject?: (key: string, body: Uint8Array, contentType: string) => Promise<unknown>;
  storageConfigured?: () => boolean;
  /** URL liveness, through the SSRF guard. */
  probe?: ProbeFn;
  /** The one path a verdict takes. */
  complete?: typeof defaultCompleteReview;
};

export type ReviewPipelineOutcome =
  | { handled: false; reason: "missing" | "already-final" }
  | ({ handled: true; kind: "informational" | "short-circuit" | "verdict" } & CompleteReviewResult);

/** CostLog `feature` values. One per tier, so the meter can group by them. */
export const COST_FEATURE_PREFLIGHT = "shipyard.preflight";
export const COST_FEATURE_VERDICT = "shipyard.verdict";
export const COST_FEATURE_ESCALATION = "shipyard.escalation";
/** Every Shipyard model call is logged against the submission it served. */
export const COST_REF_TYPE = "ShipyardSubmission";

/** The actor recorded on a kill-switch flip the reviewer itself caused. */
export const REVIEWER_ACTOR = "system:shipyard-reviewer";

const PROBE_TIMEOUT_MS = 8_000;
/** SPEC §6: the near-duplicate comparison is course-wide but not unbounded. */
export const PRIOR_SUBMISSION_CAP = 200;
/** Console noise is evidence, but ten lines of it is as much as anyone reads. */
const CONSOLE_ERROR_CAP = 10;
/** The reviewer's own words when pre-flight refuses to send a submission on. */
export const BLANK_SHORT_CIRCUIT_NOTE =
  "This reads as blank: the required fields are empty or hold a few words of placeholder text, so there is nothing here to judge against the bar. Write your answers out and submit again.";
export const SPAM_SHORT_CIRCUIT_NOTE =
  "This reads as spam rather than an attempt at the checkpoint — the text is not about a product you are building. If that is wrong, resubmit with your own answers and your instructor will look.";
export const DUPLICATE_SHORT_CIRCUIT_NOTE =
  "This reads as a near copy of another submission on this checkpoint. Work that is not your own is not reviewed here; an instructor will look at this before anything else happens.";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function defaultProbeImpl(url: string): Promise<{ alive: boolean; status?: number }> {
  const options: SafeFetchOptions = { timeoutMs: PROBE_TIMEOUT_MS };
  try {
    const res = await probeUrl(url, options, (r) => r.status === 405 || r.status === 501);
    return { alive: res.ok, status: res.status };
  } catch {
    // A blocked or unresolvable URL is evidence for the reviewer, not a crash.
    return { alive: false };
  }
}

type StoredFile = { key: string; name?: string; contentType?: string; bytes?: number };

export function parseStoredFiles(raw: unknown): SubmissionFile[] {
  if (!Array.isArray(raw)) return [];
  const out: SubmissionFile[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const file = item as StoredFile;
    if (typeof file.key !== "string" || file.key === "") continue;
    out.push({
      key: file.key,
      contentType: typeof file.contentType === "string" ? file.contentType : "",
      bytes: typeof file.bytes === "number" ? file.bytes : 0,
    });
  }
  return out;
}

export function asFields(raw: unknown): SubmissionFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return raw as SubmissionFields;
}

export function asReasons(raw: unknown): ReasonView[] {
  if (!Array.isArray(raw)) return [];
  const out: ReasonView[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Partial<ReasonView>;
    if (typeof r.criterion !== "string" || typeof r.met !== "boolean") continue;
    out.push({ criterion: r.criterion, met: r.met, note: typeof r.note === "string" ? r.note : "" });
  }
  return out;
}

function asScores(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function asRubric(raw: unknown): CheckpointRubric {
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as CheckpointRubric).criteria)) {
    return raw as CheckpointRubric;
  }
  return { criteria: [], passRule: "all-criteria-met" };
}

/**
 * The URL field the render opens. `working` names it `liveUrl` by convention;
 * any checkpoint whose schema grows a `url` field of that name gets rendered
 * too, which is the rule SPEC §6 actually states rather than hard-coding a
 * checkpoint key that a bar editor could move.
 */
export function liveUrlField(specs: FieldSpec[] | null): FieldSpec | null {
  if (!specs) return null;
  return specs.find((spec) => spec.kind === "url" && spec.key === "liveUrl") ?? null;
}

/**
 * The prompt, with every image replaced by its size. A promptLog is read by an
 * instructor in a browser and diffed by the eval harness; two megabytes of
 * base64 per image would make it useless for both, and the image bytes are
 * already in S3 under the submission.
 */
export function redactImages(user: BuiltPrompt["user"]): string {
  return user
    .map((part, index) => {
      if (part.type === "text") return part.text;
      const bytes = Math.round((part.image_url.url.length * 3) / 4);
      return `[image ${index + 1}, ${bytes} bytes]`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export async function runReviewPipeline(
  submissionId: string,
  deps: ReviewPipelineDeps = {},
): Promise<ReviewPipelineOutcome> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now ?? new Date();
  const complete = deps.complete ?? defaultCompleteReview;
  const call = deps.call ?? defaultCallStructured;
  const probe = deps.probe ?? defaultProbeImpl;

  // --- 1 · Load -------------------------------------------------------------

  const submission = await db.shipyardSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      version: true,
      fields: true,
      files: true,
      productId: true,
      checkpointId: true,
      product: {
        select: {
          id: true,
          name: true,
          oneLiner: true,
          trackerProductId: true,
          user: {
            select: { name: true, email: true, section: { select: { code: true, name: true } } },
          },
        },
      },
      checkpoint: {
        select: {
          id: true,
          key: true,
          title: true,
          order: true,
          barMarkdown: true,
          rubric: true,
          gateType: true,
          acceptsImages: true,
          fieldSchema: true,
        },
      },
    },
  });
  if (!submission) return { handled: false, reason: "missing" };
  // A retry that lands after a human already ruled must not overwrite them.
  if (submission.status === "passed" || submission.status === "returned") {
    return { handled: false, reason: "already-final" };
  }
  if (submission.status !== "in_review") {
    await db.shipyardSubmission.update({
      where: { id: submissionId },
      data: { status: "in_review" },
    });
  }

  const checkpoint = submission.checkpoint;
  const fields = asFields(submission.fields);
  const files = parseStoredFiles(submission.files);
  const fieldSpecs = parseFieldSpecs(checkpoint.fieldSchema) ?? [];
  const rubric = asRubric(checkpoint.rubric);
  const criteria = rubric.criteria.map((c) => c.id);
  const attempt = submission.version;

  // --- 2 · The informational review ----------------------------------------
  //
  // `workflow` is a metric-only gate: the tenth real run clears it and nothing
  // a student types can. Sending its write-up to a model would spend money to
  // produce a verdict that changes nothing, and recording a `return` would
  // tell a student their work was rejected when the gate is simply waiting on
  // the tracker. So the write-up is RECORDED — a zero-cost review with
  // modelUsed "none" — and the gate is left to `recomputeGates`, which for a
  // `metric` checkpoint reads signals and ignores reviews entirely.
  if (!isModelReviewed(checkpoint.key)) {
    const informational = informationalVerdict(checkpoint.gateType, rubric);
    const result = await complete(submissionId, informational, {
      db,
      tracker: deps.tracker,
      now,
    });
    return { handled: true, kind: "informational", ...result };
  }

  const previous = await loadPreviousReview(db, submission.productId, checkpoint.id, submission.id);

  // --- 3 · The render -------------------------------------------------------

  const urlSpec = liveUrlField(fieldSpecs);
  const liveUrl = urlSpec ? fields[urlSpec.key] : null;
  let render: RenderResult | null = null;
  let screenshotS3Key: string | null = null;
  if (typeof liveUrl === "string" && liveUrl.trim() !== "") {
    render = await runRender(liveUrl.trim(), fields, deps);
    screenshotS3Key = await storeScreenshot(
      render,
      { productId: submission.productId, submissionId },
      deps,
    );
  }

  // --- 3b · Tracker signals, where the gate has a metric half ---------------

  let signals: TrackerSignals | null = null;
  if (checkpoint.gateType !== "review") {
    try {
      const tracker = deps.tracker ?? (await createTrackerClient());
      signals = await tracker.getCheckpointSignals(submission.product.trackerProductId);
    } catch {
      // An unreachable tracker is not a failed review: the reviewer judges the
      // write-up, and the metric half of the gate is decided elsewhere anyway.
      signals = null;
    }
  }

  // --- 4 · The context ------------------------------------------------------

  const context = await assembleReviewContext({
    checkpoint: {
      key: checkpoint.key,
      title: checkpoint.title,
      barMarkdown: checkpoint.barMarkdown,
      rubric,
      acceptsImages: checkpoint.acceptsImages,
      fieldSchema: fieldSpecs,
    },
    submission: { fields, files },
    product: { name: submission.product.name, oneLiner: submission.product.oneLiner },
    student: {
      name: submission.product.user.name,
      email: submission.product.user.email,
      sectionCode: submission.product.user.section?.code ?? null,
      sectionName: submission.product.user.section?.name ?? null,
    },
    fetchFile: deps.fetchFile ?? ((key) => getObjectBuffer(key)),
    render: render
      ? {
          domText: render.domText,
          screenshotNote: renderScreenshotNote(render),
          screenshotPng: render.screenshotPng,
        }
      : null,
    signals,
    attempt,
    previousReasons: previous?.reasons ?? null,
  });

  // --- 5 · Pre-flight, in code ---------------------------------------------

  const priorSubmissions = await loadPriorSubmissions(db, checkpoint.id, submission.productId);
  const run: PreflightRun = await runPreflight({
    checkpointKey: checkpoint.key,
    fields: context.fields,
    fieldSpecs,
    extractedText: context.preflight.extractedText,
    // The render's own text is scanned too: a page the student controls is the
    // easiest place to hide an instruction aimed at the reviewer (SEC-3).
    domText: render?.domText,
    priorSubmissions,
    probe,
  });

  // --- 6 · The cheap classification, only when the heuristics could not -----

  const routerState = await loadRouterState(db);
  const routerDeps = makeRouterDeps(db, routerState);

  let preflight: PreflightOutput = run.preflight;
  if (run.ambiguous) {
    preflight = await classifyWithModel(run, {
      checkpointKey: checkpoint.key,
      call: async (prompt: BuiltPrompt) => {
        const res = await call(
          {
            task: "preflight",
            system: prompt.system,
            user: prompt.user,
            schema: preflightClassificationSchema,
            temperature: 0,
            maxTokens: 512,
          },
          routerDeps,
        );
        await writeCostLog(db, COST_FEATURE_PREFLIGHT, submissionId, res);
        return res.data;
      },
    });
  }

  const renderArtifacts = render
    ? {
        screenshotS3Key,
        domText: render.domText,
        finalUrl: render.finalUrl,
        status: render.status,
        title: render.title,
        ok: render.ok,
        notes: render.notes,
        blockedRequests: render.blockedRequests,
        consoleErrors: render.consoleErrors.slice(0, CONSOLE_ERROR_CAP),
      }
    : null;

  const basePromptLog = {
    promptVersion: PROMPT_VERSION,
    system: context.prompt.system,
    user: redactImages(context.prompt.user),
    preflight,
    redactions: context.redactions,
    imageCount: context.imageCount,
  };

  // --- 7 · The short circuit ------------------------------------------------
  //
  // A blank, spam or near-duplicate submission is returned WITHOUT a verdict
  // call: there is nothing to judge, the answer is the same every time, and
  // seven thousand of these a term is real money. Every one is flagged for a
  // human, because "this is spam" is an accusation and SPEC §7 scores spam at
  // zero on distribution — that is not a call a heuristic makes alone.
  const shortCircuit = shortCircuitReason(preflight);
  if (shortCircuit) {
    const verdict: VerdictInput = {
      verdict: "return",
      reasons: shortCircuitReasons(criteria, shortCircuit.note),
      rubricScores: Object.fromEntries(criteria.map((id) => [id, 0])),
      confidence: 1,
      studentSummary: shortCircuit.note,
      modelUsed: run.ambiguous ? "heuristic+model" : "heuristic",
      providerUsed: "none",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      reviewedBy: "ai",
      needsHuman: true,
      metricSignalsSeen: signals,
      renderArtifacts,
      promptLog: {
        ...basePromptLog,
        shortCircuit: shortCircuit.kind,
        needsHumanReasons: [shortCircuit.kind],
        modelsRequested: [],
        raw: null,
      },
    };
    const result = await complete(submissionId, verdict, { db, tracker: deps.tracker, now });
    return { handled: true, kind: "short-circuit", ...result };
  }

  // --- 8 · The verdict call -------------------------------------------------
  //
  // A thrown provider error is deliberately NOT caught: pg-boss retries with
  // backoff, and the dead-letter consumer returns the submission with a stock
  // reason if every retry fails, so nothing is left stuck in `in_review`.
  const modelsRequested = routeModels(routerState);
  const response = await call(
    {
      task: "verdict",
      system: context.prompt.system,
      user: context.prompt.user,
      schema: verdictOutputSchema,
      temperature: 0,
    },
    routerDeps,
  );
  await writeCostLog(db, COST_FEATURE_VERDICT, submissionId, response);

  // --- 9 / 10 · Parse and decide -------------------------------------------

  const parsed: VerdictOutput = parseVerdict(response.raw, { criteria });
  const outcome: Outcome = decideOutcome(parsed, {
    attempt,
    priorScores: previous?.rubricScores ?? null,
    suspectedInjection: preflight.suspectedInjection === true,
  });

  // --- 11 · Persist ---------------------------------------------------------

  const verdict: VerdictInput = {
    verdict: outcome.verdict,
    reasons: parsed.reasons,
    rubricScores: parsed.rubricScores,
    confidence: parsed.confidence,
    studentSummary: parsed.summaryForStudent,
    modelUsed: response.modelUsed,
    providerUsed: response.providerUsed,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
    costUsd: response.costUsd,
    reviewedBy: "ai",
    needsHuman: outcome.needsHuman,
    metricSignalsSeen: signals,
    renderArtifacts,
    promptLog: {
      ...basePromptLog,
      raw: response.raw,
      contradictions: parsed.contradictions,
      flags: parsed.flags,
      summaryForStudent: parsed.summaryForStudent,
      needsHumanReasons: outcome.needsHumanReasons,
      modelsRequested,
    },
  };

  const result = await complete(submissionId, verdict, { db, tracker: deps.tracker, now });
  return { handled: true, kind: "verdict", ...result };
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/** SPEC §6: `workflow`'s write-up is recorded, never judged. */
export function informationalVerdict(
  gateType: "review" | "metric" | "both",
  rubric: CheckpointRubric,
): VerdictInput {
  const metricOnly = gateType === "metric";
  const note = metricOnly
    ? "Recorded. This checkpoint is cleared by your workflow's real run count, which the tracker reports — not by a review of this write-up."
    : "Recorded, and flagged for an instructor: this checkpoint is not set up for a model review but its gate expects one.";
  const ids = rubric.criteria.length > 0 ? rubric.criteria.map((c) => c.id) : ["recorded"];
  return {
    verdict: "pass",
    reasons: ids.map((id) => ({ criterion: id, met: true, note })),
    rubricScores: {},
    confidence: 1,
    studentSummary: note,
    modelUsed: "none",
    providerUsed: "none",
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    reviewedBy: "ai",
    // A mis-configured checkpoint should reach a human; a correctly configured
    // metric-only one should not, or every workflow write-up fills the queue.
    needsHuman: !metricOnly,
  };
}

type ShortCircuit = { kind: "blank" | "spam" | "near_duplicate"; note: string };

export function shortCircuitReason(preflight: PreflightOutput): ShortCircuit | null {
  if (preflight.isBlank) return { kind: "blank", note: BLANK_SHORT_CIRCUIT_NOTE };
  if (preflight.isSpam) return { kind: "spam", note: SPAM_SHORT_CIRCUIT_NOTE };
  if (preflight.nearDuplicateOf) {
    return { kind: "near_duplicate", note: DUPLICATE_SHORT_CIRCUIT_NOTE };
  }
  return null;
}

function shortCircuitReasons(criteria: readonly string[], note: string): ReasonView[] {
  if (criteria.length === 0) return [{ criterion: "pre-flight", met: false, note }];
  // The reason sits on the FIRST clause and the rest say plainly that they were
  // not looked at, rather than claiming nine separate failures the reviewer
  // never assessed.
  return criteria.map((id, index) => ({
    criterion: id,
    met: false,
    note:
      index === 0
        ? note
        : "Not assessed: the submission did not get as far as a review of the bar.",
  }));
}

function renderScreenshotNote(render: RenderResult): string {
  const parts = [
    render.screenshotPng
      ? "a full-page screenshot of the render is attached"
      : "no screenshot could be captured",
    `HTTP ${render.status ?? "no response"}`,
    `final URL ${render.finalUrl}`,
  ];
  if (render.notes.length > 0) parts.push(render.notes.join("; "));
  return parts.join(" — ");
}

async function runRender(
  url: string,
  fields: SubmissionFields,
  deps: ReviewPipelineDeps,
): Promise<RenderResult> {
  const doRender = deps.render ?? renderLiveProduct;
  const corePathRaw = fields.corePath ?? fields.coreFlow ?? fields.jobStory;
  try {
    return await doRender(url, {
      corePath: typeof corePathRaw === "string" ? corePathRaw : undefined,
      timeoutMs: renderTimeoutFromEnv(),
    });
  } catch (err) {
    // `renderLiveProduct` is documented never to throw, but a browser that
    // cannot launch at all would. A dead render is evidence for a return, not
    // a dead job — so it is caught here too rather than retried forever.
    return {
      ok: false,
      finalUrl: url,
      status: null,
      title: "",
      domText: "",
      screenshotPng: null,
      consoleErrors: [],
      blockedRequests: 0,
      notes: [`the render could not run: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

async function storeScreenshot(
  render: RenderResult | null,
  where: { productId: string; submissionId: string },
  deps: ReviewPipelineDeps,
): Promise<string | null> {
  if (!render?.screenshotPng || render.screenshotPng.length === 0) return null;
  const configured = deps.storageConfigured ?? defaultS3Configured;
  if (!configured()) return null;
  const key = keyForShipyardRender(where);
  try {
    await (deps.putObject ?? defaultPutObject)(key, render.screenshotPng, "image/png");
    return key;
  } catch (err) {
    render.notes.push(
      `the screenshot could not be stored: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** The previous attempt's review, for "did they fix it" and the jump rule. */
async function loadPreviousReview(
  db: PrismaClient,
  productId: string,
  checkpointId: string,
  submissionId: string,
): Promise<{ reasons: ReasonView[]; rubricScores: Record<string, number> } | null> {
  const row = await db.shipyardReview.findFirst({
    where: {
      submission: { productId, checkpointId, id: { not: submissionId } },
    },
    orderBy: { createdAt: "desc" },
    select: { reasons: true, rubricScores: true },
  });
  if (!row) return null;
  return { reasons: asReasons(row.reasons), rubricScores: asScores(row.rubricScores) };
}

/**
 * OTHER products' latest text on this checkpoint, for the near-duplicate check.
 * A student's own resubmission is supposed to look like their last one and is
 * excluded by `productId: { not: … }` rather than by a similarity threshold.
 */
async function loadPriorSubmissions(
  db: PrismaClient,
  checkpointId: string,
  productId: string,
): Promise<{ id: string; text: string }[]> {
  const rows = await db.shipyardSubmission.findMany({
    where: {
      checkpointId,
      productId: { not: productId },
      status: { in: ["submitted", "in_review", "returned", "passed"] },
    },
    orderBy: { submittedAt: "desc" },
    take: PRIOR_SUBMISSION_CAP,
    select: { id: true, fields: true },
  });
  return rows.map((row) => ({
    id: row.id,
    text: Object.values(asFields(row.fields))
      .filter((v): v is string => typeof v === "string")
      .join("\n"),
  }));
}

/**
 * The router state, wired so a BYOK credit failure counted inside the gateway
 * is PERSISTED — five in a row flip the profile to flash-everywhere and
 * `saveRouterState` writes the AuditLog row that explains why.
 */
function makeRouterDeps(db: PrismaClient, state: RouterState) {
  return {
    routerState: state,
    onRouterState: async (next: RouterState) => {
      await saveRouterState(db, next, REVIEWER_ACTOR);
    },
  };
}

/** What the gateway was asked to try, in order — stored on the promptLog. */
function routeModels(state: RouterState): string[] {
  return [...resolveRoute("verdict", effectiveProfile(state)).models];
}

type CostBearingResult = {
  modelUsed: string;
  providerUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

/**
 * One CostLog row per model call, IN ADDITION to the fields on the review.
 * The review row answers "what did this verdict cost"; CostLog answers "what
 * did the term cost, by feature and by model", including the pre-flight and
 * escalation calls that have no review row of their own. Keeping both means
 * the admin meter never has to union two shapes to total a month.
 */
export async function writeCostLog(
  db: PrismaClient,
  feature: string,
  submissionId: string,
  result: CostBearingResult,
): Promise<void> {
  try {
    await db.costLog.create({
      data: {
        feature,
        provider: result.providerUsed,
        model: result.modelUsed,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        refType: COST_REF_TYPE,
        refId: submissionId,
      },
    });
  } catch (err) {
    // Losing a cost row must never fail a review and send the job back for a
    // retry that would double-charge the thing we are trying to measure.
    console.error(
      `[shipyard] cost log failed for ${feature} on ${submissionId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
