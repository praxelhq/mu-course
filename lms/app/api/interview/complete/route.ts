import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import { completeInterview } from "@/lib/interview/session";

// U12 — POST /api/interview/complete: student ends the interview early (or
// the client confirms a budget-forced end). Enqueues grade.interview.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ interviewId: z.string().min(1) });

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    await completeInterview(parsed.data.interviewId, user.userId);
    return Response.json({ done: true });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
