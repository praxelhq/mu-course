import { withAuth } from "@/lib/auth";
import { rateLimited, takeInterviewToken } from "@/lib/interview/http";

// Do not issue fresh presigned URLs to an obsolete manual-recording client.
// The realtime worker records and persists the interview through its internal
// agent endpoints instead.
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  return Response.json(
    {
      error:
        "Manual answer uploads are disabled for this live interview. Please reconnect to the real-time room.",
    },
    { status: 410 },
  );
});
