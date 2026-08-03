import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";

type ContentPageProps = {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
};

export function ContentPage({ eyebrow, title, lede, children }: ContentPageProps): React.ReactNode {
  return <main className="content-page"><header className="content-header"><Brand /><nav aria-label="Content"><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link><Link href="/workspace">Workspace</Link></nav></header><article className="content-document"><span>{eyebrow}</span><h1>{title}</h1><p>{lede}</p>{children}</article><footer className="content-footer"><p>Analysis, the Build Understanding, approval, and your base prompt are free.</p><Link href="/workspace">Start a build <ArrowRight size={15} /></Link></footer></main>;
}
