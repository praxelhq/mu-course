import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  PublicationDecisionError,
  setInstructorPublicationDecision,
} from "@/lib/publication-decisions";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    submissionId: z.string().trim().min(1).max(128),
    state: z.enum(["approved", "withheld", "revoked"]),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.state !== "approved" && !body.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required to withhold or revoke",
      });
    }
  });

type PublicationMutation = typeof setInstructorPublicationDecision;

export function createInstructorPublicationHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  decide?: PublicationMutation;
} = {}) {
  const decide = options.decide ?? setInstructorPublicationDecision;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        const result = await decide({
          ...parsed.data,
          actor: { userId: user.userId, role: user.role },
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof PublicationDecisionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    { role: "instructor", ...(options.getUser ? { getUser: options.getUser } : {}) },
  );
}

export const POST = createInstructorPublicationHandler();
