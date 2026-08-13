import { beforeEach, describe, expect, it } from "vitest";
import { allowRequest, resetRateLimitsForTests } from "@/lib/request-rate-limit";

describe("request rate limit", () => {
  beforeEach(resetRateLimitsForTests);

  it("bounds repeated requests without retaining the raw address", () => {
    const request = new Request("https://vibesclone.com/api/events", { headers: { "x-forwarded-for": "203.0.113.10", "user-agent": "test" } });
    expect(allowRequest(request, "events", 2, 1_000, 100)).toBe(true);
    expect(allowRequest(request, "events", 2, 1_000, 200)).toBe(true);
    expect(allowRequest(request, "events", 2, 1_000, 300)).toBe(false);
    expect(allowRequest(request, "events", 2, 1_000, 1_101)).toBe(true);
  });
});
