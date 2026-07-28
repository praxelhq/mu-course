import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewErrorResponse } from "@/lib/interview/http";
import { InterviewNotFoundError } from "@/lib/interview/session";
import { presignGet } from "@/lib/s3";

// U12 — GET /api/interview/question-audio?id=&turnNo=: short-TTL presigned GET
// for one turn's TTS mp3 (or a student answer clip on the instructor's behalf
// this route stays student/owner-only; instructors presign in their pages).

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const turnNo = Number(params.get("turnNo"));
  if (!id || !Number.isInteger(turnNo)) {
    return Response.json({ error: "Missing id / turnNo" }, { status: 400 });
  }
  try {
    const interview = await prisma.interview.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!interview || interview.userId !== user.userId) throw new InterviewNotFoundError();
    const turn = await prisma.interviewTurn.findUnique({
      where: { interviewId_turnNo: { interviewId: id, turnNo } },
      select: { audioS3Key: true },
    });
    if (!turn?.audioS3Key) throw new InterviewNotFoundError();
    const url = await presignGet(turn.audioS3Key);
    return Response.json({ url });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
