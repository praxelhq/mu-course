// `recomputeGates` against a real database: the half of the sticky-gate rule
// that only exists once there are stored rows to be sticky about.
//
// Every test here runs inside a transaction that is rolled back, so it can set
// a product up exactly as it needs it without leaving anything behind in a
// developer's seeded database.

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { checkpointId } from "@/lib/shipyard/checkpoints";
import { recomputeGates } from "@/lib/shipyard/gate-state";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";

const NOW = new Date("2026-09-15T12:00:00Z");
const EARLIER = new Date("2026-09-01T12:00:00Z");

function signals(overrides: Partial<TrackerSignals> = {}): TrackerSignals {
  return { ...emptySignals(NOW), ...overrides };
}

const CONNECTED = signals({ paymentsLive: true, trackerConnected: true });
const HALF_CONNECTED = signals({ paymentsLive: false, trackerConnected: true });
const FLAGGED = signals({
  paymentsLive: true,
  trackerConnected: true,
  blockingFlags: ["self_payment_suspected"],
});

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

/** Thrown to roll the transaction back once the assertions have run. */
class Rollback extends Error {}

describe.skipIf(!live)("recomputeGates — passed is one-way (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let seeded = false;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    seeded =
      (await prisma.shipyardCheckpoint.count()) === 6 &&
      (await prisma.shipyardProduct.count({ where: { id: { startsWith: "syp_" } } })) > 0;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Run `fn` in a transaction and undo everything it did. */
  async function inRollback(
    fn: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await prisma.$transaction(
        async (tx) => {
          await fn(tx);
          throw new Rollback("done");
        },
        { timeout: 30_000 },
      );
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
  }

  /**
   * The LAST seeded product. Every other live suite works from the front of the
   * cohort (`orderBy: id asc`), and these tests hold row locks inside a
   * transaction — working from the other end keeps the two from meeting.
   */
  async function lastProduct(
    tx: import("@prisma/client").Prisma.TransactionClient,
  ): Promise<string> {
    const product = await tx.shipyardProduct.findFirst({
      where: { id: { startsWith: "syp_" } },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return product!.id;
  }

  /**
   * A product sitting at a passed money checkpoint. A seeded one if the tail of
   * the cohort has one; otherwise the last product, forced there by hand — the
   * rule under test is about stored rows, not about how they came to be stored.
   */
  async function productAtMoneyPassed(
    tx: import("@prisma/client").Prisma.TransactionClient,
  ): Promise<string> {
    const passed = await tx.shipyardCheckpointState.findFirst({
      where: {
        state: "passed",
        checkpointId: checkpointId("money"),
        product: { id: { startsWith: "syp_" } },
      },
      orderBy: { productId: "desc" },
      select: { productId: true },
    });
    if (passed) return passed.productId;

    const productId = await lastProduct(tx);
    for (const key of ["idea", "design", "working", "money"] as const) {
      await tx.shipyardCheckpointState.update({
        where: { productId_checkpointId: { productId, checkpointId: checkpointId(key) } },
        data: {
          state: "passed",
          openedAt: EARLIER,
          passedAt: EARLIER,
          reviewClearedAt: EARLIER,
          metricClearedAt: key === "money" ? EARLIER : null,
        },
      });
    }
    return productId;
  }

  it("an unreachable tracker regresses nothing on a money-passed product", async () => {
    if (!seeded) return;
    await inRollback(async (tx) => {
      const productId = await productAtMoneyPassed(tx);
      const before = await tx.shipyardCheckpointState.findMany({
        where: { productId },
        orderBy: { checkpointId: "asc" },
      });

      const after = await recomputeGates(productId, { db: tx, signals: null, now: NOW });

      expect(after).toHaveLength(6);
      for (const row of after) {
        const prior = before.find((s) => s.checkpointId === row.checkpointId)!;
        const where = `${row.key}`;
        if (prior.state === "passed") expect(row.state, where).toBe("passed");
        if (prior.state === "open") expect(row.state, where).not.toBe("locked");
        // Nothing a student earned is ever unstamped.
        if (prior.passedAt) expect(row.passedAt, where).toEqual(prior.passedAt);
        if (prior.openedAt) expect(row.openedAt, where).toEqual(prior.openedAt);
        if (prior.reviewClearedAt) {
          expect(row.reviewClearedAt, where).toEqual(prior.reviewClearedAt);
        }
        if (prior.metricClearedAt) {
          expect(row.metricClearedAt, where).toEqual(prior.metricClearedAt);
        }
      }

      const money = after.find((s) => s.key === "money")!;
      expect(money.state).toBe("passed");
      expect(money.passedAt).not.toBeNull();

      // And the stored rows agree with what was returned.
      const persisted = await tx.shipyardCheckpointState.findUnique({
        where: {
          productId_checkpointId: { productId, checkpointId: checkpointId("money") },
        },
      });
      expect(persisted!.state).toBe("passed");
      expect(persisted!.passedAt).not.toBeNull();
    });
  }, 60_000);

  it("a dipped signal and a fresh blocking flag cannot un-pass a checkpoint", async () => {
    if (!seeded) return;
    await inRollback(async (tx) => {
      const productId = await productAtMoneyPassed(tx);
      const before = await tx.shipyardCheckpointState.findMany({
        where: { productId, state: "passed" },
        orderBy: { checkpointId: "asc" },
      });

      // Everything false, plus the flag that makes every signal false anyway.
      const after = await recomputeGates(productId, { db: tx, signals: FLAGGED, now: NOW });

      for (const prior of before) {
        const row = after.find((s) => s.checkpointId === prior.checkpointId)!;
        expect(row.state, row.key).toBe("passed");
        expect(row.passedAt, row.key).toEqual(prior.passedAt);
      }
    });
  }, 60_000);

  it("a both gate stamps the review half, then the metric half, and loses neither", async () => {
    if (!seeded) return;
    await inRollback(async (tx) => {
      const productId = await lastProduct(tx);
      const moneyId = checkpointId("money");

      // A known starting line: cleared through checkpoint 3, sitting at an
      // untouched money gate, with no submission history of its own.
      await tx.shipyardSubmission.deleteMany({ where: { productId } });
      for (const key of ["idea", "design", "working"] as const) {
        await tx.shipyardCheckpointState.update({
          where: { productId_checkpointId: { productId, checkpointId: checkpointId(key) } },
          data: {
            state: "passed",
            openedAt: EARLIER,
            passedAt: EARLIER,
            reviewClearedAt: EARLIER,
            metricClearedAt: null,
            manuallyOpenedBy: null,
          },
        });
      }
      for (const key of ["money", "workflow", "launch"] as const) {
        await tx.shipyardCheckpointState.update({
          where: { productId_checkpointId: { productId, checkpointId: checkpointId(key) } },
          data: {
            state: key === "money" ? "open" : "locked",
            openedAt: key === "money" ? EARLIER : null,
            passedAt: null,
            reviewClearedAt: null,
            metricClearedAt: null,
            manuallyOpenedBy: null,
          },
        });
      }

      // The money write-up, passed by a reviewer.
      const reviewedAt = new Date("2026-09-05T10:00:00Z");
      const submission = await tx.shipyardSubmission.create({
        data: {
          productId,
          checkpointId: moneyId,
          status: "passed",
          fields: {},
          files: [],
          version: 900,
          submittedAt: reviewedAt,
        },
        select: { id: true },
      });
      await tx.shipyardReview.create({
        data: {
          submissionId: submission.id,
          verdict: "pass",
          reasons: [],
          rubricScores: {},
          confidence: 0.9,
          modelUsed: "test",
          providerUsed: "test",
          needsHuman: false,
          createdAt: reviewedAt,
        },
      });

      // 1 · The review has cleared; payments are not live yet.
      const one = await recomputeGates(productId, { db: tx, signals: HALF_CONNECTED, now: NOW });
      const moneyOne = one.find((s) => s.key === "money")!;
      expect(moneyOne.state).toBe("open");
      expect(moneyOne.reason).toBe("awaiting-metrics");
      expect(moneyOne.reviewClearedAt).toEqual(reviewedAt);
      expect(moneyOne.metricClearedAt).toBeNull();

      // 2 · Payments go live: the metric half clears and the gate passes.
      const two = await recomputeGates(productId, { db: tx, signals: CONNECTED, now: NOW });
      const moneyTwo = two.find((s) => s.key === "money")!;
      expect(moneyTwo.state).toBe("passed");
      expect(moneyTwo.reason).toBe("review-and-metric-passed");
      expect(moneyTwo.reviewClearedAt).toEqual(reviewedAt);
      expect(moneyTwo.metricClearedAt).not.toBeNull();
      expect(moneyTwo.passedAt).not.toBeNull();

      // 3 · The tracker goes quiet, then comes back with a flag. Neither half's
      // date moves and the gate stays shut behind the student, not in front.
      for (const dip of [null, FLAGGED]) {
        const later = await recomputeGates(productId, { db: tx, signals: dip, now: NOW });
        const money = later.find((s) => s.key === "money")!;
        expect(money.state).toBe("passed");
        expect(money.passedAt).toEqual(moneyTwo.passedAt);
        expect(money.reviewClearedAt).toEqual(reviewedAt);
        expect(money.metricClearedAt).toEqual(moneyTwo.metricClearedAt);
        // The checkpoint after it stays reachable rather than re-locking.
        expect(later.find((s) => s.key === "workflow")!.state).toBe("open");
      }
    });
  }, 60_000);

  it("a both gate keeps a metric half that cleared BEFORE the write-up did", async () => {
    if (!seeded) return;
    await inRollback(async (tx) => {
      const productId = await lastProduct(tx);
      const moneyId = checkpointId("money");

      await tx.shipyardSubmission.deleteMany({ where: { productId } });
      for (const key of ["idea", "design", "working"] as const) {
        await tx.shipyardCheckpointState.update({
          where: { productId_checkpointId: { productId, checkpointId: checkpointId(key) } },
          data: {
            state: "passed",
            openedAt: EARLIER,
            passedAt: EARLIER,
            reviewClearedAt: EARLIER,
            metricClearedAt: null,
            manuallyOpenedBy: null,
          },
        });
      }
      for (const key of ["money", "workflow", "launch"] as const) {
        await tx.shipyardCheckpointState.update({
          where: { productId_checkpointId: { productId, checkpointId: checkpointId(key) } },
          data: {
            state: key === "money" ? "open" : "locked",
            openedAt: key === "money" ? EARLIER : null,
            passedAt: null,
            reviewClearedAt: null,
            metricClearedAt: null,
            manuallyOpenedBy: null,
          },
        });
      }

      // 1 · Payments go live before the write-up is even in. The metric half is
      // verified and the row records WHEN (SPEC §5 "store which cleared when").
      const one = await recomputeGates(productId, { db: tx, signals: CONNECTED, now: NOW });
      const moneyOne = one.find((s) => s.key === "money")!;
      expect(moneyOne.state).toBe("open");
      expect(moneyOne.reason).toBe("awaiting-review");
      expect(moneyOne.metricClearedAt).not.toBeNull();

      // 2 · The signal dips while the student is still writing. The half they
      // already cleared is not taken back — the row said "cleared at" and the
      // state used to say "awaiting-metrics" in the same breath (C12).
      const two = await recomputeGates(productId, { db: tx, signals: HALF_CONNECTED, now: NOW });
      const moneyTwo = two.find((s) => s.key === "money")!;
      expect(moneyTwo.reason).toBe("awaiting-review");
      expect(moneyTwo.metricClearedAt).toEqual(moneyOne.metricClearedAt);

      // 3 · The write-up passes, with the signal still down. Both halves have
      // been met at some point, so the gate opens.
      const reviewedAt = new Date("2026-09-10T10:00:00Z");
      const submission = await tx.shipyardSubmission.create({
        data: {
          productId,
          checkpointId: moneyId,
          status: "passed",
          fields: {},
          files: [],
          version: 901,
          submittedAt: reviewedAt,
        },
        select: { id: true },
      });
      await tx.shipyardReview.create({
        data: {
          submissionId: submission.id,
          verdict: "pass",
          reasons: [],
          rubricScores: {},
          confidence: 0.9,
          modelUsed: "test",
          providerUsed: "test",
          needsHuman: false,
          createdAt: reviewedAt,
        },
      });

      const three = await recomputeGates(productId, { db: tx, signals: HALF_CONNECTED, now: NOW });
      const moneyThree = three.find((s) => s.key === "money")!;
      expect(moneyThree.state).toBe("passed");
      expect(moneyThree.reason).toBe("review-and-metric-passed");
      expect(moneyThree.metricClearedAt).toEqual(moneyOne.metricClearedAt);
      expect(moneyThree.reviewClearedAt).toEqual(reviewedAt);
    });
  }, 60_000);

  it("never writes a null over a date another writer just stamped", async () => {
    if (!seeded) return;
    await inRollback(async (tx) => {
      const productId = await lastProduct(tx);
      const launchId = checkpointId("launch");
      // A row that is `locked` today but already carries the dates from a
      // previous life. A read-then-upsert with no lock used to blank them (C9).
      await tx.shipyardCheckpointState.update({
        where: { productId_checkpointId: { productId, checkpointId: launchId } },
        data: {
          state: "locked",
          openedAt: EARLIER,
          passedAt: EARLIER,
          reviewClearedAt: EARLIER,
          metricClearedAt: EARLIER,
        },
      });

      await recomputeGates(productId, { db: tx, signals: null, now: NOW });

      const after = await tx.shipyardCheckpointState.findUniqueOrThrow({
        where: { productId_checkpointId: { productId, checkpointId: launchId } },
      });
      expect(after.openedAt).toEqual(EARLIER);
      expect(after.passedAt).toEqual(EARLIER);
      expect(after.reviewClearedAt).toEqual(EARLIER);
      expect(after.metricClearedAt).toEqual(EARLIER);
    });
  }, 60_000);
});
