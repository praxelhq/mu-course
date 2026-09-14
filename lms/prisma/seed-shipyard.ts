// Shipyard (Course 2) demo world, seeded alongside the Forge's.
//
// Deterministic and idempotent, like prisma/seed.ts: fixed ids, a seeded PRNG,
// fixed dates. Running it twice produces identical rows.
//
// It seeds the six checkpoints, the v1 weights, the router's default state,
// one product per student, and a spread of submissions, reviews and tracker
// overrides wide enough that every state on the student spine and every colour
// in the instructor matrix appears in the demo.
//
// The FIRST seeded student (user_s001, the one e2e walks) is deliberately left
// at checkpoint 1 with nothing submitted, so the M0 walkthrough starts clean.

import { Prisma } from "@prisma/client";
import { mulberry32 } from "../lib/seed-utils";
import { CHECKPOINT_DEFINITIONS, checkpointId } from "../lib/shipyard/checkpoints";
import { SHIPYARD_COURSE_ID } from "../lib/shipyard/constants";
import { resolveGates, type GateCheckpoint } from "../lib/shipyard/gates";
import { WEIGHTS_V1, WEIGHTS_VERSION_V1 } from "../lib/shipyard/scoring";
import { computeCostUsd, MODEL_FLASH, MODEL_HAIKU, ROUTER_STATE_ID } from "../lib/ai/router";
import { emptySignals, type TrackerSignals } from "../lib/tracker/types";

export type SeedStudent = {
  /** User.id, e.g. user_s001. */
  id: string;
  /** The student's team sector, used to derive a plausible product. */
  sectorName: string;
};

export type SeedShipyardContext = {
  students: SeedStudent[];
  /** The seed's fixed "now". */
  now: Date;
};

type Tx = Prisma.TransactionClient;

const pad3 = (n: number) => String(n).padStart(3, "0");
const days = (n: number) => n * 86_400_000;
const hours = (n: number) => n * 3_600_000;
const minutes = (n: number) => n * 60_000;

/**
 * How many submissions the demo leaves genuinely waiting for the reviewer.
 *
 * `queuePositionOf` counts unreviewed `submitted | in_review` rows course-wide,
 * so eighty-two seeded fixtures that nothing was ever going to drain made a
 * fresh submission on the demo read "position 83" — a number that described
 * the seed rather than the queue (C4). A dozen, all arrived in the last ten
 * minutes, reads as a live queue and puts a real submit at the back of a short
 * one. The rest hold a returned verdict instead, which is a state the demo
 * needs plenty of anyway.
 */
export const QUEUE_DEMO_CAP = 12;

// ---------------------------------------------------------------------------
// Deterministic product names
// ---------------------------------------------------------------------------

const NAME_STEMS = [
  "Ledger", "Lift", "Beacon", "Harbour", "Anvil", "Relay",
  "Compass", "Tally", "Forge", "Signal", "Keel", "Loom",
];
const NAME_TAILS = ["Desk", "Works", "Base", "Line", "Yard", "Hub", "Room", "Bench"];
const ONE_LINERS = [
  "One place to track every order",
  "A weekly operating review that writes itself",
  "Quotes out in a minute rather than a day",
  "The assistant that answers the first message",
  "A standing dashboard of the five numbers that matter",
  "Onboarding that finishes itself",
  "A shared checklist that survives a handover",
  "Invoices chased without the awkward email",
  "Stock counted once and trusted all week",
  "Every customer promise in one queue",
];

function productFor(index: number, sectorName: string): { name: string; oneLiner: string } {
  const stem = NAME_STEMS[index % NAME_STEMS.length];
  const tail = NAME_TAILS[Math.floor(index / NAME_STEMS.length) % NAME_TAILS.length];
  const line = ONE_LINERS[index % ONE_LINERS.length];
  return {
    name: `${stem}${tail}`,
    // The sector keeps its own casing: "Frontier AI labs", not "frontier ai labs".
    oneLiner: `${line}, for ${sectorName}.`,
  };
}

// ---------------------------------------------------------------------------
// The spread of progress across the cohort
// ---------------------------------------------------------------------------

type Bucket =
  | "none"
  | "returned"
  | "in_review"
  | "passed_1"
  | "passed_2"
  | "passed_3"
  | "money_blocked"
  | "workflow_partial"
  | "launch_cleared"
  | "launch_flagged";

/** Counts sum to exactly 480 — SPEC §1 rule 5's "every state appears". */
const BUCKET_PLAN: [Bucket, number][] = [
  ["none", 94],             // ~20% still on checkpoint 1, nothing submitted
  ["returned", 96],         // ~20% holding a returned idea review
  ["in_review", 72],        // ~15% waiting on the reviewer
  ["passed_1", 60],         // ~25% have passed one or two checkpoints
  ["passed_2", 60],
  ["passed_3", 58],         // ~12% through the working-product render
  ["money_blocked", 24],    // ~5% at money, blocked on live payments
  ["workflow_partial", 10], // ~2% at workflow, 7 runs of 10
  ["launch_cleared", 4],    // ~1% fully cleared, with a paying customer
  ["launch_flagged", 2],    // an otherwise-qualifying launch with a flag
];

/**
 * Buckets shuffled with a fixed seed so every section's matrix shows a mix,
 * then forced so student index 0 (user_s001) holds a clean checkpoint 1.
 */
export function assignBuckets(total: number): Bucket[] {
  const pool: Bucket[] = [];
  for (const [bucket, count] of BUCKET_PLAN) {
    for (let i = 0; i < count; i++) pool.push(bucket);
  }
  if (pool.length !== total) {
    throw new Error(`bucket plan covers ${pool.length} students, expected ${total}`);
  }
  const rng = mulberry32(20260914);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // The e2e student must start clean, so swap a "none" into position 0.
  if (pool[0] !== "none") {
    const swap = pool.indexOf("none");
    [pool[0], pool[swap]] = [pool[swap], pool[0]];
  }
  return pool;
}

/** Which checkpoints this bucket has a PASSED review for. */
const REVIEW_PASSED_KEYS: Record<Bucket, string[]> = {
  none: [],
  returned: [],
  in_review: [],
  passed_1: ["idea"],
  passed_2: ["idea", "design"],
  passed_3: ["idea", "design", "working"],
  money_blocked: ["idea", "design", "working", "money"],
  workflow_partial: ["idea", "design", "working", "money"],
  launch_cleared: ["idea", "design", "working", "money", "launch"],
  launch_flagged: ["idea", "design", "working", "money", "launch"],
};

function signalsFor(bucket: Bucket, now: Date): TrackerSignals | null {
  const base = emptySignals(now);
  switch (bucket) {
    case "money_blocked":
      // Connected, but the provider is still in test mode.
      return { ...base, trackerConnected: true, paymentsLive: false, workflowRuns: 0 };
    case "workflow_partial":
      return {
        ...base,
        trackerConnected: true,
        paymentsLive: true,
        workflowRuns: 7,
        workflowTenRuns: false,
        payingCustomers: 1,
        hasPayingCustomer: true,
        grossTotal: 4_900,
        netTotal: 4_610,
      };
    case "launch_cleared":
      return {
        ...base,
        trackerConnected: true,
        paymentsLive: true,
        workflowRuns: 14,
        workflowTenRuns: true,
        payingCustomers: 3,
        hasPayingCustomer: true,
        grossTotal: 14_700,
        netTotal: 13_830,
      };
    case "launch_flagged":
      return {
        ...base,
        trackerConnected: true,
        paymentsLive: true,
        workflowRuns: 12,
        workflowTenRuns: true,
        payingCustomers: 1,
        hasPayingCustomer: true,
        grossTotal: 2_900,
        netTotal: 2_730,
        // The tracker owns anti-gaming; this portal just fails the gate.
        blockingFlags: ["self_payment_suspected"],
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Fake review content
// ---------------------------------------------------------------------------

const RETURN_REASON_SETS = [
  [
    {
      criterionId: "traffic-test",
      clause: "A real traffic test with the source named and the spend reported.",
      what: "The traffic test says \"shared it in a few groups\" with no numbers behind it.",
      fix: "Name each place you posted, and give reach, visits and signups for each one.",
    },
    {
      criterionId: "evidence-consistency",
      clause: "The screenshot shows the count in its tool, dated, and matches the reported numbers.",
      what: "The screenshot is cropped to the number alone, so there is no way to tell which tool produced it or when.",
      fix: "Re-take it with the tool's header and the date in frame.",
    },
  ],
  [
    {
      criterionId: "job-story",
      clause: "A job story with a recurring situation, a real motivation, and an outcome.",
      what: "The job story describes the product's features rather than the situation the person is already in.",
      fix: "Start from the last time someone actually had this problem, and write what they were doing when it came up.",
    },
  ],
  [
    {
      criterionId: "audience",
      clause: "Names who has the job, specifically, and what they do instead today.",
      what: "The audience is given as \"small businesses\", which is too broad to find or to test against.",
      fix: "Narrow it to a role and a place — who they are, and where you would find ten of them this week.",
    },
    {
      criterionId: "waitlist-live",
      clause: "A public waitlist URL that loads, states the promise, and collects an email.",
      what: "The waitlist URL returned a 404 when we loaded it.",
      fix: "Publish the page and open it in a private window to check a stranger can reach it.",
    },
  ],
  [
    {
      criterionId: "one-liner",
      clause: "Names the product and what it does in one understandable sentence.",
      what: "The one-liner names a category rather than what the product does for a person.",
      fix: "Say what it does and who for, in words a stranger outside your sector would use.",
    },
  ],
];

const PASS_RUBRIC: Record<string, number> = { overall: 78 };

function reviewTokens(rng: () => number): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn: 9_000 + Math.floor(rng() * 4_000),
    tokensOut: 800 + Math.floor(rng() * 600),
  };
}

// ---------------------------------------------------------------------------
// Field payloads
// ---------------------------------------------------------------------------

function fieldsFor(key: string, index: number, name: string, oneLiner: string) {
  const slug = name.toLowerCase();
  switch (key) {
    case "idea":
      return {
        productName: name,
        oneLiner,
        jobStory:
          "When the week's orders come in through three different inboxes, I want one list I can trust, so I can stop re-checking what has already shipped.",
        waitlistUrl: `https://${slug}.example.com/waitlist`,
        signupCount: 40 + (index % 80),
        trafficTestNotes:
          "Two posts in an operators' community and one small ad set. 4,200 impressions, 310 visits, and the signups above. Spend was about 2,000 rupees.",
        signupScreenshot: [`shipyard/demo/${slug}/signups.png`],
      };
    case "design":
      return {
        flowNotes:
          "1 Landing, the promise and one button. 2 Connect an inbox. 3 The order list, grouped by status. 4 One order, with its history. 5 Empty state before the first sync. 6 The error we show when a connection drops.",
        sketches: [
          `shipyard/demo/${slug}/screen-1.jpg`,
          `shipyard/demo/${slug}/screen-2.jpg`,
          `shipyard/demo/${slug}/screen-3.jpg`,
          `shipyard/demo/${slug}/screen-4.jpg`,
        ],
      };
    case "working":
      return {
        liveUrl: `https://${slug}.example.com`,
        corePath:
          "Open the site, connect an inbox with a Google account, wait for the first sync, and see every open order in one list with its status.",
        knownGaps:
          "Sync runs every fifteen minutes rather than live. There is no export yet. The mobile layout is usable but tight.",
      };
    case "money":
      return {
        pricingNote:
          "1,499 rupees a month per workspace. That is roughly two hours of the admin work it removes, and the alternative people use today is a spreadsheet plus somebody's evening.",
        checkoutUrl: `https://${slug}.example.com/checkout`,
      };
    case "workflow":
      return {
        workflowName: `${name} order sync`,
        whatItAutomates:
          "A new order in any connected inbox is parsed, added to the list, and acknowledged to the customer without anyone opening the inbox.",
      };
    case "launch":
      return {
        launchWriteup:
          "Launched over four days. Day one, a post in the operators' community. Day two, twelve direct messages to people who had replied to the waitlist. Day three, a short demo video. Day four, a follow-up to everyone who opened and did not reply. The demo video did nothing.",
        distributionChannels:
          "Operators' community: 190 visits, 2 paying. Direct messages: 12 sent, 6 replies, 1 paying. Demo video: 40 views, nothing. Cold email: not used.",
        firstCustomerStory:
          "She found the community post, signed up the same evening, and asked whether it handled partial shipments before paying. It did not, so we added it that week. She has used it every weekday since.",
      };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// The seed itself
// ---------------------------------------------------------------------------

export async function seedShipyard(tx: Tx, ctx: SeedShipyardContext): Promise<void> {
  const { students, now } = ctx;
  const rng = mulberry32(914180000);

  // --- Checkpoints, weights, router state ---------------------------------
  await tx.shipyardCheckpoint.createMany({
    data: CHECKPOINT_DEFINITIONS.map((c) => ({
      id: checkpointId(c.key),
      courseId: SHIPYARD_COURSE_ID,
      key: c.key,
      order: c.order,
      title: c.title,
      barMarkdown: c.barMarkdown,
      rubric: c.rubric as unknown as Prisma.InputJsonValue,
      gateType: c.gateType,
      acceptsImages: c.acceptsImages,
      fieldSchema: c.fieldSchema as unknown as Prisma.InputJsonValue,
      metricSignals: c.metricSignals as unknown as Prisma.InputJsonValue,
      resubmitWindowHours: c.resubmitWindowHours,
      resubmitCooldownMinutes: c.resubmitCooldownMinutes,
    })),
  });

  await tx.shipyardWeights.create({
    data: {
      id: "syw_v1",
      courseId: SHIPYARD_COURSE_ID,
      version: WEIGHTS_VERSION_V1,
      weights: WEIGHTS_V1 as unknown as Prisma.InputJsonValue,
      active: true,
    },
  });

  await tx.shipyardRouterState.create({
    data: {
      id: ROUTER_STATE_ID,
      courseId: SHIPYARD_COURSE_ID,
      anthropicExhausted: false,
      consecutiveByokFailures: 0,
      activeProfile: "flash_verdicts",
    },
  });

  // The gate checkpoints, as the pure resolver wants them.
  const gateCheckpoints: GateCheckpoint[] = CHECKPOINT_DEFINITIONS.map((c) => ({
    id: checkpointId(c.key),
    key: c.key,
    order: c.order,
    gateType: c.gateType,
    metricSignals: c.metricSignals,
  }));

  const buckets = assignBuckets(students.length);

  const products: Prisma.ShipyardProductCreateManyInput[] = [];
  const submissions: Prisma.ShipyardSubmissionCreateManyInput[] = [];
  const reviews: Prisma.ShipyardReviewCreateManyInput[] = [];
  const states: Prisma.ShipyardCheckpointStateCreateManyInput[] = [];
  const overrides: Prisma.ShipyardTrackerOverrideCreateManyInput[] = [];
  /** How many submissions are still genuinely waiting for the reviewer. */
  let liveQueue = 0;

  students.forEach((student, index) => {
    const bucket = buckets[index];
    const n = pad3(index + 1);
    const productId = `syp_${n}`;
    const { name, oneLiner } = productFor(index, student.sectorName);
    const enrolledAt = new Date(now.getTime() - days(40));

    const signals = signalsFor(bucket, now);
    const passedKeys = REVIEW_PASSED_KEYS[bucket];

    products.push({
      id: productId,
      courseId: SHIPYARD_COURSE_ID,
      userId: student.id,
      name,
      oneLiner,
      liveUrl: passedKeys.includes("working") ? `https://${name.toLowerCase()}.example.com` : null,
      waitlistUrl: passedKeys.includes("idea")
        ? `https://${name.toLowerCase()}.example.com/waitlist`
        : null,
      // In fake mode the tracker id IS the product id.
      trackerProductId: signals ? productId : null,
      createdAt: enrolledAt,
      updatedAt: now,
    });

    if (signals) {
      overrides.push({
        id: `syto_${n}`,
        courseId: SHIPYARD_COURSE_ID,
        productId,
        signals: signals as unknown as Prisma.InputJsonValue,
        updatedBy: "seed",
        updatedAt: now,
      });
    }

    // --- Submissions and reviews for every checkpoint that has one --------
    const reviewPassed: Record<string, Date | null> = {};
    for (const c of gateCheckpoints) reviewPassed[c.id] = null;

    const passedAts: Record<string, Date> = {};
    passedKeys.forEach((key, i) => {
      const cpId = checkpointId(key as GateCheckpoint["key"]);
      const at = new Date(enrolledAt.getTime() + days(4 + i * 5) + hours(index % 9));
      passedAts[cpId] = at;
      reviewPassed[cpId] = at;

      submissions.push({
        id: `sysub_${n}_${key}`,
        courseId: SHIPYARD_COURSE_ID,
        productId,
        checkpointId: cpId,
        status: "passed",
        fields: fieldsFor(key, index, name, oneLiner) as unknown as Prisma.InputJsonValue,
        files: [] as unknown as Prisma.InputJsonValue,
        version: 1,
        submittedAt: new Date(at.getTime() - hours(2)),
        createdAt: new Date(at.getTime() - hours(2)),
        updatedAt: at,
      });

      const { tokensIn, tokensOut } = reviewTokens(rng);
      reviews.push({
        id: `syrev_${n}_${key}`,
        courseId: SHIPYARD_COURSE_ID,
        submissionId: `sysub_${n}_${key}`,
        verdict: "pass",
        reasons: [] as unknown as Prisma.InputJsonValue,
        rubricScores: PASS_RUBRIC as unknown as Prisma.InputJsonValue,
        confidence: 0.82 + (index % 12) / 100,
        metricSignalsSeen:
          signals && (key === "money" || key === "launch")
            ? (signals as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        renderArtifacts:
          key === "working"
            ? ({
                screenshotS3Key: `shipyard/demo/${productId}/render.png`,
                domTextExcerpt: `${name} — ${oneLiner}`,
                renderedAt: at.toISOString(),
              } as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        modelUsed: MODEL_FLASH,
        providerUsed: "z-ai",
        tokensIn,
        tokensOut,
        costUsd: computeCostUsd(MODEL_FLASH, tokensIn, tokensOut),
        reviewedBy: "ai",
        needsHuman: false,
        createdAt: at,
      });
    });

    // The checkpoint the student is currently working on, if it has an
    // unresolved submission.
    if (bucket === "returned" || bucket === "in_review") {
      const cpId = checkpointId("idea");
      // Deterministic: `assignBuckets` is seeded and this loop runs in index
      // order, so the same twelve students hold the queue on every seed.
      const queued = bucket === "in_review" && liveQueue < QUEUE_DEMO_CAP;
      if (queued) liveQueue += 1;
      const status = queued ? "in_review" : "returned";
      const submittedAt = queued
        ? // Minutes ago, not a week ago: a queue whose oldest item is six days
          // old is not a queue, it is a pile.
          new Date(now.getTime() - minutes(1 + ((liveQueue * 7) % 10)))
        : new Date(enrolledAt.getTime() + days(6) + hours(index % 11));
      submissions.push({
        id: `sysub_${n}_idea`,
        courseId: SHIPYARD_COURSE_ID,
        productId,
        checkpointId: cpId,
        status,
        fields: fieldsFor("idea", index, name, oneLiner) as unknown as Prisma.InputJsonValue,
        files: [] as unknown as Prisma.InputJsonValue,
        version: 1,
        submittedAt,
        nextAllowedResubmitAt: queued ? null : new Date(submittedAt.getTime() + 15 * 60_000),
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
      if (!queued) {
        const { tokensIn, tokensOut } = reviewTokens(rng);
        const lowConfidence = index % 9 === 0;
        reviews.push({
          id: `syrev_${n}_idea`,
          courseId: SHIPYARD_COURSE_ID,
          submissionId: `sysub_${n}_idea`,
          verdict: "return",
          reasons: RETURN_REASON_SETS[
            index % RETURN_REASON_SETS.length
          ] as unknown as Prisma.InputJsonValue,
          rubricScores: { overall: 41 + (index % 17) } as unknown as Prisma.InputJsonValue,
          confidence: lowConfidence ? 0.58 : 0.79,
          modelUsed: lowConfidence ? MODEL_HAIKU : MODEL_FLASH,
          providerUsed: lowConfidence ? "anthropic" : "z-ai",
          tokensIn,
          tokensOut,
          costUsd: computeCostUsd(lowConfidence ? MODEL_HAIKU : MODEL_FLASH, tokensIn, tokensOut),
          reviewedBy: "ai",
          // Below the 0.7 threshold a pass or a return waits for a human.
          needsHuman: lowConfidence,
          createdAt: new Date(submittedAt.getTime() + 90_000),
        });
      }
    }

    // Students at a metric-blocked checkpoint have their write-up in already.
    if (bucket === "workflow_partial") {
      const cpId = checkpointId("workflow");
      const at = new Date(now.getTime() - minutes(2 + (index % 8)));
      submissions.push({
        id: `sysub_${n}_workflow`,
        courseId: SHIPYARD_COURSE_ID,
        productId,
        checkpointId: cpId,
        status: "submitted",
        fields: fieldsFor("workflow", index, name, oneLiner) as unknown as Prisma.InputJsonValue,
        files: [] as unknown as Prisma.InputJsonValue,
        version: 1,
        submittedAt: at,
        createdAt: at,
        updatedAt: at,
      });
      // Checkpoint 5 is metric-only: the pipeline RECORDS this write-up at zero
      // cost and leaves the gate to the run count. Seeding that review is what
      // the real path does, and it keeps ten write-ups that nobody is going to
      // judge out of the student's queue position.
      reviews.push({
        id: `syinf_${n}_workflow`,
        courseId: SHIPYARD_COURSE_ID,
        submissionId: `sysub_${n}_workflow`,
        verdict: "pass",
        reasons: [] as unknown as Prisma.InputJsonValue,
        rubricScores: {} as unknown as Prisma.InputJsonValue,
        confidence: 1,
        metricSignalsSeen: signals
          ? (signals as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        modelUsed: "none",
        providerUsed: "none",
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        reviewedBy: "ai",
        needsHuman: false,
        createdAt: new Date(at.getTime() + 1_000),
      });
    }

    // --- Gate states, straight from the pure resolver ---------------------
    const resolved = resolveGates(
      { checkpoints: gateCheckpoints, reviewPassed, signals, manualOpens: {} },
      now,
    );
    for (const c of gateCheckpoints) {
      const r = resolved[c.id];
      const passedAt = r.state === "passed" ? (passedAts[c.id] ?? now) : null;
      const openedAt =
        r.state === "locked"
          ? null
          : c.order === 1
            ? enrolledAt
            : (passedAts[gateCheckpoints[c.order - 2].id] ?? enrolledAt);
      states.push({
        id: `sycs_${n}_${c.key}`,
        courseId: SHIPYARD_COURSE_ID,
        productId,
        checkpointId: c.id,
        state: r.state,
        openedAt,
        passedAt,
        reviewClearedAt: reviewPassed[c.id],
        metricClearedAt:
          c.gateType !== "review" && r.state === "passed" ? (passedAt ?? now) : null,
        updatedAt: now,
      });
    }
  });

  await tx.shipyardProduct.createMany({ data: products });
  await tx.shipyardTrackerOverride.createMany({ data: overrides });
  await tx.shipyardSubmission.createMany({ data: submissions });
  await tx.shipyardReview.createMany({ data: reviews });
  await tx.shipyardCheckpointState.createMany({ data: states });

  console.log(
    `Seeded Shipyard: ${CHECKPOINT_DEFINITIONS.length} checkpoints, ${products.length} products, ` +
      `${submissions.length} submissions, ${reviews.length} reviews, ${states.length} gate states, ` +
      `${overrides.length} tracker overrides.`,
  );
}
