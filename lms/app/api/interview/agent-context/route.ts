import { prisma } from "@/lib/db";
import { reserveInterviewRecording } from "@/lib/interview/audio-storage";
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
  const recordingReservation =
    params.get("reserveRecording") === "1" &&
    interview.status === "live" &&
    interview.transport === "realtime"
      ? await reserveInterviewRecording(interviewId)
      : null;

  return Response.json({
    interviewId,
    status: interview.status,
    transport: interview.transport,
    systemPrompt,
    transcript,
    recordingReservation: recordingReservation
      ? { id: recordingReservation.id, s3Key: recordingReservation.s3Key }
      : null,
  });
}
