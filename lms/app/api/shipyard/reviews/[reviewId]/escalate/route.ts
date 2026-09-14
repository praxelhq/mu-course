import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { escalateReview } from "@/lib/shipyard/review-escalate";

// POST /api/shipyard/reviews/[reviewId]/escalate   (instructor or admin)
//   → 200 { escalation, modelUsed, costUsd }
//   404 no such review
//
// A second opinion on the escalation tier (SPEC §6.5: Haiku by default), over
// the SAME evidence the first reviewer saw — the render is replayed from
// `renderArtifacts` rather than re-run, because the student's product may have
// changed since and the question is what the first reviewer was looking at.
//
// It never resolves anything. The answer lands in `promptLog.escalation`,
// `needsHuman` stays true, and the instructor still has to rule.

export const dynamic = "force-dynamic";

export const POST = withAuth<{ params: Promise<{ reviewId: string }> }>(
  async (_req, { params, user }) => {
    const { reviewId } = await params;
    try {
      const result = await escalateReview(reviewId, { actorId: user.userId });
      return Response.json({
        reviewId: result.reviewId,
        modelUsed: result.modelUsed,
        providerUsed: result.providerUsed,
        costUsd: result.costUsd,
        escalation: {
          agreesWithFirstVerdict: result.escalation.agreesWithFirstVerdict,
          verdict: result.escalation.verdict,
          confidence: result.escalation.confidence,
          humanNote: result.escalation.humanNote,
          reasons: result.escalation.reasons,
          contradictions: result.escalation.contradictions,
          flags: result.escalation.flags,
          summaryForStudent: result.escalation.summaryForStudent,
        },
      });
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "instructor" },
);
