import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  TeamWorkflowSelectionError,
  nominateTeamWorkflow,
} from "@/lib/team-workflow-selection";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    assignmentId: z.string().trim().min(1).max(128),
    submissionId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

type NominationMutation = typeof nominateTeamWorkflow;

export function createWorkflowNominationHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  nominate?: NominationMutation;
} = {}) {
  const nominate = options.nominate ?? nominateTeamWorkflow;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        const result = await nominate({
          ...parsed.data,
          actor: { userId: user.userId, teamId: user.teamId },
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof TeamWorkflowSelectionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    options.getUser ? { getUser: options.getUser } : {},
  );
}

export const POST = createWorkflowNominationHandler();
