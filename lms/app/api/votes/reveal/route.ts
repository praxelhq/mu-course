import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setReveal } from "@/lib/votes";

// Instructor reveal toggle: makes vote counts + the leaderboard visible to
// students of one section for one gallery assignment. Audited.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  sectionId: z.string().min(1),
  revealed: z.boolean(),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "expected { assignmentId, sectionId, revealed }" }, { status: 400 });
    }
    const { assignmentId, sectionId, revealed } = parsed.data;
    await setReveal(assignmentId, sectionId, revealed);
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: revealed ? "votes.reveal" : "votes.hide",
        targetType: "assignment",
        targetId: assignmentId,
        after: { sectionId, revealed },
      },
    });
    return Response.json({ ok: true });
  },
  { role: "instructor" },
);
