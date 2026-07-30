import { z } from "zod";
import { prisma } from "@/lib/db";
import { interviewErrorResponse } from "@/lib/interview/http";
import { TRANSPORT_REALTIME, agentAuthResponse, touchHeartbeat } from "@/lib/interview/realtime";
import { appendTurnFromAgent } from "@/lib/interview/session";

// POST /api/interview/agent-turn: the Python agent persists each
// finalized utterance through the SAME transactional path as U12
// (appendTurnFromAgent) — one ordered transcript regardless of transport.
// Guarded by X-Agent-Token (constant-time compare vs AGENT_INTERNAL_TOKEN);
// only live realtime interviews accept agent turns. Doubles as a heartbeat.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  interviewId: z.string().min(1),
  speaker: z.enum(["agent", "student"]),
  text: z.string().min(1).max(16_000),
});

export async function POST(req: Request): Promise<Response> {
  const denied = agentAuthResponse(req);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, speaker, text } = parsed.data;

  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { status: true, transport: true },
    });
    if (!interview) return Response.json({ error: "Interview not found." }, { status: 404 });
    if (interview.transport !== TRANSPORT_REALTIME) {
      // After a fallback flip the turn-based loop owns the transcript — a
      // straggling agent post must not interleave with it.
      return Response.json(
        { error: `Interview transport is '${interview.transport}' — agent turns rejected.` },
        { status: 409 },
      );
    }
    const turn = await appendTurnFromAgent({ interviewId, speaker, text });
    await touchHeartbeat(interviewId);
    return Response.json({ ok: true, turnNo: turn.turnNo });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
}
