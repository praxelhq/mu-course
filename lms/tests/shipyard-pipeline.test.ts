import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import type { StructuredCallArgs, StructuredCallResult } from "@/lib/ai/openrouter";
import type { callStructured } from "@/lib/ai/openrouter";
import {
  applyByokOutcome,
  BYOK_FAILURE_THRESHOLD,
  INITIAL_ROUTER_STATE,
  loadRouterState,
  recordByokOutcome,
  ROUTER_FLIP_AUDIT_ACTION,
  ROUTER_STATE_ID,
  saveRouterState,
} from "@/lib/ai/router";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { HELD_PASS_BODY, isHeldPass, notificationTitle } from "@/lib/shipyard/review-complete";
import { humanResolve, loadReviewQueue } from "@/lib/shipyard/review-escalate";
import {
  BLANK_SHORT_CIRCUIT_NOTE,
  COST_FEATURE_VERDICT,
  informationalVerdict,
  liveUrlField,
  redactImages,
  runReviewPipeline,
  shortCircuitReason,
} from "@/lib/shipyard/review-pipeline";
import { ensureProduct } from "@/lib/shipyard/products";
import type { RenderResult } from "@/lib/shipyard/reviewer/render";
import type { PreflightOutput } from "@/lib/shipyard/reviewer/schemas";
import { criterionIdsFrom } from "@/lib/ai/openrouter-fake";
import { COST_DAYS, dayKey, daySeries, loadCostMeter } from "@/lib/shipyard/review-costs";

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

const IDEA = checkpointDefinition("idea");
const WORKING = checkpointDefinition("working");
const WORKFLOW = checkpointDefinition("workflow");

describe("the held pass", () => {
  it("is a pass the reviewer flagged, and only that", () => {
    const base = {
      verdict: "pass" as const,
      reasons: [],
      rubricScores: {},
      confidence: 0.4,
      modelUsed: "m",
      providerUsed: "p",
    };
    expect(isHeldPass({ ...base, needsHuman: true })).toBe(true);
    expect(isHeldPass({ ...base, needsHuman: false })).toBe(false);
    expect(isHeldPass({ ...base, verdict: "return", needsHuman: true })).toBe(false);
  });

  it("is neither cleared nor returned in the notification title", () => {
    expect(notificationTitle(3, "pass", true)).toBe("Checkpoint 3 is with a reviewer");
    expect(notificationTitle(3, "pass", false)).toBe("Checkpoint 3 cleared");
    expect(notificationTitle(3, "return", false)).toBe("Checkpoint 3 returned");
  });
});

describe("the informational review", () => {
  it("records a metric-only checkpoint without judging it", () => {
    const verdict = informationalVerdict("metric", WORKFLOW.rubric);
    expect(verdict.verdict).toBe("pass");
    expect(verdict.modelUsed).toBe("none");
    expect(verdict.costUsd).toBe(0);
    expect(verdict.needsHuman).toBe(false);
    expect(verdict.reasons.every((r) => r.met)).toBe(true);
    expect(verdict.studentSummary).toMatch(/run count/i);
  });

  it("flags a checkpoint whose gate expects a review it will not get", () => {
    expect(informationalVerdict("both", WORKFLOW.rubric).needsHuman).toBe(true);
  });
});

describe("the short circuit", () => {
  const base: PreflightOutput = {
    linkStatuses: [],
    isBlank: false,
    isSpam: false,
    extractedText: "",
    notes: [],
  };
  it("catches blank, spam and near-duplicate, in that order", () => {
    expect(shortCircuitReason(base)).toBeNull();
    expect(shortCircuitReason({ ...base, isBlank: true })?.kind).toBe("blank");
    expect(shortCircuitReason({ ...base, isSpam: true })?.kind).toBe("spam");
    expect(shortCircuitReason({ ...base, nearDuplicateOf: "x" })?.kind).toBe("near_duplicate");
  });
});

describe("liveUrlField", () => {
  it("finds checkpoint 3's rendered URL and nothing else", () => {
    expect(liveUrlField(WORKING.fieldSchema)?.key).toBe("liveUrl");
    expect(liveUrlField(IDEA.fieldSchema)).toBeNull();
    expect(liveUrlField(null)).toBeNull();
  });
});

describe("redactImages", () => {
  it("keeps the words and replaces the bytes with a size", () => {
    const text = redactImages([
      { type: "text", text: "judge this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAAAAAA" } },
    ]);
    expect(text).toContain("judge this");
    expect(text).not.toContain("base64");
    expect(text).toMatch(/\[image 2, \d+ bytes\]/);
  });
});

describe("criterionIdsFrom", () => {
  it("reads the ids the system prompt names, so the fake answers the contract", () => {
    const ids = criterionIdsFrom(
      "blah\n\nThe criterion ids, exactly: one-liner, job-story, audience",
    );
    expect(ids).toEqual(["one-liner", "job-story", "audience"]);
    expect(criterionIdsFrom("no rubric here")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The live pipeline
// ---------------------------------------------------------------------------

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient();
    await client.$queryRaw`SELECT 1`;
    await client.$disconnect();
    return true;
  } catch {
    return false;
  }
}

const live = await dbReachable();

const TEST_USER_ID = "user_shipyard_m2";
const TEST_EMAIL = "shipyard-m2@example.invalid";
const TEST_NAME = "Meera Raghunathan";

type RecordedCall = { task: string; system: string; userText: string };

/**
 * A model that answers from a script. It validates against the caller's real
 * schema, so a fake that drifts from the contract fails the test rather than
 * quietly passing a shape the pipeline could never receive.
 */
function fakeModel(
  recorded: RecordedCall[],
  respond: (args: StructuredCallArgs<unknown>) => unknown,
): typeof callStructured {
  return (async <T,>(
    args: StructuredCallArgs<T>,
  ): Promise<StructuredCallResult<T>> => {
    recorded.push({
      task: args.task,
      system: args.system,
      userText:
        typeof args.user === "string"
          ? args.user
          : args.user.map((p) => (p.type === "text" ? p.text : "[image]")).join("\n"),
    });
    const data = respond(args as unknown as StructuredCallArgs<unknown>);
    const parsed = args.schema.safeParse(data);
    if (!parsed.success) throw new Error(`fake model: ${parsed.error.message}`);
    return {
      data: parsed.data,
      modelUsed: "z-ai/glm-5.3-flash",
      providerUsed: "fake",
      tokensIn: 1_000,
      tokensOut: 200,
      costUsd: 0.000_25,
      raw: JSON.stringify(data),
    };
  }) as typeof callStructured;
}

function verdictPayload(
  criteria: readonly string[],
  opts: { verdict: "pass" | "return"; confidence?: number; unmet?: string[] },
) {
  const unmet = new Set(opts.unmet ?? []);
  return {
    verdict: opts.verdict,
    confidence: opts.confidence ?? 0.9,
    reasons: criteria.map((id) => ({
      criterion: id,
      met: !unmet.has(id),
      note: unmet.has(id) ? `You have not met ${id} yet; here is what to fix.` : "Met.",
    })),
    rubricScores: Object.fromEntries(criteria.map((id) => [id, unmet.has(id) ? 30 : 74])),
    contradictions: [],
    flags: [],
    summaryForStudent:
      opts.verdict === "pass"
        ? "This clears the bar. The next checkpoint is open."
        : "Two things to fix before this clears. Read the notes beside each clause.",
  };
}

const ideaFields = (productId: string) => ({
  productName: "DabbaRoute",
  oneLiner: "Morning delivery routes for home tiffin kitchens, sent to riders on WhatsApp",
  jobStory:
    "When a new customer signs up mid-month and I have to re-plan the morning route before 10:30, I want the stops re-ordered for me, so I can send each rider a list instead of redrawing it on paper.",
  waitlistUrl: "https://dabbaroute.example.com/waitlist",
  signupCount: 84,
  trafficTestNotes:
    "Two WhatsApp groups of Koramangala tiffin kitchens and one small Instagram ad set. 5,100 impressions, 390 visits, spend 1,800 INR.",
  signupScreenshot: [`shipyard/${productId}/idea/a-signups.png`],
});

describe.skipIf(!live)("the review pipeline (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let seeded = false;
  let productId = "";

  const baseDeps = () => ({
    db: prisma,
    probe: async () => ({ alive: true, status: 200 }),
    fetchFile: async () => Buffer.from("not a real image"),
    storageConfigured: () => false,
    tracker: { getCheckpointSignals: async () => null },
  });

  async function submitDirect(
    checkpointKey: "idea" | "design" | "working" | "workflow",
    fields: Record<string, unknown>,
    version = 1,
  ): Promise<string> {
    const checkpoint = await prisma.shipyardCheckpoint.findFirstOrThrow({
      where: { key: checkpointKey },
    });
    const row = await prisma.shipyardSubmission.create({
      data: {
        productId,
        checkpointId: checkpoint.id,
        status: "submitted",
        fields: fields as never,
        files: [],
        version,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    return row.id;
  }

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    seeded = (await prisma.shipyardCheckpoint.count()) === 6;
    if (!seeded) return;

    await prisma.shipyardProduct.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.notification.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.user.create({
      data: { id: TEST_USER_ID, email: TEST_EMAIL, name: TEST_NAME, role: "student" },
    });
    const product = await ensureProduct(TEST_USER_ID, { db: prisma });
    productId = product.id;
    await prisma.shipyardProduct.update({
      where: { id: productId },
      data: { name: "DabbaRoute", oneLiner: "Routes for tiffin kitchens" },
    });
    await prisma.costLog.deleteMany({ where: { refId: { startsWith: "" }, feature: "shipyard.verdict", provider: "fake" } });
  }, 60_000);

  afterAll(async () => {
    if (prisma && seeded) {
      await prisma.shipyardProduct.deleteMany({ where: { userId: TEST_USER_ID } });
      await prisma.notification.deleteMany({ where: { userId: TEST_USER_ID } });
      await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    }
    await prisma?.$disconnect();
  });

  it("passes a clean submission, clears the gate, and never shows the model the student", async () => {
    if (!seeded) return;
    const submissionId = await submitDirect("idea", ideaFields(productId));
    const recorded: RecordedCall[] = [];
    const criteria = IDEA.rubric.criteria.map((c) => c.id);

    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      call: fakeModel(recorded, () => verdictPayload(criteria, { verdict: "pass" })),
    });

    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.kind).toBe("verdict");
    expect(outcome.status).toBe("passed");
    expect(outcome.heldForHuman).toBe(false);

    // The gate moved, and checkpoint 2 opened.
    const states = await prisma.shipyardCheckpointState.findMany({
      where: { productId },
      include: { checkpoint: { select: { order: true } } },
      orderBy: { checkpoint: { order: "asc" } },
    });
    expect(states[0].state).toBe("passed");
    expect(states[1].state).toBe("open");

    // SPEC §6: the reviewer never sees a name, an email or a section.
    const verdictCall = recorded.find((c) => c.task === "verdict");
    expect(verdictCall).toBeTruthy();
    const everything = `${verdictCall!.system}\n${verdictCall!.userText}`;
    expect(everything).not.toContain(TEST_NAME);
    expect(everything).not.toContain(TEST_EMAIL);
    expect(everything).not.toContain("Meera");

    // One CostLog row per model call, beside the fields on the review.
    const costs = await prisma.costLog.findMany({ where: { refId: submissionId } });
    expect(costs).toHaveLength(recorded.length);
    expect(costs.some((c) => c.feature === COST_FEATURE_VERDICT)).toBe(true);
    const review = await prisma.shipyardReview.findFirstOrThrow({ where: { submissionId } });
    expect(review.costUsd).toBeGreaterThan(0);
    expect(review.tokensIn).toBe(1_000);
    expect(review.promptLog).toBeTruthy();
  }, 60_000);

  it("HOLDS a low-confidence pass, then a human ruling clears it", async () => {
    if (!seeded) return;
    const submissionId = await submitDirect("design", {
      flowNotes: "Seven screens, numbered, drawn on paper. Screen 1 is the route list.",
      sketches: [],
    });
    const criteria = checkpointDefinition("design").rubric.criteria.map((c) => c.id);
    const recorded: RecordedCall[] = [];

    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      call: fakeModel(recorded, () =>
        verdictPayload(criteria, { verdict: "pass", confidence: 0.41 }),
      ),
    });
    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;

    // The pass is RECORDED but the submission has not moved and the gate is shut.
    expect(outcome.status).toBe("in_review");
    expect(outcome.heldForHuman).toBe(true);
    const submission = await prisma.shipyardSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { reviews: true },
    });
    expect(submission.status).toBe("in_review");
    expect(submission.reviews[0].verdict).toBe("pass");
    expect(submission.reviews[0].needsHuman).toBe(true);

    const design = await prisma.shipyardCheckpointState.findFirstOrThrow({
      where: { productId, checkpoint: { key: "design" } },
    });
    expect(design.state).toBe("open");

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    expect(note.title).toBe("Checkpoint 2 is with a reviewer");
    expect(note.body).toBe(HELD_PASS_BODY);

    // It is in the queue, marked as a held pass.
    const queue = await loadReviewQueue({}, { db: prisma });
    const entry = queue.find((e) => e.reviewId === submission.reviews[0].id);
    expect(entry).toBeTruthy();
    expect(entry!.heldPass).toBe(true);
    expect(entry!.needsHumanReasons.join(" ")).toMatch(/confidence/);

    // The ruling is what opens the gate.
    const resolved = await humanResolve(
      submission.reviews[0].id,
      { decision: "pass", reason: "Looked at the photos; the screens are hand-drawn and complete.", actorId: "instructor_test" },
      { db: prisma, tracker: baseDeps().tracker },
    );
    expect(resolved.status).toBe("passed");
    expect(resolved.overrode).toBe(false);

    const after = await prisma.shipyardCheckpointState.findFirstOrThrow({
      where: { productId, checkpoint: { key: "design" } },
    });
    expect(after.state).toBe("passed");
    expect(
      await prisma.auditLog.count({
        where: { action: "shipyard.review.resolve", targetId: submission.reviews[0].id },
      }),
    ).toBe(1);

    // A second ruling on the same review is refused.
    await expect(
      humanResolve(
        submission.reviews[0].id,
        { decision: "return", reason: "changed my mind", actorId: "instructor_test" },
        { db: prisma },
      ),
    ).rejects.toThrow();
  }, 60_000);

  it("renders a live product, stores the render artifacts, and returns with reasons", async () => {
    if (!seeded) return;
    const submissionId = await submitDirect("working", {
      liveUrl: "https://dabbaroute.example.com",
      corePath: "Add a stop, reorder the route, send to a rider.",
      whatIsRough: "The rider view is not mobile-friendly yet.",
    });
    const criteria = WORKING.rubric.criteria.map((c) => c.id);
    const recorded: RecordedCall[] = [];
    let renderedUrl = "";

    const render: RenderResult = {
      ok: true,
      finalUrl: "https://dabbaroute.example.com/",
      status: 200,
      title: "DabbaRoute",
      domText: "Today's route · 14 stops · Send to rider",
      screenshotPng: Buffer.from("PNGBYTES"),
      consoleErrors: Array.from({ length: 25 }, (_, i) => `error ${i}`),
      blockedRequests: 3,
      notes: ["the page never went network-idle; rendered what was on screen at 8s"],
    };

    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      render: async (url) => {
        renderedUrl = url;
        return render;
      },
      call: fakeModel(recorded, () =>
        verdictPayload(criteria, { verdict: "return", unmet: [criteria[0]] }),
      ),
    });

    expect(renderedUrl).toBe("https://dabbaroute.example.com");
    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.status).toBe("returned");

    const review = await prisma.shipyardReview.findFirstOrThrow({ where: { submissionId } });
    const artifacts = review.renderArtifacts as Record<string, unknown>;
    expect(artifacts.domText).toContain("Today's route");
    expect(artifacts.finalUrl).toBe("https://dabbaroute.example.com/");
    expect(artifacts.status).toBe(200);
    expect(artifacts.blockedRequests).toBe(3);
    // Ten lines of console noise is as much as anyone reads.
    expect((artifacts.consoleErrors as string[]).length).toBe(10);
    // S3 is not configured in the test, so nothing was stored and it says so.
    expect(artifacts.screenshotS3Key).toBeNull();

    // The render reached the prompt.
    const verdictCall = recorded.find((c) => c.task === "verdict")!;
    expect(verdictCall.userText).toContain("Today's route");

    const reasons = review.reasons as { criterion: string; met: boolean }[];
    expect(reasons.filter((r) => !r.met).map((r) => r.criterion)).toEqual([criteria[0]]);

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    expect(note.title).toBe("Checkpoint 3 returned");
    // The notification carries the reviewer's summary, not a clause note.
    expect(note.body).toBe("Two things to fix before this clears. Read the notes beside each clause.");
  }, 60_000);

  it("short-circuits a blank submission without ever calling the verdict tier", async () => {
    if (!seeded) return;
    const submissionId = await submitDirect(
      "working",
      { liveUrl: "https://dabbaroute.example.com", corePath: "x", whatIsRough: "y" },
      2,
    );
    const recorded: RecordedCall[] = [];

    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      render: async () => ({
        ok: false,
        finalUrl: "https://dabbaroute.example.com",
        status: 200,
        title: "",
        domText: "",
        screenshotPng: null,
        consoleErrors: [],
        blockedRequests: 0,
        notes: [],
      }),
      call: fakeModel(recorded, () => {
        throw new Error("the verdict tier must not be called for a blank submission");
      }),
    });

    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.kind).toBe("short-circuit");
    expect(outcome.status).toBe("returned");
    expect(recorded.filter((c) => c.task === "verdict")).toHaveLength(0);

    const review = await prisma.shipyardReview.findFirstOrThrow({ where: { submissionId } });
    expect(review.needsHuman).toBe(true);
    expect(review.costUsd).toBe(0);
    expect(JSON.stringify(review.reasons)).toContain(BLANK_SHORT_CIRCUIT_NOTE.slice(0, 40));
  }, 60_000);

  it("does not hold a legitimate pass because a short circuit scored zero first", async () => {
    if (!seeded) return;
    // Checkpoint 3 already holds a blank short circuit (every criterion 0,
    // modelUsed "heuristic"). Carrying those forward as `priorScores` made the
    // next real attempt look like a 74-point jump into a pass and held it for
    // a human who had nothing to decide (C10).
    const zeroed = await prisma.shipyardReview.findFirst({
      where: { submission: { productId, checkpoint: { key: "working" } }, modelUsed: "heuristic" },
      orderBy: { createdAt: "desc" },
    });
    expect(zeroed).toBeTruthy();

    const submissionId = await submitDirect(
      "working",
      {
        liveUrl: "https://dabbaroute.example.com",
        corePath: "Add a stop, reorder the route, send it to a rider on WhatsApp.",
        whatIsRough: "The rider view is still tight on a small phone.",
      },
      3,
    );
    const criteria = WORKING.rubric.criteria.map((c) => c.id);
    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      render: async () => ({
        ok: true,
        finalUrl: "https://dabbaroute.example.com/",
        status: 200,
        title: "DabbaRoute",
        domText: "Today's route · 14 stops · Send to rider",
        screenshotPng: null,
        consoleErrors: [],
        blockedRequests: 0,
        notes: [],
      }),
      call: fakeModel([], () => verdictPayload(criteria, { verdict: "pass" })),
    });

    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.heldForHuman).toBe(false);
    expect(outcome.status).toBe("passed");
    const review = await prisma.shipyardReview.findFirstOrThrow({ where: { submissionId } });
    expect(review.needsHuman).toBe(false);
  }, 60_000);

  it("records a workflow write-up without a model call", async () => {
    if (!seeded) return;
    // Open the workflow checkpoint by hand; this test is about the reviewer,
    // not the gate sequence.
    const submissionId = await submitDirect("workflow", {
      workflowUrl: "https://n8n.example.com/workflow/12",
      whatItAutomates: "Every new order creates a stop and messages the rider.",
    });
    const recorded: RecordedCall[] = [];
    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      call: fakeModel(recorded, () => {
        throw new Error("a metric-only checkpoint must not reach a model");
      }),
    });
    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.kind).toBe("informational");
    expect(recorded).toHaveLength(0);
    const review = await prisma.shipyardReview.findFirstOrThrow({ where: { submissionId } });
    expect(review.modelUsed).toBe("none");
    expect(review.costUsd).toBe(0);
  }, 60_000);

  it("tells checkpoint 5 the run count rather than that anything cleared", async () => {
    if (!seeded) return;
    const { emptySignals } = await import("@/lib/tracker/types");
    const signals = { ...emptySignals(new Date()), workflowRuns: 7, trackerConnected: true };
    const submissionId = await submitDirect(
      "workflow",
      {
        workflowUrl: "https://n8n.example.com/workflow/12",
        whatItAutomates: "Every new order creates a stop and messages the rider.",
      },
      2,
    );
    const outcome = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      tracker: { getCheckpointSignals: async () => signals },
      call: fakeModel([], () => {
        throw new Error("a metric-only checkpoint must not reach a model");
      }),
    });
    expect(outcome.handled).toBe(true);

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    // "Checkpoint 5 cleared" would be a lie: the gate is the tracker's tenth
    // run, and nothing about this write-up moved it (C3).
    expect(note.title).toBe("Checkpoint 5 notes saved");
    expect(note.body).toBe("Runs are counted from your tagged n8n workflow: 7 of 10.");
  }, 60_000);

  it("flips the profile and writes the audit row after five BYOK failures", async () => {
    if (!seeded) return;
    await prisma.auditLog.deleteMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
    await saveRouterState(prisma, { ...INITIAL_ROUTER_STATE }, "test:setup");

    let state = await loadRouterState(prisma);
    for (let i = 0; i < BYOK_FAILURE_THRESHOLD; i++) {
      state = applyByokOutcome(state, "byok-credit-or-auth-error");
      await saveRouterState(prisma, state, "system:shipyard-reviewer");
    }

    const after = await loadRouterState(prisma);
    expect(after.anthropicExhausted).toBe(true);
    expect(after.activeProfile).toBe("flash-everywhere");
    expect(after.consecutiveByokFailures).toBe(BYOK_FAILURE_THRESHOLD);

    const audits = await prisma.auditLog.findMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({ activeProfile: "flash-everywhere" });

    // Put it back, so a later suite on the same database is not surprised.
    await saveRouterState(prisma, { ...INITIAL_ROUTER_STATE }, "test:teardown");
    await prisma.auditLog.deleteMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
  }, 60_000);

  it("counts five SIMULTANEOUS failures as five, and flips exactly once", async () => {
    if (!seeded) return;
    await prisma.auditLog.deleteMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
    await saveRouterState(prisma, { ...INITIAL_ROUTER_STATE }, "test:setup");

    // Fifteen reviewer workers share one row. Writing the counter back as an
    // absolute number from each worker's own snapshot lost every increment but
    // the last, so the fifth consecutive failure never arrived (C2).
    const results = await Promise.all(
      Array.from({ length: BYOK_FAILURE_THRESHOLD }, () =>
        recordByokOutcome(prisma, "byok-credit-or-auth-error", { actor: "test:concurrent" }),
      ),
    );

    const after = await loadRouterState(prisma);
    expect(after.consecutiveByokFailures).toBe(BYOK_FAILURE_THRESHOLD);
    expect(after.anthropicExhausted).toBe(true);
    expect(after.activeProfile).toBe("flash-everywhere");
    // Every caller is told the truth, and the one that crossed the line says so.
    expect(results.some((r) => r.anthropicExhausted)).toBe(true);

    const audits = await prisma.auditLog.findMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
    expect(audits).toHaveLength(1);

    // A success zeroes it again, atomically, and does not re-audit anything.
    const reset = await recordByokOutcome(prisma, "ok", { actor: "test:concurrent" });
    expect(reset.consecutiveByokFailures).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
      }),
    ).toBe(1);

    await saveRouterState(prisma, { ...INITIAL_ROUTER_STATE }, "test:teardown");
    await prisma.auditLog.deleteMany({
      where: { action: ROUTER_FLIP_AUDIT_ACTION, targetId: ROUTER_STATE_ID },
    });
  }, 60_000);

  it("does not review a submission that already carries a verdict", async () => {
    if (!seeded) return;
    // A held pass is `in_review` WITH its review row, so status alone cannot
    // tell it apart from one waiting to be judged. A post-commit failure used
    // to send the job back and the whole render-and-model run happened again,
    // writing a second verdict and charging for it twice (C7).
    const submissionId = await submitDirect(
      "design",
      { flowNotes: "Nine screens, numbered, photographed on the kitchen table.", sketches: [] },
      3,
    );
    const criteria = checkpointDefinition("design").rubric.criteria.map((c) => c.id);
    const first = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      call: fakeModel([], () => verdictPayload(criteria, { verdict: "pass", confidence: 0.4 })),
    });
    expect(first.handled).toBe(true);
    if (!first.handled) return;
    expect(first.status).toBe("in_review");
    expect(first.heldForHuman).toBe(true);

    const costsBefore = await prisma.costLog.count({ where: { refId: submissionId } });

    const again = await runReviewPipeline(submissionId, {
      ...baseDeps(),
      call: fakeModel([], () => {
        throw new Error("a submission that already has a verdict must not be reviewed again");
      }),
    });

    expect(again.handled).toBe(false);
    if (again.handled) return;
    expect(again.reason).toBe("already-final");
    expect(await prisma.shipyardReview.count({ where: { submissionId } })).toBe(1);
    expect(await prisma.costLog.count({ where: { refId: submissionId } })).toBe(costsBefore);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// The cost meter
// ---------------------------------------------------------------------------

describe("daySeries", () => {
  it("returns a fortnight of UTC days, oldest first, with no gaps", () => {
    const series = daySeries(new Date("2026-09-15T23:30:00.000Z"));
    expect(series).toHaveLength(COST_DAYS);
    expect(series[COST_DAYS - 1]).toBe("2026-09-15");
    expect(series[0]).toBe("2026-09-02");
    expect(new Set(series).size).toBe(COST_DAYS);
  });

  it("buckets by UTC day, so a deadline night does not straddle two", () => {
    expect(dayKey(new Date("2026-09-15T23:59:59.000Z"))).toBe("2026-09-15");
    expect(dayKey(new Date("2026-09-16T00:00:01.000Z"))).toBe("2026-09-16");
  });
});

describe.skipIf(!live)("the cost meter (live DB, against the seed)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let seeded = false;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    seeded = (await prisma.shipyardCheckpoint.count()) === 6;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("totals both sources and keeps them apart", async () => {
    if (!seeded) return;
    const meter = await loadCostMeter({
      db: prisma,
      // pg-boss is not running in a unit test; the meter must still answer.
      deadLetter: async () => [],
    });

    expect(meter.reviews.total).toBeGreaterThan(0);
    expect(meter.reviews.passed + meter.reviews.returned).toBe(meter.reviews.total);
    expect(meter.reviews.meanConfidence).toBeGreaterThan(0);
    expect(meter.reviews.meanConfidence).toBeLessThanOrEqual(1);

    // Every seeded review lands in exactly one checkpoint bucket.
    const bucketed = meter.byCheckpoint.reduce((a, b) => a + b.calls, 0);
    expect(bucketed).toBe(meter.reviews.total);

    // The daily series is a line, not a ranking: fourteen days, in order.
    expect(meter.byDay).toHaveLength(COST_DAYS);
    expect([...meter.byDay].map((b) => b.label).sort()).toEqual(
      meter.byDay.map((b) => b.label),
    );

    // CostLog totals reconcile with their own breakdowns.
    expect(meter.byModel.reduce((a, b) => a + b.calls, 0)).toBe(meter.totals.calls);
    expect(meter.byFeature.reduce((a, b) => a + b.calls, 0)).toBe(meter.totals.calls);

    expect(meter.deadLetter.queue).toBe("shipyard.review.dead");
    expect(meter.router.routes.verdict).toHaveLength(2);
    expect(meter.router.prices["z-ai/glm-5.3-flash"].inPerMillion).toBeGreaterThan(0);
    expect(typeof meter.router.killSwitchActive).toBe("boolean");
  }, 60_000);

  it("counts held passes inside the open human queue", async () => {
    if (!seeded) return;
    const meter = await loadCostMeter({ db: prisma, deadLetter: async () => [] });
    const open = await prisma.shipyardReview.count({
      where: { needsHuman: true, humanResolvedAt: null },
    });
    expect(meter.reviews.needsHumanOpen).toBe(open);
    expect(meter.reviews.heldPasses).toBeLessThanOrEqual(meter.reviews.needsHumanOpen);
  }, 60_000);
});
