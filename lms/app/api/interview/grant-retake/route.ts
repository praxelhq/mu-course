import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// U12 — instructor grants one extra interview attempt. The grant admits
// exactly one startInterview (consumed atomically there). Audited.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ userId: z.string().min(1) });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { userId } = parsed.data;

    const student = await prisma.user.findUnique({ where: { id: userId } });
    if (!student) return Response.json({ error: "Student not found" }, { status: 404 });

    const existing = await prisma.interviewRetake.findFirst({
      where: { userId, usedByInterviewId: null },
    });
    if (existing) {
      return Response.json(
        { error: "This student already has an unused retake grant" },
        { status: 409 },
      );
    }

    const [grant] = await prisma.$transaction([
      prisma.interviewRetake.create({
        data: { userId, grantedBy: user.userId },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.userId,
          action: "interview.grant-retake",
          targetType: "user",
          targetId: userId,
          after: { grantedBy: user.userId },
        },
      }),
    ]);
    return Response.json({ ok: true, grantId: grant.id });
  },
  { role: "instructor" },
);
