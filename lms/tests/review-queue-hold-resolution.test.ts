import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const findMany = vi.fn();
  const transaction = vi.fn();
  return {
    findMany,
    transaction,
    prisma: {
      gradeHold: { findMany },
      $transaction: transaction,
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));

import {
  ReviewActionError,
  resolveSelectedGradeHolds,
} from "../lib/review-queue";

const UPDATED_AT = "2026-07-30T10:00:00.000Z";

type HoldRow = {
  id: string;
  gradeId: string;
  submissionId: string;
  kind: "low_confidence";
  code: string;
  status: "open";
  updatedAt: Date;
};

function holdRow(index: number): HoldRow {
  return {
    id: `hold-${index}`,
    gradeId: `grade-${index % 20}`,
    submissionId: `submission-${index}`,
    kind: "low_confidence",
    code: "low-confidence",
    status: "open",
    updatedAt: new Date(UPDATED_AT),
  };
}

function configureTransaction(rows: HoldRow[], staleHoldId: string) {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const updateMany = vi.fn(async (args: { where: { id: string } }) => ({
    count: args.where.id === staleHoldId ? 0 : 1,
  }));
  const updateManyAndReturn = vi.fn(
    async (args: { where: { OR: Array<{ id: string; updatedAt: Date }> } }) =>
      args.where.OR
        .filter((candidate) => candidate.id !== staleHoldId)
        .map((candidate) => {
          const row = rowById.get(candidate.id)!;
          return { id: row.id, gradeId: row.gradeId };
        }),
  );
  const create = vi.fn(async () => ({}));
  const createMany = vi.fn(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  const tx = {
    gradeHold: { updateMany, updateManyAndReturn },
    auditLog: { create, createMany },
  };
  db.transaction.mockImplementation(
    async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
  );
  return tx;
}

describe("selected grade-hold resolution", () => {
  beforeEach(() => {
    db.findMany.mockReset();
    db.transaction.mockReset();
  });

  it("resolves the 200-row maximum with one transaction and constant mutation queries", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => holdRow(index));
    const staleHoldId = "hold-137";
    db.findMany.mockImplementation(async () => rows);
    const tx = configureTransaction(rows, staleHoldId);

    const result = await resolveSelectedGradeHolds({
      cause: "low-confidence",
      selected: rows.map((row) => ({
        holdId: row.id,
        expectedUpdatedAt: UPDATED_AT,
      })),
      actorId: "instructor-1",
      reason: "Reviewed the selected evidence and cleared this hold.",
      confirmed: true,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.gradeHold.updateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.gradeHold.updateMany).not.toHaveBeenCalled();
    expect(tx.gradeHold.updateManyAndReturn.mock.calls[0]?.[0].where).toMatchObject({
      status: "open",
      OR: expect.arrayContaining([
        { id: "hold-0", updatedAt: new Date(UPDATED_AT) },
        { id: "hold-199", updatedAt: new Date(UPDATED_AT) },
      ]),
    });
    expect(tx.gradeHold.updateManyAndReturn.mock.calls[0]?.[0].where.OR).toHaveLength(200);
    expect(tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    const auditRows = tx.auditLog.createMany.mock.calls[0]?.[0].data as Array<{
      action: string;
      targetId: string;
      before: { holdId: string; status: string; expectedUpdatedAt: string };
      after: { holdId: string; status: string; resolution: string };
    }>;
    expect(auditRows).toHaveLength(199);
    expect(auditRows[0]).toMatchObject({
      action: "grade.hold.resolve",
      targetId: "grade-0",
      before: {
        holdId: "hold-0",
        status: "open",
        expectedUpdatedAt: UPDATED_AT,
      },
      after: {
        holdId: "hold-0",
        status: "resolved",
        resolution: "Reviewed the selected evidence and cleared this hold.",
      },
    });
    expect(auditRows.some((row) => row.before.holdId === staleHoldId)).toBe(false);
    expect(result.resolved).toHaveLength(199);
    expect(result.failures).toContainEqual({ holdId: staleHoldId, reason: "stale" });
    expect(result.readyCount).toBe(199);
    expect(result.impactedGradeIds).toHaveLength(20);
  });

  it("rejects more than 200 selections before querying", async () => {
    db.findMany.mockImplementation(async () => []);
    const selected = Array.from({ length: 201 }, (_, index) => ({
      holdId: `hold-${index}`,
      expectedUpdatedAt: UPDATED_AT,
    }));

    await expect(
      resolveSelectedGradeHolds({
        cause: "low-confidence",
        selected,
        actorId: "instructor-1",
        confirmed: false,
      }),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ReviewActionError>);
    expect(db.findMany).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
