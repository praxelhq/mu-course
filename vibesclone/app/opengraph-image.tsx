import { ImageResponse } from "next/og";

export const alt = "VibesClone — Copy the product logic. Build your version.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "#f4f0e7", background: "#090b0d", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: "0.12em" }}><span style={{ color: "#c7ff22" }}>VIBES</span>CLONE</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}><div style={{ display: "flex", color: "#c7ff22", fontSize: 17, letterSpacing: "0.12em" }}>PRODUCT URL → VERIFIED BUILD PLAN</div><div style={{ display: "flex", maxWidth: 980, fontSize: 82, lineHeight: .94, letterSpacing: "-0.055em", fontWeight: 760 }}>Copy the product logic.<br />Build your version.</div></div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 24, borderTop: "1px solid #30363b", color: "#969b9f", fontSize: 20 }}><span>Analyze · Verify · Approve · Build</span><span style={{ color: "#c7ff22" }}>vibesclone.com</span></div>
    </div>, size,
  );
}
