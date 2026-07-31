import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#090b0d", background: "#c7ff22", fontSize: 118, fontWeight: 900, letterSpacing: "-0.08em", borderRadius: 36 }}>V</div>, size);
}
