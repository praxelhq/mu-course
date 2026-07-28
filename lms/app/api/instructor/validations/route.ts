import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendValidation } from "@/lib/portfolio";

// U16 — instructor-entered portfolio validations (v1: students cannot request
// peer validation in-product; instructors/admins record both kinds — see
// docs/DECISIONS.md). Appends {kind, by, note, at} to the student's
// PortfolioEntry.validations and audit-logs the act.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  kind: z.enum(["external", "peer"]),
  note: z.string().min(1).max(1000),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { userId, kind: external|peer, note }" },
        { status: 400 },
      );
    }
    const { userId, kind, note } = parsed.data;

    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!student || student.role !== "student") {
      return Response.json({ error: "Unknown student" }, { status: 404 });
    }

    const validation = { kind, by: user.email, note, at: new Date().toISOString() };
    const all = await appendValidation(userId, validation);
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "validation-added",
        targetType: "portfolio",
        targetId: userId,
        after: validation,
      },
    });
    return Response.json({ ok: true, count: all.length });
  },
  { role: "instructor" },
);
