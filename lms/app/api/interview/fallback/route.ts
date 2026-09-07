import { withAuth } from "@/lib/auth";
import { rateLimited, takeInterviewToken } from "@/lib/interview/http";

// Kept as an explicit refusal for stale browser bundles. A graded interview is
// a realtime LiveKit conversation; downgrading it to manual uploads masks an
// outage, bypasses the live interaction contract, and has already stranded
// students on an unconfigured transcription provider.
export const dynamic = "force-dynamic";

export const POST = withAuth(async (_req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  return Response.json(
    {
      error:
        "The live interview connection changed. Please rejoin the real-time room; recording answers here is disabled.",
    },
    { status: 409 },
  );
});
