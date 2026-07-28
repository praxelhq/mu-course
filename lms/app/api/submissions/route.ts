import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  ForeignFileKeyError,
  GateClosedError,
  SubmissionValidationError,
  submitAssignment,
} from "@/lib/submissions";

// POST submit. Validation → 422 with per-field messages; closed gate →
// 409 with the clear message; a file key outside the student's namespace →
// 403. All rules live in lib/submissions — this route only maps errors.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
  files: z.array(z.string().min(1)).default([]),
});

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const submission = await submitAssignment({
      userId: user.userId,
      assignmentId: parsed.data.assignmentId,
      fields: parsed.data.fields,
      files: parsed.data.files,
    });
    return Response.json({
      submission: {
        id: submission.id,
        version: submission.version,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (err) {
    if (err instanceof SubmissionValidationError) {
      return Response.json({ error: "Validation failed", errors: err.errors }, { status: 422 });
    }
    if (err instanceof GateClosedError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ForeignFileKeyError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
});
