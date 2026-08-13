import { describe, expect, it } from "vitest";
import { blueprints, findBlueprint, relatedBlueprints } from "@/lib/blueprints";

describe("blueprint registry", () => {
  it("ships eight complete, unique launch blueprints", () => {
    expect(blueprints).toHaveLength(8);
    expect(new Set(blueprints.map((item) => item.slug)).size).toBe(blueprints.length);
    expect(new Set(blueprints.map((item) => new URL(item.sourceUrl).hostname)).size).toBe(blueprints.length);
    for (const blueprint of blueprints) {
      expect(blueprint.coreFeatures.length).toBeGreaterThanOrEqual(4);
      expect(blueprint.keyFlows.length).toBeGreaterThanOrEqual(3);
      expect(blueprint.hardParts.length).toBeGreaterThanOrEqual(2);
      expect(blueprint.nicheAngles.length).toBeGreaterThanOrEqual(3);
      expect(blueprint.scopeCuts.length).toBeGreaterThanOrEqual(2);
      expect(blueprint.basePrompt.length).toBeGreaterThan(240);
      expect(blueprint.cloneabilityScore).toBeGreaterThanOrEqual(1);
      expect(blueprint.cloneabilityScore).toBeLessThanOrEqual(100);
    }
  });

  it("resolves names, domains, and public URLs", () => {
    expect(findBlueprint("Linear")?.slug).toBe("linear");
    expect(findBlueprint("https://www.notion.so/product")?.slug).toBe("notion");
    expect(findBlueprint("calendly.com")?.slug).toBe("calendly");
    expect(findBlueprint("https://unknown.example")?.slug).toBeUndefined();
  });

  it("returns relevant alternatives without returning itself", () => {
    const related = relatedBlueprints(blueprints[0], 3);
    expect(related).toHaveLength(3);
    expect(related.every((item) => item.slug !== blueprints[0].slug)).toBe(true);
  });
});
