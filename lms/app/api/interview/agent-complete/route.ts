import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  commitInterviewRecording,
  commitInterviewVideo,
} from "@/lib/interview/audio-storage";
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
    videoS3Key: z.string().min(1).max(500).optional(),
    videoReservationId: z.string().min(1).max(500).optional(),
    /** True only from the agent's normal end path. Absent/false = shutdown. */
    finished: z.boolean().optional(),
  })
  .refine((body) => Boolean(body.audioS3Key) === Boolean(body.audioReservationId))
  .refine((body) => Boolean(body.videoS3Key) === Boolean(body.videoReservationId));

export async function POST(req: Request): Promise<Response> {
  const denied = agentAuthResponse(req);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, audioS3Key, audioReservationId, videoS3Key, videoReservationId, finished } =
    parsed.data;

  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { userId: true, transport: true, status: true },
    });
    if (!interview) return Response.json({ error: "Interview not found." }, { status: 404 });

    if (audioS3Key && audioReservationId) {
      // The recording must live in this interview's own namespace.
      if (!audioS3Key.startsWith(`interviews/${interviewId}/`)) {
        return Response.json({ error: "audioS3Key outside interview namespace" }, { status: 400 });
      }
      await commitInterviewRecording({ interviewId, reservationId: audioReservationId, s3Key: audioS3Key });
    }

    if (videoS3Key && videoReservationId) {
      if (!videoS3Key.startsWith(`interviews/${interviewId}/`)) {
        return Response.json({ error: "videoS3Key outside interview namespace" }, { status: 400 });
      }
      await commitInterviewVideo({ interviewId, reservationId: videoReservationId, s3Key: videoS3Key });
    }

    // The recording is always committed above; completion is not automatic.
    //
    // Two ways this route used to end an interview it had no business ending:
    // the agent posts here from its SHUTDOWN callback, so a worker restart, a
    // deploy, or a student refreshing the page marked them complete and sent a
    // fragment to grading; and once a student had degraded to the turn-based
    // loop the agent was no longer the thing conducting their interview, yet
    // its shutdown still finished it underneath them.
    if (!finished) {
      return Response.json({ ok: true, completed: false, reason: "recording-only" });
    }
    if (interview.transport && interview.transport !== "realtime") {
      return Response.json({ ok: true, completed: false, reason: "not-realtime" });
    }

    await completeInterview(interviewId, interview.userId);
    return Response.json({ ok: true, completed: true });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
