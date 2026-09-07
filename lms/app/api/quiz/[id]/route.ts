import { withAuth } from "@/lib/auth";
import { getArmedQuizForStudent } from "@/lib/quizzes";

// GET /api/quiz/[id] — the quiz as presented for taking (no correct answers),
// via the single student repository module. Unavailable states come back as
// the same small status set for every quiz kind.

export const dynamic = "force-dynamic";

export const GET = withAuth<{ params: Promise<{ id: string }> }>(async (_req, { params, user }) => {
  const { id } = await params;
  const result = await getArmedQuizForStudent(user.userId, id);
  if (result.status === "not_available") {
    return Response.json({ status: "not_available" }, { status: 404 });
  }
  return Response.json(result);
});
