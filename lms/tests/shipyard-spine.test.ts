import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  currentOrderFrom,
  fieldSpecViews,
  formatSignalValue,
  loadSpine,
  parseStoredFiles,
  QUEUE_NOTE,
  reasonViews,
  signalViews,
  spineVersion,
} from "@/lib/shipyard/spine";
import type { CheckpointView, SpineView } from "@/lib/shipyard/view-models";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";
import { checkpointId } from "@/lib/shipyard/checkpoints";
import { mockSpine } from "@/lib/shipyard/spine-mock";

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

function signals(patch: Partial<TrackerSignals> = {}): TrackerSignals {
  return { ...emptySignals(new Date("2026-09-14T10:00:00Z")), ...patch };
}

describe("signalViews", () => {
  it("gives every signal a human label and a display-ready value", () => {
    const views = signalViews(
      ["paymentsLive", "trackerConnected", "workflowTenRuns", "hasPayingCustomer", "noBlockingFlags"],
      signals({ paymentsLive: true, trackerConnected: true, workflowRuns: 7, payingCustomers: 2 }),
    );
    expect(views.map((v) => v.label)).toEqual([
      "Payments live",
      "Tracker connected",
      "Workflow runs",
      "Paying customers",
      "No blocking flags",
    ]);
    expect(views.map((v) => v.value)).toEqual(["yes", "yes", "7 of 10", "2", "none"]);
  });

  it("reads unknown, not unmet, when the tracker has not answered", () => {
    const views = signalViews(["paymentsLive"], null);
    expect(views[0].met).toBeNull();
    expect(views[0].value).toBe("not read yet");
  });

  it("makes every signal but the flag itself false when a flag is raised", () => {
    const views = signalViews(
      ["hasPayingCustomer", "noBlockingFlags"],
      signals({ hasPayingCustomer: true, payingCustomers: 3, blockingFlags: ["self_payment"] }),
    );
    expect(views[0].met).toBe(false);
    expect(views[1].met).toBe(false);
    expect(views[1].value).toBe("self_payment");
  });

  it("falls back to the boolean when the tracker sends no run count", () => {
    expect(formatSignalValue("workflowTenRuns", signals({ workflowTenRuns: true, workflowRuns: undefined }))).toBe(
      "10 of 10",
    );
  });
});

describe("reasonViews", () => {
  it("passes the view-model shape through unchanged", () => {
    expect(reasonViews([{ criterion: "A live waitlist", met: true, note: "200 OK." }])).toEqual([
      { criterion: "A live waitlist", met: true, note: "200 OK." },
    ]);
  });

  it("maps the seeded {criterionId, clause, what, fix} shape onto ReasonView", () => {
    const mapped = reasonViews([
      { criterionId: "traffic-test", clause: "A real traffic test.", what: "No numbers.", fix: "Give reach." },
    ]);
    expect(mapped).toEqual([
      { criterion: "A real traffic test.", met: false, note: "No numbers. Give reach." },
    ]);
  });

  it("drops anything it cannot make a criterion out of", () => {
    expect(reasonViews([null, 3, "x", {}, { note: "orphan" }])).toEqual([]);
    expect(reasonViews("not an array")).toEqual([]);
  });
});

describe("fieldSpecViews", () => {
  it("turns the accept array into the HTML accept attribute", () => {
    const [view] = fieldSpecViews([
      {
        key: "sketches",
        label: "Photos",
        kind: "images",
        required: true,
        maxFiles: 8,
        accept: ["image/png", "image/jpeg"],
      },
    ]);
    expect(view.accept).toBe("image/png,image/jpeg");
    expect(view.maxFiles).toBe(8);
    expect(view).not.toHaveProperty("help");
  });

  it("is empty for a checkpoint whose field schema does not parse", () => {
    expect(fieldSpecViews(null)).toEqual([]);
  });
});

describe("parseStoredFiles", () => {
  it("keeps well-formed entries and names an entry that has no name", () => {
    expect(
      parseStoredFiles([
        { key: "shipyard/p1/idea/a-shot.png", name: "shot.png", contentType: "image/png", bytes: 10 },
        { key: "shipyard/p1/idea/b-scan.pdf" },
        { key: "" },
        "nope",
      ]),
    ).toEqual([
      { key: "shipyard/p1/idea/a-shot.png", name: "shot.png", contentType: "image/png", bytes: 10 },
      {
        key: "shipyard/p1/idea/b-scan.pdf",
        name: "b-scan.pdf",
        contentType: "application/octet-stream",
        bytes: 0,
      },
    ]);
  });
});

describe("currentOrderFrom", () => {
  const cp = (order: number, state: CheckpointView["state"]) => ({ order, state });

  it("is the lowest open checkpoint", () => {
    expect(currentOrderFrom([cp(1, "passed"), cp(2, "open"), cp(3, "locked")])).toBe(2);
  });

  it("is one past the end when every checkpoint is cleared", () => {
    expect(currentOrderFrom([1, 2, 3, 4, 5, 6].map((o) => cp(o, "passed")))).toBe(7);
  });

  it("falls back to the lowest unpassed one when nothing is open", () => {
    expect(currentOrderFrom([cp(1, "passed"), cp(2, "locked")])).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The poll's content hash
// ---------------------------------------------------------------------------

function spine(patch: Partial<SpineView> = {}): SpineView {
  const checkpoint: CheckpointView = {
    id: "cp1",
    key: "idea",
    order: 1,
    title: "The idea",
    barMarkdown: "## The bar",
    gateType: "review",
    state: "open",
    openedAt: "2026-09-01T00:00:00.000Z",
    passedAt: null,
    deadlineAt: null,
    resubmitWindowHours: 72,
    resubmitCooldownMinutes: 15,
    fields: [],
    signals: null,
    signalsRefreshedAt: null,
    latestSubmission: null,
    attempts: 0,
  };
  return {
    product: {
      id: "p1",
      name: "Ledger",
      oneLiner: "one line",
      liveUrl: null,
      trackerProductId: null,
    },
    checkpoints: [checkpoint],
    currentOrder: 1,
    grade: null,
    queueNote: QUEUE_NOTE,
    now: "2026-09-14T10:00:00.000Z",
    ...patch,
  };
}

describe("the held-pass shape the UI renders", () => {
  it("says met-the-bar, with no queue position and no cooldown", () => {
    const view = mockSpine("held_pass");
    const cp = view.checkpoints.find((c) => c.state === "open")!;
    const sub = cp.latestSubmission!;
    expect(sub.status).toBe("in_review");
    expect(sub.heldPass).toBe(true);
    // The three things that must NOT be on screen for a held pass.
    expect(sub.queuePosition).toBeNull();
    expect(sub.nextAllowedResubmitAt).toBeNull();
    expect(cp.state).not.toBe("passed");
    // And the two that must: the verdict, and that it is with a person.
    expect(sub.review!.verdict).toBe("pass");
    expect(sub.review!.pendingHuman).toBe(true);
    expect(sub.review!.id).not.toBe("");
  });
});

describe("spineVersion", () => {
  it("does not move when only the clock moves", () => {
    expect(spineVersion(spine())).toBe(spineVersion(spine({ now: "2026-09-14T10:00:04.000Z" })));
  });

  it("does not move when only a presigned file URL is re-signed", () => {
    const withFile = (url: string): SpineView => {
      const base = spine();
      base.checkpoints[0].latestSubmission = {
        id: "s1",
        status: "returned",
        version: 1,
        submittedAt: "2026-09-13T00:00:00.000Z",
        nextAllowedResubmitAt: null,
        queuePosition: null,
        heldPass: false,
        review: null,
        fields: {},
        files: [{ key: "k", name: "n", contentType: "image/png", bytes: 1, url }],
      };
      return base;
    };
    expect(spineVersion(withFile("https://s3/a?sig=1"))).toBe(
      spineVersion(withFile("https://s3/a?sig=2")),
    );
  });

  it("moves when a gate opens", () => {
    const after = spine();
    after.checkpoints[0].state = "passed";
    expect(spineVersion(after)).not.toBe(spineVersion(spine()));
  });

  it("moves when a verdict lands", () => {
    const after = spine();
    after.checkpoints[0].latestSubmission = {
      id: "s1",
      status: "passed",
      version: 1,
      submittedAt: "2026-09-13T00:00:00.000Z",
      nextAllowedResubmitAt: null,
      queuePosition: null,
      heldPass: false,
      review: {
        id: "rev1",
        verdict: "pass",
        reasons: [],
        confidence: 1,
        createdAt: "2026-09-13T00:01:00.000Z",
        pendingHuman: false,
      },
      fields: {},
      files: [],
    };
    expect(spineVersion(after)).not.toBe(spineVersion(spine()));
  });

  it("is stable across calls on the same view", () => {
    expect(spineVersion(spine())).toBe(spineVersion(spine()));
  });
});

// ---------------------------------------------------------------------------
// Live DB: the loader against the seeded cohort
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

describe.skipIf(!live)("loadSpine (live DB)", () => {
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

  it("gives the fresh student six checkpoints, one open, nothing submitted", async () => {
    if (!seeded) return;
    const view = await loadSpine("user_s001", { db: prisma, presign: async () => undefined });
    expect(view.checkpoints).toHaveLength(6);
    expect(view.checkpoints[0].state).toBe("open");
    expect(view.checkpoints.slice(1).every((c) => c.state === "locked")).toBe(true);
    expect(view.currentOrder).toBe(1);
    expect(view.checkpoints[0].latestSubmission).toBeNull();
    expect(view.checkpoints[0].attempts).toBe(0);
    expect(view.queueNote).toBe(QUEUE_NOTE);
    // A student with nothing scored still gets the LINE: four labelled
    // components and their weights, no numbers. How the course is scored is
    // course content, not a reward for finishing (SPEC §7).
    expect(view.grade).not.toBeNull();
    expect(view.grade!.total).toBeNull();
    expect(view.grade!.provisional).toBe(true);
    expect(view.grade!.components).toHaveLength(4);
    expect(view.grade!.components.every((c) => c.weight > 0)).toBe(true);
    // The bar is published; the rubric never leaves the database.
    expect(view.checkpoints[0].barMarkdown).toContain("You clear this when");
    expect(JSON.stringify(view)).not.toContain("passThreshold");
  });

  it("renders a returned attempt with its reasons and its cooldown", async () => {
    if (!seeded) return;
    const returned = await prisma.shipyardSubmission.findFirst({
      where: { status: "returned", checkpointId: checkpointId("idea") },
      select: { product: { select: { userId: true } } },
    });
    if (!returned) return;
    const view = await loadSpine(returned.product.userId, {
      db: prisma,
      presign: async () => undefined,
    });
    const idea = view.checkpoints[0];
    expect(idea.state).toBe("open");
    expect(idea.latestSubmission?.status).toBe("returned");
    expect(idea.latestSubmission?.review?.verdict).toBe("return");
    expect((idea.latestSubmission?.review?.reasons.length ?? 0)).toBeGreaterThan(0);
    for (const reason of idea.latestSubmission!.review!.reasons) {
      expect(reason.criterion).toBeTruthy();
      expect(typeof reason.met).toBe("boolean");
    }
    expect(idea.latestSubmission?.nextAllowedResubmitAt).toBeTruthy();
    expect(idea.attempts).toBe(1);
  });

  it("shows a queue position while a submission is in review", async () => {
    if (!seeded) return;
    const inReview = await prisma.shipyardSubmission.findFirst({
      where: { status: "in_review" },
      select: { product: { select: { userId: true } } },
    });
    if (!inReview) return;
    const view = await loadSpine(inReview.product.userId, {
      db: prisma,
      presign: async () => undefined,
    });
    const pending = view.checkpoints.find((c) => c.latestSubmission?.status === "in_review");
    expect(pending?.latestSubmission?.queuePosition).toBeGreaterThanOrEqual(1);
  });

  it("carries live signals and their refresh time on a metric-blocked student", async () => {
    if (!seeded) return;
    const blocked = await prisma.shipyardCheckpointState.findFirst({
      where: { state: "open", checkpoint: { key: "money" }, product: { trackerProductId: { not: null } } },
      select: { product: { select: { userId: true } } },
    });
    if (!blocked) return;
    const view = await loadSpine(blocked.product.userId, {
      db: prisma,
      presign: async () => undefined,
    });
    const money = view.checkpoints.find((c) => c.key === "money")!;
    expect(money.signals).not.toBeNull();
    expect(money.signals!.map((s) => s.name)).toEqual(["paymentsLive", "trackerConnected"]);
    expect(money.signalsRefreshedAt).toBeTruthy();
    // A review gate never carries signals.
    expect(view.checkpoints[0].signals).toBeNull();
    expect(view.checkpoints[0].signalsRefreshedAt).toBeNull();
  });

  it("reads a held pass as met-the-bar, with no queue position", async () => {
    if (!seeded) return;
    // Any submission the seed left `in_review` with a held pass; if the cohort
    // has none, there is nothing to assert and the test says so by skipping.
    const held = await prisma!.shipyardSubmission.findFirst({
      where: {
        status: "in_review",
        reviews: { some: { verdict: "pass", needsHuman: true, humanResolvedAt: null } },
      },
      select: { checkpointId: true, product: { select: { userId: true } } },
    });
    if (!held) return;

    const view = await loadSpine(held.product.userId, {
      db: prisma,
      presign: async () => undefined,
    });
    const cp = view.checkpoints.find((c) => c.id === held.checkpointId)!;
    const sub = cp.latestSubmission!;
    expect(sub.heldPass).toBe(true);
    // The model is finished with it, so a queue position would predict nothing.
    expect(sub.queuePosition).toBeNull();
    expect(sub.review!.verdict).toBe("pass");
    expect(sub.review!.pendingHuman).toBe(true);
    // And the gate has NOT moved.
    expect(cp.state).not.toBe("passed");
  });

  it("carries the review id a dispute is filed against", async () => {
    if (!seeded) return;
    const returned = await prisma!.shipyardSubmission.findFirst({
      where: { status: "returned", reviews: { some: {} } },
      select: { product: { select: { userId: true } }, checkpointId: true },
    });
    if (!returned) return;
    const view = await loadSpine(returned.product.userId, {
      db: prisma,
      presign: async () => undefined,
    });
    const cp = view.checkpoints.find((c) => c.id === returned.checkpointId)!;
    expect(cp.latestSubmission!.review!.id).toMatch(/.+/);
  });

  it("hashes to the same version twice in a row", async () => {
    if (!seeded) return;
    const a = await loadSpine("user_s001", { db: prisma, presign: async () => undefined });
    const b = await loadSpine("user_s001", { db: prisma, presign: async () => undefined });
    expect(spineVersion(a)).toBe(spineVersion(b));
  });
});
