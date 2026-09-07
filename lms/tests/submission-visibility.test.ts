import { describe, expect, it } from "vitest";
import { isLockedAssignmentUndiscoverable } from "../lib/submissions";

describe("locked assignment visibility", () => {
  it("hides only first-time locked assignments", () => {
    expect(isLockedAssignmentUndiscoverable({
      available: false,
      hasLiveGrant: false,
      historyCount: 0,
    })).toBe(true);
    expect(isLockedAssignmentUndiscoverable({
      available: true,
      hasLiveGrant: false,
      historyCount: 0,
    })).toBe(false);
    expect(isLockedAssignmentUndiscoverable({
      available: false,
      hasLiveGrant: true,
      historyCount: 0,
    })).toBe(false);
    expect(isLockedAssignmentUndiscoverable({
      available: false,
      hasLiveGrant: false,
      historyCount: 1,
    })).toBe(false);
  });
});
