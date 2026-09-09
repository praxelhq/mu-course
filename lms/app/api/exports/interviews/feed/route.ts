import { createHash, timingSafeEqual } from "node:crypto";
import { buildInterviewScoreCsv } from "@/lib/interview/score-export";

// GET /api/exports/interviews/feed?token=… — the same instructor export, for a
// caller that cannot hold a session: a Google Sheet refreshing itself on a
// timer, which is the only way that sheet stays current without a person.
//
// This carries every student's score, so it is OFF unless INTERVIEW_EXPORT_TOKEN
// is set, and revoking it is one env-var deletion. The token is compared in
// constant time and never echoed back. Read-only by construction.

export const dynamic = "force-dynamic";

function tokenOk(candidate: string | null): boolean {
  const expected = process.env.INTERVIEW_EXPORT_TOKEN;
  if (!expected || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!process.env.INTERVIEW_EXPORT_TOKEN) {
    return Response.json({ error: "Export feed is not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const supplied = url.searchParams.get("token") ?? req.headers.get("x-export-token");
  if (!tokenOk(supplied)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return new Response(await buildInterviewScoreCsv(), {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
  });
}
