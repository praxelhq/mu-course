import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  GradeAppealActionError,
  openGradeAppeal,
} from "@/lib/grade-appeals";

const bodySchema = z.object({
  gradeId: z.string().min(1),
  reason: z.string().trim().min(1).max(2_000),
});

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "student") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  try {
    const appeal = await openGradeAppeal({
      ...parsed.data,
      actorId: user.userId,
    });
    return Response.json({ ok: true, appeal }, { status: 201 });
  } catch (error) {
    if (error instanceof GradeAppealActionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
