import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExternalLinks } from "@/lib/portfolio";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import {
  projectSafeAppealHistory,
  projectSafeEvidenceManifest,
  projectSafeScalarFields,
  resolveSafeExportContract,
  sanitizeExportText,
} from "@/lib/safe-exports";

// Admin-only data-access bundle. This endpoint deliberately assembles a safe
// projection instead of serializing ORM rows. Grading/evaluator records and
// object-store locators are not selected; versioned submission fields and
// evidence metadata are governed by the bound immutable exportPolicy.

export const dynamic = "force-dynamic";
export const DPDP_EXPORT_CONTRACT_VERSION = 2 as const;

export function dpdpExportFilename(userId: string): string {
  return `dpdp-export-v${DPDP_EXPORT_CONTRACT_VERSION}-${userId}.json`;
}

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

    const [
      submissions,
      appeals,
      interviews,
      attempts,
      reviewsGiven,
      notifications,
      portfolio,
      uploadAttributions,
      appealAttributions,
      holdAttributions,
      publicationAttributions,
      nominationAttributions,
      auditAttributions,
    ] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          assessmentVersionId: true,
          fields: true,
          version: true,
          attempt: true,
          submittedAt: true,
          createdAt: true,
          assessmentVersion: {
            select: { exportPolicy: true, publicSchema: true },
          },
          assignment: {
            select: {
              title: true,
              assignmentType: {
                select: {
                  slug: true,
                  submissionSchema: true,
                  galleryEligible: true,
                },
              },
            },
          },
          evidence: {
            orderBy: { committedAt: "asc" },
            select: {
              id: true,
              fieldKey: true,
              fileRole: true,
              byteCount: true,
              inspectedMimeType: true,
              scanState: true,
              committedAt: true,
              reservation: { select: { filename: true } },
            },
          },
        },
      }),
      prisma.gradeAppeal.findMany({
        where: { grade: { submission: { userId } } },
        orderBy: { createdAt: "asc" },
        select: {
          reason: true,
          status: true,
          outcome: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          grade: { select: { submissionId: true } },
        },
      }),
      prisma.interview.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          attemptNumber: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.quizAttempt.findMany({
        where: { userId },
        orderBy: { submittedAt: "asc" },
        select: {
          submittedAt: true,
          quiz: { select: { title: true, sessionNo: true } },
        },
      }),
      prisma.peerReview.findMany({
        where: { reviewerId: userId },
        orderBy: [{ checkpoint: "asc" }, { revieweeId: "asc" }],
        select: { checkpoint: true, revieweeId: true, pointsAllocated: true },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      prisma.portfolioEntry.findUnique({
        where: { userId },
        select: { narrative: true, links: true },
      }),
      // Attribution is queried globally by actor, not through Submission.userId:
      // a learner may act on a shared row owned by another teammate.
      prisma.uploadReservation.findMany({
        where: { createdById: userId },
        select: { id: true, submissionId: true, createdAt: true },
      }),
      prisma.gradeAppeal.findMany({
        where: { openedBy: userId },
        select: {
          id: true,
          createdAt: true,
          grade: { select: { submissionId: true } },
        },
      }),
      prisma.gradeHold.findMany({
        where: { createdBy: userId },
        select: { id: true, submissionId: true, createdAt: true },
      }),
      prisma.publicationDecision.findMany({
        where: { ownerConsentBy: userId },
        select: { id: true, submissionId: true, createdAt: true },
      }),
      prisma.teamWorkflowNomination.findMany({
        where: { nominatedBy: userId },
        select: { id: true, submissionId: true, createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: { OR: [{ actorId: userId }, { targetId: userId }] },
        select: { id: true, actorId: true, targetId: true, createdAt: true },
      }),
    ]);

    const appealsBySubmission = new Map<string, typeof appeals>();
    for (const appeal of appeals) {
      const rows = appealsBySubmission.get(appeal.grade.submissionId) ?? [];
      rows.push(appeal);
      appealsBySubmission.set(appeal.grade.submissionId, rows);
    }

    const safeSubmissions = submissions.map((submission) => {
      const contract = resolveSafeExportContract({
        contractMode: submission.assessmentVersionId ? "versioned" : "legacy",
        exportPolicy: submission.assessmentVersion?.exportPolicy ?? null,
        submissionSchema: submission.assignment.assignmentType.submissionSchema,
        legacyPraxyEnabled: submission.assignment.assignmentType.galleryEligible,
      });
      const referencedEvidence = submission.assessmentVersionId
        ? selectReferencedEvidence({
            publicSchema: submission.assessmentVersion?.publicSchema,
            fields: submission.fields,
            evidence: submission.evidence,
          })
        : [];
      const evidence = referencedEvidence.map((item) => ({
        role: item.fileRole,
        filename: item.reservation.filename,
        inspectedMimeType: item.inspectedMimeType,
        byteCount: item.byteCount,
        scanState: item.scanState,
        committedAt: item.committedAt,
      }));
      const appealHistory = appealsBySubmission.get(submission.id) ?? [];
      return {
        id: submission.id,
        assignmentTitle:
          sanitizeExportText(submission.assignment.title, "dpdp:assignment:title") ?? "Artifact",
        artifactType:
          sanitizeExportText(
            submission.assignment.assignmentType.slug,
            "dpdp:assignment:type",
          ) ?? "artifact",
        version: submission.version,
        attempt: submission.attempt,
        submittedAt: submission.submittedAt,
        createdAt: submission.createdAt,
        fields: contract
          ? projectSafeScalarFields(submission.fields, contract.dpdp.fieldKeys)
          : {},
        evidence: contract
          ? projectSafeEvidenceManifest(evidence, contract.dpdp.evidenceRoles)
          : [],
        appeals: projectSafeAppealHistory(appealHistory),
      };
    });

    const externalLinks = parseExternalLinks(portfolio?.links).flatMap((link) => {
      const label = sanitizeExportText(link.label, "dpdp:portfolio:label");
      const href = sanitizeExportText(link.url, "dpdp:portfolio:url");
      return label && href ? [{ label, href }] : [];
    });

    const actorAttributions = [
      ...uploadAttributions.map((row) => ({
        recordType: "upload",
        recordId: row.id,
        submissionId: row.submissionId,
        role: "createdById",
        createdAt: row.createdAt,
        erasureDisposition: "pseudonymized-on-erasure",
      })),
      ...appealAttributions.map((row) => ({
        recordType: "appeal",
        recordId: row.id,
        submissionId: row.grade.submissionId,
        role: "openedBy",
        createdAt: row.createdAt,
        erasureDisposition: "pseudonymized-on-erasure",
      })),
      ...holdAttributions.map((row) => ({
        recordType: "hold",
        recordId: row.id,
        submissionId: row.submissionId,
        role: "createdBy",
        createdAt: row.createdAt,
        erasureDisposition: "pseudonymized-on-erasure",
      })),
      ...publicationAttributions.map((row) => ({
        recordType: "publication-consent",
        recordId: row.id,
        submissionId: row.submissionId,
        role: "ownerConsentBy",
        createdAt: row.createdAt,
        erasureDisposition: "pseudonymized-on-erasure",
      })),
      ...nominationAttributions.map((row) => ({
        recordType: "team-nomination",
        recordId: row.id,
        submissionId: row.submissionId,
        role: "nominatedBy",
        createdAt: row.createdAt,
        erasureDisposition: "pseudonymized-on-erasure",
      })),
      ...auditAttributions.flatMap((row) => [
        ...(row.actorId === userId
          ? [{
              recordType: "audit",
              recordId: row.id,
              role: "actorId",
              createdAt: row.createdAt,
              erasureDisposition: "pseudonymized-on-erasure",
            }]
          : []),
        ...(row.targetId === userId
          ? [{
              recordType: "audit",
              recordId: row.id,
              role: "targetId",
              createdAt: row.createdAt,
              erasureDisposition: "pseudonymized-on-erasure",
            }]
          : []),
      ]),
    ].sort(
      (left, right) =>
        left.recordType.localeCompare(right.recordType) ||
        left.recordId.localeCompare(right.recordId) ||
        left.role.localeCompare(right.role),
    );

    const appReviewsGiven = await prisma.appReview.findMany({
      where: { reviewerId: userId },
      select: { slot: true, visual: true, functionality: true, overall: true, comment: true, accessIssue: true, assignedAt: true, completedAt: true, retiredAt: true },
    });
    const bundle = {
      contractVersion: DPDP_EXPORT_CONTRACT_VERSION,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        section: user.section,
        team: user.team,
      },
      submissions: safeSubmissions,
      interviews,
      learningActivities: attempts.map((attempt) => ({
        title: sanitizeExportText(attempt.quiz.title, "dpdp:activity:title") ?? "Activity",
        sessionNo: attempt.quiz.sessionNo,
        submittedAt: attempt.submittedAt,
      })),
      peerReviewsGiven: reviewsGiven,
      appReviewsGiven: appReviewsGiven.map((review) => ({ ...review,
        comment: sanitizeExportText(review.comment, "dpdp:app-review:comment"),
        accessIssue: review.accessIssue === null ? null : sanitizeExportText(review.accessIssue, "dpdp:app-review:issue"),
      })),
      actorAttributions,
      notifications: notifications.map((notification) => ({
        kind: sanitizeExportText(notification.kind, "dpdp:notification:kind") ?? "notice",
        title:
          sanitizeExportText(notification.title, "dpdp:notification:title") ?? "[redacted]",
        body:
          notification.body === null
            ? null
            : (sanitizeExportText(notification.body, "dpdp:notification:body") ?? "[redacted]"),
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
      portfolio: {
        narrative:
          portfolio?.narrative === null || portfolio?.narrative === undefined
            ? null
            : (sanitizeExportText(portfolio.narrative, "dpdp:portfolio:narrative") ??
              "[redacted]"),
        externalLinks,
      },
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${dpdpExportFilename(user.id)}"`,
      },
    });
  },
  { role: "admin" },
);
