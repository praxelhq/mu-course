import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Instructor featuring surface. Featuring is the explicit act that
// exposes a workflow item's company-engagement files on the wall, so every
// change lands in the AuditLog ('gallery.feature' / 'gallery.unfeature';
// caption-only edits log 'gallery.caption').

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    galleryItemId: z.string().min(1),
    featured: z.boolean().optional(),
    caption: z.string().max(500).nullable().optional(),
  })
  .refine((b) => b.featured !== undefined || b.caption !== undefined, {
    message: "Nothing to change",
  });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { galleryItemId, featured? and/or caption? }" },
        { status: 400 },
      );
    }
    const { galleryItemId, featured, caption } = parsed.data;

    const item = await prisma.galleryItem.findUnique({ where: { id: galleryItemId } });
    if (!item) return Response.json({ error: "Unknown gallery item" }, { status: 404 });

    const updated = await prisma.galleryItem.update({
      where: { id: galleryItemId },
      data: {
        ...(featured !== undefined ? { featured } : {}),
        ...(caption !== undefined ? { caption } : {}),
      },
    });

    const action =
      featured === undefined
        ? "gallery.caption"
        : featured
          ? "gallery.feature"
          : "gallery.unfeature";
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action,
        targetType: "galleryItem",
        targetId: galleryItemId,
        before: { featured: item.featured, caption: item.caption },
        after: { featured: updated.featured, caption: updated.caption },
      },
    });

    return Response.json({
      ok: true,
      item: { id: updated.id, featured: updated.featured, caption: updated.caption },
    });
  },
  { role: "instructor" },
);
