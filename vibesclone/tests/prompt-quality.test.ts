import { describe, expect, it } from "vitest";
import { fixturePromptSet, fixtureUnderstanding } from "@/lib/fixtures";
import { promptSetSchema } from "@/lib/contracts";
import { enforcePromptIdentity } from "@/lib/prompts/generation";

describe("prompt sequence quality", () => {
  it("keeps order, checks, mapping, and removed-feature exclusion", () => {
    const understanding = fixtureUnderstanding({ hostname: "linear.app", niche: "Recruiters", usp: "Local-first" });
    const set = promptSetSchema.parse(fixturePromptSet(understanding, "claude-code"));
    const prompts = [set.base, ...set.followUps];
    expect(prompts.map((item) => item.order)).toEqual([0, 1, 2, 3, 4]);
    expect(prompts.every((item) => item.completionChecks.length > 0 && item.mappedFeatures.length > 0)).toBe(true);
    expect(prompts.every((item) => !item.prompt.includes("Enterprise administration"))).toBe(true);
    expect(prompts.every((item) => item.prompt.includes(understanding.productName) || item.order > 1)).toBe(true);
    expect(prompts.every((item) => !/VibesClone/i.test(`${item.title} ${item.purpose} ${item.prompt}`))).toBe(true);
  });

  it("replaces platform-brand leakage with the approved product name", () => {
    const understanding = { ...fixtureUnderstanding({ hostname: "linear.app", niche: "Recruiters", usp: "Local-first" }), productName: "ScoutFlow" };
    const unsafe = fixturePromptSet(understanding, "claude-code");
    unsafe.base.title = "Initialize VibesClone";
    unsafe.base.prompt = unsafe.base.prompt.replaceAll("ScoutFlow", "VibesClone");
    const safe = enforcePromptIdentity(unsafe, understanding.productName);
    expect(`${safe.base.title} ${safe.base.prompt}`).toContain("ScoutFlow");
    expect(`${safe.base.title} ${safe.base.prompt}`).not.toMatch(/VibesClone/i);
  });
});
