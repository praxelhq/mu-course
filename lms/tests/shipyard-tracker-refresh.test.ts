import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  CALLBACK_WINDOW_SECONDS,
  signRefreshCallback,
  verifyRefreshCallback,
} from "@/lib/shipyard/tracker-refresh";
import { signSignalsRequest } from "@/lib/tracker/real";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";
import type { TrackerClient } from "@/lib/tracker/client";

const TOKEN = "shipped-money-service-token";
const SLUG = "ledger-desk";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const TS = String(Math.floor(NOW.getTime() / 1000));

function headers(over: Partial<Record<"authorization" | "timestamp" | "signature", string>> = {}) {
  return {
    authorization: `Bearer ${TOKEN}`,
    timestamp: TS,
    signature: signRefreshCallback(TOKEN, TS, SLUG),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The callback's signature — pure
// ---------------------------------------------------------------------------

describe("verifyRefreshCallback", () => {
  it("accepts a correctly signed, fresh call", () => {
    expect(verifyRefreshCallback(headers(), SLUG, TOKEN, NOW)).toBe(true);
  });

  it("uses the same scheme this portal signs its own tracker reads with", () => {
    // One shared secret, both directions (lib/tracker/real.ts).
    expect(signRefreshCallback(TOKEN, TS, SLUG)).toBe(signSignalsRequest(TOKEN, TS, SLUG));
  });

  it("refuses a right token with a wrong signature", () => {
    expect(
      verifyRefreshCallback(headers({ signature: "a".repeat(64) }), SLUG, TOKEN, NOW),
    ).toBe(false);
  });

  it("refuses a right signature with a wrong bearer token", () => {
    expect(
      verifyRefreshCallback(headers({ authorization: "Bearer nope" }), SLUG, TOKEN, NOW),
    ).toBe(false);
  });

  it("refuses a signature made for a different slug — replay across projects", () => {
    const other = { ...headers(), signature: signRefreshCallback(TOKEN, TS, "somebody-else") };
    expect(verifyRefreshCallback(other, SLUG, TOKEN, NOW)).toBe(false);
  });

  it("refuses a stale or future timestamp outside the ±300s window", () => {
    const stale = String(Number(TS) - CALLBACK_WINDOW_SECONDS - 1);
    const future = String(Number(TS) + CALLBACK_WINDOW_SECONDS + 1);
    for (const timestamp of [stale, future]) {
      expect(
        verifyRefreshCallback(
          { ...headers({ timestamp }), signature: signRefreshCallback(TOKEN, timestamp, SLUG) },
          SLUG,
          TOKEN,
          NOW,
        ),
        timestamp,
      ).toBe(false);
    }
    // The edge itself is inside the window.
    const edge = String(Number(TS) - CALLBACK_WINDOW_SECONDS);
    expect(
      verifyRefreshCallback(
        { ...headers({ timestamp: edge }), signature: signRefreshCallback(TOKEN, edge, SLUG) },
        SLUG,
        TOKEN,
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses missing, malformed and empty credentials", () => {
    expect(verifyRefreshCallback({ authorization: null, timestamp: null, signature: null }, SLUG, TOKEN, NOW)).toBe(false);
    expect(verifyRefreshCallback(headers({ authorization: TOKEN }), SLUG, TOKEN, NOW)).toBe(false);
    expect(verifyRefreshCallback(headers({ timestamp: "not-a-number" }), SLUG, TOKEN, NOW)).toBe(false);
    expect(verifyRefreshCallback(headers({ signature: "short" }), SLUG, TOKEN, NOW)).toBe(false);
    // No configured token at all: nothing is ever accepted.
    expect(verifyRefreshCallback(headers(), SLUG, "", NOW)).toBe(false);
  });

  it("accepts an upper-case hex signature and a lower-case scheme name", () => {
    const upper = signRefreshCallback(TOKEN, TS, SLUG).toUpperCase();
    expect(verifyRefreshCallback(headers({ signature: upper }), SLUG, TOKEN, NOW)).toBe(true);
    expect(
      verifyRefreshCallback(headers({ authorization: `bearer ${TOKEN}` }), SLUG, TOKEN, NOW),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live DB: a refresh moves a gate
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

/** A tracker that answers with exactly what the test says, and counts reads. */
function fixedTracker(signals: TrackerSignals | null): TrackerClient & { reads: number } {
  const client = {
    reads: 0,
    async getCheckpointSignals() {
      client.reads += 1;
      return signals;
    },
  };
  return client;
}

const live = await dbReachable();

describe.skipIf(!live)("refreshTrackerForProduct (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let productId: string | null = null;
  let snapshot: Awaited<ReturnType<typeof prisma.shipyardCheckpointState.findMany>> = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    if ((await prisma.shipyardCheckpoint.count()) !== 6) return;
    // A student sitting at the money checkpoint: its metric half is what a
    // refresh can move.
    const state = await prisma.shipyardCheckpointState.findFirst({
      where: {
        state: "open",
        checkpoint: { key: "money" },
        product: { id: { startsWith: "syp_" }, trackerProductId: { not: null } },
      },
      orderBy: { productId: "asc" },
      select: { productId: true },
    });
    productId = state?.productId ?? null;
    // Snapshot the six rows so the suite leaves the seeded cohort exactly as it
    // found it — passed gates are sticky now, so a test that clears the money
    // gate would otherwise contradict every later suite that expects it open.
    if (productId) {
      snapshot = await prisma.shipyardCheckpointState.findMany({ where: { productId } });
    }
  }, 60_000);

  afterAll(async () => {
    if (productId && snapshot.length > 0) {
      for (const row of snapshot) {
        await prisma.shipyardCheckpointState.update({
          where: { id: row.id },
          data: {
            state: row.state,
            openedAt: row.openedAt,
            passedAt: row.passedAt,
            reviewClearedAt: row.reviewClearedAt,
            metricClearedAt: row.metricClearedAt,
            manuallyOpenedBy: row.manuallyOpenedBy,
          },
        });
      }
      await prisma.shipyardTrackerOverride.deleteMany({ where: { productId, updatedBy: "test" } }).catch(() => undefined);
    }
    await prisma?.$disconnect();
  });

  it("opens the money gate when the tracker's numbers arrive", async () => {
    if (!productId) return;
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");

    const before = await refreshTrackerForProduct(productId, {
      db: prisma,
      tracker: fixedTracker({
        ...emptySignals(),
        trackerConnected: true,
        paymentsLive: false,
      }),
      recomputeGrade: false,
    });
    expect(before.signals).not.toBeNull();
    expect(before.states.find((s) => s.key === "money")?.state).toBe("open");

    const after = await refreshTrackerForProduct(productId, {
      db: prisma,
      tracker: fixedTracker({
        ...emptySignals(),
        trackerConnected: true,
        paymentsLive: true,
      }),
      recomputeGrade: false,
    });
    // The money checkpoint is a `both` gate. The metric half has now cleared,
    // so the state is either passed (its write-up already passed) or still
    // open awaiting the review — never "awaiting-metrics" any more.
    const money = after.states.find((s) => s.key === "money");
    expect(money?.reason).not.toBe("awaiting-metrics");
    expect(money?.metricClearedAt).not.toBeNull();
  });

  it("leaves every gate where it was when the tracker cannot answer", async () => {
    if (!productId) return;
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");

    const before = await prisma.shipyardCheckpointState.findMany({
      where: { productId },
      orderBy: { checkpointId: "asc" },
      select: { checkpointId: true, state: true },
    });

    const result = await refreshTrackerForProduct(productId, {
      db: prisma,
      tracker: fixedTracker(null),
      recomputeGrade: false,
    });
    expect(result.signals).toBeNull();

    const after = await prisma.shipyardCheckpointState.findMany({
      where: { productId },
      orderBy: { checkpointId: "asc" },
      select: { checkpointId: true, state: true },
    });
    expect(after).toEqual(before);
    // The returned states are the stored ones, read back rather than recomputed.
    const stored = new Map(before.map((s) => [s.checkpointId, s.state]));
    for (const state of result.states) {
      expect(state.state, state.key).toBe(stored.get(state.checkpointId));
    }
  });

  it("only counts n8n runs when the tracker reported none", async () => {
    if (!productId) return;
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");

    let asked = 0;
    const countRuns = async () => {
      asked += 1;
      return 12;
    };

    // The tracker has its own count: the adapter is never consulted.
    const trackerKnows = await refreshTrackerForProduct(productId, {
      db: prisma,
      tracker: fixedTracker({ ...emptySignals(), trackerConnected: true, workflowRuns: 3 }),
      countRuns,
      recomputeGrade: false,
    });
    expect(asked).toBe(0);
    expect(trackerKnows.workflowRunsFromN8n).toBe(false);
    expect(trackerKnows.signals?.workflowRuns).toBe(3);
  });

  it("finds a product by its Shipped.money slug, and nothing by an unknown one", async () => {
    if (!productId) return;
    const { productIdForSlug } = await import("@/lib/shipyard/tracker-refresh");
    const product = await prisma.shipyardProduct.findUnique({
      where: { id: productId },
      select: { trackerProductId: true },
    });
    expect(await productIdForSlug(product!.trackerProductId!, prisma)).toBe(productId);
    expect(await productIdForSlug("no-such-project-anywhere", prisma)).toBeNull();
  });
});
