import { prisma } from "@/lib/db";
import { s3Configured } from "@/lib/s3";
import { galleryVoteState, isRevealed, VOTE_UNLOCK_MIN } from "@/lib/votes";

// Read model for a voting gallery (one meme / AI-image assignment). A student
// sees ONLY their own section's wall and may vote only within it; staff see
// every section and filter between them. Counts stay hidden until the
// instructor reveals that section AND the student has cast VOTE_UNLOCK_MIN
// votes (both enforced by lib/votes.galleryVoteState).
//
// No grade data is touched here — these artifacts are ungraded by design.

export type VoteGalleryItem = {
  submissionId: string;
  /**
   * Author name — ANONYMISED until the instructor reveals results. People vote
   * on the work, not on whose friend made it; a name next to the image is the
   * social-bias problem the reveal gate exists to prevent. The viewer's own
   * entry is always identifiable to them ("Your submission") so they can find
   * it, and that leaks nothing about anyone else.
   */
  ownerName: string;
  /** True for the viewer's own entry. */
  mineSubmission: boolean;
  sectionCode: string;
  imageUrl: string | null;
  caption: string | null;
  /** viewer may cast a vote on this item (own section, not their own work) */
  votable: boolean;
  /** viewer has already voted this item */
  mine: boolean;
  /** vote count — only ever populated for the viewer's own section once unlocked+revealed */
  count: number | null;
};

export type VoteGallerySection = { code: string; items: VoteGalleryItem[] };

export type VoteGallery = {
  assignmentId: string;
  title: string;
  mySectionCode: string | null;
  myVotes: number;
  unlockThreshold: number;
  unlocked: boolean;
  revealed: boolean;
  votesToUnlock: number;
  sections: VoteGallerySection[];
};

function imageKeyOf(fields: unknown, files: string[]): string | null {
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    const v = (fields as Record<string, unknown>).image;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return files[0] ?? null;
}

export async function getVoteGallery(
  viewer: { id: string; sectionId: string | null; role?: string },
  assignmentId: string,
): Promise<VoteGallery | null> {
  // Students see ONLY their own section's wall. Staff see every section and can
  // filter between them — that is how an instructor shows one class's gallery
  // without the other sections' entries on screen.
  const isStaff = viewer.role === "instructor" || viewer.role === "admin";
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, title: true, assignmentType: { select: { galleryEligible: true } } },
  });
  if (!assignment || !assignment.assignmentType.galleryEligible) return null;

  const [state, viewerSection, rows] = await Promise.all([
    galleryVoteState(viewer, assignmentId),
    viewer.sectionId
      ? prisma.section.findUnique({ where: { id: viewer.sectionId }, select: { code: true } })
      : null,
    prisma.submission.findMany({
      where: {
        assignmentId,
        status: { in: ["submitted", "graded", "finalised"] },
        galleryItem: { isNot: null },
        // Section isolation for students, enforced in the query itself.
        ...(isStaff ? {} : { user: { sectionId: viewer.sectionId ?? "__none__" } }),
      },
      select: {
        id: true,
        userId: true,
        fields: true,
        files: true,
        galleryItem: { select: { caption: true } },
        user: { select: { name: true, sectionId: true, section: { select: { code: true } } } },
      },
    }),
  ]);

  const canPresign = s3Configured();
  const bySection = new Map<string, VoteGalleryItem[]>();
  // Names stay hidden until the instructor reveals — voting is on the work.
  const namesVisible = await isRevealed(assignmentId, viewer.sectionId);

  for (const r of rows) {
    const sectionCode = r.user.section?.code ?? "—";
    const sameSection = viewer.sectionId != null && r.user.sectionId === viewer.sectionId;
    const isMine = r.userId === viewer.id;
    const key = imageKeyOf(r.fields, r.files);
    const item: VoteGalleryItem = {
      submissionId: r.id,
      ownerName: namesVisible ? r.user.name : isMine ? "Your submission" : "Anonymous",
      mineSubmission: isMine,
      sectionCode,
      // Stable link (see app/api/gallery/image/[id]): signs on demand, so it
      // never expires mid-class the way an embedded presigned URL did.
      imageUrl: key && canPresign ? `/api/gallery/image/${r.id}` : null,
      caption: r.galleryItem?.caption ?? null,
      votable: sameSection && r.userId !== viewer.id,
      mine: state.mine.has(r.id),
      // Counts only ever surface for the viewer's own section, gated by unlock+reveal.
      count: sameSection ? (state.counts?.get(r.id) ?? null) : null,
    };
    const arr = bySection.get(sectionCode) ?? [];
    arr.push(item);
    bySection.set(sectionCode, arr);
  }

  const sections: VoteGallerySection[] = [...bySection.entries()]
    .map(([code, items]) => ({
      code,
      items: items.sort((a, b) => a.ownerName.localeCompare(b.ownerName)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const revealed = namesVisible;
  return {
    assignmentId,
    title: assignment.title,
    mySectionCode: viewerSection?.code ?? null,
    myVotes: state.myCount,
    unlockThreshold: VOTE_UNLOCK_MIN,
    unlocked: state.unlocked,
    revealed,
    votesToUnlock: Math.max(0, VOTE_UNLOCK_MIN - state.myCount),
    sections,
  };
}
