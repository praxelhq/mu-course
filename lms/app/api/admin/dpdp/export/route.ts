import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// DPDP data export: everything the LMS holds ABOUT one student, as one
// JSON bundle, for fulfilling a data-access request. Admin-only.
//
// Scope decisions (docs/DECISIONS.md):
//  - Grades INCLUDE promptLog — the grading prompt/response is derived from
//    the student's own submission and the rubric, so it is their data.
//  - Quiz attempts include the diagnostic attempt as a PLAIN attempt row
//    (quiz title + score). No isDiagnostic marker and no counting/not-counting
//    annotation appears anywhere in the bundle: the student knows they took
//    the quiz; what must not leak is that it does not count.
//  - Peer reviews GIVEN by the student only. Reviews RECEIVED are the
//    reviewers' personal data (their opinions/allocations) and are excluded.
//  - S3 keys are listed as a manifest, not fetched — the app tier never
//    proxies file bytes.
//  - No other student's name or email appears anywhere in the bundle
//    (opaque ids like reviewee ids are retained for correlation).

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "userId query parameter required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        section: { select: { code: true, name: true } },
        team: { select: { name: true, sectorName: true } },
      },
    });
    if (!user) return Response.json({ error: "Unknown user" }, { status: 404 });

    const [submissions, interviews, attempts, reviewsGiven, notifications, portfolio, auditRows] =
      await Promise.all([
        prisma.submission.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            fields: true,
            files: true,
            version: true,
            createdAt: true,
            assignment: {
              select: { title: true, assignmentType: { select: { slug: true, title: true } } },
            },
            grades: {
              orderBy: { createdAt: "asc" },
              select: {
                rubricScores: true,
                total: true,
                confidence: true,
                feedbackMd: true,
                flags: true,
                gradedBy: true,
                provisional: true,
                overrideReason: true,
                promptLog: true, // the student's own grading context — included
                createdAt: true,
              },
            },
            galleryItem: { select: { featured: true, caption: true, screenshotS3Key: true } },
          },
        }),
        prisma.interview.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            transport: true,
            audioS3Key: true,
            rubricScores: true,
            confidence: true,
            escalationReason: true,
            attemptNumber: true,
            createdAt: true,
            completedAt: true,
            turns: {
              orderBy: { turnNo: "asc" },
              select: { turnNo: true, speaker: true, text: true, audioS3Key: true, startedAt: true },
            },
          },
        }),
        // ALL attempts — including the diagnostic, projected as a plain row.
        prisma.quizAttempt.findMany({
          where: { userId },
          orderBy: { submittedAt: "asc" },
          select: {
            answers: true,
            scorePct: true,
            submittedAt: true,
            quiz: { select: { title: true, sessionNo: true } },
          },
        }),
        prisma.peerReview.findMany({
          where: { reviewerId: userId }, // GIVEN only — received are others' data
          select: { checkpoint: true, revieweeId: true, pointsAllocated: true, ratings: true },
        }),
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: { kind: true, title: true, body: true, readAt: true, createdAt: true },
        }),
        prisma.portfolioEntry.findUnique({
          where: { userId },
          select: { narrative: true, links: true, validations: true, lastCrawl: true },
        }),
        prisma.auditLog.findMany({
          where: { actorId: userId },
          orderBy: { createdAt: "asc" },
          select: { action: true, targetType: true, targetId: true, before: true, after: true, createdAt: true },
        }),
      ]);

    // S3 key manifest — keys only, never bytes.
    const s3Keys = [
      ...submissions.flatMap((s) => s.files),
      ...submissions.flatMap((s) => (s.galleryItem?.screenshotS3Key ? [s.galleryItem.screenshotS3Key] : [])),
      ...interviews.flatMap((iv) => (iv.audioS3Key ? [iv.audioS3Key] : [])),
      ...interviews.flatMap((iv) => iv.turns.flatMap((t) => (t.audioS3Key ? [t.audioS3Key] : []))),
    ];

    const bundle = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        section: user.section,
        team: user.team, // team name + sector only — no member list
      },
      submissions: submissions.map((s) => ({
        id: s.id,
        assignmentTitle: s.assignment.title,
        artifactType: s.assignment.assignmentType.slug,
        status: s.status,
        version: s.version,
        submittedAt: s.submittedAt,
        createdAt: s.createdAt,
        fields: s.fields,
        files: s.files,
        grades: s.grades,
        galleryItem: s.galleryItem,
      })),
      interviews,
      quizAttempts: attempts.map((a) => ({
        quizTitle: a.quiz.title,
        sessionNo: a.quiz.sessionNo,
        scorePct: a.scorePct,
        answers: a.answers,
        submittedAt: a.submittedAt,
      })),
      peerReviewsGiven: reviewsGiven,
      notifications,
      portfolio,
      auditLogsAsActor: auditRows,
      s3Keys,
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="dpdp-export-${user.id}.json"`,
      },
    });
  },
  { role: "admin" },
);
