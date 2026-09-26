import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { understandingSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const project = await prisma.project.findFirst({ where: { publicId, isPublic: true, publishedAt: { not: null }, publishedVersion: { not: null } }, select: { id: true, niche: true, usp: true, publishedVersion: true } });
  if (!project || project.publishedVersion === null) notFound();
  const version = await prisma.understandingVersion.findUnique({ where: { projectId_version: { projectId: project.id, version: project.publishedVersion } }, select: { content: true } });
  const parsed = understandingSchema.safeParse(version?.content); const name = parsed.success ? parsed.data.productName : "Public build report";
  return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#080c0b", color: "#f5f2ea", padding: "72px", display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif" }}><div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, letterSpacing: 4 }}><b style={{ color: "#bdff16" }}>VIBES</b>CLONE <span style={{ color: "#68706e" }}>· PUBLIC BUILD REPORT</span></div><div><div style={{ color: "#bdff16", fontSize: 24, marginBottom: 24 }}>{project.niche}</div><div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>{name}</div><div style={{ fontSize: 30, color: "#b7bdb9", marginTop: 26 }}>{project.usp}</div></div><div style={{ fontSize: 22, color: "#68706e" }}>vibesclone.com</div></div>, size);
}
