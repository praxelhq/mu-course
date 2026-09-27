import Link from "next/link";
import { ArrowRight, Check, Minus, Star } from "lucide-react";
import { MarketingDemo } from "@/components/marketing-demo";
import { SalesForm } from "@/components/sales-form";
import { HeroSearch } from "@/components/hero-search";
import { OpportunityTable } from "@/components/opportunity-table";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { betterVersions, formatUsd, marketStats as m, opportunities, opportunityCategories } from "@/lib/opportunities";

const totalMrr = opportunities.reduce((sum, item) => sum + item.mrr, 0);
const pct = (value: number) => `${Math.round(value * 100)}%`;
const share = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

const comparison: { label: string; buy: string; build: string; buildWins: boolean }[] = [
  { label: "Upfront cost", buy: `${formatUsd(m.acquireSmallMedianAsk)} median ask for $1k–20k MRR on Acquire`, build: "$29 per project. Analysis and the base prompt are free", buildWins: true },
  { label: "Revenue on day one", buy: "Yes, existing customers transfer", build: "No. You still have to find customers", buildWins: false },
  { label: "Your niche and your angle", buy: "Inherited positioning, inherited debt", build: "Chosen before the first prompt runs", buildWins: true },
  { label: "Codebase you understand", buy: "Due diligence on someone else’s stack", build: "Built step by step, with a check after each prompt", buildWins: true },
  { label: "Proof the market pays", buy: "The seller’s claims, audited by you", build: "Verified MRR from payment providers via TrustMRR", buildWins: true },
];

const faqs = [
  { q: "Is this cloning?", a: "No. You adapt the product logic, the part that shows people pay for a job done, for a different niche. VibesClone never copies branding, copy, content, or visual identity, and the Build Understanding lets you cut and change features before any prompt is written." },
  { q: "Where does the revenue data come from?", a: `TrustMRR lists startups whose revenue is pulled directly from their payment provider. We use a public snapshot from ${new Date(m.snapshotDate).toLocaleDateString("en-US", { dateStyle: "long" })} and link every product back to its TrustMRR page. Figures are rounded to the nearest $100.` },
  { q: "Does a product with revenue mean mine will earn too?", a: `No. Only ${share(m.over1k, m.trustmrrStartups)} of the ${m.trustmrrStartups.toLocaleString()} startups on TrustMRR reach $1k a month. Verified revenue proves people pay for the job, not that your version will win. Pick a niche you can reach, and plan distribution before you build.` },
  { q: "What do I actually get?", a: "An evidence-linked Build Understanding you can edit and approve, then one base prompt plus ordered follow-ups for Lovable, Replit, Base44, or Claude Code. Each prompt has an acceptance check before you move on." },
];

export default function Home(): React.ReactNode {
  const ticker = opportunities.slice(0, 24);
  return (
    <main className="home">
      <div className="announce"><span>NEW</span>{opportunities.length} verified-revenue products<em> from the {new Date(m.snapshotDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })} TrustMRR snapshot</em><Link href="/opportunities">Browse them <ArrowRight size={13} /></Link></div>
      <PublicHeader />

      <section className="home-hero">
        <span className="eyebrow">VERIFIED REVENUE → BUILD SEQUENCE</span>
        <h1>Build what’s <em>already earning</em>.</h1>
        <p>{m.over1k.toLocaleString()} indie products on TrustMRR make over $1k a month. {pct(m.midBandSmallAudienceShare)} of those in the $1k–50k band were built by founders with under 1,000 followers. Pick one, see its buildable core, and get the prompts to ship your version for a different niche.</p>
        <HeroSearch />
        <div className="chip-row centered">{opportunityCategories.slice(0, 12).map((category) => <Link className="chip" key={category} href={`/opportunities?category=${encodeURIComponent(category)}`}>{category.toLowerCase()}</Link>)}<Link className="chip strong" href="/opportunities">all {opportunityCategories.length} categories →</Link></div>
        <p className="hero-footnote">Analysis, Build Understanding and the base prompt are free · $29 unlocks a full Build Sequence</p>
      </section>

      <section className="ticker-band" aria-label="Verified monthly revenue">
        <div className="ticker" aria-hidden="true"><div>{[...ticker, ...ticker].map((item, index) => <span key={`${item.slug}-${index}`}>{item.name.toUpperCase()} <b>{formatUsd(item.mrr)}/mo</b></span>)}</div></div>
        <div className="ticker-total"><small>verified MRR<br />on this list</small><strong>{formatUsd(totalMrr)}</strong><small>/mo across {opportunities.length} products</small></div>
      </section>

      <section className="home-section" id="opportunities">
        <div className="section-head"><span className="section-index">01</span><h2>Products that already earn</h2><p>Each row is a real business with revenue verified through its payment provider. Open one to see what it does, who pays, how crowded the field is, and how to build your version.</p></div>
        <OpportunityTable items={opportunities} limit={10} />
        <div className="section-foot"><Link className="button secondary" href="/opportunities">See all {opportunities.length} earning products <ArrowRight size={16} /></Link></div>
      </section>

      <section className="home-section" id="evidence">
        <div className="section-head"><span className="section-index">02</span><h2>What the data says</h2><p>We read {m.trustmrrStartups.toLocaleString()} TrustMRR startups, {m.appsumoProducts.toLocaleString()} AppSumo deals and {m.acquireListings.toLocaleString()} Acquire listings. The same picture keeps showing up.</p></div>
        <div className="evidence-grid">
          <article><strong>{m.midBand}</strong><b>products earn $1k–50k a month</b><p>That’s the band a solo builder can realistically reach, and it isn’t dominated by famous founders.</p></article>
          <article><strong>{m.midBandMedianFollowers}</strong><b>median founder followers on X</b><p>{pct(m.midBandSmallAudienceShare)} have under 1,000. The revenue comes from the product and its niche, not from an audience.</p></article>
          <article><strong>{m.recentSmallAudience}</strong><b>launched since 2024 by small founders</b><p>Median {formatUsd(m.recentSmallAudienceMedianMrr)} MRR. Recent, focused products you could build this quarter.</p></article>
          <article className="caution"><strong>{share(m.over1k, m.trustmrrStartups)}</strong><b>of all listed startups reach $1k MRR</b><p>Verified revenue proves demand, not your odds. Building is the easy part now; choosing a niche you can reach is the work.</p></article>
        </div>
      </section>

      <section className="home-section" id="build-vs-buy">
        <div className="section-head"><span className="section-index">03</span><h2>Buy the business, or build your version?</h2><p>{m.forSaleOver1k} TrustMRR startups earning over $1k a month are for sale, at a median {formatUsd(m.forSaleMedianAsk)} ({m.forSaleMedianMultiple}× revenue). Sometimes buying is right. Here’s the honest trade.</p></div>
        <div className="compare-card">
          <div className="compare-head"><span /><span>Buy on Acquire or TrustMRR</span><span className="us">Build with VibesClone</span></div>
          <div className="compare-body">{comparison.map((row) => <div className="compare-row" key={row.label}><b>{row.label}</b><span>{row.buy}</span><span className={row.buildWins ? "win" : "lose"}>{row.buildWins ? <Check size={15} /> : <Minus size={15} />}{row.build}</span></div>)}</div>
        </div>
      </section>

      <section className="home-section" id="how">
        <div className="section-head"><span className="section-index">04</span><h2>From URL to Build Sequence</h2><p>Analyze, check, approve, then prompt. You fix the AI’s understanding before it writes a single instruction for your builder. Click Analyze to play it through.</p></div>
        <MarketingDemo />
        <div className="step-grid">
          <article><span>1</span><b>Pick a proven product</b><p>From the list, or paste any public URL.</p></article>
          <article><span>2</span><b>Choose your niche and angle</b><p>Who you’ll serve and why they’ll switch.</p></article>
          <article><span>3</span><b>Approve the understanding</b><p>Keep, change, remove or add every feature.</p></article>
          <article><span>4</span><b>Ship prompt by prompt</b><p>One base prompt, then follow-ups with checks.</p></article>
        </div>
      </section>

      <section className="home-section" id="better-versions">
        <div className="section-head"><span className="section-index">05</span><h2>Paid for, poorly rated</h2><p>{m.appsumoPaidButPoorlyRated} AppSumo deals sold 300+ copies yet average under 4 stars. Buyers wanted the job done and were let down. That’s room for a better version.</p></div>
        <div className="table-scroll plain" role="region" aria-label="AppSumo products with unmet demand" tabIndex={0}>
          <table>
            <thead><tr><th>Product</th><th>Category</th><th className="num">Buyers</th><th className="num">Rating</th><th aria-label="Build" /></tr></thead>
            <tbody>{betterVersions.slice(0, 8).map((item) => <tr key={item.name}><td><span className="product-cell static"><span><b>{item.name}</b><small>{item.tagline}</small></span></span></td><td className="mono-cell">{item.category}</td><td className="num"><strong>{item.purchases.toLocaleString()}</strong></td><td className="num rating"><Star size={13} />{item.rating.toFixed(1)}<small> · {item.reviews}</small></td><td>{item.productUrl ? <Link className="text-link" href={`/workspace?sourceUrl=${encodeURIComponent(item.productUrl)}&origin=public-scan`}>Build better <ArrowRight size={14} /></Link> : <a className="text-link" href={item.appsumoUrl} target="_blank" rel="noreferrer">See reviews <ArrowRight size={14} /></a>}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="home-section" id="pricing">
        <div className="section-head"><span className="section-index">06</span><h2>Free until the output earns the upgrade</h2><p>Analysis, the Build Understanding, approval and the complete base prompt are free. A license unlocks every follow-up in the Build Sequence for one project.</p></div>
        <div className="price-cards">
          <article><span>One project</span><strong>$29</strong><small>$29 per project</small></article>
          <article className="featured"><i>Builder pack</i><span>Three projects</span><strong>$69</strong><small>$23 per project</small></article>
          <article><span>Ten projects</span><strong>$179</strong><small>$17.90 per project</small></article>
        </div>
        <div className="section-foot"><Link className="button primary" href="/workspace">Start free <ArrowRight size={16} /></Link><span>No subscription. Unused licenses stay on your account.</span></div>
      </section>

      <section className="home-section" id="faq">
        <div className="section-head"><span className="section-index">07</span><h2>Questions</h2></div>
        <div className="faq-list">{faqs.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>

      <section className="home-section sales-block" id="sales">
        <div className="section-head"><span className="section-index">08</span><h2>Building as a team?</h2><p>Tell us your size and use case. We’ll reply within one business day with volume pricing and rollout help.</p></div>
        <SalesForm />
      </section>

      <PublicFooter />
    </main>
  );
}
