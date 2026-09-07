import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  GradeAppealActionError,
  resolveGradeAppeal,
} from "@/lib/grade-appeals";

const bodySchema = z.object({
  appealId: z.string().min(1),
  outcome: z.enum(["accepted", "partially_accepted", "denied"]),
  reason: z.string().trim().min(1).max(2_000),
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
      const appeal = await resolveGradeAppeal({
        ...parsed.data,
        actorId: user.userId,
      });
      return Response.json({ ok: true, appeal });
    } catch (error) {
      if (error instanceof GradeAppealActionError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  { role: "instructor" },
);
