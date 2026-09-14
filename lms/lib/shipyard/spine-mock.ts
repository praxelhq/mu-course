import type {
  CheckpointView,
  FieldSpecView,
  GradeLineView,
  ReasonView,
  SignalView,
  SpineView,
  SubmissionView,
} from "./view-models";

// Hand-built `SpineView`s, one per scenario, so the student spine can be
// designed, reviewed and screenshotted before the data layer lands. Delete
// nothing here when it does: `pnpm e2e` and the design pass both read these,
// and they double as the fixture set for the gate/scoring unit tests.
//
// The products are the kind of thing this cohort actually ships (small,
// Indian, paid-for), and the return reasons are the kind of thing a good
// reviewer actually writes: it names the URL, the number it saw, and the
// clause of the bar that number missed.

export type SpineScenario =
  | "fresh"
  | "returned"
  | "in_review"
  | "mid_course"
  | "metric_blocked"
  | "held_pass"
  | "complete";

// Everything is relative to the real clock, not a frozen one: a cooldown that
// reads "12m" has to actually tick down to zero while you watch it, or the one
// piece of live behaviour on this screen is a lie.
const iso = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString();
const days = (d: number) => iso(d * 24 * 60);

// ---------------------------------------------------------------------------
// The six bars (seeded rows in production — `barMarkdown` on ShipyardCheckpoint)
// ---------------------------------------------------------------------------

const BARS: Record<CheckpointView["key"], string> = {
  idea: `**What clears this checkpoint**

- One sentence naming who the product is for and what it does for them.
- A live waitlist page at your own URL, reachable from any browser.
- **25 signups** from a traffic test you ran yourself, with the ad or post numbers.

Screenshots must show the count inside your own dashboard, not a shared link.`,

  design: `**What clears this checkpoint**

- Hand-drawn screens for the whole core path, start to paid.
- Each screen labelled, and the arrows between them readable.
- One flow written out in words: what the user taps, what the product does.

Photographs of paper are expected. Figma is not.`,

  working: `**What clears this checkpoint**

- A live URL a stranger can open with no login, no invite, no localhost.
- The core path from your job story works end to end in one sitting.
- The product does the thing on the page, not a form that emails you.

We open the URL in a real browser and walk the path you named.`,

  money: `**What clears this checkpoint**

- Payments are live on your own product, taking real money.
- Your product is connected to Shipped.money, so the numbers are readable.
- 150 words on what you charge, why that number, and what you learnt charging it.

The money half of this gate is read from the tracker. Nothing you type clears it.`,

  workflow: `**What clears this checkpoint**

- One automation that does real work in your product, running live.
- **Ten or more real runs**, triggered by real use, not by you testing.

This gate is read entirely from the tracker. There is nothing to submit.`,

  launch: `**What clears this checkpoint**

- At least one paying customer who is not you, not family, not a classmate.
- No blocking integrity flags on your tracker account.
- 200 words on how you got them, honestly: the channel, the message, the cost.

Self-payments are detected and fail this gate.`,
};

const TITLES: Record<CheckpointView["key"], string> = {
  idea: "Idea, with demand",
  design: "Design, on paper",
  working: "A working product",
  money: "Money, live",
  workflow: "The workflow, running",
  launch: "Launch",
};

// ---------------------------------------------------------------------------
// Field schemas (rows too — adding a field is an edit, never a deploy)
// ---------------------------------------------------------------------------

const FIELDS: Record<CheckpointView["key"], FieldSpecView[]> = {
  idea: [
    { key: "productName", label: "Product name", kind: "text", required: true },
    {
      key: "oneLiner",
      label: "One sentence",
      kind: "textarea",
      required: true,
      help: "Who it is for, and what it does for them.",
    },
    { key: "waitlistUrl", label: "Waitlist URL", kind: "url", required: true, help: "We open it." },
    { key: "signups", label: "Signups", kind: "number", required: true },
    {
      key: "proof",
      label: "Signup count and traffic numbers",
      kind: "images",
      required: true,
      maxFiles: 4,
      accept: "image/*",
    },
  ],
  design: [
    {
      key: "flow",
      label: "The core path, in words",
      kind: "textarea",
      required: true,
      help: "What the user taps, what the product does. Six lines is plenty.",
    },
    {
      key: "screens",
      label: "Photographs of your screens",
      kind: "images",
      required: true,
      maxFiles: 12,
      accept: "image/*",
    },
  ],
  working: [
    { key: "liveUrl", label: "Live URL", kind: "url", required: true },
    {
      key: "jobStory",
      label: "The path we should walk",
      kind: "textarea",
      required: true,
      help: "Name the exact steps. We follow them in a real browser.",
    },
  ],
  money: [
    {
      key: "pricing",
      label: "What you charge, and why",
      kind: "textarea",
      required: true,
      help: "150 words.",
    },
  ],
  workflow: [],
  launch: [
    {
      key: "story",
      label: "How you got them",
      kind: "textarea",
      required: true,
      help: "200 words. The channel, the message, the cost.",
    },
    { key: "evidence", label: "Anything worth seeing", kind: "files", required: false, maxFiles: 5 },
  ],
};

const GATE_TYPES: Record<CheckpointView["key"], CheckpointView["gateType"]> = {
  idea: "review",
  design: "review",
  working: "review",
  money: "both",
  workflow: "metric",
  launch: "both",
};

const ORDER: CheckpointView["key"][] = [
  "idea",
  "design",
  "working",
  "money",
  "workflow",
  "launch",
];

/** Days between one checkpoint's deadline and the next, as timetabled. */
const DEADLINE_SPACING_DAYS = 7;

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const signals = {
  moneyUnmet: [
    { name: "trackerConnected", label: "Tracker connected", met: true, value: "yes" },
    { name: "paymentsLive", label: "Payments live", met: false, value: "no" },
    { name: "grossTotal", label: "Gross taken", met: null, value: "₹0" },
  ] satisfies SignalView[],
  moneyMet: [
    { name: "trackerConnected", label: "Tracker connected", met: true, value: "yes" },
    { name: "paymentsLive", label: "Payments live", met: true, value: "yes" },
    { name: "grossTotal", label: "Gross taken", met: null, value: "₹4,780" },
  ] satisfies SignalView[],
  workflowUnmet: [
    { name: "workflowTenRuns", label: "Workflow runs", met: false, value: "7 of 10" },
    { name: "workflowLive", label: "Automation live", met: true, value: "yes" },
  ] satisfies SignalView[],
  workflowMet: [
    { name: "workflowTenRuns", label: "Workflow runs", met: true, value: "14 of 10" },
    { name: "workflowLive", label: "Automation live", met: true, value: "yes" },
  ] satisfies SignalView[],
  launchUnmet: [
    { name: "hasPayingCustomer", label: "Paying customers", met: false, value: "0" },
    { name: "blockingFlags", label: "Integrity flags", met: true, value: "none" },
  ] satisfies SignalView[],
  launchMet: [
    { name: "hasPayingCustomer", label: "Paying customers", met: true, value: "6" },
    { name: "blockingFlags", label: "Integrity flags", met: true, value: "none" },
  ] satisfies SignalView[],
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function checkpoint(
  key: CheckpointView["key"],
  patch: Partial<CheckpointView> = {},
): CheckpointView {
  const order = ORDER.indexOf(key) + 1;
  return {
    id: `cp-${key}`,
    key,
    order,
    title: TITLES[key],
    barMarkdown: BARS[key],
    gateType: GATE_TYPES[key],
    state: "locked",
    openedAt: null,
    passedAt: null,
    deadlineAt: days((ORDER.indexOf(key) + 1) * DEADLINE_SPACING_DAYS),
    resubmitWindowHours: 48,
    resubmitCooldownMinutes: 15,
    fields: FIELDS[key],
    signals: null,
    signalsRefreshedAt: null,
    latestSubmission: null,
    attempts: 0,
    ...patch,
  };
}

function passed(key: CheckpointView["key"], passedAtDays: number, model = "gemini-3-flash"): CheckpointView {
  return checkpoint(key, {
    state: "passed",
    openedAt: days(passedAtDays - 3),
    passedAt: days(passedAtDays),
    deadlineAt: days(passedAtDays + 1),
    attempts: key === "idea" ? 2 : 1,
    signals: GATE_TYPES[key] === "review" ? null : trackerFor(key, true),
    signalsRefreshedAt: GATE_TYPES[key] === "review" ? null : iso(-6),
    latestSubmission: {
      id: `sub-${key}`,
      status: "passed",
      version: key === "idea" ? 2 : 1,
      submittedAt: days(passedAtDays),
      nextAllowedResubmitAt: null,
      queuePosition: null,
      heldPass: false,
      review: {
        id: `rev-${key}`,
        verdict: "pass",
        reasons: [],
        confidence: 0.91,
        createdAt: days(passedAtDays),
        pendingHuman: false,
        modelUsed: model,
      },
      fields: {},
      files: [],
    },
  });
}

function trackerFor(key: CheckpointView["key"], met: boolean): SignalView[] | null {
  if (key === "money") return met ? signals.moneyMet : signals.moneyUnmet;
  if (key === "workflow") return met ? signals.workflowMet : signals.workflowUnmet;
  if (key === "launch") return met ? signals.launchMet : signals.launchUnmet;
  return null;
}

function open(
  key: CheckpointView["key"],
  dueInDays: number,
  patch: Partial<CheckpointView> = {},
): CheckpointView {
  return checkpoint(key, {
    state: "open",
    openedAt: days(-1),
    deadlineAt: days(dueInDays),
    ...patch,
  });
}

const RETURNED_REASONS: ReasonView[] = [
  {
    criterion: "25 signups from your own traffic test",
    met: false,
    note: "The waitlist page at tiffintrail.in loads, but the signup count screenshot shows 3 signups; the bar asks for 25 from a traffic test you ran yourself. Run the ₹500 Instagram test you described, wait for it to finish, and screenshot the count again.",
  },
  {
    criterion: "Signup count shown inside your own dashboard",
    met: false,
    note: "Screenshot 2 is a Google Form summary view shared by link. We cannot tell whose account it is. Show the count in the waitlist tool you own, with your account visible.",
  },
  {
    criterion: "A live waitlist page at your own URL",
    met: true,
    note: "tiffintrail.in returned 200 and the form submits.",
  },
  {
    criterion: "One sentence naming who it is for",
    met: true,
    note: "\"Weekly tiffin subscriptions from verified home kitchens in Koramangala\" names the buyer and the job.",
  },
];

function returnedSubmission(): SubmissionView {
  return {
    id: "sub-idea-2",
    status: "returned",
    version: 2,
    submittedAt: iso(-34),
    nextAllowedResubmitAt: iso(12),
    queuePosition: null,
    heldPass: false,
    review: {
      id: "rev-idea-2",
      verdict: "return",
      reasons: RETURNED_REASONS,
      confidence: 0.88,
      createdAt: iso(-31),
      pendingHuman: false,
      modelUsed: "gemini-3-flash",
    },
    fields: {
      productName: "Tiffin Trail",
      oneLiner: "Weekly tiffin subscriptions from verified home kitchens in Koramangala.",
      waitlistUrl: "https://tiffintrail.in",
      signups: 3,
    },
    files: [
      { key: "s/1", name: "waitlist-count.png", contentType: "image/png", bytes: 284_120 },
      { key: "s/2", name: "instagram-reach.png", contentType: "image/png", bytes: 191_004 },
    ],
  };
}

const GRADE_EMPTY: GradeLineView = {
  provisional: true,
  allCheckpointsCleared: false,
  total: null,
  components: [
    { key: "product", label: "Product quality", raw: null, weight: 30, weighted: null, source: "Reviewer · checkpoints 3 and 6" },
    { key: "numbers", label: "Real numbers", raw: null, weight: 30, weighted: null, source: "Shipped.money · Verified only" },
    { key: "workflow", label: "Workflow", raw: null, weight: 20, weighted: null, source: "Shipped.money" },
    { key: "distribution", label: "Distribution and launch", raw: null, weight: 20, weighted: null, source: "Reviewer + Shipped.money" },
  ],
};

function grade(
  raws: [number | null, number | null, number | null, number | null],
  allCleared: boolean,
): GradeLineView {
  const components = GRADE_EMPTY!.components.map((c, i) => ({
    ...c,
    raw: raws[i],
    weighted: raws[i] === null ? null : Math.round(((raws[i]! * c.weight) / 100) * 10) / 10,
  }));
  const complete = components.every((c) => c.weighted !== null);
  return {
    provisional: true,
    allCheckpointsCleared: allCleared,
    total: complete
      ? Math.round(components.reduce((s, c) => s + (c.weighted ?? 0), 0) * 10) / 10
      : null,
    components,
  };
}

const PRODUCTS = {
  tiffin: {
    id: "prod-tiffin",
    name: "Tiffin Trail",
    oneLiner: "Weekly tiffin subscriptions from verified home kitchens in Koramangala.",
    liveUrl: "https://tiffintrail.in",
    trackerProductId: null,
  },
  mandi: {
    id: "prod-mandi",
    name: "Mandi Rate",
    oneLiner: "Today's wholesale vegetable rates for Pune retailers, on WhatsApp, by 6am.",
    liveUrl: "https://mandirate.app",
    trackerProductId: "mandi-rate",
  },
  stitchline: {
    id: "prod-stitch",
    name: "Stitchline",
    oneLiner: "Order tracking for neighbourhood tailors, in Hindi, over WhatsApp.",
    liveUrl: "https://stitchline.co.in",
    trackerProductId: null,
  },
  rentbook: {
    id: "prod-rentbook",
    name: "Rentbook",
    oneLiner: "Rent receipts and reminders for landlords with one or two flats.",
    liveUrl: "https://rentbook.in",
    trackerProductId: "rentbook",
  },
};

const QUEUE_NOTE = "Usually under two minutes, longer on deadline nights.";

// ---------------------------------------------------------------------------

export function mockSpine(scenario: SpineScenario): SpineView {
  const base = { queueNote: QUEUE_NOTE, now: new Date().toISOString() };

  switch (scenario) {
    // Day one. No product named yet, checkpoint 1 open, nothing behind them.
    case "fresh":
      return {
        ...base,
        product: null,
        currentOrder: 1,
        grade: GRADE_EMPTY,
        checkpoints: [
          open("idea", 2),
          checkpoint("design"),
          checkpoint("working"),
          checkpoint("money"),
          checkpoint("workflow"),
          checkpoint("launch"),
        ],
      };

    // Second attempt at checkpoint 1 came back with specific fixes, and the
    // 15-minute cooldown has 12 minutes left on it.
    case "returned":
      return {
        ...base,
        product: PRODUCTS.tiffin,
        currentOrder: 1,
        grade: GRADE_EMPTY,
        checkpoints: [
          open("idea", 2, { attempts: 2, latestSubmission: returnedSubmission() }),
          checkpoint("design"),
          checkpoint("working"),
          checkpoint("money"),
          checkpoint("workflow"),
          checkpoint("launch"),
        ],
      };

    // Submitted four minutes ago; fourth in the queue.
    case "in_review":
      return {
        ...base,
        product: PRODUCTS.stitchline,
        currentOrder: 2,
        grade: grade([null, null, null, null], false),
        checkpoints: [
          passed("idea", -11),
          open("design", 5, {
            attempts: 1,
            latestSubmission: {
              id: "sub-design-1",
              status: "in_review",
              version: 1,
              submittedAt: iso(-4),
              nextAllowedResubmitAt: null,
              queuePosition: 4,
              heldPass: false,
              review: null,
              fields: { flow: "Tailor opens WhatsApp, sends a photo of the bill…" },
              files: [
                { key: "d/1", name: "screen-01-intake.jpg", contentType: "image/jpeg", bytes: 1_240_500 },
                { key: "d/2", name: "screen-02-status.jpg", contentType: "image/jpeg", bytes: 1_101_220 },
                { key: "d/3", name: "screen-03-pickup.jpg", contentType: "image/jpeg", bytes: 998_140 },
              ],
            },
          }),
          checkpoint("working"),
          checkpoint("money"),
          checkpoint("workflow"),
          checkpoint("launch"),
        ],
      };

    // Halfway. Three cleared, standing at the money gate: the write-up half is
    // still to submit and the tracker half is not met yet.
    case "mid_course":
      return {
        ...base,
        product: PRODUCTS.mandi,
        currentOrder: 4,
        grade: grade([72, null, null, null], false),
        checkpoints: [
          passed("idea", -22),
          passed("design", -15),
          passed("working", -6, "claude-haiku-4.5"),
          open("money", 6, {
            signals: signals.moneyUnmet,
            signalsRefreshedAt: iso(-7),
          }),
          checkpoint("workflow"),
          checkpoint("launch"),
        ],
      };

    // A pure metric gate: nothing to submit, three runs short. The signal
    // strip is the whole screen here.
    case "metric_blocked":
      return {
        ...base,
        product: PRODUCTS.rentbook,
        currentOrder: 5,
        grade: grade([78, 61, null, null], false),
        checkpoints: [
          passed("idea", -30),
          passed("design", -24),
          passed("working", -16),
          passed("money", -5),
          open("workflow", 4, {
            signals: signals.workflowUnmet,
            signalsRefreshedAt: iso(-3),
          }),
          checkpoint("launch"),
        ],
      };

    // The reviewer said pass and the trust rules held it. The student is not
    // being asked to fix anything and there is no queue position to give —
    // the model is finished; a person has to agree (DECISIONS, 2026-09-15).
    case "held_pass":
      return {
        ...base,
        product: PRODUCTS.mandi,
        currentOrder: 3,
        grade: grade([null, null, null, null], false),
        checkpoints: [
          passed("idea", -18),
          passed("design", -9),
          open("working", 3, {
            attempts: 2,
            latestSubmission: {
              id: "sub-working-2",
              status: "in_review",
              version: 2,
              submittedAt: iso(-52),
              nextAllowedResubmitAt: null,
              queuePosition: null,
              heldPass: true,
              review: {
                id: "rev-working-2",
                verdict: "pass",
                reasons: [
                  {
                    criterion: "A live URL a stranger can open",
                    met: true,
                    note: "mandirate.app loads for a signed-out visitor and the rate table renders without a login.",
                  },
                  {
                    criterion: "The core path works end to end",
                    met: true,
                    note: "Picked Pune, chose three vegetables, received the 6am WhatsApp preview in the same sitting.",
                  },
                ],
                confidence: 0.64,
                createdAt: iso(-49),
                pendingHuman: true,
                modelUsed: "glm-5.3-flash",
              },
              fields: {
                liveUrl: "https://mandirate.app",
                jobStory: "When I am setting my morning prices, I want today's mandi rate on WhatsApp so I stop calling three traders.",
              },
              files: [],
            },
          }),
          checkpoint("money"),
          checkpoint("workflow"),
          checkpoint("launch"),
        ],
      };

    // All six cleared. The grade line is the point of the screen.
    case "complete":
      return {
        ...base,
        product: PRODUCTS.tiffin,
        currentOrder: 6,
        grade: grade([84, 71, 90, 76], true),
        checkpoints: [
          passed("idea", -38),
          passed("design", -32),
          passed("working", -24),
          passed("money", -14),
          passed("workflow", -7),
          passed("launch", -1, "claude-sonnet-4.5"),
        ],
      };
  }
}

/** Every scenario key, for the design pass and the e2e sweep. */
export const SPINE_SCENARIOS: SpineScenario[] = [
  "fresh",
  "returned",
  "in_review",
  "mid_course",
  "metric_blocked",
  "held_pass",
  "complete",
];

export function isSpineScenario(v: string | undefined): v is SpineScenario {
  return v !== undefined && (SPINE_SCENARIOS as string[]).includes(v);
}
