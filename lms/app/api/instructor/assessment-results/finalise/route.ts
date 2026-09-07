import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  AssessmentResultFinalisationError,
  finaliseAssessmentResult,
} from "@/lib/assessment-result-finalisation";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    resultId: z.string().trim().min(1).max(128),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

type FinalisationMutation = typeof finaliseAssessmentResult;

export function createAssessmentResultFinalisationHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  finalise?: FinalisationMutation;
} = {}) {
  const finalise = options.finalise ?? finaliseAssessmentResult;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        const result = await finalise({
          resultId: parsed.data.resultId,
          expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
          reason: parsed.data.reason,
          actor: { userId: user.userId, role: user.role },
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof AssessmentResultFinalisationError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    { role: "instructor", ...(options.getUser ? { getUser: options.getUser } : {}) },
  );
}

export const POST = createAssessmentResultFinalisationHandler();
