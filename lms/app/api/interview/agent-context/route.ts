import { prisma } from "@/lib/db";
import {
  reserveInterviewRecording,
  reserveInterviewVideo,
} from "@/lib/interview/audio-storage";
import { agentAuthResponse } from "@/lib/interview/realtime";

// GET /api/interview/agent-context?interviewId=: the Python agent reads
// the assembled system prompt (turn 0) and the transcript so far without any
// DB access of its own. X-Agent-Token guarded (constant-time).

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = agentAuthResponse(req);
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const interviewId = params.get("interviewId");
  if (!interviewId) return Response.json({ error: "Missing interviewId" }, { status: 400 });

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { turnNo: "asc" } } },
  });
  if (!interview) return Response.json({ error: "Interview not found." }, { status: 404 });

  const systemPrompt = interview.turns.find((t) => t.turnNo === 0)?.text ?? "";
  const transcript = interview.turns
    .filter((t) => t.turnNo > 0)
    .map((t) => ({ turnNo: t.turnNo, speaker: t.speaker, text: t.text }));
  const recordable =
    params.get("reserveRecording") === "1" &&
    interview.status === "live" &&
    interview.transport === "realtime";

  // Recording is a NICE-TO-HAVE; the interview is the product. A reservation
  // that throws must never reach the agent as a 500, because the agent treats
  // a failed context fetch as fatal and leaves the room — which is exactly how
  // a bad CHECK constraint on the video purpose silently killed every
  // interview. Reserve best-effort; a null reservation simply means the agent
  // records nothing and the conversation still happens.
  async function reserveQuietly<T>(
    what: string,
    reserve: () => Promise<T>,
  ): Promise<T | null> {
    if (!recordable) return null;
    try {
      return await reserve();
    } catch (err) {
      console.error(
        `[agent-context] ${what} reservation failed for ${interviewId}; continuing without it:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  const recordingReservation = await reserveQuietly("audio", () =>
    reserveInterviewRecording(interviewId),
  );
  const videoReservation = await reserveQuietly("video", () =>
    reserveInterviewVideo(interviewId),
  );

  return Response.json({
    interviewId,
    status: interview.status,
    transport: interview.transport,
    systemPrompt,
    transcript,
    recordingReservation: recordingReservation
      ? { id: recordingReservation.id, s3Key: recordingReservation.s3Key }
      : null,
    videoReservation: videoReservation
      ? { id: videoReservation.id, s3Key: videoReservation.s3Key }
      : null,
  });
}
