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
