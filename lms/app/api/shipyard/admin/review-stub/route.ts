import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { completeReview } from "@/lib/shipyard/review-complete";
import { rubricClauses } from "@/worker/shipyard-jobs/review-submission";

// POST /api/shipyard/admin/review-stub  (instructor or admin)
//   body { submissionId, verdict: "pass" | "return", reason, reasons? } → 200
//   400 no reason, or a reason under 8 characters
//   403 not staff
//   404 no such submission
//   409 that submission already has a verdict
//
// M1's "stub reviewer that passes on command", from the other direction: the
// worker's handler decides for itself, this one is decided by a human in the
// room. Both land in `completeReview`, so a verdict recorded here moves the
// gate and notifies the student in exactly the same way — which is the point of
// having one completion path.
//
// It is also the faculty "record a verdict" action on the student drill-down,
// so it is audit-logged as `shipyard.review.override` with the staff member's
// reason: a human verdict that moved a student's gate has to be reconstructable
// from the log alone (SPEC §4, "one-click override and a required reason").

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    submissionId: z.string().min(1),
    verdict: z.enum(["pass", "return"]),
    /**
     * Why a human decided this. REQUIRED (SEC-6). It was optional on the wire
     * so an M1 demo script could stay unchanged, which meant the one route
     * that lets a human move a student's gate could be called with no
     * justification at all — and SPEC §4 asks for "one-click override and a
     * required reason". The 8-character floor is what the staff UI already
     * enforces, so nothing a person can click changes.
     */
    reason: z.string().trim().min(8).max(500),
    reasons: z
      .array(z.object({ criterion: z.string().min(1), met: z.boolean(), note: z.string() }))
      .max(20)
      .optional(),
  })
  .strict();

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          error:
            "A recorded verdict needs a reason of at least 8 characters, so the audit log says why.",
        },
        { status: 400 },
      );
    }
    const { submissionId, verdict, reason } = parsed.data;

    const submission = await prisma.shipyardSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true, checkpoint: { select: { rubric: true } } },
    });
    if (!submission) return Response.json({ error: "No such submission." }, { status: 404 });
    if (submission.status === "passed" || submission.status === "returned") {
      return Response.json({ error: "That submission already has a verdict." }, { status: 409 });
    }

    const clauses = rubricClauses(submission.checkpoint.rubric);
    const reasons =
      parsed.data.reasons ??
      clauses.map((clause, index) => ({
        criterion: clause,
        met: verdict === "pass" ? true : index !== 0,
        note:
          verdict === "pass" || index !== 0
            ? "Met."
            : reason,
      }));

    try {
      const result = await completeReview(submissionId, {
        verdict,
        reasons,
        rubricScores: { stub: verdict === "pass" ? 100 : 0 },
        confidence: 1,
        modelUsed: "stub",
        providerUsed: "stub",
        reviewedBy: "human",
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.userId,
          action: "shipyard.review.override",
          targetType: "ShipyardSubmission",
          targetId: submissionId,
          before: { status: submission.status } as unknown as Prisma.InputJsonValue,
          after: {
            verdict,
            reviewId: result.reviewId,
            status: result.status,
            role: user.role,
            reason,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return Response.json({
        reviewId: result.reviewId,
        status: result.status,
        states: result.states.map((s) => ({ key: s.key, order: s.order, state: s.state })),
      });
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "instructor" },
);
