import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/layout";
import { posts } from "@/lib/content";

export const metadata: Metadata = { title: "Blog", description: "Writing on build discipline: why ordered prompts beat mega-prompts, how to choose a build target, and how to adapt a product's logic without imitating its identity.", alternates: { canonical: "/blog" } };

export default function BlogIndexPage(): React.ReactNode {
  return <ContentPage eyebrow="BLOG" title="Blog" lede="Notes on building with AI tools deliberately: verification before generation, ordered prompts over mega-prompts, and adapting logic without imitating identity.">
    <div className="content-index">{posts.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`}><h2>{post.title}</h2><p>{post.description}</p><small>{post.date} · {post.author}</small></Link>)}</div>
  </ContentPage>;
}
