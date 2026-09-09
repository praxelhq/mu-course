import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../app/(room)/interview/live/interview-client.tsx", import.meta.url),
  "utf8",
);

describe("realtime interview client contract", () => {
  it("reconnects a disrupted room instead of downgrading a graded interview to a recorder", () => {
    expect(source).toContain('setMode("reconnecting")');
    expect(source).toContain("void requestRealtime(true)");
    expect(source).not.toContain('setMode("turnbased")');
    expect(source).not.toContain("<TurnBasedRoom");
  });
});

const meetingView = readFileSync(
  new URL("../app/(room)/interview/live/meeting-view.tsx", import.meta.url),
  "utf8",
);

describe("interview timer", () => {
  // A student whose browser dropped four times watched the timer reset to
  // 00:00 four times and concluded his interview had restarted. The clock
  // belongs to the interview, not to the websocket.
  it("counts from the interview's own start, not from room-connect", () => {
    expect(meetingView).toContain("const elapsedFrom = interviewStartedAt ?? connectedAt;");
    expect(meetingView).toContain("Date.parse(startedAt)");
    expect(meetingView).not.toMatch(/now - connectedAt/);
  });

  it("threads the interview start time from the token route to the timer", () => {
    expect(source).toContain("startedAt: body.startedAt ?? null");
    expect(source).toContain("startedAt={rt.startedAt}");
  });
});

describe("no-interviewer watchdog", () => {
  // Three ways an interview dies with the student still sitting there, and the
  // old check could see only one of them.
  it("watches presence, not just whose turn it was", () => {
    // Matched on the interviewer's identity, not "any remote participant".
    expect(meetingView).toContain("p.identity === AGENT_IDENTITY");
    expect(meetingView).toContain('onReconnect("interviewer-left")');
  });

  it("catches an interviewer that is present but has gone silent", () => {
    // A quota outage or a wedged STT leaves the agent in the room publishing
    // silence; no student turn can follow, so the turn checks never fire.
    expect(meetingView).toContain('onReconnect("interviewer-silent")');
    expect(meetingView).toContain("NO_PROGRESS_MS");
  });

  it("gives a cold-starting agent longer than it used to", () => {
    expect(meetingView).toMatch(/NO_AGENT_GRACE_MS = 75_000/);
  });
});
