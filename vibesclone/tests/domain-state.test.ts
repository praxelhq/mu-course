import { describe, expect, it } from "vitest";
import { assertProjectTransition, canGenerate, ensureDistinctProductName, productNameIssue } from "@/lib/domain";
import { fixtureUnderstanding } from "@/lib/fixtures";

describe("project state", () => {
  it("allows the verified path and rejects bypasses", () => {
    expect(() => assertProjectTransition("review", "approved")).not.toThrow();
    expect(() => assertProjectTransition("draft", "complete")).toThrow("Invalid project transition");
    expect(canGenerate({ status: "approved", approvedVersion: 2, currentUnderstanding: 2 })).toEqual({ ok: true });
    expect(canGenerate({ status: "approved", approvedVersion: 1, currentUnderstanding: 2 })).toEqual({ ok: false, reason: "The current understanding has not been approved." });
  });
});

describe("adapted product identity", () => {
  it("rejects the platform brand and the source product brand", () => {
    expect(productNameIssue("VibesClone", "https://linear.app")).toMatch(/VibesClone/i);
    expect(productNameIssue("Linear", "https://linear.app")).toMatch(/source product/i);
    expect(productNameIssue("LinearFlow", "https://app.linear.app")).toMatch(/source product/i);
    expect(productNameIssue("ScoutFlow", "https://linear.app")).toBeNull();
  });

  it("replaces a leaked brand with a niche-specific working name", () => {
    const understanding = fixtureUnderstanding({ hostname: "linear.app", niche: "Independent recruiters", usp: "Local-first" });
    const cleaned = ensureDistinctProductName({ ...understanding, productName: "VibesClone" }, "https://linear.app", "Independent recruiters");
    expect(cleaned.productName).toBe("Independent Recruiters Flow");
    expect(cleaned.summary).toBe(understanding.summary);
  });
});
