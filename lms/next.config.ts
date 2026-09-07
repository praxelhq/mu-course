import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for Docker (see Dockerfile.web):
  // `next build` emits .next/standalone/server.js with only the needed deps.
  output: "standalone",
  // PDF text extraction deliberately does NOT run in this tier. pdf-parse
  // pulls pdfjs-dist and the native @napi-rs/canvas, whose per-platform binary
  // package Next's tracer does not follow into the standalone output — and the
  // runtime image copies only .next/standalone. Both a serverExternalPackages
  // pin and explicit outputFileTracingIncludes were tried and verified failing
  // against a copy of the bundle taken outside the repo (locally it always
  // "worked", because Node walks up into the project's own node_modules).
  // Extraction therefore happens in the worker, which installs the full
  // dependency tree. See worker/jobs/prepare-prerequisite.ts.

  // NOTE: do NOT add pdf-parse to serverExternalPackages. That was tried and it
  // is what broke PDF extraction in production: marking it external stops Next
  // bundling it, but nothing then copies it into the standalone runtime image,
  // so `import("pdf-parse")` threw ERR_MODULE_NOT_FOUND inside the container
  // while working perfectly in local dev. Verified by SSHing into the running
  // service. Left to Next's file tracing, the package is included and resolves.
};

export default nextConfig;
