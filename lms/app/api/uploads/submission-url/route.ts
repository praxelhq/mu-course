import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { s3ErrorResponse } from "@/lib/s3";
import {
  ContractBindingError,
  DraftAccessError,
  DraftConflictError,
  DraftGateClosedError,
  RevisionNotAllowedError,
} from "@/lib/submission-drafts";
import { reserveSubmissionUpload, UploadPolicyError } from "@/lib/upload-reservations";

// Presign creates (or resumes) a server-owned draft and one-use reservation.
// The client names only a schema field; owner/version/attempt/role/key are
// derived from the authenticated user and the draft's immutable contract.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    assignmentId: z.string().min(1),
    draftId: z.string().min(1).optional(),
    grantId: z.string().min(1).optional(),
    fieldKey: z.string().min(1).max(128),
    filename: z.string().min(1).max(200),
    contentType: z.string().min(1).max(200),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body; upload keys and file roles are server-derived." },
      { status: 400 },
    );
  }

  try {
    const reserved = await reserveSubmissionUpload({ userId: user.userId, ...parsed.data });
    return Response.json({
      draftId: reserved.draftId,
      draftUpdatedAt: reserved.draftUpdatedAt,
      assessmentVersionId: reserved.assessmentVersionId,
      grantId: reserved.grantId,
      version: reserved.version,
      attempt: reserved.attempt,
      reservationId: reserved.reservation.id,
      expiresAt: reserved.reservation.expiresAt,
      url: reserved.upload.url,
      key: reserved.upload.key,
      headers: reserved.upload.headers,
    });
  } catch (error) {
    if (error instanceof UploadPolicyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DraftAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof DraftConflictError ||
      error instanceof DraftGateClosedError ||
      error instanceof RevisionNotAllowedError ||
      error instanceof ContractBindingError
    ) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const response = s3ErrorResponse(error);
    if (response) return response;
    throw error;
  }
});
