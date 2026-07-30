import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  CohortFreezeActionError,
  freezeAssessmentCohort,
} from "@/lib/assessment-cohort-freeze";

const bodySchema = z.object({
  assessmentVersionId: z.string().min(1),
  sectionId: z.string().min(1),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    try {
      const freeze = await freezeAssessmentCohort({
        ...parsed.data,
        actorId: user.userId,
      });
      return Response.json({ ok: true, freeze });
    } catch (error) {
      if (error instanceof CohortFreezeActionError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  { role: "instructor" },
);
