import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewOpen, setInterviewOpen } from "@/lib/interview/rollout";

// Instructor-controlled open/close for the whole interview v2 flow. Default is
// closed, so deploying the feature never opens it. Audited.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ open: z.boolean() }).strict();

export const GET = withAuth(
  async () => Response.json({ open: await interviewOpen() }),
  { role: "instructor" },
);

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const before = await interviewOpen();
    await setInterviewOpen(parsed.data.open);
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "interview.rollout",
        targetType: "config",
        targetId: "interview_v2",
        before: { open: before },
        after: { open: parsed.data.open },
      },
    });
    return Response.json({ open: parsed.data.open });
  },
  { role: "instructor" },
);
