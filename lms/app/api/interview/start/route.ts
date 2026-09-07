import { withAuth } from "@/lib/auth";
import { rateLimited, takeInterviewToken } from "@/lib/interview/http";

// A stale browser bundle may still ask for the retired turn-based transport.
// Refuse it server-side so it cannot create a manual interview after the
// realtime admission route has verified the agent worker.
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  return Response.json(
    {
      error:
        "This assessment is a live interview. Please return to the live room and reconnect there.",
    },
    { status: 410 },
  );
});
