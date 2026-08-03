import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  ReviewActionError,
  finaliseAssignment,
  previewFinalise,
} from "@/lib/review-queue";

// Batch finalise (U10). Server-enforced confirmation, same shape as the
// Unlock Console's close-with-pending flow: without confirmed:true the
// endpoint answers { needsConfirm, count, newlyFlagged } and changes nothing.
// The percentile check re-runs at finalise — unreviewed grades that are NOW
// outliers are excluded from the batch and returned for review.

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  confirmed: z.boolean().optional(),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const { assignmentId, confirmed } = parsed.data;
    try {
      if (!confirmed) {
        const preview = await previewFinalise(assignmentId);
        return Response.json({ needsConfirm: true, ...preview });
      }
      const result = await finaliseAssignment({ assignmentId, actorId: user.userId });
      return Response.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof ReviewActionError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  },
  { role: "instructor" },
);
