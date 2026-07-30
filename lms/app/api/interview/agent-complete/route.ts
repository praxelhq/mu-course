import { z } from "zod";
import { prisma } from "@/lib/db";
import { commitInterviewRecording } from "@/lib/interview/audio-storage";
import { interviewErrorResponse } from "@/lib/interview/http";
import { agentAuthResponse } from "@/lib/interview/realtime";
import { completeInterview } from "@/lib/interview/session";

// POST /api/interview/agent-complete: the Python agent ends the
// interview (LLM signalled done, or the 12-minute budget). Stores the Egress
// room recording key when provided, marks completed and enqueues grading via
// the U12 completeInterview (idempotent on repeats). X-Agent-Token guarded.
// The agent stops its own Egress — the LMS only records the resulting key.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    interviewId: z.string().min(1),
    /** Room-composite Egress output reserved before recording starts. */
    audioS3Key: z.string().min(1).max(500).optional(),
    audioReservationId: z.string().min(1).max(500).optional(),
  })
  .refine((body) => Boolean(body.audioS3Key) === Boolean(body.audioReservationId));

export async function POST(req: Request): Promise<Response> {
  const denied = agentAuthResponse(req);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, audioS3Key, audioReservationId } = parsed.data;

  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { userId: true },
    });
    if (!interview) return Response.json({ error: "Interview not found." }, { status: 404 });

    if (audioS3Key && audioReservationId) {
      // The recording must live in this interview's own namespace.
      if (!audioS3Key.startsWith(`interviews/${interviewId}/`)) {
        return Response.json({ error: "audioS3Key outside interview namespace" }, { status: 400 });
      }
      await commitInterviewRecording({ interviewId, reservationId: audioReservationId, s3Key: audioS3Key });
    }

    await completeInterview(interviewId, interview.userId);
    return Response.json({ ok: true });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
