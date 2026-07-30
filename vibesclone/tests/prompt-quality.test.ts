import { describe, expect, it } from "vitest";
import { fixturePromptSet, fixtureUnderstanding } from "@/lib/fixtures";
import { promptSetSchema } from "@/lib/contracts";

describe("prompt sequence quality", () => {
  it("keeps order, checks, mapping, and removed-feature exclusion", () => {
    const understanding = fixtureUnderstanding({ hostname: "linear.app", niche: "Recruiters", usp: "Local-first" });
    const set = promptSetSchema.parse(fixturePromptSet(understanding, "claude-code"));
    const prompts = [set.base, ...set.followUps];
    expect(prompts.map((item) => item.order)).toEqual([0, 1, 2, 3, 4]);
    expect(prompts.every((item) => item.completionChecks.length > 0 && item.mappedFeatures.length > 0)).toBe(true);
    expect(prompts.every((item) => !item.prompt.includes("Enterprise administration"))).toBe(true);
  });
});
