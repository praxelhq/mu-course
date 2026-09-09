import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_FAILURE_MAX_AGENT_TURNS,
  REGRADE_AFTER_MS,
  STALE_LIVE_AFTER_MS,
  SWEEP_ACTOR,
  sweepInterviews,
} from "../worker/jobs/sweep-interviews";

// Every mode this repairs is SILENT: the interview never reaches a grade and
// nobody is told. Six students were reset by hand before this existed.

type StaleRow = { id: string; userId?: string; turns?: { speaker: string }[] };

/** An interview the student actually sat through: greeting + several questions. */
function conducted(): { speaker: string }[] {
  return [
    { speaker: "agent" },
    { speaker: "student" },
    { speaker: "agent" },
    { speaker: "student" },
    { speaker: "agent" },
  ];
}

function fakeDb(
  ungraded: { id: string }[],
  stale: StaleRow[],
  opts: {
    heldGrant?: boolean;
    unattached?: { id: string }[];
    reservation?: { s3Key: string; consumedAt: Date | null; expiresAt: Date } | null;
  } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const grants: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let call = 0;
  return {
    calls,
    updates,
    grants,
    audits,
    client: {
      interview: {
        findMany: vi.fn(async (args: Record<string, unknown>) => {
          calls.push(args);
          const n = call++;
          if (n === 0) return ungraded;
          if (n === 2) return opts.unattached ?? [];
          return stale.map((row) => ({
            userId: "u_1",
            turns: conducted(),
            ...row,
          }));
        }),
        updateMany: vi.fn(async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
      interviewRetake: {
        findFirst: vi.fn(async () => (opts.heldGrant ? { id: "rtk_held" } : null)),
        create: vi.fn(async (args: Record<string, unknown>) => {
          grants.push(args);
          return { id: "rtk_new" };
        }),
      },
      generatedObjectReservation: {
        findUnique: vi.fn(async () =>
          opts.reservation === null
            ? null
            : (opts.reservation ?? {
                s3Key: "interviews/iv/room-1.mp4",
                consumedAt: null,
                expiresAt: new Date(Date.now() + 60_000),
              }),
        ),
      },
      auditLog: {
        create: vi.fn(async (args: Record<string, unknown>) => {
          audits.push(args);
          return { id: "aud_1" };
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

  it("leaves a genuine walk-off with the instructor, and grants nothing", async () => {
    const { client, grants, updates } = fakeDb([], [{ id: "iv_9" }]);
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.autoRetakes).toBe(0);
    expect(grants).toHaveLength(0);
    expect((updates[0].data as { escalationReason: string }).escalationReason).toMatch(
      /Abandoned mid-interview/,
    );
  });
});

describe("interviews that ended before they began", () => {
  // Four students lost their interviews to a dialog outage inside the first two
  // turns, and every one of them needed a retake granted by hand two days
  // later. That is the repeat this closes.
  const barelyStarted: { speaker: string }[] = [{ speaker: "agent" }, { speaker: "student" }];

  it("grants the attempt back automatically", async () => {
    const { client, grants, audits, updates } = fakeDb(
      [],
      [{ id: "iv_dead", userId: "u_shab", turns: barelyStarted }],
    );
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.autoRetakes).toBe(1);
    expect(grants[0]).toMatchObject({ data: { userId: "u_shab", grantedBy: SWEEP_ACTOR } });
    expect(audits[0]).toMatchObject({ data: { action: "interview.grant-retake" } });
    expect((updates[0].data as { escalationReason: string }).escalationReason).toMatch(
      /platform failure/i,
    );
  });

  it("does not stack a second grant on a student who already holds one", async () => {
    const { client, grants } = fakeDb(
      [],
      [{ id: "iv_dead", turns: barelyStarted }],
      { heldGrant: true },
    );
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.autoRetakes).toBe(0);
    expect(grants).toHaveLength(0);
  });

  it("still escalates when the grant itself fails", async () => {
    const { client, updates } = fakeDb([], [{ id: "iv_dead", turns: barelyStarted }]);
    (client as unknown as { interviewRetake: { findFirst: () => Promise<never> } })
      .interviewRetake.findFirst = async () => {
      throw new Error("db down");
    };
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.reaped).toBe(1);
    expect(out.autoRetakes).toBe(0);
    expect(updates[0].data).toMatchObject({ status: "escalated" });
  });

  it("draws the line at a greeting plus one question", () => {
    expect(PLATFORM_FAILURE_MAX_AGENT_TURNS).toBe(2);
  });
});

describe("an interview the student was never in", () => {
  // A drop during startup leaves the interviewer questioning an empty room for
  // the full budget: many agent turns, no answers. The agent refuses to
  // complete that, so it arrives here looking like a long walk-out.
  it("is a platform failure however many questions were asked", async () => {
    const monologue = Array.from({ length: 15 }, () => ({ speaker: "agent" }));
    const { client, grants, updates } = fakeDb([], [{ id: "iv_empty", turns: monologue }]);
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.autoRetakes).toBe(1);
    expect(grants).toHaveLength(1);
    expect((updates[0].data as { escalationReason: string }).escalationReason).toMatch(
      /platform failure/i,
    );
  });
});

describe("concurrent sweeps", () => {
  // Two sweep runs can both read "this student holds no unused grant" before
  // either inserts. The database refuses the second; the sweep must treat that
  // as "no grant issued by me" rather than as a failure to escalate.
  it("reports no grant when the database refuses a duplicate", async () => {
    const { client, updates } = fakeDb([], [{ id: "iv_dead", turns: [{ speaker: "agent" }] }]);
    (client as unknown as { interviewRetake: { create: () => Promise<never> } })
      .interviewRetake.create = async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    };
    const out = await sweepInterviews({ prisma: client, enqueue: async () => null });
    expect(out.autoRetakes).toBe(0);
    // The escalation itself still happened.
    expect(out.reaped).toBe(1);
    expect(updates[0].data).toMatchObject({ status: "escalated" });
  });
});

describe("recordings that never got attached", () => {
  // The key was written by one route and read by nothing, so nine recordings
  // sat in S3 unreferenced. The agent now waits for the upload before
  // reporting the key; this is the backstop for when it cannot — a restart or
  // a deploy between "the interview is over" and "here is the file".
  it("commits a recording whose reservation is still live", async () => {
    const attached: unknown[] = [];
    const { client } = fakeDb([], [], { unattached: [{ id: "iv_done" }] });
    const out = await sweepInterviews({
      prisma: client,
      enqueue: async () => null,
      attachRecording: async (a) => {
        attached.push(a);
        return {};
      },
    });
    expect(out.recordingsAttached).toBe(1);
    expect(attached[0]).toMatchObject({
      interviewId: "iv_done",
      reservationId: "interview-video:iv_done",
    });
  });

  it("stays quiet while the upload is still in flight", async () => {
    const { client } = fakeDb([], [], { unattached: [{ id: "iv_done" }] });
    const out = await sweepInterviews({
      prisma: client,
      enqueue: async () => null,
      attachRecording: async () => {
        throw new Error("NotFound");
      },
    });
    // Next tick retries; a recording that is not there yet is not an incident.
    expect(out.recordingsAttached).toBe(0);
  });

  it("skips an interview that never recorded at all", async () => {
    const { client } = fakeDb([], [], { unattached: [{ id: "iv_done" }], reservation: null });
    const attached: unknown[] = [];
    const out = await sweepInterviews({
      prisma: client,
      enqueue: async () => null,
      attachRecording: async (a) => {
        attached.push(a);
        return {};
      },
    });
    expect(out.recordingsAttached).toBe(0);
    expect(attached).toHaveLength(0);
  });
});
