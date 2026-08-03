import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#090b0d", background: "#c7ff22", fontSize: 22, fontWeight: 900, letterSpacing: "-0.08em" }}>V</div>, size);
}
