import { withAuth } from "@/lib/auth";
import { rateLimited, takeInterviewToken } from "@/lib/interview/http";

// POST /api/interview/complete — retired, like /start, /answer and /fallback.
//
// It let any student end and grade their own interview at any moment. No client
// calls it and the live room has no such control, but it was owner-scoped and
// reachable: a fragment could be sent to grading mid-conversation, the agent's
// subsequent turns would 409 and be dropped, and "my interview cut off" became
// a self-service claim. The agent completes an interview through
// /agent-complete, which is the only path that knows whether one actually
// happened.

export const dynamic = "force-dynamic";

export const POST = withAuth(async (_req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  return Response.json(
    {
      error:
        "A live interview ends on its own. If yours was cut off, ask your instructor for a retake.",
    },
    { status: 410 },
  );
});
