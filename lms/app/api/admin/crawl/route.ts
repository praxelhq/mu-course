import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueuePortfolioCrawl } from "@/lib/queue";

// Admin trigger for the portfolio link-liveness crawl. POST {userId}
// enqueues one student; POST {all:true} enqueues the cohort sweep. The
// worker's 'portfolio.crawl' consumer does the fetching (through safe-fetch)
// and writes PortfolioEntry.lastCrawl.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.userId) !== Boolean(b.all), {
    message: "Pass exactly one of userId or all",
  });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { userId } or { all: true }" },
        { status: 400 },
      );
    }

    if (parsed.data.userId) {
      const target = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, role: true },
      });
      if (!target || target.role !== "student") {
        return Response.json({ error: "Unknown student" }, { status: 404 });
      }
    }

    const payload = parsed.data.userId ? { userId: parsed.data.userId } : { all: true };
    const jobId = await enqueuePortfolioCrawl(payload);
    if (!jobId) {
      return Response.json({ error: "Queue unavailable — retry shortly" }, { status: 503 });
    }
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "portfolio-crawl-enqueued",
        targetType: "portfolio",
        targetId: parsed.data.userId ?? "all",
        after: payload,
      },
    });
    return Response.json({ ok: true, jobId });
  },
  { role: "admin" },
);
