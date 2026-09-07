import { describe, expect, it, vi } from "vitest";
import {
  INTERVIEW_ROLLOUT_KEY,
  InterviewClosedError,
  assertInterviewOpen,
  interviewOpen,
  setInterviewOpen,
} from "../lib/interview/rollout";

// U9 — interview v2 ships deployed but closed. A deploy must never be the
// thing that opens a cohort's assessment.

function fakeDb(value: unknown | undefined) {
  const upserts: Record<string, unknown>[] = [];
  return {
    upserts,
    client: {
      configKV: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
          value === undefined ? null : { key: where.key, value },
        ),
        upsert: vi.fn(async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        }),
      },
    } as never,
  };
}

describe("rollout flag", () => {
  it("is closed when no row exists, so a fresh deploy exposes nothing", async () => {
    const { client } = fakeDb(undefined);
    expect(await interviewOpen(client)).toBe(false);
    await expect(assertInterviewOpen(client)).rejects.toBeInstanceOf(InterviewClosedError);
  });

  it("is closed when the row says so", async () => {
    const { client } = fakeDb({ open: false });
    expect(await interviewOpen(client)).toBe(false);
  });

  it("is open only on an exact boolean true", async () => {
    expect(await interviewOpen(fakeDb({ open: true }).client)).toBe(true);
    // A truthy-but-wrong value must not open a graded assessment.
    expect(await interviewOpen(fakeDb({ open: "true" }).client)).toBe(false);
    expect(await interviewOpen(fakeDb({ open: 1 }).client)).toBe(false);
    expect(await interviewOpen(fakeDb({}).client)).toBe(false);
  });

  it("passes once opened", async () => {
    const { client } = fakeDb({ open: true });
    await expect(assertInterviewOpen(client)).resolves.toBeUndefined();
  });

  it("reads and writes the documented key", async () => {
    const { client, upserts } = fakeDb({ open: false });
    await setInterviewOpen(true, client);
    expect(upserts[0].where).toEqual({ key: INTERVIEW_ROLLOUT_KEY });
    expect(upserts[0].create).toEqual({ key: INTERVIEW_ROLLOUT_KEY, value: { open: true } });
    expect(upserts[0].update).toEqual({ value: { open: true } });
  });

  it("reports a closed interview as a 409 the client can distinguish", () => {
    const err = new InterviewClosedError();
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/not open yet/i);
  });
});
