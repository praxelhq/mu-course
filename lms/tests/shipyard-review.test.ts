import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  rubricClauses,
  stubVerdict,
  STUB_RETURN_NOTE,
  STUB_RETURN_TOKEN,
  handleReviewSubmission,
} from "@/worker/shipyard-jobs/review-submission";
import {
  DEAD_LETTER_REASON,
  handleReviewDeadLetter,
} from "@/worker/shipyard-jobs/review-dead-letter";
import { notificationBody, notificationFor } from "@/lib/shipyard/review-complete";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { createSubmission, SubmissionError } from "@/lib/shipyard/submissions";
import { ensureProduct } from "@/lib/shipyard/products";
import { loadSpine } from "@/lib/shipyard/spine";
import type { FieldSpec } from "@/lib/shipyard/fields";

// ---------------------------------------------------------------------------
// Pure: the stub reviewer
// ---------------------------------------------------------------------------

const IDEA = checkpointDefinition("idea");

const SPECS: FieldSpec[] = [
  { key: "a", label: "A", kind: "text", required: true },
  { key: "b", label: "B", kind: "text", required: false },
];

describe("rubricClauses", () => {
  it("reads a checkpoint's clauses in order", () => {
    expect(rubricClauses(IDEA.rubric)).toEqual(IDEA.rubric.criteria.map((c) => c.clause));
  });

  it("always yields at least one clause", () => {
    expect(rubricClauses(null)).toEqual(["Meets the published bar"]);
    expect(rubricClauses({ criteria: [] })).toEqual(["Meets the published bar"]);
  });
});

describe("stubVerdict", () => {
  it("passes a complete attempt, with one met reason per rubric criterion", () => {
    const verdict = stubVerdict({
      fields: { a: "filled" },
      rubric: IDEA.rubric,
      gateType: "review",
      fieldSpecs: SPECS,
    });
    expect(verdict.verdict).toBe("pass");
    expect(verdict.reasons).toHaveLength(IDEA.rubric.criteria.length);
    expect(verdict.reasons.every((r) => r.met)).toBe(true);
    expect(verdict.modelUsed).toBe("stub");
    expect(verdict.providerUsed).toBe("stub");
    expect(verdict.tokensIn).toBe(0);
    expect(verdict.costUsd).toBe(0);
    expect(verdict.confidence).toBe(1);
    expect(verdict.reviewedBy).toBe("ai");
  });

  it("returns when the demo token appears in any field value", () => {
    const verdict = stubVerdict({
      fields: { a: `please ${STUB_RETURN_TOKEN} this one` },
      rubric: IDEA.rubric,
      gateType: "review",
      fieldSpecs: SPECS,
    });
    expect(verdict.verdict).toBe("return");
    expect(verdict.reasons[0]).toEqual({
      criterion: IDEA.rubric.criteria[0].clause,
      met: false,
      note: STUB_RETURN_NOTE,
    });
    expect(verdict.reasons.slice(1).every((r) => r.met)).toBe(true);
  });

  it("finds the token inside a file-key array too", () => {
    expect(
      stubVerdict({
        fields: { a: "ok", c: [STUB_RETURN_TOKEN] },
        rubric: IDEA.rubric,
        gateType: "review",
        fieldSpecs: SPECS,
      }).verdict,
    ).toBe("return");
  });

  it("returns a judged checkpoint whose required field is blank", () => {
    for (const gateType of ["review", "both"] as const) {
      expect(
        stubVerdict({ fields: { a: "   " }, rubric: IDEA.rubric, gateType, fieldSpecs: SPECS })
          .verdict,
        gateType,
      ).toBe("return");
    }
  });

  it("does not judge a pure metric checkpoint on its write-up", () => {
    expect(
      stubVerdict({ fields: { a: "" }, rubric: IDEA.rubric, gateType: "metric", fieldSpecs: SPECS })
        .verdict,
    ).toBe("pass");
  });
});

describe("notificationBody", () => {
  it("quotes the first unmet reason on a return", () => {
    expect(
      notificationBody(
        "return",
        [
          { criterion: "one", met: true, note: "Met." },
          { criterion: "two", met: false, note: "The waitlist URL returned 404." },
        ],
        "Design",
      ),
    ).toBe("The waitlist URL returned 404.");
  });

  it("names the next checkpoint on a pass", () => {
    expect(notificationBody("pass", [], "The screens, drawn by hand")).toBe(
      "Next: The screens, drawn by hand.",
    );
  });

  it("says so when there is nothing left", () => {
    expect(notificationBody("pass", [], null)).toMatch(/Every checkpoint is cleared/);
  });
});

// ---------------------------------------------------------------------------
// What the student is actually told (C3): the GATE decides, not the verdict
// ---------------------------------------------------------------------------

describe("notificationFor", () => {
  const base = {
    order: 4,
    verdict: "pass" as const,
    held: false,
    nextTitle: "Launch",
    nextOpened: false,
    reasons: [],
    studentSummary: "The pricing is specific and the checkout link opens.",
  };

  it("says cleared, and names the next checkpoint, only when it really opened", () => {
    const cleared = notificationFor({
      ...base,
      state: { state: "passed", reason: "review-and-metric-passed" },
      nextOpened: true,
    });
    expect(cleared.title).toBe("Checkpoint 4 cleared");
    expect(cleared.body).toBe("Next: Launch.");
  });

  it("does not say cleared when only the write-up half of a `both` gate passed", () => {
    const half = notificationFor({
      ...base,
      state: { state: "open", reason: "awaiting-metrics" },
    });
    expect(half.title).toBe("Checkpoint 4 write-up accepted");
    expect(half.body).toBe(
      "Payments live and tracker connected are still being read from Shipped.money.",
    );
  });

  it("names the blocking flag and the unreachable tracker as the different things they are", () => {
    expect(
      notificationFor({ ...base, state: { state: "open", reason: "blocked-by-flag" } }).body,
    ).toMatch(/blocking flag/);
    expect(
      notificationFor({ ...base, state: { state: "open", reason: "tracker-unreachable" } }).body,
    ).toMatch(/could not be read/);
  });

  it("calls checkpoint 5's write-up what it is: notes, not a verdict", () => {
    const informational = notificationFor({
      ...base,
      order: 5,
      state: { state: "open", reason: "awaiting-metrics" },
      informational: true,
      workflowRuns: 7,
    });
    expect(informational.title).toBe("Checkpoint 5 notes saved");
    expect(informational.body).toBe(
      "Runs are counted from your tagged n8n workflow: 7 of 10.",
    );
  });

  it("still says `with a reviewer` for a held pass, and `returned` for a return", () => {
    expect(
      notificationFor({ ...base, held: true, state: { state: "open", reason: "awaiting-review" } })
        .title,
    ).toBe("Checkpoint 4 is with a reviewer");
    expect(
      notificationFor({
        ...base,
        verdict: "return",
        state: { state: "open", reason: "awaiting-review" },
      }).title,
    ).toBe("Checkpoint 4 returned");
  });
});

// ---------------------------------------------------------------------------
// Live DB: submit → review → gate flip → notification
//
// These walk M1's STUB reviewer, which is why every call passes `stub: true`.
// Since M2 `handleReviewSubmission` defaults to the real pipeline; the stub is
// kept for the keyless demo and is exercised here.
// ---------------------------------------------------------------------------

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

const TEST_USER_ID = "user_shipyard_m1";
const TEST_EMAIL = "shipyard-m1@example.invalid";

const ideaFields = (productId: string) => ({
  productName: "TiffinTrail",
  oneLiner: "Weekly tiffin subscriptions from verified home kitchens in Koramangala",
  jobStory:
    "When Sunday evening comes and I have not planned the week's meals, I want a kitchen I already trust to send lunch every day, so I can stop deciding at 11am.",
  waitlistUrl: "https://tiffintrail.example.com/waitlist",
  signupCount: 62,
  trafficTestNotes: "Two community posts and one small ad set. 4,200 impressions, 310 visits.",
  signupScreenshot: [`shipyard/${productId}/idea/a-signups.png`],
});

const designSketches = (productId: string) => [
  `shipyard/${productId}/design/a-screen-1.jpg`,
  `shipyard/${productId}/design/b-screen-2.jpg`,
];

describe.skipIf(!live)("the review pipeline (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let seeded = false;
  let productId = "";

  const submitDeps = {
    db: undefined as unknown as import("@prisma/client").PrismaClient,
    storageConfigured: () => false,
    probe: async () => ({ ok: true, status: 200 }),
    enqueue: async () => null,
  };

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    submitDeps.db = prisma;
    seeded = (await prisma.shipyardCheckpoint.count()) === 6;
    if (!seeded) return;

    await prisma.shipyardProduct.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.notification.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.user.create({
      data: { id: TEST_USER_ID, email: TEST_EMAIL, name: "M1 Walkthrough", role: "student" },
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma && seeded) {
      await prisma.shipyardProduct.deleteMany({ where: { userId: TEST_USER_ID } });
      await prisma.notification.deleteMany({ where: { userId: TEST_USER_ID } });
      await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    }
    await prisma?.$disconnect();
  });

  it("gives a new student a product and six checkpoint states, idempotently", async () => {
    if (!seeded) return;
    const product = await ensureProduct(TEST_USER_ID, { db: prisma });
    productId = product.id;
    expect(product.name).toBe("");
    expect(product.oneLiner).toBe("");
    expect(await prisma.shipyardCheckpointState.count({ where: { productId } })).toBe(6);

    const again = await ensureProduct(TEST_USER_ID, { db: prisma });
    expect(again.id).toBe(productId);
    expect(await prisma.shipyardProduct.count({ where: { userId: TEST_USER_ID } })).toBe(1);
  });

  it("walks submit → stub review → passed → checkpoint 2 open", async () => {
    if (!seeded) return;
    const created = await createSubmission(
      { userId: TEST_USER_ID, checkpointKey: "idea", fields: ideaFields(productId) },
      submitDeps,
    );
    expect(created.status).toBe("submitted");

    const before = await loadSpine(TEST_USER_ID, { db: prisma, presign: async () => undefined });
    expect(before.checkpoints[1].state).toBe("locked");
    expect(before.product?.name).toBe("TiffinTrail");

    const outcome = await handleReviewSubmission(created.submissionId, { db: prisma, stub: true });
    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.status).toBe("passed");

    const after = await loadSpine(TEST_USER_ID, { db: prisma, presign: async () => undefined });
    expect(after.checkpoints[0].state).toBe("passed");
    expect(after.checkpoints[0].passedAt).toBeTruthy();
    expect(after.checkpoints[0].latestSubmission?.review?.verdict).toBe("pass");
    expect(after.checkpoints[1].state).toBe("open");
    expect(after.currentOrder).toBe(2);

    const notification = await prisma.notification.findFirst({
      where: { userId: TEST_USER_ID, kind: "shipyard.review" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification?.title).toBe("Checkpoint 1 cleared");
    expect(notification?.body).toContain("Next:");

    // A retry of the same job must not write a second verdict.
    const replay = await handleReviewSubmission(created.submissionId, { db: prisma, stub: true });
    expect(replay.handled).toBe(false);
    expect(await prisma.shipyardReview.count({ where: { submissionId: created.submissionId } })).toBe(1);
  });

  it("returns a checkpoint 2 attempt carrying the demo token, and holds the cooldown", async () => {
    if (!seeded) return;
    const created = await createSubmission(
      {
        userId: TEST_USER_ID,
        checkpointKey: "design",
        fields: {
          flowNotes: `Six screens, numbered. ${STUB_RETURN_TOKEN}`,
          sketches: designSketches(productId),
        },
      },
      submitDeps,
    );

    const outcome = await handleReviewSubmission(created.submissionId, { db: prisma, stub: true });
    expect(outcome.handled).toBe(true);
    if (!outcome.handled) return;
    expect(outcome.status).toBe("returned");

    const view = await loadSpine(TEST_USER_ID, { db: prisma, presign: async () => undefined });
    const design = view.checkpoints[1];
    expect(design.state).toBe("open");
    expect(design.latestSubmission?.status).toBe("returned");
    expect(design.latestSubmission?.review?.verdict).toBe("return");
    expect(design.latestSubmission?.review?.reasons[0]).toMatchObject({
      met: false,
      note: STUB_RETURN_NOTE,
    });
    expect(view.checkpoints[2].state).toBe("locked");

    const notification = await prisma.notification.findFirst({
      where: { userId: TEST_USER_ID, kind: "shipyard.review" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification?.title).toBe("Checkpoint 2 returned");
    expect(notification?.body).toBe(STUB_RETURN_NOTE);

    // Resubmitting immediately is refused, with the time remaining.
    let refused: SubmissionError | null = null;
    try {
      await createSubmission(
        {
          userId: TEST_USER_ID,
          checkpointKey: "design",
          fields: { flowNotes: "Six screens, numbered.", sketches: designSketches(productId) },
        },
        submitDeps,
      );
    } catch (err) {
      if (err instanceof SubmissionError) refused = err;
      else throw err;
    }
    expect(refused?.status).toBe(429);
    expect(refused?.body.nextAllowedResubmitAt).toBeTruthy();
    expect(refused?.body.humanText).toBeTruthy();
  });

  it("refuses a submission for a locked checkpoint", async () => {
    if (!seeded) return;
    let refused: SubmissionError | null = null;
    try {
      await createSubmission(
        {
          userId: TEST_USER_ID,
          checkpointKey: "launch",
          fields: {
            launchWriteup: "x",
            distributionChannels: "y",
            firstCustomerStory: "z",
          },
        },
        submitDeps,
      );
    } catch (err) {
      if (err instanceof SubmissionError) refused = err;
      else throw err;
    }
    expect(refused?.status).toBe(409);
    expect(refused?.body.error).toMatch(/not open/i);
  });

  it("refuses a second submission for a cleared checkpoint", async () => {
    if (!seeded) return;
    let refused: SubmissionError | null = null;
    try {
      await createSubmission(
        { userId: TEST_USER_ID, checkpointKey: "idea", fields: ideaFields(productId) },
        submitDeps,
      );
    } catch (err) {
      if (err instanceof SubmissionError) refused = err;
      else throw err;
    }
    expect(refused?.status).toBe(409);
    expect(refused?.body.error).toMatch(/already cleared/i);
  });

  it("returns a stuck submission from the dead-letter queue rather than leaving it in review", async () => {
    if (!seeded) return;
    const checkpoint = await prisma.shipyardCheckpoint.findFirstOrThrow({ where: { key: "working" } });
    const stuck = await prisma.shipyardSubmission.create({
      data: {
        productId,
        checkpointId: checkpoint.id,
        status: "in_review",
        fields: { liveUrl: "https://tiffintrail.example.com" },
        files: [],
        version: 1,
        submittedAt: new Date(),
      },
    });

    const outcome = await handleReviewDeadLetter(stuck.id, { db: prisma });
    expect(outcome.handled).toBe(true);

    const after = await prisma.shipyardSubmission.findUniqueOrThrow({
      where: { id: stuck.id },
      include: { reviews: true },
    });
    expect(after.status).toBe("returned");
    expect(after.reviews[0].verdict).toBe("return");
    expect(after.reviews[0].needsHuman).toBe(true);
    expect(JSON.stringify(after.reviews[0].reasons)).toContain(DEAD_LETTER_REASON);

    // A verdict that already landed is never overwritten by a late dead letter.
    const second = await handleReviewDeadLetter(stuck.id, { db: prisma });
    expect(second.handled).toBe(false);

    await prisma.shipyardSubmission.delete({ where: { id: stuck.id } });
  });
});
