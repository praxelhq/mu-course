import { readFile } from "node:fs/promises";
import path from "node:path";
import { withAuth } from "@/lib/auth";
import { SESSION_8_SIMULATOR_URL } from "@/lib/session-8";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async () => {
    let html: string;
    try {
      html = await readFile(
        path.join(process.cwd(), "course", "session-08", "session-08-rag-mcp-instructor.html"),
        "utf8",
      );
      html = html.replaceAll(
        "https://rag-simulator-production.up.railway.app/experiment",
        SESSION_8_SIMULATOR_URL,
      );
    } catch {
      return new Response("Session 8 pack is unavailable", { status: 503 });
    }
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        "x-content-type-options": "nosniff",
      },
    });
  },
  { role: "instructor" },
);
