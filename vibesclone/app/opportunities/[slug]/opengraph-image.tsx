import { ImageResponse } from "next/og";
import { findOpportunity, founderAudience, formatUsd, opportunities } from "@/lib/opportunities";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Verified revenue and the buildable core, on VibesClone";

export function generateStaticParams() { return opportunities.map(({ slug }) => ({ slug })); }

export default async function Image({ params }: { params: Promise<{ slug: string }> }): Promise<ImageResponse> {
  const item = findOpportunity((await params).slug);
  const name = item?.name ?? "An earning product";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", color: "#14171c", background: "#f6f7f8", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}><span style={{ display: "flex", fontWeight: 700 }}>vibes<span style={{ color: "#0e7a43" }}>clone</span></span><span style={{ color: "#0e7a43", letterSpacing: "0.1em", fontSize: 18 }}>{(item?.category ?? "").toUpperCase()} · VERIFIED REVENUE</span></div>
      <div style={{ display: "flex", flexDirection: "column" }}><div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.02 }}>{name} earns</div><div style={{ display: "flex", color: "#0e7a43", fontSize: 128, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>{item ? `${formatUsd(item.mrr)}/mo` : ""}</div></div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 22, borderTop: "1px solid #e2e5e9", color: "#3f4650", fontSize: 24 }}><span>{item ? `Founder audience: ${founderAudience(item.founderFollowers).toLowerCase()}` : ""}</span><span style={{ color: "#0e7a43" }}>Build your version →</span></div>
    </div>, size,
  );
}
