import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-shell";

type ContentPageProps = {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
};

export function ContentPage({ eyebrow, title, lede, children }: ContentPageProps): React.ReactNode {
  return <main className="content-page"><PublicHeader /><article className="content-document"><span>{eyebrow}</span><h1>{title}</h1><p>{lede}</p>{children}<div className="content-cta"><p>Analysis, the Build Understanding, approval, and your base prompt are free.</p><Link className="button primary" href="/workspace">Start a build <ArrowRight size={15} /></Link></div></article><PublicFooter /></main>;
}
