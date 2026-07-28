import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interviewErrorResponse, rateLimited, takeInterviewToken } from "@/lib/interview/http";
import { TRANSPORT_TURNBASED } from "@/lib/interview/session";

// U13 — POST /api/interview/fallback: in-place degradation. The student's
// client flips its own live interview from 'realtime' to 'turnbased-fallback'
// (dropped connection, failed join, sustained poor quality) and continues the
// SAME interview over the U12 turn-based loop — every realtime turn already
// persisted via agent-turn stays in the one ordered transcript. Audited, and
// idempotent so a reconnect race never errors.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  interviewId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  if (!takeInterviewToken(user.userId)) return rateLimited();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { interviewId, reason } = parsed.data;

  try {
    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    // Owner-or-404 — never leak another student's interview.
    if (!interview || interview.userId !== user.userId) {
      return Response.json({ error: "Interview not found." }, { status: 404 });
    }
    if (interview.transport === TRANSPORT_TURNBASED) {
      return Response.json({ ok: true, transport: TRANSPORT_TURNBASED }); // idempotent
    }
    if (interview.status !== "live") {
      return Response.json(
        { error: `This interview is ${interview.status} — transport cannot change.` },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.interview.update({
        where: { id: interviewId },
        data: { transport: TRANSPORT_TURNBASED },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.userId,
          action: "interview.fallback",
          targetType: "interview",
          targetId: interviewId,
          before: { transport: interview.transport },
          after: { transport: TRANSPORT_TURNBASED, reason: reason ?? "unspecified" },
        },
      }),
    ]);
    return Response.json({ ok: true, transport: TRANSPORT_TURNBASED });
  } catch (err) {
    const mapped = interviewErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
