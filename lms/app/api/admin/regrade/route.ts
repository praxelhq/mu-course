import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueGradeSubmission } from "@/lib/queue";

// Admin re-enqueue of a grading job. Covers dead-letter recovery (a job
// that exhausted retries left the submission in 'grading') and re-grading a
// 'graded' submission after a rubric change. Finalised grades are immutable —
// regrade is refused (409).

export const dynamic = "force-dynamic";

const bodySchema = z.object({ submissionId: z.string().min(1) });

export const POST = withAuth(
  async (req, { user }) => {
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid body: expected { submissionId }" }, { status: 400 });
    }
    const { submissionId } = parsed.data;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });
    if (!submission) {
      return Response.json({ error: "Unknown submission" }, { status: 404 });
    }
    if (submission.status === "finalised") {
      return Response.json(
        { error: "Submission is finalised — its grade can no longer be regenerated" },
        { status: 409 },
      );
    }
    if (submission.status === "draft") {
      return Response.json({ error: "Submission is still a draft" }, { status: 409 });
    }

    // Reset to 'submitted' so the worker's status guard accepts the job even
    // when the previous run left it 'graded'.
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "submitted" },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "regrade-enqueued",
        targetType: "submission",
        targetId: submissionId,
        before: { status: submission.status },
        after: { status: "submitted" },
      },
    });

    const jobId = await enqueueGradeSubmission(submissionId);
    if (!jobId) {
      return Response.json(
        { error: "Queue unavailable — submission reset to 'submitted'; retry shortly" },
        { status: 503 },
      );
    }
    return Response.json({ ok: true, jobId });
  },
  { role: "admin" },
);
