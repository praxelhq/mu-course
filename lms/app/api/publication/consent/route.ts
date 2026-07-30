import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  PublicationDecisionError,
  setPublicationConsent,
} from "@/lib/publication-decisions";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    submissionId: z.string().trim().min(1).max(128),
    consent: z.boolean(),
  })
  .strict();

type ConsentMutation = typeof setPublicationConsent;

export function createPublicationConsentHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  mutate?: ConsentMutation;
} = {}) {
  const mutate = options.mutate ?? setPublicationConsent;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        const result = await mutate({
          ...parsed.data,
          actor: { userId: user.userId, teamId: user.teamId },
        });
        return Response.json(result);
      } catch (error) {
        if (error instanceof PublicationDecisionError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    options.getUser ? { getUser: options.getUser } : {},
  );
}

export const POST = createPublicationConsentHandler();
