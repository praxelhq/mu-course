import { withAuth } from "@/lib/auth";
import { getBestOfThreeAvg, getStudentQuizHistory } from "@/lib/quizzes";

// GET /api/quiz/history — the student's quiz record: every attempt with its
// score, whether it counts (best-of-three) or is feedback only, plus the
// current best-of-three average. Served by the single student repository
// module.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { user }) => {
  const now = new Date();
  const [attempts, bestOfThreeAvg] = await Promise.all([
    getStudentQuizHistory(user.userId, now),
    getBestOfThreeAvg(user.userId, now),
  ]);
  return Response.json({ attempts, bestOfThreeAvg });
});
