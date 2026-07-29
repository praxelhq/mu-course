import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";

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
      user: { select: { sectionId: true } },
      assignment: { select: { assignmentType: { select: { galleryEligible: true } } } },
    },
  });
  if (!sub || !sub.assignment.assignmentType.galleryEligible) {
    return new Response(null, { status: 404 });
  }
  if (!["submitted", "graded", "finalised"].includes(sub.status)) {
    return new Response(null, { status: 404 });
  }

  const isStaff = user.role === "instructor" || user.role === "admin";
  if (!isStaff && (!user.sectionId || user.sectionId !== sub.user.sectionId)) {
    // Not this student's section — 404 rather than 403 so the existence of
    // another section's entry is not confirmed.
    return new Response(null, { status: 404 });
  }

  const fields = (sub.fields ?? {}) as Record<string, unknown>;
  const key =
    typeof fields.image === "string" && fields.image ? fields.image : (sub.files[0] ?? null);
  if (!key || !s3Configured()) return new Response(null, { status: 404 });

  const url = await presignGet(key);
  // 302 to a freshly-signed URL; never cached, so it cannot go stale either.
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
});
