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
  return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#f6f7f8", color: "#14171c", padding: "72px", display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif" }}><div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, letterSpacing: 4 }}><b>vibes</b><b style={{ color: "#0e7a43" }}>clone</b> <span style={{ color: "#6b737d" }}>· PUBLIC BUILD REPORT</span></div><div><div style={{ color: "#0e7a43", fontSize: 24, marginBottom: 24 }}>{project.niche}</div><div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>{name}</div><div style={{ fontSize: 30, color: "#3f4650", marginTop: 26 }}>{project.usp}</div></div><div style={{ fontSize: 22, color: "#6b737d" }}>vibesclone.com</div></div>, size);
}
