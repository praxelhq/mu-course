import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { s3ErrorResponse } from "@/lib/s3";
import { DraftAccessError, DraftConflictError } from "@/lib/submission-drafts";
import { commitUploadReservation, UploadPolicyError } from "@/lib/upload-reservations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reservationId: z.string().min(1) }).strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const evidence = await commitUploadReservation({
      userId: user.userId,
      reservationId: parsed.data.reservationId,
    });
    return Response.json({
      evidence: {
        id: evidence.id,
        fieldKey: evidence.fieldKey,
        fileRole: evidence.fileRole,
        byteCount: evidence.byteCount,
        sha256: evidence.sha256,
        scanState: evidence.scanState,
        quarantineReasonCode: evidence.quarantineReasonCode,
      },
    });
  } catch (error) {
    if (error instanceof UploadPolicyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DraftAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DraftConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const response = s3ErrorResponse(error);
    if (response) return response;
    throw error;
  }
});
