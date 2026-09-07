import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildInterviewResult } from "@/lib/interview/result";

// The student's own interview result. Scoped to the caller — there is no id
// parameter, so there is nothing to enumerate. The response body is built by
// buildInterviewResult, which allow-lists the readable fields; confidence,
// escalation reason and both sets of integrity flags never reach this tier.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { user }) => {
  const interview = await prisma.interview.findFirst({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    select: { status: true, rubricScores: true, completedAt: true },
  });
  return Response.json(buildInterviewResult(interview));
});
