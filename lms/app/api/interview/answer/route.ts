import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import { completeInterview, nextQuestion, submitAnswer } from "@/lib/interview/session";

// POST /api/interview/answer: persist the student's answer (audio →
// transcribed, or typed text in the dev/text fallback), then auto-advance:
// returns the next question, or {done:true} after completing the interview
// when the budget/model says the session is over.

export const dynamic = "force-dynamic";

/**
 * Typed answers are a dev/text fallback only — the same gating the UI uses to
 * offer the text box (NEXT_PUBLIC_INTERVIEW_TEXT_MODE) plus the dev envs. In
 * production without a flag, a graded viva must be spoken, never typed: a
 * text-only body is refused so a student cannot complete the interview with
 * un-timed, un-recorded typed answers and no audio artifact to review.
 */
export function textAnswersAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.NEXT_PUBLIC_INTERVIEW_TEXT_MODE === "1") return true;
  return ["1", "true", "yes", "on"].includes(
    (process.env.INTERVIEW_DEV_SCRIPTED ?? "").toLowerCase(),
  );
}

const bodySchema = z
  .object({
    interviewId: z.string().min(1),
    audioS3Key: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(8000).optional(),
  })
  .refine((b) => b.audioS3Key || b.text, { message: "Provide audioS3Key or text" });

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, audioS3Key, text } = parsed.data;

  // A typed answer with no audio is only accepted in the dev/text fallback.
  if (text && !audioS3Key && !textAnswersAllowed()) {
    return Response.json(
      { error: "Typed answers are not available — please answer by voice." },
      { status: 400 },
    );
  }

  try {
    const answer = await submitAnswer({ interviewId, userId: user.userId, audioS3Key, text });
    const next = await nextQuestion(interviewId);
    if (next.done) {
      await completeInterview(interviewId, user.userId);
      return Response.json({ answer, done: true });
    }
    return Response.json({ answer, done: false, question: next });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
