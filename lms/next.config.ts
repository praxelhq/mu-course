import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for Docker (see Dockerfile.web):
  // `next build` emits .next/standalone/server.js with only the needed deps.
  output: "standalone",
};

export default nextConfig;
