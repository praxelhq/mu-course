import { readFile } from "node:fs/promises";
import path from "node:path";
import { withAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ASSETS = {
  blueprint: { relativePath: "make/praxelpay-safe-lead-tool.blueprint.json", type: "application/json", download: true },
  "mcp-test-cases": { relativePath: "fixtures/mcp-tool-test-cases.json", type: "application/json", download: false },
  "package-guide": { relativePath: "README.md", type: "text/markdown; charset=utf-8", download: false },
  "source-ledger": { relativePath: "source-ledger.md", type: "text/markdown; charset=utf-8", download: false },
} as const;

export const GET = withAuth<{ params: Promise<{ asset: string }> }>(
  async (_req, { params }) => {
    const { asset } = await params;
    if (!Object.hasOwn(ASSETS, asset)) return new Response("Not found", { status: 404 });
    const entry = ASSETS[asset as keyof typeof ASSETS];
    let body: string;
    try {
      body = await readFile(path.join(process.cwd(), "course", "session-08", entry.relativePath), "utf8");
    } catch {
      return new Response("Session 8 pack is unavailable", { status: 503 });
    }
    const filename = path.basename(entry.relativePath);
    return new Response(body, {
      headers: {
        "content-type": entry.type,
        "content-disposition": `${entry.download ? "attachment" : "inline"}; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  },
  { role: "instructor" },
);
