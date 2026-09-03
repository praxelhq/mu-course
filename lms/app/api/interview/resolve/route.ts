import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  INTERVIEW_CATEGORIES,
  INTERVIEW_CATEGORY_MAX,
} from "@/lib/ai/interview-grading";

// Instructor resolution of interview escalations: mark the AI grade as
// final, or adjust category scores (reason required). Both are audited.

export const dynamic = "force-dynamic";

const scoresSchema = z.object(
  Object.fromEntries(
    INTERVIEW_CATEGORIES.map((k) => [k, z.number().min(0).max(INTERVIEW_CATEGORY_MAX)]),
  ) as Record<(typeof INTERVIEW_CATEGORIES)[number], z.ZodNumber>,
);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark-graded"),
    interviewId: z.string().min(1),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    interviewId: z.string().min(1),
    scores: scoresSchema,
    reason: z.string().min(3).max(2000),
  }),
]);

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const body = parsed.data;

    const interview = await prisma.interview.findUnique({ where: { id: body.interviewId } });
    if (!interview) return Response.json({ error: "Interview not found" }, { status: 404 });
    if (interview.status !== "escalated" && interview.status !== "graded") {
      return Response.json(
        { error: `Interview is ${interview.status} — nothing to resolve yet` },
        { status: 409 },
      );
    }

    const before = {
      status: interview.status,
      rubricScores: interview.rubricScores,
      escalationReason: interview.escalationReason,
    } as unknown as Prisma.InputJsonValue;

    if (body.action === "mark-graded") {
      await prisma.$transaction([
        prisma.interview.update({
          where: { id: interview.id },
          data: { status: "graded" },
        }),
        prisma.auditLog.create({
          data: {
            actorId: user.userId,
            action: "interview.resolve-escalation",
            targetType: "interview",
            targetId: interview.id,
            before,
            after: { status: "graded", note: body.note ?? null } as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
      return Response.json({ ok: true, status: "graded" });
    }

    // Adjust: replace category scores, recompute total, keep AI rationales.
    const prior = (interview.rubricScores ?? {}) as Record<string, unknown>;
    const total = Object.values(body.scores).reduce((sum, n) => sum + n, 0);
    const rubricScores = {
      ...prior,
      ...body.scores,
      total,
      adjustedBy: user.userId,
    } as unknown as Prisma.InputJsonValue;
    await prisma.$transaction([
      prisma.interview.update({
        where: { id: interview.id },
        data: { status: "graded", rubricScores },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.userId,
          action: "interview.adjust-scores",
          targetType: "interview",
          targetId: interview.id,
          before,
          after: {
            status: "graded",
            rubricScores,
            reason: body.reason,
          } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return Response.json({ ok: true, status: "graded", total });
  },
  { role: "instructor" },
);
