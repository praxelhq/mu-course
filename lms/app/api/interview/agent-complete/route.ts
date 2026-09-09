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

    // The recording must live in this interview's own namespace.
    if (audioS3Key && !audioS3Key.startsWith(`interviews/${interviewId}/`)) {
      return Response.json({ error: "audioS3Key outside interview namespace" }, { status: 400 });
    }
    if (videoS3Key && !videoS3Key.startsWith(`interviews/${interviewId}/`)) {
      return Response.json({ error: "videoS3Key outside interview namespace" }, { status: 400 });
    }

    // The interview is the product; the recording is an attachment to it.
    //
    // These used to run the other way round, and it cost interviews. The agent
    // calls Egress stop and posts the key immediately, but stop() returns while
    // the MP4 is still uploading — so committing the key does a HEAD on an
    // object S3 does not have yet, throws, and the completion underneath it
    // never ran. The student had already heard "your interview is complete"
    // while their row sat `live` forever: never graded, never swept (the open
    // tab keeps the heartbeat fresh), and costUsd stuck at 0 because grading is
    // the only thing that writes it.
    //
    // So: complete first, attach the recording best-effort. A lost recording is
    // a lost recording. A lost completion is a lost interview.
    const commitRecording = async () => {
      const failures: string[] = [];
      if (audioS3Key && audioReservationId) {
        try {
          await commitInterviewRecording({
            interviewId,
            reservationId: audioReservationId,
            s3Key: audioS3Key,
          });
        } catch (err) {
          failures.push("audio");
          console.error(`[agent-complete] audio commit failed for ${interviewId}:`, err);
        }
      }
      if (videoS3Key && videoReservationId) {
        try {
          await commitInterviewVideo({
            interviewId,
            reservationId: videoReservationId,
            s3Key: videoS3Key,
          });
        } catch (err) {
          failures.push("video");
          console.error(`[agent-complete] video commit failed for ${interviewId}:`, err);
        }
      }
      return failures;
    };

    // Completion is not automatic.
    //
    // Two ways this route used to end an interview it had no business ending:
    // the agent posts here from its SHUTDOWN callback, so a worker restart, a
    // deploy, or a student refreshing the page marked them complete and sent a
    // fragment to grading; and once a student had degraded to the turn-based
    // loop the agent was no longer the thing conducting their interview, yet
    // its shutdown still finished it underneath them.
    if (!finished) {
      const recordingFailures = await commitRecording();
      return Response.json({
        ok: true,
        completed: false,
        reason: "recording-only",
        recordingFailures,
      });
    }
    if (interview.transport && interview.transport !== "realtime") {
      const recordingFailures = await commitRecording();
      return Response.json({
        ok: true,
        completed: false,
        reason: "not-realtime",
        recordingFailures,
      });
    }

    await completeInterview(interviewId, interview.userId);
    const recordingFailures = await commitRecording();
    return Response.json({ ok: true, completed: true, recordingFailures });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
