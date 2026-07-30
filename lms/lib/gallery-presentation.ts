import { selectLegacyGalleryImageKey } from "@/lib/galleries";

const PRESENTABLE_STATUSES = new Set(["submitted", "graded", "finalised"]);
const SESSION_2_IMAGE_SLUGS = new Set(["meme", "ai-image"]);
const CAPTION_MAX_LENGTH = 180;

export type GalleryPresentationItem = {
  submissionId: string;
  imageUrl: string;
  ownerName: string;
  caption: string | null;
};

export type GalleryPresentationSource = {
  id: string;
  userId: string;
  ownerName: string;
  status: string;
  version: number;
  attempt: number;
  fields: unknown;
  files: readonly string[];
  galleryItem: { caption: string | null } | null;
};

function shortCaption(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const caption = value.trim();
  if (!caption) return null;
  return caption.length <= CAPTION_MAX_LENGTH
    ? caption
    : `${caption.slice(0, CAPTION_MAX_LENGTH - 1)}…`;
}

/**
 * Instructor-only projection for the Session 2 projector view. It returns a
 * stable, access-checked app URL and never a private object-store key.
 */
export function buildGalleryPresentationItems(args: {
  assignmentTypeSlug: string;
  namesVisible: boolean;
  rows: readonly GalleryPresentationSource[];
}): GalleryPresentationItem[] {
  if (!SESSION_2_IMAGE_SLUGS.has(args.assignmentTypeSlug)) return [];
  const newestFirst = [...args.rows].sort(
    (a, b) => b.version - a.version || b.attempt - a.attempt || a.id.localeCompare(b.id),
  );
  const seenOwners = new Set<string>();
  const items: GalleryPresentationItem[] = [];

  for (const row of newestFirst) {
    if (seenOwners.has(row.userId)) continue;
    if (!PRESENTABLE_STATUSES.has(row.status) || !row.galleryItem) continue;
    const fields =
      row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
        ? (row.fields as Record<string, unknown>)
        : {};
    const imageKey = selectLegacyGalleryImageKey({
      assignmentTypeSlug: args.assignmentTypeSlug,
      fields,
      files: row.files,
      screenshotS3Key: null,
    });
    if (!imageKey) continue;

    seenOwners.add(row.userId);
    items.push({
      submissionId: row.id,
      imageUrl: `/api/gallery/image/${encodeURIComponent(row.id)}`,
      ownerName: args.namesVisible ? row.ownerName : "Anonymous",
      caption: shortCaption(row.galleryItem.caption) ?? shortCaption(fields.caption),
    });
  }

  return items.sort((a, b) =>
    args.namesVisible
      ? a.ownerName.localeCompare(b.ownerName) || a.submissionId.localeCompare(b.submissionId)
      : a.submissionId.localeCompare(b.submissionId),
  );
}
