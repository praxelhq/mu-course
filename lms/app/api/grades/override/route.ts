import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { ReviewActionError, overrideGrade } from "@/lib/review-queue";

// Instructor grade override (U10). Reason is REQUIRED — the zod schema
// rejects an empty/whitespace reason before any write. Students never pass
// the role gate (403). All effects (grade write, AuditLog before/after,
// student notification) live in lib/review-queue.overrideGrade.

const bodySchema = z.object({
  gradeId: z.string().min(1),
  rubricScores: z.record(z.string(), z.number().min(0).max(10)).optional(),
  total: z.number().min(0).optional(),
  feedbackMd: z.string().optional(),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required to override a grade"),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }
    try {
      const result = await overrideGrade({ ...parsed.data, actorId: user.userId });
      return Response.json({ ok: true, total: result.total });
    } catch (err) {
      if (err instanceof ReviewActionError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  },
  { role: "instructor" },
);
