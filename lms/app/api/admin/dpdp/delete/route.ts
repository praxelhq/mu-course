import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateClerkUserMetadata } from "@/lib/auth/clerk";

// U16 — DPDP erasure: hard-delete every row the LMS holds for one student,
// in one FK-safe transaction. Admin-only; confirmEmail must match the
// student's email exactly (typo guard for an irreversible act).
//
// Decisions (docs/DECISIONS.md):
//  - The user ROW is deleted entirely (not anonymised) — a roster re-import
//    can recreate the account if the deletion was a mistake.
//  - The AuditLog row recording the deletion is KEPT and carries the email +
//    per-table counts: the legal basis for "we deleted it" must survive the
//    deletion itself.
//  - The Clerk account is flagged for deletion best-effort (privateMetadata)
//    before the row goes; actual Clerk account removal is a manual admin act.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  confirmEmail: z.string().min(1),
});

export const POST = withAuth(
  async (req, { user: admin }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { userId, confirmEmail }" },
        { status: 400 },
      );
    }
    const { userId, confirmEmail } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, clerkUserId: true },
    });
    if (!target) return Response.json({ error: "Unknown user" }, { status: 404 });
    if (target.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      return Response.json(
        { error: "confirmEmail does not match the user's email — nothing deleted" },
        { status: 400 },
      );
    }

    // Best-effort Clerk flag BEFORE the row (and its clerkUserId) disappears.
    if (target.clerkUserId) {
      try {
        await updateClerkUserMetadata(target.clerkUserId, {
          privateMetadata: { flaggedForDeletion: true, dpdpDeletedAt: new Date().toISOString() },
        });
      } catch (err) {
        console.error("[dpdp-delete] Clerk flag failed (continuing):", err);
      }
    }

    const counts = await prisma.$transaction(async (tx) => {
      // FK-safe order: children before parents.
      const galleryItems = await tx.galleryItem.deleteMany({
        where: { submission: { userId } },
      });
      const grades = await tx.grade.deleteMany({ where: { submission: { userId } } });
      const submissions = await tx.submission.deleteMany({ where: { userId } });
      const interviewTurns = await tx.interviewTurn.deleteMany({
        where: { interview: { userId } },
      });
      const interviews = await tx.interview.deleteMany({ where: { userId } });
      const interviewRetakes = await tx.interviewRetake.deleteMany({ where: { userId } });
      const quizAttempts = await tx.quizAttempt.deleteMany({ where: { userId } });
      const peerReviews = await tx.peerReview.deleteMany({
        where: { OR: [{ reviewerId: userId }, { revieweeId: userId }] },
      });
      const portfolio = await tx.portfolioEntry.deleteMany({ where: { userId } });
      const notifications = await tx.notification.deleteMany({ where: { userId } });
      const gateExceptions = await tx.gateException.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      return {
        galleryItems: galleryItems.count,
        grades: grades.count,
        submissions: submissions.count,
        interviewTurns: interviewTurns.count,
        interviews: interviews.count,
        interviewRetakes: interviewRetakes.count,
        quizAttempts: quizAttempts.count,
        peerReviews: peerReviews.count,
        portfolio: portfolio.count,
        notifications: notifications.count,
        gateExceptions: gateExceptions.count,
        user: 1,
      };
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: "dpdp-delete",
        targetType: "user",
        targetId: userId,
        // The email in the summary is deliberate — the legal record of WHOSE
        // data was erased must outlive the erasure.
        after: { email: target.email, deleted: counts },
      },
    });

    return Response.json({ ok: true, deleted: counts });
  },
  { role: "admin" },
);
