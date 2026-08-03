import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { backfillGalleryItems } from "@/lib/galleries";
import { enqueueScreenshotCapture } from "@/lib/queue";

// Admin backfill for screenshot capture. POST {submissionId} re-enqueues
// one capture; POST {all:true} runs the gallery backfill and re-enqueues every
// app-wall item's current submission (U16 surfaces failures from the queue).

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    submissionId: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.submissionId) !== Boolean(b.all), {
    message: "Pass exactly one of submissionId or all",
  });

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { submissionId } or { all: true }" },
        { status: 400 },
      );
    }

    let targets: string[] = [];
    if (parsed.data.submissionId) {
      const sub = await prisma.submission.findUnique({
        where: { id: parsed.data.submissionId },
        select: { id: true, assignment: { select: { assignmentType: { select: { slug: true } } } } },
      });
      if (!sub) return Response.json({ error: "Unknown submission" }, { status: 404 });
      if (sub.assignment.assignmentType.slug !== "app") {
        return Response.json(
          { error: "Screenshots are captured for app-type submissions only" },
          { status: 409 },
        );
      }
      targets = [sub.id];
    } else {
      await backfillGalleryItems();
      const items = await prisma.galleryItem.findMany({
        where: {
          submission: { assignment: { assignmentType: { slug: "app" } } },
        },
        select: { submissionId: true },
      });
      targets = items.map((i) => i.submissionId);
    }

    let enqueued = 0;
    for (const id of targets) {
      if (await enqueueScreenshotCapture(id)) enqueued++;
    }
    if (targets.length > 0 && enqueued === 0) {
      return Response.json({ error: "Queue unavailable — retry shortly" }, { status: 503 });
    }
    return Response.json({ ok: true, enqueued, targets: targets.length });
  },
  { role: "admin" },
);
