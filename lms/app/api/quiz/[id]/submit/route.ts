import { withAuth } from "@/lib/auth";
import { submitQuizAttempt } from "@/lib/quizzes";

// POST /api/quiz/[id]/submit — auto-graded submission via the single student
// repository module. Write-path friendly: one row insert, the (quizId,userId)
// unique constraint is the idempotency guard. A double submit answers 409
// WITH the original result. A submit within the grace window after gate close
// is accepted.

export const dynamic = "force-dynamic";

export const POST = withAuth<{ params: Promise<{ id: string }> }>(async (req, { params, user }) => {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { answers?: unknown } | null;
  const outcome = await submitQuizAttempt(user.userId, id, body?.answers);

  switch (outcome.status) {
    case "ok":
      return Response.json({ status: "ok", result: outcome.result });
    case "duplicate":
      return Response.json({ status: "duplicate", result: outcome.result }, { status: 409 });
    case "received":
      return Response.json({ status: "ok", receipt: outcome.receipt });
    case "duplicate_received":
      return Response.json(
        { status: "duplicate", receipt: outcome.receipt },
        { status: 409 },
      );
    case "invalid":
      return Response.json({ status: "invalid", error: outcome.message }, { status: 422 });
    case "closed":
      return Response.json(
        { status: "closed", error: "This quiz has closed and is no longer accepting answers." },
        { status: 409 },
      );
    case "not_available":
      return Response.json({ status: "not_available" }, { status: 404 });
  }
});
