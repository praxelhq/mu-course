import { describe, expect, it } from "vitest";
import {
  AGENT_GONE_GRACE_MS,
  NO_AGENT_GRACE_MS,
  NO_PROGRESS_MS,
  REJOIN_OFFER_AFTER_MS,
  assessRoom,
  quietForMs,
  type RoomActivity,
} from "../lib/interview/stall";

// A student answering is not a stranded student. Every case below is one a
// real interview produced: the rejoin offer appearing mid-answer, and the call
// being rebuilt under a student who was still talking.

const T0 = 1_000_000;

function room(over: Partial<RoomActivity> = {}): RoomActivity {
  return {
    now: T0,
    connectedAt: T0 - 60_000,
    agentPresent: true,
    agentLastSeenAt: T0,
    agentTurns: 3,
    lastAgentTurnAt: T0 - 1_000,
    lastStudentActivityAt: T0 - 1_000,
    studentSpokeLast: false,
    ...over,
  };
}

describe("quietForMs", () => {
  it("measures from the last thing EITHER side did", () => {
    expect(
      quietForMs(room({ now: T0, lastAgentTurnAt: T0 - 90_000, lastStudentActivityAt: T0 - 5_000 })),
    ).toBe(5_000);
  });

  it("falls back to connect time before anyone has spoken", () => {
    expect(
      quietForMs(room({ now: T0, connectedAt: T0 - 8_000, lastAgentTurnAt: null, lastStudentActivityAt: null })),
    ).toBe(8_000);
  });
});

describe("a student who is still answering", () => {
  const midAnswer = room({
    now: T0,
    lastAgentTurnAt: T0 - 95_000, // the question was asked a minute and a half ago
    lastStudentActivityAt: T0 - 2_000, // they are talking right now
    studentSpokeLast: true,
  });

  it("is never offered a rejoin", () => {
    expect(assessRoom(midAnswer).offerRejoin).toBe(false);
  });

  it("is never reconnected out of their own answer", () => {
    expect(assessRoom(midAnswer).reconnect).toBeNull();
  });

  it("stays connected through an answer longer than the no-progress timeout", () => {
    const longAnswer = room({
      now: T0,
      lastAgentTurnAt: T0 - (NO_PROGRESS_MS + 60_000),
      lastStudentActivityAt: T0 - 3_000,
      studentSpokeLast: true,
    });
    expect(assessRoom(longAnswer)).toEqual({ reconnect: null, offerRejoin: false });
  });
});

describe("a genuinely quiet room", () => {
  it("offers a rejoin once both sides have been silent", () => {
    const quiet = room({
      lastAgentTurnAt: T0 - (REJOIN_OFFER_AFTER_MS + 1_000),
      lastStudentActivityAt: T0 - (REJOIN_OFFER_AFTER_MS + 1_000),
    });
    expect(assessRoom(quiet)).toEqual({ reconnect: null, offerRejoin: true });
  });

  it("reconnects when the student is owed a reply and nothing comes", () => {
    const stopped = room({
      lastAgentTurnAt: T0 - (NO_AGENT_GRACE_MS + 5_000),
      lastStudentActivityAt: T0 - (NO_AGENT_GRACE_MS + 1_000),
      studentSpokeLast: true,
    });
    expect(assessRoom(stopped).reconnect).toBe("interviewer-stopped");
  });

  it("reconnects a present-but-dead interviewer", () => {
    const silent = room({
      lastAgentTurnAt: T0 - (NO_PROGRESS_MS + 1_000),
      lastStudentActivityAt: T0 - (NO_PROGRESS_MS + 1_000),
      studentSpokeLast: false,
    });
    expect(assessRoom(silent).reconnect).toBe("interviewer-silent");
  });
});

describe("an interviewer that is not there", () => {
  it("is caught even while the student keeps talking into the void", () => {
    // Vasudha's second attempt: "Hello? Can you hear me?" to an empty room.
    const empty = room({
      connectedAt: T0 - (NO_AGENT_GRACE_MS + 10_000),
      agentPresent: false,
      agentTurns: 0,
      lastAgentTurnAt: null,
      lastStudentActivityAt: T0 - 1_000,
    });
    expect(assessRoom(empty).reconnect).toBe("no-interviewer");
  });

  it("gives a cold-starting interviewer time to arrive", () => {
    const starting = room({
      connectedAt: T0 - 20_000,
      agentPresent: false,
      agentTurns: 0,
      lastAgentTurnAt: null,
      lastStudentActivityAt: null,
    });
    expect(assessRoom(starting).reconnect).toBeNull();
  });

  it("treats an interviewer that left as gone, whatever the student is doing", () => {
    const left = room({
      agentPresent: false,
      agentLastSeenAt: T0 - (AGENT_GONE_GRACE_MS + 1_000),
      lastStudentActivityAt: T0 - 500,
    });
    expect(assessRoom(left).reconnect).toBe("interviewer-left");
  });
});
