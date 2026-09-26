import { describe, expect, it } from "vitest";
import { projectInputSchema, understandingSchema } from "@/lib/contracts";
import { fixtureUnderstanding } from "@/lib/fixtures";

describe("product contracts", () => {
  it("accepts every build target and rejects unknown targets", () => {
    for (const buildTarget of ["lovable", "replit", "base44", "claude-code"]) {
      expect(projectInputSchema.safeParse({ sourceUrl: "https://linear.app", niche: "Recruiters", usp: "Local-first", buildTarget }).success).toBe(true);
    }
    expect(projectInputSchema.safeParse({ sourceUrl: "https://linear.app", niche: "Recruiters", usp: "Local-first", buildTarget: "bolt" }).success).toBe(false);
  });

  it("accepts the empty optional fields submitted by a direct workspace form", () => {
    expect(projectInputSchema.safeParse({ sourceUrl: "https://linear.app", uiReferenceUrl: "", remixOrigin: "", niche: "Recruiters", usp: "Local-first", buildTarget: "claude-code" }).success).toBe(true);
  });

  it("validates the deterministic understanding fixture", () => {
    const fixture = fixtureUnderstanding({ hostname: "linear.app", niche: "Recruiters", usp: "Local-first" });
    expect(understandingSchema.parse(fixture).features).toHaveLength(4);
  });
});
