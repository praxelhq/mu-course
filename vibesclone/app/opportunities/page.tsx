import type { Metadata } from "next";
import { OpportunityTable } from "@/components/opportunity-table";
import { NewsletterForm } from "@/components/newsletter-form";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { formatUsd, marketStats, opportunities, opportunityCategories } from "@/lib/opportunities";

export const metadata: Metadata = {
  title: "Products that already earn",
  description: `${opportunities.length} indie products with TrustMRR-verified revenue, the size of their founder’s audience, and how crowded their category is. Pick one and build your version for a different niche.`,
  alternates: { canonical: "/opportunities" },
  openGraph: { title: "Build what’s already earning", description: "Indie products with verified revenue, ranked, with the buildable core one click away.", url: "/opportunities" },
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }): Promise<React.ReactNode> {
  const { q, category } = await searchParams;
  const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: "VibesClone earning products", description: metadata.description, mainEntity: { "@type": "ItemList", itemListElement: opportunities.map((item, index) => ({ "@type": "ListItem", position: index + 1, url: `https://vibesclone.com/opportunities/${item.slug}`, name: item.name })) } };
  return <main>
    <PublicHeader />
    <section className="page-hero">
      <span className="eyebrow">TRUSTMRR-VERIFIED · SNAPSHOT {new Date(marketStats.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</span>
      <h1>Products that already earn</h1>
      <p>{opportunities.length} products earning between {formatUsd(Math.min(...opportunities.map((item) => item.mrr)))} and {formatUsd(Math.max(...opportunities.map((item) => item.mrr)))} a month, picked for being software you can build, not services or audiences you’d have to copy.</p>
    </section>
    <section className="list-section">
      <OpportunityTable items={opportunities} categories={opportunityCategories} filters initialQuery={q ?? ""} initialCategory={category ?? "all"} />
      <p className="data-note">Revenue is TrustMRR-verified MRR at snapshot time, rounded to $100. “Competition” counts how many startups in the same category earn at least $100 a month on TrustMRR. It isn’t a verdict on your idea.</p>
    </section>
    <section className="digest-band"><div><span>THE BUILDABLE PRODUCT DIGEST</span><h2>One earning product worth opening.</h2><p>A weekly pick with verified revenue, three niche angles, and a builder lesson. We only send when the material earns it.</p></div><NewsletterForm source="blueprints" /></section>
    <PublicFooter />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
  </main>;
}
