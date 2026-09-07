import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import { s3Configured } from "@/lib/s3";

// Instructor material creation (step 2 after the direct-to-S3 PUT, or a
// link-kind material with no file). The new row joins its session page's
// orderedMaterialIds so hubs and bulk gate actions see it. New materials
// start with no gate row — locked — until the Unlock Console opens them.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sessionNo: z.number().int().min(1).max(10),
    title: z.string().min(1).max(300),
    kind: z.enum(["dataset", "schema-pack", "lab-sheet", "deck", "link"]),
    s3Key: z.string().min(1).optional(),
    externalUrl: z.url().optional(),
    sizeBytes: z.number().int().positive().optional(),
    sectionIds: z.array(z.string().min(1)).optional(),
    instructorOnly: z.boolean().optional(),
  })
  .refine((b) => (b.kind === "link" ? Boolean(b.externalUrl) : Boolean(b.s3Key)), {
    message: "link materials need externalUrl; file materials need s3Key",
  });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const body = parsed.data;

    // Without storage configured, only link materials can be created — a
    // file row would point at an object that cannot exist yet.
    if (body.kind !== "link" && !s3Configured()) {
      return Response.json({ error: "Storage not configured" }, { status: 503 });
    }

    const page = await prisma.sessionPage.findUnique({
      where: { sessionNo: body.sessionNo },
      select: { id: true, orderedMaterialIds: true },
    });
    if (!page) return Response.json({ error: "Unknown session" }, { status: 404 });

    const sectionIds =
      body.sectionIds ?? (await prisma.section.findMany({ select: { id: true } })).map((s) => s.id);

    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.material.create({
        data: {
          sessionNo: body.sessionNo,
          title: body.title,
          kind: body.kind,
          s3Key: body.kind === "link" ? null : body.s3Key,
          externalUrl: body.kind === "link" ? body.externalUrl : null,
          sizeBytes: body.sizeBytes ?? null,
          sectionIds,
          instructorOnly: body.instructorOnly ?? false,
        },
      });
      await tx.sessionPage.update({
        where: { id: page.id },
        data: { orderedMaterialIds: [...page.orderedMaterialIds, created.id] },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.userId,
          action: "material.create",
          targetType: "material",
          targetId: created.id,
          after: { title: created.title, kind: created.kind, sessionNo: created.sessionNo },
        },
      });
      return created;
    });

    return Response.json({ material });
  },
  { role: "instructor" },
);
