import { withAuth } from "@/lib/auth";
import { interviewErrorResponse } from "@/lib/interview/http";
import { getInterviewState } from "@/lib/interview/session";

// U12 — GET /api/interview/state?id=: full transcript + pending question,
// owner only. This is the resume endpoint (R17): a dropped connection reloads
// exactly where it stopped.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    const state = await getInterviewState(id, user.userId);
    return Response.json({ state });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
