import Link from "next/link";
import { ArrowRight, Check, Copy, Layers3, ScanSearch } from "lucide-react";
import { Brand } from "@/components/brand";
import { MarketingDemo } from "@/components/marketing-demo";
import { SalesForm } from "@/components/sales-form";
import { HeroFlow } from "@/components/hero-flow";

export default function Home(): React.ReactNode {
  return (
    <main>
      <header className="site-header"><Brand /><nav aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#output">Output</a><a href="#pricing">Pricing</a></nav><Link className="header-cta" href="/workspace">Start a build</Link></header>
      <section className="hero">
        <div className="hero-copy"><span className="hero-eyebrow">PRODUCT URL → VERIFIED BUILD PLAN</span><h1>Copy the product logic.<br />Build your version.</h1><p>Paste a product URL. Verify what the AI understood. Get the exact prompt sequence to build it for your niche.</p><div className="hero-actions"><Link className="button primary" href="/workspace">Analyze a product <ArrowRight size={18} /></Link><a className="button secondary" href="#workflow">See the workflow</a></div></div>
        <HeroFlow />
      </section>
      <section className="demo-section-wrap" id="workflow"><div className="section-heading"><div className="section-index">01</div><div><span>TRY THE FLOW</span><h2>From URL to build sequence.</h2></div><p>This is the real order: analyze, verify, approve, then prompt. Click Analyze to play it through.</p></div><MarketingDemo /></section>
      <section className="understanding-section"><div className="section-index">02</div><div><h2>Understanding<br />before prompting.</h2></div><div className="section-explainer"><p>VibesClone shows its work before it tells your builder what to build. Correct the name, ICP, flows, and feature decisions—then approve the exact version that powers every prompt.</p><ul><li><ScanSearch /> Evidence-linked, uncertainty-aware analysis</li><li><Layers3 /> Retain, modify, remove, or add every feature</li><li><Check /> Immutable approval before generation</li></ul></div></section>
      <section className="output-section" id="output"><div className="output-copy"><div className="section-index">03</div><h2>One base prompt.<br />Follow-ups that finish.</h2><p>No 4,000-word prompt dump. You get a deliberate build order, platform-specific phrasing, feature lineage, and a check before you advance.</p></div><div className="prompt-preview"><div className="prompt-preview-head"><span>00 · BASE PROMPT</span><button type="button"><Copy size={15} /> Copy</button></div><h3>Build the smallest complete version</h3><p>Start from the approved product definition. Establish the architecture, core entities, authentication boundary, and first vertical slice…</p><strong>ACCEPTANCE CHECK</strong><ul><li>Project runs locally</li><li>Primary workflow completes end to end</li><li>Removed features do not appear</li></ul><div className="next-prompt">NEXT · 01 Foundation <ArrowRight size={16} /></div></div></section>
      <section className="pricing-section" id="pricing"><div><div className="section-index">04</div><h2>Free until the output earns the upgrade.</h2><p>Analysis, Build Understanding, approval, and the complete base prompt are free. A license unlocks every mapped follow-up for one project.</p></div><div className="pricing-grid"><article><span>ONE PROJECT</span><strong>$29</strong><small>$29 / project</small></article><article className="featured"><i>BUILDER PACK</i><span>THREE PROJECTS</span><strong>$69</strong><small>$23 / project</small></article><article><span>TEN PROJECTS</span><strong>$179</strong><small>$17.90 / project</small></article><Link className="button primary" href="/workspace">Start free <ArrowRight size={18} /></Link></div></section>
      <section className="sales-section" id="sales"><div><div className="section-index">05</div><h2>Building for a team?</h2><p>Tell us your size and use case. We’ll get back with volume pricing and rollout support, so you don’t have to buy project licenses one at a time.</p><span className="sales-note">Our team replies within one business day.</span></div><SalesForm /></section>
      <footer><Brand /><p>Adapt the logic. Don’t imitate the identity.</p><nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><span>© 2026 VibesClone</span></footer>
    </main>
  );
}
