import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import { grantException, listExceptions, revokeException } from "@/lib/gates";

// Per-student reopen exceptions (instructor). An exception makes one target
// available to one student regardless of its gate states — see lib/gates.
//   GET    ?targetType=assignment&targetId=asg_x        → list with emails
//   POST   { email, targetType, targetId, expiresAt? }  → grant (upsert)
//   DELETE ?targetType=assignment&targetId=asg_x&userId → revoke

const targetSchema = z.object({
  targetType: z.enum(["session", "material", "assignment", "quiz", "app_review"]),
  targetId: z.string().min(1),
});

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const parsed = targetSchema.safeParse({
      targetType: url.searchParams.get("targetType"),
      targetId: url.searchParams.get("targetId"),
    });
    if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });
    const exceptions = await listExceptions(parsed.data.targetType, parsed.data.targetId);
    return Response.json({ exceptions });
  },
  { role: "instructor" },
);

const grantSchema = targetSchema.extend({
  email: z.string().email(),
  expiresAt: z.iso.datetime().optional(),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = grantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { email, targetType, targetId, expiresAt } = parsed.data;

    const student = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, sectionId: true },
    });
    if (!student) return Response.json({ error: `No user with email ${email}` }, { status: 404 });

    await grantException({
      targetType,
      targetId,
      sectionId: student.sectionId ?? "",
      userId: student.id,
      grantedBy: user.userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    return Response.json({ ok: true, userId: student.id, email: student.email, name: student.name });
  },
  { role: "instructor" },
);

export const DELETE = withAuth(
  async (req, { user }) => {
    const url = new URL(req.url);
    const parsed = targetSchema
      .extend({ userId: z.string().min(1) })
      .safeParse({
        targetType: url.searchParams.get("targetType"),
        targetId: url.searchParams.get("targetId"),
        userId: url.searchParams.get("userId"),
      });
    if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });
    await revokeException({ ...parsed.data, actorId: user.userId });
    return Response.json({ ok: true });
  },
  { role: "instructor" },
);
