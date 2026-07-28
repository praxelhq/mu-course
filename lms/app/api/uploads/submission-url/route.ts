import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  S3NotConfiguredError,
  UploadRejectedError,
  keyForSubmission,
  presignPut,
} from "@/lib/s3";
import { GateClosedError, assertAssignmentOpen } from "@/lib/submissions";

// U8 — student submission uploads, step 1: presigned PUT scoped to the
// student's own namespace (submissions/{userId}/{draftId}/{filename}).
// The client generates one draftId (uuid) per submit attempt so a
// multi-file submission groups under one prefix; the final POST /api/
// submissions carries the returned keys. Gate-checked: no presigned URL is
// ever issued for a closed assignment.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  draftId: z
    .string()
    .regex(/^[a-zA-Z0-9-]{8,64}$/)
    .optional(),
});

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { assignmentId, filename, contentType, sizeBytes, draftId } = parsed.data;

  try {
    await assertAssignmentOpen(user.userId, assignmentId);
    const key = keyForSubmission(user.userId, draftId ?? randomUUID(), filename);
    const { url, headers } = await presignPut({ key, contentType, maxBytes: sizeBytes });
    return Response.json({ url, key, headers });
  } catch (err) {
    if (err instanceof GateClosedError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof UploadRejectedError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof S3NotConfiguredError) {
      return Response.json({ error: "Storage not configured" }, { status: 503 });
    }
    throw err;
  }
});
