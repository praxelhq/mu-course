import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";

// Galleries. One GalleryItem per graded/finalised submission of a
// galleryEligible AssignmentType, always pointing at the LATEST graded
// version (resubmission moves the existing item — featured flag and caption
// survive, the screenshot resets so the capture job re-runs on new content).
//
// PROJECTION RULE (CLAUDE.md: grades never leave the LMS): getGalleryWalls
// returns an explicitly-typed shape with NO grade, score, confidence,
// promptLog or feedback data anywhere — items are built field-by-field from
// submission/user/team rows only; Grade rows are never even queried here.
//
// Company-engagement rule (v1, per plan): workflow artifacts (Make.com
// blueprint JSON + screen recording) routinely contain partner-company
// process detail. "Company-engagement materials excluded unless explicitly
// featured" is implemented as: workflow-wall FILE downloads are exposed only
// when the item is featured (an instructor's explicit act); non-featured
// workflow items show name/caption only with files withheld. See
// docs/DECISIONS.md.

/** Sentinel stored in screenshotS3Key when the appUrl failed the SSRF policy. */
export const SCREENSHOT_BLOCKED = "blocked";

export const WALL_SLUGS = {
  app: "app",
  workflow: "workflow",
  maps: "value-chain-map",
} as const;

export type WallKey = keyof typeof WALL_SLUGS;

export interface GalleryDeps {
  prisma?: PrismaClient;
}

// ---------------------------------------------------------------------------
// syncGalleryItem — call after grading persists (worker) or from backfill
// ---------------------------------------------------------------------------

const GALLERY_STATUSES = ["graded", "finalised"] as const;

type GalleryItemRow = {
  id: string;
  submissionId: string;
  featured: boolean;
  caption: string | null;
  screenshotS3Key: string | null;
};

/**
 * Ensure the gallery reflects this submission's owner chain: creates an item
 * for a graded/finalised submission of a galleryEligible type, or moves the
 * owner's existing item to the latest graded version (supersede). Idempotent;
 * returns the item, or null when the chain has nothing gallery-worthy.
 */
export async function syncGalleryItem(
  submissionId: string,
  deps: GalleryDeps = {},
): Promise<GalleryItemRow | null> {
  const db = deps.prisma ?? defaultPrisma;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { assignmentType: true } } },
  });
  if (!submission) return null;
  if (!submission.assignment.assignmentType.galleryEligible) return null;

  // The owner chain: all versions by the same team (team-based) or user.
  const teamBased = submission.assignment.assignmentType.teamBased;
  const ownerWhere =
    teamBased && submission.teamId
      ? { teamId: submission.teamId }
      : { userId: submission.userId };
  const siblings = await db.submission.findMany({
    where: { assignmentId: submission.assignmentId, ...ownerWhere },
    orderBy: { version: "desc" },
    select: { id: true, status: true },
  });

  const latestGraded = siblings.find((s) =>
    (GALLERY_STATUSES as readonly string[]).includes(s.status),
  );
  if (!latestGraded) return null; // nothing graded yet in this chain

  const existing = await db.galleryItem.findFirst({
    where: { submissionId: { in: siblings.map((s) => s.id) } },
  });
  if (existing) {
    if (existing.submissionId === latestGraded.id) return existing; // idempotent
    // Supersede: move the item to the latest graded version. Featured flag and
    // caption are curation state and survive; the screenshot is stale content
    // and resets (the capture job re-runs for app-type resubmissions).
    return db.galleryItem.update({
      where: { id: existing.id },
      data: { submissionId: latestGraded.id, screenshotS3Key: null },
    });
  }
  return db.galleryItem.create({ data: { submissionId: latestGraded.id } });
}

/**
 * Backfill: sync every graded/finalised submission of a galleryEligible type.
 * Returns how many items were created or moved.
 */
export async function backfillGalleryItems(deps: GalleryDeps = {}): Promise<number> {
  const db = deps.prisma ?? defaultPrisma;
  const candidates = await db.submission.findMany({
    where: {
      status: { in: [...GALLERY_STATUSES] },
      assignment: { assignmentType: { galleryEligible: true } },
    },
    select: { id: true, galleryItem: { select: { id: true } } },
  });
  let changed = 0;
  for (const c of candidates) {
    const before = c.galleryItem?.id ?? null;
    const item = await syncGalleryItem(c.id, deps);
    if (item && item.submissionId === c.id && before === null) changed++;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// getGalleryWalls — the ONLY read surface for gallery payloads
// ---------------------------------------------------------------------------

export interface GalleryWallItem {
  id: string;
  submissionId: string;
  wall: WallKey;
  /** Assignment title, e.g. "S4 · Lovable app". */
  title: string;
  /** Instructor caption, falling back to the student's own writeup excerpt. */
  caption: string | null;
  /** Team name (team artifacts) or student name. */
  displayName: string;
  sectionCode: string | null;
  sectorName: string | null;
  featured: boolean;
  /** Presigned screenshot URL (app wall). Null when absent/blocked/unsigned. */
  screenshotUrl: string | null;
  /** External links derived from fields (app wall only). */
  links: { appUrl?: string; githubUrl?: string };
  /** Presigned file downloads (workflow: only when featured; maps: always). */
  files: { label: string; url: string }[];
  /** True when workflow files exist but are withheld pending featuring. */
  filesWithheld: boolean;
  /** Single letter for the branded placeholder card. */
  placeholderInitial: string;
}

export interface GalleryWalls {
  app: GalleryWallItem[];
  workflow: GalleryWallItem[];
  maps: GalleryWallItem[];
  /** Distinct sector names across all items (for the filter control). */
  sectors: string[];
  /** All sections, for the filter control. */
  sections: { id: string; code: string }[];
}

export interface GalleryFilter {
  sectionId?: string;
  sector?: string;
}

function excerpt(value: unknown, max = 160): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = value.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function fileLabel(key: string): string {
  const base = key.split("/").pop() ?? key;
  if (/blueprint/i.test(base)) return "Blueprint JSON";
  if (/recording/i.test(base) || /\.mp4$/i.test(base)) return "Recording";
  if (/\.pdf$/i.test(base)) return `Map PDF · ${base}`;
  if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return `Map image · ${base}`;
  return base;
}

async function presignOrNull(key: string): Promise<string | null> {
  if (!s3Configured()) return null;
  try {
    return await presignGet(key);
  } catch {
    return null;
  }
}

/**
 * The three login-gated gallery walls. Cross-section by design — every
 * student sees every section's work; filters only narrow the view.
 */
export async function getGalleryWalls(
  opts: { filter?: GalleryFilter; deps?: GalleryDeps } = {},
): Promise<GalleryWalls> {
  const db = opts.deps?.prisma ?? defaultPrisma;
  const filter = opts.filter ?? {};

  const [rows, sections] = await Promise.all([
    db.galleryItem.findMany({
      where: {
        submission: {
          assignment: {
            assignmentType: { slug: { in: Object.values(WALL_SLUGS) } },
          },
        },
      },
      // STRICT projection: no grade relation is ever selected here.
      select: {
        id: true,
        featured: true,
        caption: true,
        screenshotS3Key: true,
        submission: {
          select: {
            id: true,
            fields: true,
            files: true,
            assignment: {
              select: { title: true, assignmentType: { select: { slug: true } } },
            },
            user: {
              select: { name: true, section: { select: { id: true, code: true } } },
            },
            team: {
              select: {
                name: true,
                sectorName: true,
                section: { select: { id: true, code: true } },
              },
            },
          },
        },
      },
    }),
    db.section.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);

  const slugToWall = new Map<string, WallKey>(
    (Object.entries(WALL_SLUGS) as [WallKey, string][]).map(([wall, slug]) => [slug, wall]),
  );

  const allSectors = new Set<string>();
  const walls: GalleryWalls = { app: [], workflow: [], maps: [], sectors: [], sections };

  for (const row of rows) {
    const sub = row.submission;
    const wall = slugToWall.get(sub.assignment.assignmentType.slug);
    if (!wall) continue;

    const section = sub.team?.section ?? sub.user?.section ?? null;
    const sectorName = sub.team?.sectorName ?? null;
    if (sectorName) allSectors.add(sectorName);

    if (filter.sectionId && section?.id !== filter.sectionId) continue;
    if (filter.sector && sectorName !== filter.sector) continue;

    const fields = (sub.fields ?? {}) as Record<string, unknown>;
    const displayName = sub.team?.name ?? sub.user?.name ?? "Unknown";

    const links: GalleryWallItem["links"] = {};
    if (wall === "app") {
      if (typeof fields.appUrl === "string") links.appUrl = fields.appUrl;
      if (typeof fields.githubUrl === "string") links.githubUrl = fields.githubUrl;
    }

    // Files: workflow downloads (blueprint + recording — may contain partner
    // company detail) are exposed ONLY when featured; map files always.
    let files: GalleryWallItem["files"] = [];
    let filesWithheld = false;
    if (wall === "workflow" || wall === "maps") {
      if (wall === "workflow" && !row.featured) {
        filesWithheld = sub.files.length > 0;
      } else {
        files = (
          await Promise.all(
            sub.files.map(async (key) => {
              const url = await presignOrNull(key);
              return url ? [{ label: fileLabel(key), url }] : [];
            }),
          )
        ).flat();
      }
    }

    const screenshotUrl =
      row.screenshotS3Key && row.screenshotS3Key !== SCREENSHOT_BLOCKED
        ? await presignOrNull(row.screenshotS3Key)
        : null;

    const caption =
      row.caption ??
      excerpt(fields.writeup) ??
      excerpt(fields.usefulness) ??
      excerpt(fields.summary);

    walls[wall].push({
      id: row.id,
      submissionId: sub.id,
      wall,
      title: sub.assignment.title,
      caption,
      displayName,
      sectionCode: section?.code ?? null,
      sectorName,
      featured: row.featured,
      screenshotUrl,
      links,
      files,
      filesWithheld,
      placeholderInitial: (displayName.trim()[0] ?? "?").toUpperCase(),
    });
  }

  for (const wall of ["app", "workflow", "maps"] as const) {
    walls[wall].sort((a, b) =>
      a.featured === b.featured ? a.displayName.localeCompare(b.displayName) : a.featured ? -1 : 1,
    );
  }
  walls.sectors = [...allSectors].sort((a, b) => a.localeCompare(b));
  return walls;
}
