import { describe, expect, it, vi } from "vitest";
import { REGRADE_AFTER_MS, STALE_LIVE_AFTER_MS, sweepInterviews } from "../worker/jobs/sweep-interviews";

// Every mode this repairs is SILENT: the interview never reaches a grade and
// nobody is told. Six students were reset by hand before this existed.

function fakeDb(ungraded: { id: string }[], stale: { id: string }[]) {
  const calls: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  let call = 0;
  return {
    calls,
    updates,
    client: {
      interview: {
        findMany: vi.fn(async (args: Record<string, unknown>) => {
          calls.push(args);
          return call++ === 0 ? ungraded : stale;
        }),
        updateMany: vi.fn(async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
    } as never,
  };
}

describe("completed but never graded", () => {
  it("re-enqueues grading", async () => {
    const enqueued: string[] = [];
    const { client } = fakeDb([{ id: "iv_1" }, { id: "iv_2" }], []);
    const out = await sweepInterviews({
      prisma: client,
      enqueue: async (id) => { enqueued.push(id); return "job"; },
    });
    expect(out.requeued).toBe(2);
    expect(enqueued).toEqual(["iv_1", "iv_2"]);
  });

  it("leaves a fresh completion alone, so it is not double-graded", async () => {
    const { client, calls } = fakeDb([], []);
    await sweepInterviews({ prisma: client, enqueue: async () => null, now: () => new Date("2026-09-06T12:00:00Z") });
    const where = (calls[0] as { where: { completedAt: { lt: Date } } }).where;
    expect(where.completedAt.lt.getTime()).toBe(new Date("2026-09-06T12:00:00Z").getTime() - REGRADE_AFTER_MS);
  });

  it("survives the queue being unavailable", async () => {
    const { client } = fakeDb([{ id: "iv_1" }], []);
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.requeued).toBe(1);
  });
});

describe("abandoned live interviews", () => {
  it("escalates rather than completing them", async () => {
    // Grading a fragment would be worse than handing it to an instructor who
    // can grant a retake.
    const { client, updates } = fakeDb([], [{ id: "iv_9" }]);
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.reaped).toBe(1);
    expect(updates[0].data).toMatchObject({ status: "escalated" });
    expect((updates[0].data as { escalationReason: string }).escalationReason).toMatch(/retake/i);
  });

  it("binds the update to still being live, so a reconnect wins the race", async () => {
    const { client, updates } = fakeDb([], [{ id: "iv_9" }]);
    await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(updates[0].where).toMatchObject({ id: "iv_9", status: "live" });
  });

  it("waits half an hour before presuming abandonment", () => {
    expect(STALE_LIVE_AFTER_MS).toBe(30 * 60 * 1000);
  });
});
