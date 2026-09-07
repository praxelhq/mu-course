import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { instructorReplyDraft, progressFromTurns } from "@/lib/interview/escalation";

// Instructor reopens a dropped interview: grants one retake (idempotent — a
// second click must not stack unused grants) and returns a reply draft
// carrying what the student already covered, so they are not asked to repeat
// it. The draft never carries a score.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ interviewId: z.string().min(1) }).strict();

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

    const interview = await prisma.interview.findUnique({
      where: { id: parsed.data.interviewId },
      select: {
        id: true,
        attemptNumber: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
        turns: { orderBy: { turnNo: "asc" }, select: { speaker: true, meta: true } },
      },
    });
    if (!interview) return Response.json({ error: "Interview not found" }, { status: 404 });

    const existing = await prisma.interviewRetake.findFirst({
      where: { userId: interview.user.id, usedByInterviewId: null },
      select: { id: true },
    });
    if (!existing) {
      await prisma.$transaction([
        prisma.interviewRetake.create({
          data: { userId: interview.user.id, grantedBy: user.userId },
        }),
        prisma.auditLog.create({
          data: {
            actorId: user.userId,
            action: "interview.regenerate",
            targetType: "interview",
            targetId: interview.id,
            before: {},
            after: { userId: interview.user.id },
          },
        }),
      ]);
    }

    const interviewUrl = `${process.env.APP_URL ?? ""}/interview`;
    const draft = instructorReplyDraft({
      progress: progressFromTurns({
        interviewId: interview.id,
        attemptNumber: interview.attemptNumber,
        createdAt: interview.createdAt,
        turns: interview.turns,
      }),
      studentName: interview.user.name.split(" ")[0] ?? interview.user.name,
      interviewUrl,
    });

    return Response.json({ ok: true, alreadyGranted: Boolean(existing), draft, interviewUrl });
  },
  { role: "instructor" },
);
