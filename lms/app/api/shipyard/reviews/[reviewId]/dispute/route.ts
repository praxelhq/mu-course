import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { disputeReview, DISPUTE_NOTE_MAX } from "@/lib/shipyard/review-escalate";

// POST /api/shipyard/reviews/[reviewId]/dispute   (the STUDENT who owns it)
//   body { note } → 200 { escalation }
//   400 no note, or over the cap
//   404 not this student's review
//   409 not a return, or already disputed
//
// SPEC §6: "a `return` a student disputes is escalated the same way." This is
// the student's one appeal per review. It flags the review for a human, stores
// the note on `promptLog.dispute`, and runs the escalation second opinion with
// the dispute in the prompt so the instructor sees a model that has read the
// student's objection rather than one that has not.
//
// Rate limit: ONE per review, enforced by the presence of `promptLog.dispute`
// rather than by a counter — an appeal is about one verdict, and a student who
// resubmits gets a new review and a new appeal with it.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ note: z.string().trim().min(1).max(DISPUTE_NOTE_MAX) }).strict();

export const POST = withAuth<{ params: Promise<{ reviewId: string }> }>(
  async (req, { params, user }) => {
    const { reviewId } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          error: `Say what you think the reviewer got wrong, in ${DISPUTE_NOTE_MAX} characters or fewer.`,
        },
        { status: 400 },
      );
    }
    try {
      const result = await disputeReview(reviewId, {
        userId: user.userId,
        note: parsed.data.note,
      });
      return Response.json({
        reviewId: result.reviewId,
        disputedAt: result.disputedAt,
        // The student is told it is with a person; they are not shown the
        // second model's reasoning, which is written for the instructor.
        message:
          "Your note is with an instructor, together with a second reviewer's opinion. You will hear back here.",
      });
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
);
