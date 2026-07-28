import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import {
  TRANSPORT_REALTIME,
  countActiveRealtimeRooms,
  livekitConfigured,
  maxRealtimeRooms,
  mintRoomToken,
} from "@/lib/interview/realtime";
import { startInterview } from "@/lib/interview/session";

// U13 — POST /api/interview/token: the realtime entry point. The server
// decides the transport; the client just tries this first:
//   503 {realtimeUnavailable:true}  → no LIVEKIT env — client runs turn-based
//   429 {waiting:true, activeRooms} → all rooms busy — client shows the
//                                     waiting room and retries
//   200 {turnbased:true}            → a live turnbased interview already
//                                     exists (e.g. after a fallback flip)
//   200 {token,url,roomName,...}    → join the LiveKit room
// Guards (window/attempt/retake) are startInterview's own — identical to U12.

export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  try {
    const now = new Date();

    // Resume path: a live interview in flight is continued, never recreated.
    const existing = await prisma.interview.findFirst({
      where: { userId: user.userId, status: "live" },
      orderBy: { createdAt: "desc" },
      select: { id: true, transport: true },
    });
    if (existing && existing.transport !== TRANSPORT_REALTIME) {
      // Mid-session fallback (or a turn-based start) — continue turn-based.
      return Response.json({ turnbased: true, interviewId: existing.id });
    }

    if (!livekitConfigured()) {
      return Response.json({ realtimeUnavailable: true }, { status: 503 });
    }

    // Concurrency guard: ~30 rooms with a fresh heartbeat. A student resuming
    // their own live room is already counted, so resumes never queue.
    if (!existing) {
      const activeRooms = await countActiveRealtimeRooms(prisma, now);
      if (activeRooms >= maxRealtimeRooms()) {
        return Response.json({ waiting: true, activeRooms }, { status: 429 });
      }
    }

    let interviewId: string;
    if (existing) {
      interviewId = existing.id;
    } else {
      const interview = await startInterview(user.userId); // window/attempt guards
      await prisma.interview.update({
        where: { id: interview.id },
        data: { transport: TRANSPORT_REALTIME, lastSeenAt: now },
      });
      interviewId = interview.id;
    }
    await prisma.interview.updateMany({
      where: { id: interviewId, status: "live" },
      data: { lastSeenAt: now },
    });

    const { token, roomName, url } = await mintRoomToken({
      interviewId,
      identity: user.userId,
    });
    return Response.json({ interviewId, token, roomName, url, resumed: Boolean(existing) });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
