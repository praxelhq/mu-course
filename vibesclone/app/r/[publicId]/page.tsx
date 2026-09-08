import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GitFork, Layers3, Target } from "lucide-react";
import { PublicActions } from "@/components/public-actions";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { understandingSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { publicProjectView } from "@/lib/public-projects";

export const dynamic = "force-dynamic";

const loadReport = cache(async (publicId: string) => {
  const project = await prisma.project.findFirst({ where: { publicId, isPublic: true, publishedAt: { not: null }, publishedVersion: { not: null } }, select: { id: true, publicId: true, name: true, sourceUrl: true, niche: true, usp: true, publishedAt: true, publishedVersion: true } });
  if (!project?.publicId || !project.publishedAt || project.publishedVersion === null) return null;
  const version = await prisma.understandingVersion.findUnique({ where: { projectId_version: { projectId: project.id, version: project.publishedVersion } }, select: { content: true } });
  const parsed = understandingSchema.safeParse(version?.content); if (!parsed.success) return null;
  return publicProjectView({ ...project, publicId: project.publicId, publishedAt: project.publishedAt, understanding: parsed.data });
});

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const report = await loadReport((await params).publicId); if (!report) return {};
  const title = `${report.productName}: ${report.niche} build blueprint`;
  const description = `${report.productName} adapts ${new URL(report.sourceUrl).hostname} for ${report.niche}: ${report.usp}`.slice(0, 158);
  return { title, description, robots: { index: false, follow: true }, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PublicReportPage({ params }: { params: Promise<{ publicId: string }> }): Promise<React.ReactNode> {
  const report = await loadReport((await params).publicId); if (!report) notFound();
  const buildHref = `/workspace?sourceUrl=${encodeURIComponent(report.sourceUrl)}&niche=${encodeURIComponent(report.niche)}&usp=${encodeURIComponent(report.usp)}&origin=${encodeURIComponent(`report:${report.publicId}`)}`;
  return <main><PublicHeader /><article className="public-report"><Link className="back-link" href="/blueprints"><ArrowLeft size={15} /> Explore blueprints</Link><header><span>PUBLIC BUILD REPORT</span><h1>{report.productName}</h1><p>{report.summary}</p><div className="report-thesis"><span><Target /> NICHE</span><b>{report.niche}</b><span><Layers3 /> REASON TO CHOOSE IT</span><b>{report.usp}</b></div><PublicActions title={report.productName} text={`I mapped ${new URL(report.sourceUrl).hostname.replace(/^www\./, "")} into ${report.productName} for ${report.niche}.`} buildHref={buildHref} publicId={report.publicId} trackView="public_report_view" /></header><section className="report-grid"><div><span>WHO IT SERVES</span><ul>{report.icp.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul></div><div><span>CORE JOBS</span><ul>{report.coreJobs.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul></div></section><section className="report-flows"><span>APPROVED PRODUCT FLOWS</span>{report.productFlows.map((flow, index) => <article key={flow.name}><b>{String(index + 1).padStart(2, "0")}</b><div><h2>{flow.name}</h2><p>{flow.steps.join(" → ")}</p></div></article>)}</section><section className="report-features"><span>FEATURE DECISIONS</span><div>{report.features.slice(0, 12).map((feature) => <article key={feature.name}><b className={feature.disposition}>{feature.disposition}</b><h3>{feature.name}</h3><p>{feature.rationale}</p></article>)}</div></section><section className="remix-band"><GitFork /><div><span>MAKE IT YOURS</span><h2>Keep the logic. Change the niche.</h2><p>This public report shares the approved product model—not the owner’s paid prompt sequence. Remix it to choose your own audience, USP, and build target.</p></div><Link className="button primary" href={buildHref}>Remix this blueprint <ArrowRight size={16} /></Link></section></article><PublicFooter /></main>;
}
