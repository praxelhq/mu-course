import { describe, expect, it } from "vitest";
import { ROOM_TOKEN_TTL_SECONDS } from "../lib/interview/realtime";

// U1 — the LiveKit join token and the agent's interview budget are set in two
// different services with no shared constant. They are only correct together:
// the token must outlive a full-length interview so a student who drops near
// the end can rejoin. At parity, a late reconnect fails on the clock rather
// than the network and degrades a healthy session to turn-based for no reason.
//
// agent/main.py: MAX_INTERVIEW_SECONDS = 15 * 60. Keep these in step.
const AGENT_BUDGET_SECONDS = 15 * 60;

describe("room token lifetime", () => {
  it("outlives a full-length interview", () => {
    expect(ROOM_TOKEN_TTL_SECONDS).toBeGreaterThan(AGENT_BUDGET_SECONDS);
  });

  it("leaves at least five minutes of reconnect headroom", () => {
    expect(ROOM_TOKEN_TTL_SECONDS - AGENT_BUDGET_SECONDS).toBeGreaterThanOrEqual(5 * 60);
  });
});
