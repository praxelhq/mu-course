import { describe, expect, it } from "vitest";
import { isFinalProviderAttempt } from "@/worker/jobs";

describe("provider retry state", () => {
  it("keeps the first two failures retryable", () => {
    expect(isFinalProviderAttempt(0)).toBe(false);
    expect(isFinalProviderAttempt(1)).toBe(false);
  });

  it("marks the third failure final", () => {
    expect(isFinalProviderAttempt(2)).toBe(true);
  });
});
