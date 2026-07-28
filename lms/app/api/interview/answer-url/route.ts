import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import { InterviewNotFoundError, InterviewNotLiveError } from "@/lib/interview/session";
import {
  INTERVIEW_AUDIO_EXTENSIONS,
  MAX_INTERVIEW_AUDIO_BYTES,
  keyForInterviewAudio,
  presignPut,
} from "@/lib/s3";

// U12 — POST /api/interview/answer-url: presigned PUT for one answer clip.
// audio/webm | audio/mpeg | audio/mp4 only, <=25MB, key
// interviews/{interviewId}/a{turnNo}.{ext}. Owner-only; interview must be live.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  interviewId: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, contentType, sizeBytes } = parsed.data;

  try {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { userId: true, status: true },
    });
    if (!interview || interview.userId !== user.userId) throw new InterviewNotFoundError();
    if (interview.status !== "live") throw new InterviewNotLiveError(interview.status);

    const ext = INTERVIEW_AUDIO_EXTENSIONS[contentType.toLowerCase()];
    if (!ext) {
      return Response.json(
        { error: `Audio type not allowed: ${contentType} (use webm, mp3 or m4a)` },
        { status: 415 },
      );
    }
    if (sizeBytes > MAX_INTERVIEW_AUDIO_BYTES) {
      return Response.json({ error: "Answer clip too large (max 25MB)" }, { status: 413 });
    }

    // The answer will become turn max+1 — name the clip after it.
    const maxTurn = await prisma.interviewTurn.aggregate({
      where: { interviewId },
      _max: { turnNo: true },
    });
    const turnNo = (maxTurn._max.turnNo ?? 0) + 1;
    const key = keyForInterviewAudio(interviewId, "a", turnNo, ext);
    const { url, headers } = await presignPut({ key, contentType, maxBytes: sizeBytes });
    return Response.json({ url, key, headers });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
