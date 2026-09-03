import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for Docker (see Dockerfile.web):
  // `next build` emits .next/standalone/server.js with only the needed deps.
  output: "standalone",
  // pdf-parse pulls pdfjs, which resolves worker and font assets at runtime.
  // Bundling it breaks those lookups and every PDF silently extracts to
  // nothing, so keep it external and let Node resolve it from node_modules.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
