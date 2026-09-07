import { describe, expect, it } from "vitest";
import { hasCurrentRealtimeAgentHeartbeat } from "../lib/interview/realtime";

const sha = "a".repeat(40);
const now = new Date("2026-09-07T06:00:00.000Z");

describe("realtime agent admission", () => {
  it("admits only a fresh, matching, error-free agent heartbeat", () => {
    expect(
      hasCurrentRealtimeAgentHeartbeat(
        [
          {
            sourceSha: sha,
            intervalSeconds: 30,
            errorCount: 0,
            lastSeenAt: new Date("2026-09-07T05:59:30.000Z"),
          },
        ],
        sha,
        now,
      ),
    ).toBe(true);
  });

  it("does not let a stale, wrong-build, or failing worker start a student attempt", () => {
    const current = {
      sourceSha: sha,
      intervalSeconds: 30,
      errorCount: 0,
      lastSeenAt: new Date("2026-09-07T05:59:30.000Z"),
    };
    expect(
      hasCurrentRealtimeAgentHeartbeat(
        [{ ...current, lastSeenAt: new Date("2026-09-07T05:58:59.000Z") }],
        sha,
        now,
      ),
    ).toBe(false);
    expect(hasCurrentRealtimeAgentHeartbeat([{ ...current, sourceSha: "b".repeat(40) }], sha, now)).toBe(false);
    expect(hasCurrentRealtimeAgentHeartbeat([{ ...current, errorCount: 1 }], sha, now)).toBe(false);
  });
});
