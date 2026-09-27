import { opportunities, type Opportunity } from "@/lib/opportunities-data";

export { betterVersions, marketStats, opportunities } from "@/lib/opportunities-data";
export type { BetterVersion, Competition, Opportunity } from "@/lib/opportunities-data";

export function findOpportunity(slug: string): Opportunity | undefined {
  return opportunities.find((item) => item.slug === slug);
}

export function relatedOpportunities(opportunity: Opportunity, limit = 3): Opportunity[] {
  return opportunities
    .filter((item) => item.slug !== opportunity.slug)
    .sort((a, b) => Number(b.category === opportunity.category) - Number(a.category === opportunity.category) || Math.abs(a.mrr - opportunity.mrr) - Math.abs(b.mrr - opportunity.mrr))
    .slice(0, limit);
}

export const opportunityCategories = [...new Set(opportunities.map((item) => item.category))].sort();

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 10_000) return `$${Math.round(value / 1000)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${value}`;
}

export function founderAudience(followers: number): string {
  if (followers < 1) return "No X audience listed";
  if (followers < 100) return "Under 100 followers";
  if (followers < 1000) return "Under 1k followers";
  if (followers < 10_000) return `${Math.round(followers / 1000)}k followers`;
  return "10k+ followers";
}

export function opportunityBuildHref(opportunity: Opportunity): string {
  return `/workspace?sourceUrl=${encodeURIComponent(opportunity.website)}&origin=${encodeURIComponent(`opportunity:${opportunity.slug}`)}`;
}
