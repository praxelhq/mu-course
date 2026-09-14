// The six checkpoints, as data.
//
// This is course content, not configuration: `barMarkdown` is the published
// bar a student reads before submitting and again on every return, so it is
// written plainly and in full. The rubric beside it is internal — the reviewer
// scores against these criteria and quotes the matching bar clause back to the
// student, which is how a return stays specific instead of vague.
//
// The seed writes these rows once. After that a bar, a rubric, a deadline or a
// cooldown is an admin row edit and never a deploy.

import type { ShipyardCheckpointKey, ShipyardGateType } from "@prisma/client";
import type { FieldSpec } from "./fields";

export type RubricCriterion = {
  /** Stable id: reviewer output and stored rubricScores key on this. */
  id: string;
  /** The bar clause this criterion judges, quoted back in a return. */
  clause: string;
  /** Relative weight inside this checkpoint's rubric. Criteria sum to 100. */
  weight: number;
  /** What "met" looks like, in the reviewer's own terms. */
  passThreshold: string;
};

export type CheckpointRubric = {
  criteria: RubricCriterion[];
  /** Every criterion at or above its threshold, or the verdict is `return`. */
  passRule: "all-criteria-met";
};

export type CheckpointDefinition = {
  key: ShipyardCheckpointKey;
  order: number;
  title: string;
  barMarkdown: string;
  rubric: CheckpointRubric;
  gateType: ShipyardGateType;
  acceptsImages: boolean;
  /** Tracker signal names that must be true before a metric gate clears. */
  metricSignals: string[];
  fieldSchema: FieldSpec[];
  resubmitWindowHours: number;
  resubmitCooldownMinutes: number;
};

const DEFAULT_RESUBMIT_WINDOW_HOURS = 72;
const DEFAULT_COOLDOWN_MINUTES = 15;

// ---------------------------------------------------------------------------
// 1 · Idea, with demand
// ---------------------------------------------------------------------------

const IDEA: CheckpointDefinition = {
  key: "idea",
  order: 1,
  title: "The idea, with demand",
  barMarkdown: `## The bar

An idea is not a plan and it is not a paragraph. At this checkpoint it is a
named job, a named person, and evidence that the person wants it enough to
give you their email before anything exists.

You clear this when:

1. You can name the product and say what it does in one sentence a stranger
   understands without a follow-up question.
2. You write the job as a job story — when [situation], I want to [motivation],
   so I can [outcome] — and the situation is one that actually recurs, not one
   you invented to fit the product.
3. You name who has that job today, specifically enough that you could list ten
   of them by name or by where they gather.
4. You say what those people do instead right now, and why that is worse.
5. You have a waitlist page live on a public URL that loads for anyone, states
   the promise, and collects an email.
6. You ran a real traffic test to that page — an ad, a post, a community, a
   cold list — and you say where the traffic came from.
7. You report the numbers honestly: how many people saw it, how many landed on
   the page, how many signed up, and what you spent.
8. The signup screenshot shows the count inside the tool that collected it, with
   the date visible, and the numbers in it match what you reported.
9. Your conversion is explainable. A very high rate from a tiny sample or a very
   low rate from a large one both need a sentence of explanation.

## What gets this returned

A landing page with no traffic behind it. Signups from your own cohort or your
own family. A screenshot that has been cropped past the point where anyone can
tell what it counts. A job story that is really a feature description. An
audience described as "small businesses" or "students" with nothing narrower
underneath it.

## A note on this one

This is the only checkpoint judged from evidence you report yourself. The
tracker does not see waitlist signups. We are trusting you here, and a review
that cannot tell whether the numbers are real goes to a human rather than
passing quietly.`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "one-liner",
        clause: "Names the product and what it does in one understandable sentence.",
        weight: 10,
        passThreshold:
          "A stranger outside the field could restate the product after reading the one-liner once. Jargon, a category name alone, or a promise with no mechanism fails.",
      },
      {
        id: "job-story",
        clause: "A job story with a recurring situation, a real motivation, and an outcome.",
        weight: 20,
        passThreshold:
          "All three parts present, and the situation recurs on its own in the person's life rather than being manufactured by the product. A restated feature list fails.",
      },
      {
        id: "audience",
        clause: "Names who has the job, specifically, and what they do instead today.",
        weight: 15,
        passThreshold:
          "The audience is narrow enough to find — a role, a place, a behaviour — and the current alternative is named. 'Everyone' or a broad demographic fails.",
      },
      {
        id: "waitlist-live",
        clause: "A public waitlist URL that loads, states the promise, and collects an email.",
        weight: 15,
        passThreshold:
          "The URL is public http(s) and the pre-flight liveness check reached it. A dead link, a login wall, or a page with no capture fails.",
      },
      {
        id: "traffic-test",
        clause: "A real traffic test with the source named and the spend reported.",
        weight: 20,
        passThreshold:
          "Where the traffic came from is named concretely, and impressions or reach, visits, and spend are all reported. 'I shared it around' fails.",
      },
      {
        id: "evidence-consistency",
        clause: "The screenshot shows the count in its tool, dated, and matches the reported numbers.",
        weight: 20,
        passThreshold:
          "The image shows a recognisable tool with a count and a date, and the count matches the reported signups. A mismatch, a crop with no context, or a hand-typed number fails and is flagged for a human.",
      },
    ],
  },
  gateType: "review",
  acceptsImages: true,
  metricSignals: [],
  fieldSchema: [
    { key: "productName", label: "Product name", kind: "text", required: true },
    {
      key: "oneLiner",
      label: "One line a stranger would understand",
      kind: "text",
      required: true,
      help: "What it does and for whom. No adjectives you cannot defend.",
    },
    {
      key: "jobStory",
      label: "The job story",
      kind: "textarea",
      required: true,
      help: "When [situation], I want to [motivation], so I can [outcome]. Then say who has this job and what they do instead today.",
    },
    {
      key: "waitlistUrl",
      label: "Waitlist URL",
      kind: "url",
      required: true,
      help: "A public page anyone can open. We load it to check it is live.",
    },
    {
      key: "signupCount",
      label: "Signups so far",
      kind: "number",
      required: true,
    },
    {
      key: "trafficTestNotes",
      label: "The traffic test",
      kind: "textarea",
      required: true,
      help: "Where the traffic came from and the numbers: impressions or reach, visits, signups, and what you spent.",
    },
    {
      key: "signupScreenshot",
      label: "Screenshot of the signup count",
      kind: "images",
      required: true,
      maxFiles: 3,
      minFiles: 1,
      accept: ["image/png", "image/jpeg", "image/webp"],
      help: "Straight from the tool that collected them, with the date visible. Up to three images.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// ---------------------------------------------------------------------------
// 2 · Design
// ---------------------------------------------------------------------------

const DESIGN: CheckpointDefinition = {
  key: "design",
  order: 2,
  title: "The screens, drawn by hand",
  barMarkdown: `## The bar

Draw the product before you build it. Paper and pen, a whiteboard, a tablet —
the medium does not matter. Deciding what goes on the screen before a tool
decides for you is the point.

You clear this when:

1. You have drawn every screen a first-time user passes through from arriving
   to finishing the job once, and nothing in that path is missing.
2. Each screen is legible in the photo: the layout, the main elements, and the
   words on the buttons can be read.
3. The screens are numbered or ordered, so the sequence is not a guess.
4. You describe the flow in words alongside the drawings, screen by screen,
   naming what the user does and what happens next.
5. You show what happens when it goes wrong — at least one empty state, one
   error, or one thing-not-found — because those are most of real use.
6. The entry point is clear: what the user sees in the first three seconds, and
   what you want them to do there.
7. Every screen serves the job story from checkpoint 1. A screen that serves
   something else needs a reason.
8. You name the one screen that carries the product, and say why.

## What gets this returned

Screens generated by a tool rather than drawn. A photo too dark or too angled
to read. A happy path only. A set of screens with no stated order. Drawings
that describe a different product from the one you cleared checkpoint 1 with.`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "flow-complete",
        clause: "Every screen from arrival to finishing the job once is drawn.",
        weight: 25,
        passThreshold:
          "The images cover an unbroken path with no missing step between arriving and the job being done. A gap the reviewer has to infer fails.",
      },
      {
        id: "legibility",
        clause: "Each screen is legible: layout, main elements, and button words readable.",
        weight: 15,
        passThreshold:
          "The reviewer can read the labels in the image. Too dark, too small, or too skewed to read fails with the specific image named.",
      },
      {
        id: "ordering",
        clause: "The screens are numbered or ordered and the written flow matches.",
        weight: 10,
        passThreshold:
          "A sequence is stated, in the images or in the notes, and the two agree.",
      },
      {
        id: "flow-notes",
        clause: "A written flow, screen by screen, naming the action and what follows.",
        weight: 20,
        passThreshold:
          "Each screen has a line saying what the user does and where it leads. A general description of the product fails.",
      },
      {
        id: "unhappy-paths",
        clause: "At least one empty, error, or not-found state is drawn.",
        weight: 15,
        passThreshold:
          "One non-happy state is present and identified. A mention with no screen fails.",
      },
      {
        id: "serves-the-job",
        clause: "Every screen serves the job story, and the carrying screen is named.",
        weight: 15,
        passThreshold:
          "The drawn product is recognisably the one from checkpoint 1, and one screen is named as the one that carries it, with a reason.",
      },
    ],
  },
  gateType: "review",
  acceptsImages: true,
  metricSignals: [],
  fieldSchema: [
    {
      key: "flowNotes",
      label: "The flow, screen by screen",
      kind: "textarea",
      required: true,
      help: "For each screen: what the user sees, what they do, and where it takes them. Include your empty and error states.",
    },
    {
      key: "sketches",
      label: "Photos of your screens",
      kind: "images",
      required: true,
      minFiles: 2,
      maxFiles: 12,
      accept: ["image/png", "image/jpeg", "image/webp"],
      help: "Two to twelve photos. Flat light, straight on, numbered in the drawing itself if you can.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// ---------------------------------------------------------------------------
// 3 · Working product
// ---------------------------------------------------------------------------

const WORKING: CheckpointDefinition = {
  key: "working",
  order: 3,
  title: "A working product a stranger can use",
  barMarkdown: `## The bar

Live on the internet, and a stranger who has never met you can do the one thing
the product exists for, from start to finish, without you in the room.

We do not read your description of the product. We open the URL in a real
browser, wait for it to load, and try the path you name.

You clear this when:

1. The URL is public and loads in a browser with no password, no invite, and no
   VPN.
2. It renders. A blank page, a build error, or a permanent spinner is not a
   product yet.
3. You name the core path in one paragraph: the exact sequence a stranger
   follows to get the value once.
4. That path works end to end on the live site. Every step in it is reachable
   from the previous one.
5. Signing up, if it is required, works with an ordinary email and does not
   need anything a stranger cannot supply.
6. The product does the job from checkpoint 1, not a different, easier job.
7. Nothing on the core path is a placeholder: no lorem text, no dead buttons,
   no "coming soon" standing where the value should be.
8. You list the known gaps honestly — what is stubbed, what is slow, what breaks
   — and the list does not include anything on the core path.
9. It stays up. We may load it more than once.

## What gets this returned

A landing page with no product behind it. A demo video instead of a URL. A
core path that needs an account we cannot create. A product that works only
with data you seeded for yourself. Known gaps that quietly include the main
thing.`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "loads",
        clause: "The URL is public and renders in a real browser.",
        weight: 20,
        passThreshold:
          "The headless render returned a page with visible content. A blank body, an error page, or a timeout fails and the screenshot is attached to the return.",
      },
      {
        id: "core-path-named",
        clause: "The core path is named as an exact sequence a stranger can follow.",
        weight: 15,
        passThreshold:
          "A concrete ordered sequence, not a description of features. 'Users can manage their work' fails.",
      },
      {
        id: "core-path-works",
        clause: "The named path is reachable end to end on the live site.",
        weight: 30,
        passThreshold:
          "The rendered page and extracted text show the entry point of the path and no barrier a stranger cannot pass. A gate the reviewer cannot get through fails.",
      },
      {
        id: "no-placeholders",
        clause: "Nothing on the core path is placeholder or dead.",
        weight: 15,
        passThreshold:
          "No lorem text, template default copy, or 'coming soon' appears on the path. Placeholders elsewhere are acceptable if declared.",
      },
      {
        id: "serves-the-job",
        clause: "It does the job from checkpoint 1.",
        weight: 10,
        passThreshold:
          "The rendered product is recognisably the product whose idea and screens already passed. A pivot needs to be declared, not discovered.",
      },
      {
        id: "honest-gaps",
        clause: "Known gaps are listed and none of them sits on the core path.",
        weight: 10,
        passThreshold:
          "A specific list. An empty list on a product with obvious rough edges reads as a missing answer, not a perfect product.",
      },
    ],
  },
  gateType: "review",
  acceptsImages: true,
  metricSignals: [],
  fieldSchema: [
    {
      key: "liveUrl",
      label: "Live URL",
      kind: "url",
      required: true,
      help: "Public, no password. We open it in a real browser and try your core path.",
    },
    {
      key: "corePath",
      label: "The core path",
      kind: "textarea",
      required: true,
      help: "The one thing a stranger can do end to end, written as the exact steps they follow.",
    },
    {
      key: "knownGaps",
      label: "Known gaps",
      kind: "textarea",
      required: true,
      help: "What is stubbed, slow, or broken. Being honest here does not cost you the pass. Hiding it does.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// ---------------------------------------------------------------------------
// 4 · Money
// ---------------------------------------------------------------------------

const MONEY: CheckpointDefinition = {
  key: "money",
  order: 4,
  title: "Money, live and connected",
  barMarkdown: `## The bar

Two halves, and both have to clear.

The half we read: your payment provider is live and your product is connected
to the tracker, so every rupee from here on is counted by something other than
you. We read those signals from Shipped.money. Nothing you type on this page
can clear that half.

The half we review: you can say what you charge and why anyone would pay it.

You clear this when:

1. Payments are live on your product — a real provider, in live mode, not a
   sandbox key.
2. Your product is connected to the tracker, so its numbers flow in on their
   own.
3. A checkout URL exists that a stranger can reach and pay through.
4. You state the price, and the unit you charge for: per month, per seat, per
   use, one time.
5. You say why that price and not half or double it, in terms of what the buyer
   gets rather than what it cost you to build.
6. You name what the buyer gives up by not paying — the thing that stays
   unsolved.
7. The price and the product agree: a price that assumes features you have not
   shipped needs to say so.

## What the tracker must show

- payments live: yes
- tracker connected: yes

Until both are true, this checkpoint stays open no matter how good the write-up
is. The live numbers are on your spine, so you always know what the tracker
sees.`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "checkout-reachable",
        clause: "A checkout URL a stranger can reach and pay through.",
        weight: 25,
        passThreshold:
          "The URL is public and the liveness check reached it. A link behind a login, or a contact form standing in for checkout, fails.",
      },
      {
        id: "price-stated",
        clause: "The price and the unit charged for are both stated.",
        weight: 20,
        passThreshold: "A number and a unit. 'Pricing coming soon' or a range with no anchor fails.",
      },
      {
        id: "price-reasoned",
        clause: "Why that price, in terms of what the buyer gets.",
        weight: 30,
        passThreshold:
          "The reasoning is about buyer value or a named alternative's price. Cost-plus reasoning alone, or 'it felt right', fails.",
      },
      {
        id: "cost-of-not-buying",
        clause: "What the buyer gives up by not paying.",
        weight: 15,
        passThreshold: "A concrete unsolved outcome, not a restatement of the feature list.",
      },
      {
        id: "price-product-agreement",
        clause: "The price matches what is actually shipped.",
        weight: 10,
        passThreshold:
          "No pricing tier depends on something the checkpoint 3 render did not show, unless it is declared as not yet available.",
      },
    ],
  },
  gateType: "both",
  acceptsImages: false,
  metricSignals: ["paymentsLive", "trackerConnected"],
  fieldSchema: [
    {
      key: "pricingNote",
      label: "What you charge and why",
      kind: "textarea",
      required: true,
      help: "The price, the unit, the reasoning in the buyer's terms, and what they give up by not paying.",
    },
    {
      key: "checkoutUrl",
      label: "Checkout URL",
      kind: "url",
      required: true,
      help: "Where a stranger pays. We check it loads.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// ---------------------------------------------------------------------------
// 5 · Workflow
// ---------------------------------------------------------------------------

const WORKFLOW: CheckpointDefinition = {
  key: "workflow",
  order: 5,
  title: "One workflow, running on its own",
  barMarkdown: `## The bar

One piece of your operation runs without you, and it has run for real often
enough that we can see it.

This checkpoint is cleared by runs, not by writing. Nothing here is reviewed by
the AI. We read the run count from the tracker and the gate opens at ten.

You clear this when:

1. A workflow of yours is live and triggered by something real — a customer
   action, a schedule, an inbound message — rather than by you pressing run.
2. It has completed ten or more real runs.
3. Those runs are connected to the tracker, so the count is read rather than
   reported.
4. The workflow does something that would otherwise cost you time every week.
5. You name it and say in a line what it automates, so an instructor reading
   your spine knows what they are looking at.

## What the tracker must show

- workflow runs: 10 or more

Test runs you fired by hand to reach ten are visible in the data and are not
the point. The count on your spine updates on its own — if you land the tenth
run at midnight, the gate opens without you resubmitting anything.`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "metric-only",
        clause: "Cleared by the tracker's run count alone.",
        weight: 100,
        passThreshold:
          "Not reviewed by a model. The two fields on this checkpoint are informational: they label the workflow on the spine and in the instructor matrix.",
      },
    ],
  },
  gateType: "metric",
  acceptsImages: false,
  metricSignals: ["workflowTenRuns"],
  fieldSchema: [
    {
      key: "workflowName",
      label: "Workflow name",
      kind: "text",
      required: true,
      help: "The name it has in your automation tool, so the count on your spine is easy to match up.",
    },
    {
      key: "whatItAutomates",
      label: "What it automates",
      kind: "textarea",
      required: true,
      help: "One or two lines. What triggers it, what it does, and what it saves you. This is for your instructor to read, not for the reviewer.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// ---------------------------------------------------------------------------
// 6 · Launch
// ---------------------------------------------------------------------------

const LAUNCH: CheckpointDefinition = {
  key: "launch",
  order: 6,
  title: "Launched, with a stranger who paid",
  barMarkdown: `## The bar

The last one. A stranger paid you, the tracker saw it, and you can account for
how they found you.

Two halves again. The tracker must show at least one paying customer and no
blocking flags. The write-up is reviewed.

You clear this when:

1. At least one paying customer exists in the tracker's verified data, and that
   customer is not you, your team, or an account you control.
2. No blocking flag stands against your product. A self-payment flag fails this
   gate whatever the number says.
3. You write up the launch: what you did, on what days, and to whom.
4. You name the distribution channels you actually used, with what each one
   returned. A channel you listed but did not use is worse than an honest short
   list.
5. You tell the story of the first customer: how they found you, what they said
   before paying, and what they did after.
6. You say what you would do differently with the next hundred people, based on
   what this hundred did.
7. The numbers in the write-up agree with the tracker. Where they differ, you
   say why.
8. You name one thing that did not work, plainly.

## What gets this returned

A launch write-up with no channel specifics. A first-customer story that cannot
say how they arrived. Spam — bought signups, mass unsolicited outreach,
anything that treats people as a list — which scores zero on distribution and
is escalated to a human rather than quietly returned.

## What the tracker must show

- paying customer: yes
- blocking flags: none`,
  rubric: {
    passRule: "all-criteria-met",
    criteria: [
      {
        id: "launch-account",
        clause: "A launch write-up with what was done, when, and to whom.",
        weight: 20,
        passThreshold:
          "Dated, specific actions. A plan written in the future tense, or a summary with no dates, fails.",
      },
      {
        id: "channels",
        clause: "Distribution channels named, with what each returned.",
        weight: 25,
        passThreshold:
          "Each channel has a number or an honest 'nothing'. A list of channel names with no outcomes fails.",
      },
      {
        id: "first-customer",
        clause: "The first customer's story: how they found you, what they said, what they did.",
        weight: 25,
        passThreshold:
          "The arrival path is traceable and the account reads as a real person. An anonymous 'someone signed up' fails.",
      },
      {
        id: "numbers-agree",
        clause: "The write-up's numbers agree with the tracker, or the difference is explained.",
        weight: 15,
        passThreshold:
          "No contradiction with the signals read at review time. A contradiction is escalated to a human, never passed.",
      },
      {
        id: "learning",
        clause: "What would change for the next hundred, and one thing that did not work.",
        weight: 10,
        passThreshold: "Both present and specific. 'Post more' fails.",
      },
      {
        id: "no-spam",
        clause: "The distribution was honest.",
        weight: 5,
        passThreshold:
          "No bought signups, no mass unsolicited outreach. Any sign of it scores this criterion zero and escalates to a human.",
      },
    ],
  },
  gateType: "both",
  acceptsImages: false,
  metricSignals: ["hasPayingCustomer", "noBlockingFlags"],
  fieldSchema: [
    {
      key: "launchWriteup",
      label: "The launch",
      kind: "textarea",
      required: true,
      help: "What you did, on what days, and to whom. Include what did not work.",
    },
    {
      key: "distributionChannels",
      label: "Distribution channels",
      kind: "textarea",
      required: true,
      help: "Each channel you actually used and what it returned. A short honest list beats a long aspirational one.",
    },
    {
      key: "firstCustomerStory",
      label: "Your first customer",
      kind: "textarea",
      required: true,
      help: "How they found you, what they said before paying, and what they did after.",
    },
  ],
  resubmitWindowHours: DEFAULT_RESUBMIT_WINDOW_HOURS,
  resubmitCooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

/** The six checkpoints, in course order. Seeded once; edited as rows after. */
export const CHECKPOINT_DEFINITIONS: readonly CheckpointDefinition[] = [
  IDEA,
  DESIGN,
  WORKING,
  MONEY,
  WORKFLOW,
  LAUNCH,
];

export function checkpointDefinition(key: ShipyardCheckpointKey): CheckpointDefinition {
  const found = CHECKPOINT_DEFINITIONS.find((c) => c.key === key);
  if (!found) throw new Error(`unknown checkpoint key: ${key}`);
  return found;
}

/** Deterministic seed ids, so a re-seed does not renumber the checkpoints. */
export function checkpointId(key: ShipyardCheckpointKey): string {
  return `sycp_${key}`;
}
