import Link from "next/link";
import { Brand } from "@/components/brand";

export function PublicHeader(): React.ReactNode {
  return <header className="site-header public-header"><Brand /><nav aria-label="Main navigation"><Link href="/blueprints">Blueprints</Link><Link href="/stats">Live stats</Link><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link><Link href="/sponsor">Partners</Link></nav><Link className="header-cta" href="/workspace">Start a build</Link></header>;
}

export function PublicFooter(): React.ReactNode {
  return <footer className="public-footer"><div><Brand /><p>Adapt the logic. Don’t imitate the identity.</p></div><nav aria-label="Footer"><Link href="/blueprints">Blueprints</Link><Link href="/stats">Live stats</Link><Link href="/sponsor">Partners</Link><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><span>© 2026 VibesClone</span></footer>;
}
