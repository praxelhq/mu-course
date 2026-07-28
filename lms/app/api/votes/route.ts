import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { castVote, removeVote, VoteError } from "@/lib/votes";

// Student voting on gallery artifacts (memes, AI images). Cast (POST) / remove
// (DELETE) one upvote on a submission. Section-scoping, no-self-vote and
// idempotency all live in lib/votes; here we just map errors to statuses.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ submissionId: z.string().min(1) });

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "submissionId required" }, { status: 400 });
  try {
    const result = await castVote(
      { id: user.userId, sectionId: user.sectionId },
      parsed.data.submissionId,
    );
    return Response.json(result);
  } catch (e) {
    if (e instanceof VoteError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
});

export const DELETE = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "submissionId required" }, { status: 400 });
  await removeVote(user.userId, parsed.data.submissionId);
  return Response.json({ ok: true });
});
