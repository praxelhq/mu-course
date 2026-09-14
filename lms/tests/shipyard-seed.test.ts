import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { assignBuckets } from "../prisma/seed-shipyard";
import { CHECKPOINT_DEFINITIONS, checkpointId } from "@/lib/shipyard/checkpoints";
import { SHIPYARD_COURSE_ID } from "@/lib/shipyard/constants";
import { recomputeGates } from "@/lib/shipyard/gate-state";
import { trackerSignalsSchema, type TrackerSignals } from "@/lib/tracker/types";

// ---------------------------------------------------------------------------
// Pure: the cohort spread
// ---------------------------------------------------------------------------

describe("assignBuckets", () => {
  it("covers exactly 480 students and is deterministic", () => {
    const a = assignBuckets(480);
    const b = assignBuckets(480);
    expect(a).toHaveLength(480);
    expect(a).toEqual(b);
  });

  it("puts the e2e student at a clean checkpoint 1", () => {
    expect(assignBuckets(480)[0]).toBe("none");
  });

  it("produces every state the demo has to show", () => {
    const counts = new Map<string, number>();
    for (const bucket of assignBuckets(480)) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    for (const bucket of [
      "none",
      "returned",
      "in_review",
      "passed_1",
      "passed_2",
      "passed_3",
      "money_blocked",
      "workflow_partial",
      "launch_cleared",
      "launch_flagged",
    ]) {
      expect(counts.get(bucket) ?? 0, bucket).toBeGreaterThan(0);
    }
    expect(counts.get("launch_flagged")).toBeGreaterThanOrEqual(2);
  });

  it("spreads the buckets across sections rather than blocking them", () => {
    // Sections are 60 consecutive indices; every one must show a mix.
    const buckets = assignBuckets(480);
    for (let section = 0; section < 8; section++) {
      const slice = new Set(buckets.slice(section * 60, (section + 1) * 60));
      expect(slice.size, `section ${section}`).toBeGreaterThanOrEqual(5);
    }
  });

  it("refuses a cohort size the plan does not cover", () => {
    expect(() => assignBuckets(100)).toThrow(/bucket plan/);
  });
});

// ---------------------------------------------------------------------------
// Live DB: the seeded Shipyard world and recomputeGates against it
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

describe.skipIf(!live)("seeded Shipyard (live DB)", () => {
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

  it("seeds the six checkpoints, the v1 weights and the router's default state", async () => {
    if (!seeded) return;
    const checkpoints = await prisma.shipyardCheckpoint.findMany({ orderBy: { order: "asc" } });
    expect(checkpoints).toHaveLength(6);
    expect(checkpoints.map((c) => c.key)).toEqual(CHECKPOINT_DEFINITIONS.map((c) => c.key));
    expect(checkpoints.every((c) => c.courseId === SHIPYARD_COURSE_ID)).toBe(true);
    expect(checkpoints.every((c) => c.barMarkdown.includes("You clear this when"))).toBe(true);

    const weights = await prisma.shipyardWeights.findMany();
    expect(weights).toHaveLength(1);
    expect(weights[0].version).toBe("v1");
    expect(weights[0].active).toBe(true);

    const router = await prisma.shipyardRouterState.findUnique({ where: { id: "default" } });
    expect(router?.activeProfile).toBe("flash_verdicts");
    expect(router?.anthropicExhausted).toBe(false);
  });

  it("gives every seeded student one product and six gate states", async () => {
    if (!seeded) return;
    // Scoped to the seed's own ids: a developer's hand-made row in the local
    // database must not fail the seed's own assertions.
    expect(await prisma.shipyardProduct.count({ where: { id: { startsWith: "syp_" } } })).toBe(480);
    expect(
      await prisma.shipyardCheckpointState.count({
        where: { product: { id: { startsWith: "syp_" } } },
      }),
    ).toBe(480 * 6);
    const orphan = await prisma.user.count({
      where: { role: "student", id: { startsWith: "user_s" }, shipyardProduct: { is: null } },
    });
    expect(orphan).toBe(0);
  });

  it("leaves the e2e student at an open checkpoint 1 with nothing submitted", async () => {
    if (!seeded) return;
    const product = await prisma.shipyardProduct.findUnique({
      where: { userId: "user_s001" },
      include: {
        submissions: true,
        checkpointStates: { include: { checkpoint: true } },
      },
    });
    expect(product).not.toBeNull();
    expect(product!.submissions).toHaveLength(0);
    const byKey = Object.fromEntries(
      product!.checkpointStates.map((s) => [s.checkpoint.key, s.state]),
    );
    expect(byKey.idea).toBe("open");
    for (const key of ["design", "working", "money", "workflow", "launch"]) {
      expect(byKey[key], key).toBe("locked");
    }
  });

  it("shows every submission status and both verdicts", async () => {
    if (!seeded) return;
    for (const status of ["returned", "in_review", "submitted", "passed"] as const) {
      expect(await prisma.shipyardSubmission.count({ where: { status } }), status).toBeGreaterThan(
        0,
      );
    }
    expect(await prisma.shipyardReview.count({ where: { verdict: "return" } })).toBeGreaterThan(0);
    expect(await prisma.shipyardReview.count({ where: { verdict: "pass" } })).toBeGreaterThan(0);
    // Low-confidence reviews land in the human queue.
    expect(await prisma.shipyardReview.count({ where: { needsHuman: true } })).toBeGreaterThan(0);
  });

  it("records model, provider, tokens and cost on every review", async () => {
    if (!seeded) return;
    const reviews = await prisma.shipyardReview.findMany({ take: 50 });
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) {
      expect(review.modelUsed).toBeTruthy();
      expect(review.providerUsed).toBeTruthy();
      expect(review.tokensIn).toBeGreaterThan(0);
      expect(review.tokensOut).toBeGreaterThan(0);
      expect(review.costUsd).toBeGreaterThan(0);
    }
  });

  it("attaches a render artifact to every checkpoint 3 review", async () => {
    if (!seeded) return;
    const working = await prisma.shipyardReview.findMany({
      where: { submission: { checkpointId: checkpointId("working") } },
      take: 20,
    });
    expect(working.length).toBeGreaterThan(0);
    for (const review of working) {
      expect(review.renderArtifacts).not.toBeNull();
    }
  });

  it("seeds tracker overrides that all validate, including two blocking flags", async () => {
    if (!seeded) return;
    const overrides = await prisma.shipyardTrackerOverride.findMany();
    expect(overrides.length).toBeGreaterThan(0);
    let flagged = 0;
    for (const row of overrides) {
      const parsed = trackerSignalsSchema.safeParse(row.signals);
      expect(parsed.success, row.productId).toBe(true);
      if (parsed.success && parsed.data.blockingFlags.length > 0) flagged += 1;
    }
    expect(flagged).toBeGreaterThanOrEqual(2);

    // A partially-run workflow is visible on the spine as "7 of 10".
    const partial = overrides.find((row) => {
      const parsed = trackerSignalsSchema.safeParse(row.signals);
      return parsed.success && parsed.data.workflowRuns === 7;
    });
    expect(partial).toBeDefined();
  });

  it("recomputeGates reproduces the seeded states exactly", async () => {
    if (!seeded) return;
    const products = await prisma.shipyardProduct.findMany({
      where: { id: { startsWith: "syp_" } },
      take: 12,
      orderBy: { id: "asc" },
      include: { trackerOverride: true },
    });
    for (const product of products) {
      const before = await prisma.shipyardCheckpointState.findMany({
        where: { productId: product.id },
      });
      const signals: TrackerSignals | null = product.trackerOverride
        ? trackerSignalsSchema.parse(product.trackerOverride.signals)
        : null;
      const after = await recomputeGates(product.id, { db: prisma, signals });
      expect(after, product.id).toHaveLength(6);
      for (const row of after) {
        const prior = before.find((s) => s.checkpointId === row.checkpointId)!;
        expect(row.state, `${product.id}/${row.key}`).toBe(prior.state);
      }
    }
  }, 60_000);

  it("recomputeGates is idempotent and keeps the first openedAt", async () => {
    if (!seeded) return;
    const product = await prisma.shipyardProduct.findFirst({
      where: { id: { startsWith: "syp_" } },
      orderBy: { id: "asc" },
    });
    const first = await recomputeGates(product!.id, { db: prisma, signals: null });
    const second = await recomputeGates(product!.id, { db: prisma, signals: null });
    expect(second.map((s) => s.state)).toEqual(first.map((s) => s.state));
    expect(second.map((s) => s.openedAt?.toISOString() ?? null)).toEqual(
      first.map((s) => s.openedAt?.toISOString() ?? null),
    );
  });

  it("refuses to recompute a product that does not exist", async () => {
    if (!seeded) return;
    await expect(recomputeGates("syp_missing", { db: prisma, signals: null })).rejects.toThrow(
      /no product/,
    );
  });
});
