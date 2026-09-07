import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";

// Instructor material management: PATCH toggles (sectionIds / instructorOnly
// / title), DELETE removes the row plus its session-page ordering entry and
// gate rows, with an AuditLog record for both.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  sectionIds: z.array(z.string().min(1)).optional(),
  instructorOnly: z.boolean().optional(),
});

export const PATCH = withAuth<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const material = await prisma.$transaction(async (tx) => {
      const updated = await tx.material.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({
        data: {
          actorId: user.userId,
          action: "material.update",
          targetType: "material",
          targetId: id,
          before: {
            title: existing.title,
            sectionIds: existing.sectionIds,
            instructorOnly: existing.instructorOnly,
          },
          after: {
            title: updated.title,
            sectionIds: updated.sectionIds,
            instructorOnly: updated.instructorOnly,
          },
        },
      });
      return updated;
    });
    return Response.json({ material });
  },
  { role: "instructor" },
);

export const DELETE = withAuth<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      const page = await tx.sessionPage.findUnique({
        where: { sessionNo: existing.sessionNo },
        select: { id: true, orderedMaterialIds: true },
      });
      if (page?.orderedMaterialIds.includes(id)) {
        await tx.sessionPage.update({
          where: { id: page.id },
          data: { orderedMaterialIds: page.orderedMaterialIds.filter((m) => m !== id) },
        });
      }
      await tx.gate.deleteMany({ where: { targetType: "material", targetId: id } });
      await tx.gateException.deleteMany({ where: { targetType: "material", targetId: id } });
      await tx.material.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: user.userId,
          action: "material.delete",
          targetType: "material",
          targetId: id,
          before: {
            title: existing.title,
            kind: existing.kind,
            sessionNo: existing.sessionNo,
            s3Key: existing.s3Key,
          },
        },
      });
    });
    return Response.json({ ok: true });
  },
  { role: "instructor" },
);
