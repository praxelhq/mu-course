import { describe, expect, it } from "vitest";
import { blueprints } from "@/lib/blueprints";
import { betterVersions, findOpportunity, formatUsd, founderAudience, marketStats, opportunities, opportunityBuildHref, relatedOpportunities } from "@/lib/opportunities";
import { newsletterInputSchema } from "@/lib/newsletter";

describe("opportunity registry", () => {
  it("ships unique, URL-safe slugs that never collide with teardown slugs", () => {
    const slugs = opportunities.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]{1,60}$/.test(slug))).toBe(true);
    const teardowns = new Set(blueprints.map((item) => item.slug));
    expect(slugs.filter((slug) => teardowns.has(slug))).toEqual([]);
  });

  it("only lists software with verified revenue, a public site and its TrustMRR source", () => {
    expect(opportunities.length).toBeGreaterThanOrEqual(30);
    for (const item of opportunities) {
      expect(item.mrr).toBeGreaterThanOrEqual(1000);
      expect(new URL(item.website).protocol).toMatch(/^https?:$/);
      expect(item.trustmrrUrl).toMatch(/^https:\/\/trustmrr\.com\/startup\//);
      expect(item.summary.length).toBeGreaterThan(20);
      expect(item.name).not.toMatch(/stealth/i);
      expect(["Low", "Medium", "High"]).toContain(item.competition);
    }
  });

  it("is sorted by verified revenue so the homepage leads with the strongest evidence", () => {
    const mrr = opportunities.map((item) => item.mrr);
    expect(mrr).toEqual([...mrr].sort((a, b) => b - a));
  });

  it("keeps market statistics internally consistent", () => {
    expect(marketStats.over10k).toBeLessThanOrEqual(marketStats.over1k);
    expect(marketStats.over1k).toBeLessThanOrEqual(marketStats.withRevenue);
    expect(marketStats.withRevenue).toBeLessThanOrEqual(marketStats.trustmrrStartups);
    expect(marketStats.midBandSmallAudienceShare).toBeGreaterThan(0);
    expect(marketStats.midBandSmallAudienceShare).toBeLessThanOrEqual(1);
  });

  it("lists AppSumo gaps only when buyers were many and ratings were low", () => {
    for (const item of betterVersions) {
      expect(item.purchases).toBeGreaterThanOrEqual(500);
      expect(item.rating).toBeLessThan(4);
    }
  });

  it("finds, relates, and links into the workspace with a labelled origin", () => {
    const first = opportunities[0];
    expect(findOpportunity(first.slug)?.name).toBe(first.name);
    expect(findOpportunity("not-a-real-product")).toBeUndefined();
    const related = relatedOpportunities(first, 3);
    expect(related).toHaveLength(3);
    expect(related.some((item) => item.slug === first.slug)).toBe(false);
    const href = new URL(opportunityBuildHref(first), "https://vibesclone.com");
    expect(href.pathname).toBe("/workspace");
    expect(href.searchParams.get("sourceUrl")).toBe(first.website);
    expect(href.searchParams.get("origin")).toBe(`opportunity:${first.slug}`);
  });

  it("formats money and audience for humans", () => {
    expect(formatUsd(57_100)).toBe("$57k");
    expect(formatUsd(8400)).toBe("$8.4k");
    expect(formatUsd(2000)).toBe("$2k");
    expect(formatUsd(1_500_000)).toBe("$1.5M");
    expect(founderAudience(0)).toBe("No X audience listed");
    expect(founderAudience(79)).toBe("Under 100 followers");
    expect(founderAudience(4683)).toBe("5k followers");
  });

  it("accepts newsletter signups sourced from an opportunity page", () => {
    const slug = opportunities[0].slug;
    expect(newsletterInputSchema.safeParse({ email: "builder@example.com", source: `opportunity:${slug}`, website: "" }).success).toBe(true);
    expect(newsletterInputSchema.safeParse({ email: "builder@example.com", source: "opportunity:Bad Slug", website: "" }).success).toBe(false);
  });
});
