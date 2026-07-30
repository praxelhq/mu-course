import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  DraftAccessError,
  DraftConflictError,
  RevisionNotAllowedError,
} from "@/lib/submission-drafts";
import {
  GateClosedError,
  SubmissionValidationError,
  finalizeSubmissionDraft,
} from "@/lib/submissions";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    assignmentId: z.string().min(1),
    draftId: z.string().min(1),
    fields: z.record(z.string(), z.unknown()),
    evidenceIds: z.array(z.string().min(1)),
  })
  .strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  try {
    const submission = await finalizeSubmissionDraft({
      userId: user.userId,
      ...parsed.data,
    });
    return Response.json({
      submission: {
        id: submission.id,
        assessmentVersionId: submission.assessmentVersionId,
        version: submission.version,
        attempt: submission.attempt,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof DraftConflictError ||
      error instanceof RevisionNotAllowedError ||
      error instanceof GateClosedError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SubmissionValidationError) {
      return Response.json(
        { error: "Validation failed", errors: error.errors },
        { status: 422 },
      );
    }
    throw error;
  }
});
