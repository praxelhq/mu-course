import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Activity, ArrowRight, BookOpen, Copy, GitFork, Globe2 } from "lucide-react";
import Link from "next/link";
import { NewsletterForm } from "@/components/newsletter-form";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { blueprints } from "@/lib/blueprints";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live Product Stats", description: "Truthful, database-backed VibesClone blueprint, remix, publishing, and prompt activity.", alternates: { canonical: "/stats" } };

async function safe<T>(promise: Promise<T>): Promise<T | null> { try { return await promise; } catch { return null; } }

const loadStats = unstable_cache(async () => Promise.all([safe(prisma.project.count()), safe(prisma.project.count({ where: { isPublic: true } })), safe(prisma.promptSet.count()), safe(prisma.productEvent.groupBy({ by: ["event"], _count: { _all: true } })), safe(prisma.productEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } })), safe(prisma.newsletterSubscriber.count({ where: { active: true } }))]), ["public-growth-stats"], { revalidate: 60 });

export default async function StatsPage(): Promise<React.ReactNode> {
  const [projects, publicReports, promptSets, events, firstEvent, subscribers] = await loadStats();
  const count = Object.fromEntries((events ?? []).map((item) => [item.event, item._count._all]));
  const dataAvailable = [projects, publicReports, promptSets, events, subscribers].every((value) => value !== null);
  const stats = [{ label: "Curated blueprints", value: blueprints.length, icon: <BookOpen /> }, { label: "Products analyzed", value: projects, icon: <Activity /> }, { label: "Prompt sets generated", value: promptSets, icon: <Copy /> }, { label: "Blueprint remixes", value: count.blueprint_remix ?? 0, icon: <GitFork /> }, { label: "Public build reports", value: publicReports, icon: <Globe2 /> }, { label: "Digest subscribers", value: subscribers, icon: <ArrowRight /> }];
  return <main><PublicHeader /><section className="stats-hero"><span>PUBLIC PROOF · NO SEEDED ACTIVITY</span><h1>Watch the build loop grow.</h1><p>These are direct database counts, not an activity animation or a marketing estimate. Funnel events started {firstEvent ? firstEvent.createdAt.toLocaleDateString("en-US", { dateStyle: "long" }) : "with this release"}.{!dataAvailable ? " Some counters are temporarily unavailable rather than being shown as zero." : ""}</p></section><section className="stats-grid">{stats.map((stat) => <article key={stat.label}><span>{stat.icon}</span><strong>{stat.value === null ? "—" : stat.value.toLocaleString()}</strong><p>{stat.label}</p></article>)}</section><section className="stats-explainer"><div><span>WHAT WE MEASURE</span><h2>Attention is not activation.</h2><p>A blueprint view matters less than a remix. A public report matters when it starts someone else’s build. These counters let us improve that chain without pretending every page view is product value.</p><Link href="/blueprints" className="button primary">Explore a blueprint <ArrowRight size={16} /></Link></div><NewsletterForm source="stats" /></section><PublicFooter /></main>;
}
