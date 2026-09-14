import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { humanResolve } from "@/lib/shipyard/review-escalate";

// POST /api/shipyard/reviews/[reviewId]/resolve   (instructor or admin)
//   body { decision: "pass" | "return", reason } → 200
//   400 invalid body      404 no such review
//   409 already resolved
//
// The ruling. This is the only thing that clears a gate a held pass left shut
// (SPEC §6), and the only thing that turns a model's `return` into a pass. The
// reason is required because it is what the student reads on a return and what
// the audit log carries on an override.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    decision: z.enum(["pass", "return"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const POST = withAuth<{ params: Promise<{ reviewId: string }> }>(
  async (req, { params, user }) => {
    const { reviewId } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "A ruling needs a decision and a reason (1–500 characters)." },
        { status: 400 },
      );
    }
    try {
      const result = await humanResolve(reviewId, {
        decision: parsed.data.decision,
        reason: parsed.data.reason,
        actorId: user.userId,
      });
      return Response.json({
        reviewId: result.reviewId,
        submissionId: result.submissionId,
        decision: result.decision,
        status: result.status,
        overrode: result.overrode,
        states: result.states.map((s) => ({ key: s.key, order: s.order, state: s.state })),
      });
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "instructor" },
);
