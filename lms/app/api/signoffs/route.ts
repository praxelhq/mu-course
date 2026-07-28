import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// U8 — company sign-off capture (instructor): per-team status + note +
// optional evidence key (uploaded via /api/uploads/signoff-url into the
// signoffs/{teamId}/ namespace). Upsert + AuditLog in one transaction.
// U15 reads these rows for the completion exports.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teamId: z.string().min(1),
  status: z.enum(["none", "contacted", "signed_off"]),
  note: z.string().max(2000).nullable().optional(),
  evidenceS3Key: z.string().max(500).nullable().optional(),
  assignmentId: z.string().nullable().optional(),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { teamId, status, note, evidenceS3Key, assignmentId } = parsed.data;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return Response.json({ error: "Unknown team" }, { status: 404 });
    if (evidenceS3Key && !evidenceS3Key.startsWith(`signoffs/${teamId}/`)) {
      return Response.json({ error: "Evidence key outside the team's namespace" }, { status: 403 });
    }

    const signOff = await prisma.$transaction(async (tx) => {
      const before = await tx.signOff.findUnique({ where: { teamId } });
      const data = {
        status,
        note: note ?? null,
        evidenceS3Key: evidenceS3Key ?? before?.evidenceS3Key ?? null,
        assignmentId: assignmentId ?? before?.assignmentId ?? null,
        recordedBy: user.userId,
      };
      const row = await tx.signOff.upsert({
        where: { teamId },
        update: data,
        create: { teamId, ...data },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.userId,
          action: "signoff.set",
          targetType: "team",
          targetId: teamId,
          before: before
            ? { status: before.status, note: before.note, evidenceS3Key: before.evidenceS3Key }
            : undefined,
          after: { status, note: note ?? null, evidenceS3Key: data.evidenceS3Key },
        },
      });
      return row;
    });

    return Response.json({
      signOff: {
        teamId: signOff.teamId,
        status: signOff.status,
        note: signOff.note,
        evidenceS3Key: signOff.evidenceS3Key,
      },
    });
  },
  { role: "instructor" },
);
