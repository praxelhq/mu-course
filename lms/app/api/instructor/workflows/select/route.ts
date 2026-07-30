import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  TeamWorkflowSelectionError,
  selectTeamWorkflow,
} from "@/lib/team-workflow-selection";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    teamId: z.string().trim().min(1).max(128),
    assignmentId: z.string().trim().min(1).max(128),
    submissionId: z.string().trim().min(1).max(128),
    nominationId: z.string().trim().min(1).max(128).optional(),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

type SelectionMutation = typeof selectTeamWorkflow;

export function createInstructorWorkflowSelectionHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  select?: SelectionMutation;
} = {}) {
  const select = options.select ?? selectTeamWorkflow;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        const result = await select({
          ...parsed.data,
          actor: { userId: user.userId, role: user.role },
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof TeamWorkflowSelectionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    { role: "instructor", ...(options.getUser ? { getUser: options.getUser } : {}) },
  );
}

export const POST = createInstructorWorkflowSelectionHandler();
