import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for Docker (see Dockerfile.web):
  // `next build` emits .next/standalone/server.js with only the needed deps.
  output: "standalone",
  // NOTE: do NOT add pdf-parse to serverExternalPackages. That was tried and it
  // is what broke PDF extraction in production: marking it external stops Next
  // bundling it, but nothing then copies it into the standalone runtime image,
  // so `import("pdf-parse")` threw ERR_MODULE_NOT_FOUND inside the container
  // while working perfectly in local dev. Verified by SSHing into the running
  // service. Left to Next's file tracing, the package is included and resolves.
};

export default nextConfig;
