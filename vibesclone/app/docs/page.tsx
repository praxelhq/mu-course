import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/layout";
import { docs } from "@/lib/content";

export const metadata: Metadata = { title: "Docs", description: "How VibesClone works: from a public product URL to an approved Build Understanding and a licensed Build Sequence.", alternates: { canonical: "/docs" } };

export default function DocsIndexPage(): React.ReactNode {
  return <ContentPage eyebrow="DOCS" title="Documentation" lede="Everything the product does, in reading order: analysis, the Build Understanding, Build Sequences, build targets, and what a license covers.">
    <div className="content-index">{docs.map((doc) => <Link key={doc.slug} href={`/docs/${doc.slug}`}><h2>{doc.title}</h2><p>{doc.description}</p></Link>)}</div>
  </ContentPage>;
}
