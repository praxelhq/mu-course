import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import {
  completeInterview,
  dialogAvailable,
  getInterviewState,
  nextQuestion,
  startInterview,
} from "@/lib/interview/session";

// POST /api/interview/start: window/attempt guards, creates the live
// interview (system prompt stored as turn 0) and asks the first question.
// If the student already has a LIVE interview, this resumes it instead — the
// R17 guarantee means a page reload never burns the attempt.

export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  try {
    // Resume path: an interview already in flight is returned, not recreated.
    const existing = await prisma.interview.findFirst({
      where: { userId: user.userId, status: "live" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      let state = await getInterviewState(existing.id, user.userId);
      // Crash-mid-turn recovery (R17): if the student's answer persisted but the
      // agent's next question never landed (a crash in the Gemini/TTS window),
      // the transcript ends on a student turn with no pending question — /answer
      // would 409 forever. nextQuestion is idempotent for the agent-turn-last
      // case, so regenerate the question (completing if the budget says done).
      if (state.status === "live" && !state.pendingQuestion) {
        const last = state.turns[state.turns.length - 1];
        if (last && last.speaker === "student") {
          const q = await nextQuestion(existing.id);
          if (q.done) await completeInterview(existing.id, user.userId);
          state = await getInterviewState(existing.id, user.userId);
        }
      }
      return Response.json({ resumed: true, state });
    }

    // Fail BEFORE creating anything when no question source exists — never
    // leave a half-created interview that would block a later clean start.
    if (!dialogAvailable()) {
      return Response.json(
        {
          error:
            "The interview service is not available right now — please tell your instructor.",
        },
        { status: 503 },
      );
    }

    const interview = await startInterview(user.userId);
    const question = await nextQuestion(interview.id);
    const state = await getInterviewState(interview.id, user.userId);
    return Response.json({ resumed: false, interview, question, state });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
