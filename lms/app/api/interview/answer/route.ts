import { withAuth } from "@/lib/auth";
import { rateLimited, takeInterviewToken } from "@/lib/interview/http";

// The retired recorder endpoint remains as a server-side stop for stale
// assets. Realtime agent turns are persisted through /agent-turn instead.
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  return Response.json(
    {
      error:
        "Manual recorded answers are disabled for this live interview. Please reconnect to the real-time room.",
    },
    { status: 410 },
  );
});
