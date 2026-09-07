import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";
import { parsePublicationPolicy } from "@/lib/publication-policy";
import {
  isVersionedPublicationChainRevoked,
  SCREENSHOT_BLOCKED,
  selectLegacyGalleryImageKey,
} from "@/lib/galleries";

// Stable image link for gallery artifacts. The wall used to embed presigned
// URLs directly, but those expire after GET_TTL_SECONDS (5 min) — a page left
// open during class turned every image into an S3 "access denied". This route
// signs on demand instead, so the link in the page never goes stale.
//
// It is also the access check: a STUDENT may only load images from their own
// section; staff may load any. That keeps section isolation enforced on the
// bytes, not just on what the page chooses to render.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, { user, params }) => {
  const { id: submissionId } = await params;
  if (!submissionId) return new Response(null, { status: 404 });

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      fields: true,
      files: true,
      status: true,
      assignmentId: true,
      user: { select: { sectionId: true } },
      assignment: {
        select: { assignmentType: { select: { galleryEligible: true, slug: true } } },
      },
      assessmentVersionId: true,
      ownerKind: true,
      ownerId: true,
      assessmentVersion: { select: { publicationPolicy: true } },
      assessmentResult: { select: { publishable: true } },
      publicationDecision: {
        select: {
          ownerConsent: true,
          ownerRevokedAt: true,
          instructorState: true,
          previewS3Key: true,
          previewS3VersionId: true,
        },
      },
      galleryItem: { select: { screenshotS3Key: true, screenshotS3VersionId: true } },
    },
  });
  if (
    !sub ||
    (!sub.assessmentVersionId && !sub.assignment.assignmentType.galleryEligible)
  ) {
    return new Response(null, { status: 404 });
  }
  if (!["submitted", "graded", "finalised"].includes(sub.status)) {
    return new Response(null, { status: 404 });
  }

  const isStaff = user.role === "instructor" || user.role === "admin";
  if (
    !sub.assessmentVersionId &&
    !isStaff &&
    (!user.sectionId || user.sectionId !== sub.user.sectionId)
  ) {
    // Not this student's section — 404 rather than 403 so the existence of
    // another section's entry is not confirmed.
    return new Response(null, { status: 404 });
  }

  let key: string | null;
  let versionId: string | null = null;
  if (sub.assessmentVersionId) {
    if (await isVersionedPublicationChainRevoked(sub)) {
      return new Response(null, { status: 404 });
    }
    const policy = parsePublicationPolicy(sub.assessmentVersion?.publicationPolicy);
    const decision = sub.publicationDecision;
    if (
      policy?.wall !== "app" ||
      !sub.assessmentResult?.publishable ||
      !decision?.ownerConsent ||
      decision.ownerRevokedAt ||
      (!isStaff && decision.instructorState !== "approved")
    ) {
      return new Response(null, { status: 404 });
    }
    if (isStaff && decision.previewS3Key) {
      key = decision.previewS3Key;
      versionId = decision.previewS3VersionId;
    } else {
      key = sub.galleryItem?.screenshotS3Key ?? null;
      versionId = sub.galleryItem?.screenshotS3VersionId ?? null;
    }
  } else {
    key = selectLegacyGalleryImageKey({
      assignmentTypeSlug: sub.assignment.assignmentType.slug,
      fields: sub.fields,
      files: sub.files,
      screenshotS3Key: sub.galleryItem?.screenshotS3Key ?? null,
    });
    if (key && key === sub.galleryItem?.screenshotS3Key) {
      versionId = sub.galleryItem?.screenshotS3VersionId ?? null;
    }
  }
  if (key === SCREENSHOT_BLOCKED) return new Response(null, { status: 404 });
  if (sub.assessmentVersionId && key && !versionId) return new Response(null, { status: 404 });
  if (!key || !s3Configured()) return new Response(null, { status: 404 });

  const url = await presignGet(key, { versionId: versionId ?? undefined });
  // 302 to a freshly-signed URL; never cached, so it cannot go stale either.
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
});
