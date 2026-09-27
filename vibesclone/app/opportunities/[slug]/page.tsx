import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { CompetitionPill } from "@/components/opportunity-table";
import { NewsletterForm } from "@/components/newsletter-form";
import { PublicActions } from "@/components/public-actions";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { findOpportunity, founderAudience, formatUsd, marketStats, opportunities, opportunityBuildHref, relatedOpportunities } from "@/lib/opportunities";

export function generateStaticParams() { return opportunities.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = findOpportunity((await params).slug); if (!item) return {};
  const title = `${item.name} earns ${formatUsd(item.mrr)}/mo. Build your version`;
  const description = `${item.summary} Verified revenue, founder audience, pricing and competition, plus the prompts to build a version for your niche.`.slice(0, 158);
  return { title, description, alternates: { canonical: `/opportunities/${item.slug}` }, openGraph: { title, description, url: `/opportunities/${item.slug}`, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

function monthYear(value: string | null): string {
  if (!value) return "Not listed";
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }): Promise<React.ReactNode> {
  const item = findOpportunity((await params).slug); if (!item) notFound();
  const buildHref = opportunityBuildHref(item);
  const related = relatedOpportunities(item);
  const facts: [string, string][] = [
    ["Verified MRR", `${formatUsd(item.mrr)} / month`],
    ["30-day change", item.growth30d === null ? "Not reported" : `${item.growth30d > 0 ? "+" : ""}${item.growth30d}%`],
    ["Founded", monthYear(item.founded)],
    ["Founder audience", founderAudience(item.founderFollowers)],
    ["Sells to", item.audience === "Both" ? "Businesses and consumers" : item.audience === "B2B" ? "Businesses" : item.audience === "B2C" ? "Consumers" : "Not listed"],
    ...(item.onSale && item.askingPrice ? [["For sale at", `${formatUsd(item.askingPrice)} (${(item.askingPrice / (item.mrr * 12)).toFixed(1)}× ARR)`] as [string, string]] : []),
  ];
  const schema = [{ "@context": "https://schema.org", "@type": "Article", headline: `${item.name} earns ${formatUsd(item.mrr)}/mo: build your version`, description: item.summary, mainEntityOfPage: `https://vibesclone.com/opportunities/${item.slug}`, about: { "@type": "SoftwareApplication", name: item.name, applicationCategory: item.category, url: item.website } }, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Opportunities", item: "https://vibesclone.com/opportunities" }, { "@type": "ListItem", position: 2, name: item.name, item: `https://vibesclone.com/opportunities/${item.slug}` }] }];

  return <main>
    <PublicHeader />
    <article className="opportunity-detail">
      <Link className="back-link" href="/opportunities"><ArrowLeft size={15} /> All earning products</Link>
      <header className="opportunity-title">
        <div>
          <span className="eyebrow">{item.category.toUpperCase()} · VERIFIED REVENUE</span>
          <h1>{item.name} earns <em>{formatUsd(item.mrr)}</em> a month.</h1>
          <p>{item.summary}</p>
          <PublicActions title={item.name} text={`${item.name} earns ${formatUsd(item.mrr)}/mo with a founder audience of ${founderAudience(item.founderFollowers).toLowerCase()}. Here's the buildable core.`} buildHref={buildHref} blueprintSlug={item.slug} trackView="blueprint_view" />
        </div>
        <aside className="fact-card">
          <div className="fact-card-head"><ShieldCheck size={16} /> Revenue verified by TrustMRR</div>
          <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <a href={item.trustmrrUrl} target="_blank" rel="noreferrer">View the TrustMRR listing <ExternalLink size={13} /></a>
        </aside>
      </header>

      <section className="detail-grid">
        <article className="detail-card">
          <span className="section-index">01</span><h2>Who pays, and for what</h2>
          <dl className="plain-facts">
            <div><dt>The job it does</dt><dd>{item.problem ?? item.summary}</dd></div>
            <div><dt>Who it’s for</dt><dd>{item.persona ?? "Not listed on TrustMRR. Confirm it during analysis."}</dd></div>
            <div><dt>How it charges</dt><dd>{item.pricing ?? "Not listed on TrustMRR. VibesClone reads the public pricing page during analysis."}</dd></div>
          </dl>
        </article>
        <article className="detail-card">
          <span className="section-index">02</span><h2>How crowded is it?</h2>
          <div className="competition-line"><CompetitionPill level={item.competition} /><p><b>{item.categoryEarningCount}</b> {item.category} startups earn at least $100 a month on TrustMRR.</p></div>
          <p>{item.competition === "High" ? "Buyers are proven but the category is crowded. Don’t build a general version; win one narrow audience the leaders serve badly." : item.competition === "Medium" ? "There’s room, but pick a specific audience and one reason to switch before you build anything." : "Few earning rivals. A focused version for one clear audience can stand out quickly."}</p>
          <p className="muted-note">{item.founderFollowers < 1000 ? "The founder has a small audience, so this revenue is mostly the product and its niche, not personal reach." : "The founder has a real audience. Some of this revenue is reach you won’t have, so plan distribution from day one."}</p>
        </article>
      </section>

      <section className="build-band">
        <div><span className="section-index">03</span><h2>Build your version, not theirs.</h2><p>VibesClone reads {item.name}’s public site, maps its flows and features, and lets you pick a different niche and angle. You approve that understanding, then get one base prompt and ordered follow-ups for Lovable, Replit, Base44 or Claude Code.</p><ul><li>Analysis, understanding and base prompt: free</li><li>Full Build Sequence: $29 per project</li><li>Never copies branding, copy, content or visual identity</li></ul></div>
        <Link className="button primary" href={buildHref}>Analyze {item.name} <ArrowRight size={17} /></Link>
      </section>

      <section className="related-section"><span>NEARBY OPPORTUNITIES</span><div>{related.map((other) => <Link href={`/opportunities/${other.slug}`} key={other.slug}><b>{other.name}</b><small>{formatUsd(other.mrr)}/mo · {other.category}</small><ArrowRight size={15} /></Link>)}</div></section>
      <div className="detail-digest"><NewsletterForm source={`opportunity:${item.slug}`} /></div>
      <p className="data-note">Snapshot of {new Date(marketStats.snapshotDate).toLocaleDateString("en-US", { dateStyle: "long" })}. Figures change; check the live TrustMRR listing before you decide. VibesClone isn’t affiliated with {item.name}.</p>
    </article>
    <PublicFooter />
    {schema.map((entry, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(entry).replace(/</g, "\\u003c") }} />)}
  </main>;
}
