import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isPublicEvidenceRole,
  isVersionedPublicationChainRevoked,
} from "@/lib/galleries";
import { parsePublicationPolicy } from "@/lib/publication-policy";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import { presignGet, s3Configured } from "@/lib/s3";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ submissionId: string; role: string }> };

export const GET = withAuth<Ctx>(async (_req, { user, params }) => {
  const { submissionId, role } = await params;
  if (!submissionId || !role) return new Response(null, { status: 404 });

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      assignmentId: true,
      assessmentVersionId: true,
      ownerKind: true,
      ownerId: true,
      fields: true,
      assessmentVersion: {
        select: { publicationPolicy: true, publicSchema: true },
      },
      assessmentResult: { select: { publishable: true } },
      publicationDecision: {
        select: {
          ownerConsent: true,
          ownerRevokedAt: true,
          instructorState: true,
        },
      },
      galleryItem: { select: { id: true } },
      evidence: {
        where: { fileRole: role, scanState: "clean" },
        orderBy: { committedAt: "desc" },
        select: {
          id: true,
          fieldKey: true,
          s3Key: true,
          s3VersionId: true,
          fileRole: true,
        },
      },
    },
  });
  const policy = parsePublicationPolicy(submission?.assessmentVersion?.publicationPolicy);
  const decision = submission?.publicationDecision;
  const evidence = submission
    ? selectReferencedEvidence({
        publicSchema: submission.assessmentVersion?.publicSchema,
        fields: submission.fields,
        evidence: submission.evidence,
      })[0]
    : undefined;
  const isStaff = user.role === "instructor" || user.role === "admin";
  const chainRevoked = submission
    ? await isVersionedPublicationChainRevoked(submission)
    : true;
  if (
    !submission ||
    chainRevoked ||
    !submission.assessmentResult?.publishable ||
    !policy ||
    !decision?.ownerConsent ||
    decision.ownerRevokedAt ||
    (!isStaff &&
      (!submission.galleryItem || decision.instructorState !== "approved")) ||
    !evidence ||
    !isPublicEvidenceRole(policy, evidence.fileRole) ||
    !s3Configured()
  ) {
    return new Response(null, { status: 404 });
  }

  const url = await presignGet(evidence.s3Key, {
    versionId: evidence.s3VersionId,
    ...(policy.previewRole === role ? {} : { downloadName: role }),
  });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
});
