import { ImageResponse } from "next/og";
import { formatUsd, marketStats, opportunities } from "@/lib/opportunities";

export const alt = "VibesClone — Build what’s already earning.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  const top = opportunities.slice(0, 3);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", color: "#14171c", background: "#f6f7f8", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, border: "3px solid #0e7a43", borderRadius: 11, color: "#0e7a43", fontSize: 18 }}>$_</div><span>vibes</span><span style={{ color: "#0e7a43", marginLeft: -14 }}>clone</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}><div style={{ display: "flex", color: "#0e7a43", fontSize: 18, letterSpacing: "0.12em" }}>VERIFIED REVENUE → BUILD SEQUENCE</div><div style={{ display: "flex", fontSize: 88, lineHeight: 1, letterSpacing: "-0.04em", fontWeight: 800 }}>Build what’s already earning.</div><div style={{ display: "flex", color: "#3f4650", fontSize: 26 }}>{marketStats.over1k.toLocaleString()} indie products make $1k+/month. Pick one. Build yours for a different niche.</div></div>
      <div style={{ display: "flex", gap: 14 }}>{top.map((item) => <div key={item.slug} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 22px", border: "1px solid #e2e5e9", borderRadius: 16, background: "#ffffff" }}><span style={{ fontSize: 22, fontWeight: 700 }}>{item.name}</span><span style={{ marginTop: 6, color: "#0e7a43", fontSize: 30, fontWeight: 800 }}>{formatUsd(item.mrr)}/mo</span></div>)}</div>
    </div>, size,
  );
}
