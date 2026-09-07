import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VIDEO_LOST_FLAG } from "@/lib/interview/video";

// The student's camera track ended mid-interview. The conversation continues
// on audio; this records that the recording is incomplete so an instructor
// reviewing it later knows why, and so it can be weighed in a fraud review.
//
// Owner-or-404, and idempotent: a flapping camera fires this repeatedly.
// The grading model never writes systemFlags — it cannot observe a track
// ending, and must not be able to clear one.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ interviewId: z.string().min(1) }).strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const interview = await prisma.interview.findFirst({
    where: { id: parsed.data.interviewId, userId: user.userId },
    select: { id: true, systemFlags: true },
  });
  if (!interview) return Response.json({ error: "Interview not found." }, { status: 404 });

  if (!interview.systemFlags.includes(VIDEO_LOST_FLAG)) {
    await prisma.interview.update({
      where: { id: interview.id },
      data: { systemFlags: { push: VIDEO_LOST_FLAG } },
    });
  }
  return Response.json({ ok: true, flagged: true });
});
