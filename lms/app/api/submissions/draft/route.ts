import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  ContractBindingError,
  DraftAccessError,
  DraftConflictError,
  DraftGateClosedError,
  RevisionNotAllowedError,
  loadSubmissionDraft,
  saveSubmissionDraft,
} from "@/lib/submission-drafts";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    assignmentId: z.string().min(1),
    draftId: z.string().min(1).optional(),
    grantId: z.string().min(1).optional(),
    expectedUpdatedAt: z.coerce.date().optional(),
    fields: z.record(z.string(), z.unknown()),
  })
  .strict();

export const GET = withAuth(async (req, { user }) => {
  const assignmentId = new URL(req.url).searchParams.get("assignmentId");
  if (!assignmentId) return Response.json({ error: "assignmentId is required" }, { status: 400 });
  try {
    const loaded = await loadSubmissionDraft({ userId: user.userId, assignmentId });
    if (!loaded) return Response.json({ draft: null, evidence: [] });
    return Response.json({
      draft: {
        id: loaded.draft.id,
        updatedAt: loaded.draft.updatedAt,
        assessmentVersionId: loaded.assessmentVersionId,
        grantId: loaded.grantId,
        version: loaded.draft.version,
        attempt: loaded.draft.attempt,
        fields: loaded.draft.fields,
      },
      evidence: loaded.evidence,
    });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ContractBindingError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
});

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const saved = await saveSubmissionDraft({ userId: user.userId, ...parsed.data });
    return Response.json({
      draft: {
        id: saved.draft.id,
        updatedAt: saved.draft.updatedAt,
        assessmentVersionId: saved.assessmentVersionId,
        grantId: saved.grantId,
        version: saved.draft.version,
        attempt: saved.draft.attempt,
      },
    });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof DraftConflictError ||
      error instanceof DraftGateClosedError ||
      error instanceof RevisionNotAllowedError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ContractBindingError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
});
