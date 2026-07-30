import { describe, expect, it } from "vitest";
import { assertProjectTransition, canGenerate } from "@/lib/domain";

describe("project state", () => {
  it("allows the verified path and rejects bypasses", () => {
    expect(() => assertProjectTransition("review", "approved")).not.toThrow();
    expect(() => assertProjectTransition("draft", "complete")).toThrow("Invalid project transition");
    expect(canGenerate({ status: "approved", approvedVersion: 2, currentUnderstanding: 2 })).toEqual({ ok: true });
    expect(canGenerate({ status: "approved", approvedVersion: 1, currentUnderstanding: 2 })).toEqual({ ok: false, reason: "The current understanding has not been approved." });
  });
});
