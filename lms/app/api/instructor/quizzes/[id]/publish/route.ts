import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { publishVersionedQuiz } from "@/lib/quizzes/instructor";

export const dynamic = "force-dynamic";

const publishSchema = z.object({
  classification: z.enum(["diagnostic", "formative", "summative"]),
  feedbackReleaseAt: z.iso.datetime(),
});

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (request, { params, user }) => {
    const parsed = publishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Choose a quiz classification and a valid feedback release time." },
        { status: 422 },
      );
    }

    const { id } = await params;
    const outcome = await publishVersionedQuiz(id, {
      classification: parsed.data.classification,
      feedbackReleaseAt: new Date(parsed.data.feedbackReleaseAt),
      actorId: user.userId,
    });

    switch (outcome.status) {
      case "published":
        return Response.json({ ok: true, publishedAt: outcome.publishedAt });
      case "not_found":
        return Response.json({ error: "Unknown quiz." }, { status: 404 });
      case "not_versioned":
        return Response.json(
          { error: "Legacy quizzes do not use the versioned publication flow." },
          { status: 409 },
        );
      case "already_published":
        return Response.json(
          { error: "This quiz contract is already published and immutable." },
          { status: 409 },
        );
      case "has_attempts":
        return Response.json(
          { error: "A quiz with attempts cannot be reclassified or published." },
          { status: 409 },
        );
      case "invalid":
        return Response.json({ error: outcome.message }, { status: 422 });
    }
  },
  { role: "instructor" },
);
