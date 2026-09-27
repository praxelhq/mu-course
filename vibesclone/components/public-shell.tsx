import Link from "next/link";
import { Brand } from "@/components/brand";
import { docs, posts } from "@/lib/content";
import { marketStats } from "@/lib/opportunities";

export function PublicHeader(): React.ReactNode {
  return <header className="site-header public-header"><div className="site-header-inner"><Brand /><nav aria-label="Main navigation"><Link href="/opportunities">Opportunities</Link><Link href="/blueprints">Teardowns</Link><Link href="/#how">How it works</Link><Link href="/#pricing">Pricing</Link><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link></nav><Link className="header-cta" href="/workspace">Start a build</Link></div></header>;
}

export function PublicFooter(): React.ReactNode {
  return <footer className="public-footer">
    <div className="footer-map" aria-label="All pages">
      <div className="footer-about"><Brand /><p>Find a product that already earns. Build your version for a different niche.</p><small>Revenue data: TrustMRR, AppSumo and Acquire public listings, snapshot {new Date(marketStats.snapshotDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</small></div>
      <nav className="footer-col" aria-label="Product"><strong>Product</strong><Link href="/opportunities">Opportunities</Link><Link href="/blueprints">Teardowns</Link><Link href="/workspace">Start a build</Link><Link href="/stats">Live stats</Link><Link href="/sponsor">Partners</Link><Link href="/#pricing">Pricing</Link></nav>
      <nav className="footer-col" aria-label="Docs"><strong><Link href="/docs">Docs</Link></strong>{docs.map((doc) => <Link key={doc.slug} href={`/docs/${doc.slug}`}>{doc.title}</Link>)}</nav>
      <nav className="footer-col" aria-label="Blog"><strong><Link href="/blog">Blog</Link></strong>{posts.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`}>{post.title}</Link>)}</nav>
      <nav className="footer-col" aria-label="Legal"><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
    </div>
    <div className="footer-base"><p>Adapt the logic. Don’t imitate the identity.</p><span>© 2026 VibesClone</span></div>
    <div className="footer-wordmark" aria-hidden="true">vibesclone</div>
  </footer>;
}
