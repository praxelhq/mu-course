import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import {
  fingerprintPublicationSource,
  parsePublicationPolicy,
  projectPublication,
  type PublicationEvidence,
  type PublicationPolicy,
  type PublicationProjection,
} from "@/lib/publication-policy";

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
// Workflow artifacts (blueprints, recordings and logs) can contain secrets or
// partner-company process detail. They are never exposed through a legacy
// Submission.files fallback, even when a card is featured. Versioned workflow
// actions come only from the immutable publication-policy allowlist.

/** Sentinel stored in screenshotS3Key when the appUrl failed the SSRF policy. */
export const SCREENSHOT_BLOCKED = "blocked";
export const EXTERNAL_FINGERPRINT_PREFIX = "external-fingerprint:sha256:";

export function isExternalFingerprintMarker(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(EXTERNAL_FINGERPRINT_PREFIX));
}

export const WALL_SLUGS = {
  app: "app",
  workflow: "workflow",
  maps: "value-chain-map",
} as const;

export type WallKey = keyof typeof WALL_SLUGS;

export interface GalleryDeps {
  prisma?: PrismaClient;
  /** Test seam; defaults to the pg-boss screenshot queue. */
  enqueuePreviewCapture?: (submissionId: string) => Promise<unknown>;
  /** Worker-only: a freshly captured preview can make this exact version eligible. */
  previewS3Key?: string;
  previewS3VersionId?: string;
}

export type VersionedPublicationChain = {
  assignmentId: string;
  assessmentVersionId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
};

type CanonicalVersionedPublicationChain = {
  assignmentId: string;
  ownerKind: "individual" | "team";
  ownerId: string;
};

function canonicalVersionedPublicationChain(
  chain: VersionedPublicationChain,
): CanonicalVersionedPublicationChain | null {
  if (!chain.assessmentVersionId || !chain.ownerKind || !chain.ownerId) return null;
  return {
    assignmentId: chain.assignmentId,
    ownerKind: chain.ownerKind,
    ownerId: chain.ownerId,
  };
}

function versionedPublicationChainKey(
  chain: CanonicalVersionedPublicationChain,
): string {
  return JSON.stringify([chain.assignmentId, chain.ownerKind, chain.ownerId]);
}

function publicationDecisionRevoked(
  decision: {
    ownerRevokedAt: Date | null;
    instructorState: "pending" | "approved" | "withheld" | "revoked";
  } | null,
): boolean {
  return Boolean(decision?.ownerRevokedAt || decision?.instructorState === "revoked");
}

/**
 * Revocation is an owner-chain decision, not a materialized GalleryItem
 * property. Public reads call this source-of-truth check so a failed
 * best-effort projection sync cannot leave an older version accessible.
 * Missing immutable owner identity fails closed for versioned rows.
 */
export async function isVersionedPublicationChainRevoked(
  chain: VersionedPublicationChain,
  deps: Pick<GalleryDeps, "prisma"> = {},
): Promise<boolean> {
  if (!chain.assessmentVersionId) return false;
  if (!chain.ownerKind || !chain.ownerId) return true;
  const db = deps.prisma ?? defaultPrisma;
  const newest = await db.submission.findFirst({
    where: {
      assignmentId: chain.assignmentId,
      assessmentVersionId: { not: null },
      ownerKind: chain.ownerKind,
      ownerId: chain.ownerId,
    },
    orderBy: [{ version: "desc" }, { attempt: "desc" }],
    select: {
      publicationDecision: {
        select: { ownerRevokedAt: true, instructorState: true },
      },
    },
  });
  if (!newest) return true;
  return publicationDecisionRevoked(newest.publicationDecision);
}

/**
 * Resolve newest-chain revocation for a gallery page in one database query.
 * Missing canonical identity and missing newest rows deliberately remain
 * absent from the map so the projection lookup fails closed.
 */
async function loadVersionedPublicationChainRevocations(
  chains: readonly VersionedPublicationChain[],
  db: PrismaClient,
): Promise<Map<string, boolean>> {
  const canonicalByKey = new Map<string, CanonicalVersionedPublicationChain>();
  for (const chain of chains) {
    const canonical = canonicalVersionedPublicationChain(chain);
    if (canonical) canonicalByKey.set(versionedPublicationChainKey(canonical), canonical);
  }
  if (canonicalByKey.size === 0) return new Map();

  const rows = await db.submission.findMany({
    where: {
      assessmentVersionId: { not: null },
      OR: [...canonicalByKey.values()],
    },
    orderBy: [
      { assignmentId: "asc" },
      { ownerKind: "asc" },
      { ownerId: "asc" },
      { version: "desc" },
      { attempt: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: {
      assignmentId: true,
      ownerKind: true,
      ownerId: true,
      publicationDecision: {
        select: { ownerRevokedAt: true, instructorState: true },
      },
    },
  });

  const revocationByKey = new Map<string, boolean>();
  for (const row of rows) {
    if (!row.ownerKind || !row.ownerId) continue;
    const key = versionedPublicationChainKey({
      assignmentId: row.assignmentId,
      ownerKind: row.ownerKind,
      ownerId: row.ownerId,
    });
    if (!revocationByKey.has(key)) {
      revocationByKey.set(key, publicationDecisionRevoked(row.publicationDecision));
    }
  }
  return revocationByKey;
}

function versionedPublicationChainRevokedFromBatch(
  chain: VersionedPublicationChain,
  revocationByKey: ReadonlyMap<string, boolean>,
): boolean {
  if (!chain.assessmentVersionId) return false;
  const canonical = canonicalVersionedPublicationChain(chain);
  if (!canonical) return true;
  return revocationByKey.get(versionedPublicationChainKey(canonical)) ?? true;
}

export type VersionedPublicationCandidate = {
  id: string;
  version: number;
  attempt: number;
  status: string;
  publishable: boolean;
  ownerConsent: boolean;
  ownerRevokedAt: Date | null;
  instructorState: "pending" | "approved" | "withheld" | "revoked";
  previewReady: boolean;
  reviewCurrent: boolean;
};

/**
 * Latest-publishable selection is intentionally different from latest
 * submitted/evaluated/scoreable. A pending or unsafe V2 leaves the last safe
 * V1 in place. An explicit owner revocation on the newest attempt removes the
 * projection altogether instead of silently resurrecting an older version.
 */
export function selectLatestPublishableCandidate<T extends VersionedPublicationCandidate>(
  candidates: readonly T[],
): T | null {
  const newestFirst = [...candidates].sort(
    (a, b) => b.version - a.version || b.attempt - a.attempt,
  );
  const newest = newestFirst[0];
  if (newest?.ownerRevokedAt || newest?.instructorState === "revoked") {
    return null;
  }
  return (
    newestFirst.find(
      (candidate) =>
        (candidate.status === "graded" || candidate.status === "finalised") &&
        candidate.publishable &&
        candidate.ownerConsent &&
        !candidate.ownerRevokedAt &&
        candidate.instructorState === "approved" &&
        candidate.previewReady &&
        candidate.reviewCurrent,
    ) ?? null
  );
}

export function buildVersionedGalleryProjection(args: {
  policy: PublicationPolicy;
  fields: Record<string, unknown>;
  evidence: PublicationEvidence[];
  ownerConsent: boolean;
  instructorState: "pending" | "approved" | "withheld" | "revoked";
  reviewedFingerprint: string | null;
  currentFingerprint: string | null;
}): PublicationProjection {
  const reviewedFingerprints: Record<string, string | undefined> = {};
  const currentFingerprints: Record<string, string | undefined> = {};
  for (const action of args.policy.actions) {
    if (action.kind !== "external-url") continue;
    reviewedFingerprints[action.field] = args.reviewedFingerprint ?? undefined;
    currentFingerprints[action.field] = args.currentFingerprint ?? undefined;
  }
  return projectPublication({
    policy: args.policy,
    fields: args.fields,
    evidence: args.evidence,
    consent: { active: args.ownerConsent },
    curation: { status: args.instructorState },
    reviewedFingerprints,
    currentFingerprints,
  });
}

export function isPublicEvidenceRole(policy: PublicationPolicy, role: string): boolean {
  return (
    policy.previewRole === role ||
    policy.actions.some((action) => action.kind === "roster-file" && action.role === role)
  );
}

/** Explicit legacy image compatibility without a workflow raw-file fallback. */
export function selectLegacyGalleryImageKey(args: {
  assignmentTypeSlug: string;
  fields: unknown;
  files: readonly string[];
  screenshotS3Key: string | null;
}): string | null {
  if (args.assignmentTypeSlug === WALL_SLUGS.workflow) return args.screenshotS3Key;
  const fields =
    args.fields && typeof args.fields === "object" && !Array.isArray(args.fields)
      ? (args.fields as Record<string, unknown>)
      : {};
  return typeof fields.image === "string" && fields.image
    ? fields.image
    : (args.files[0] ?? null);
}

export function selectGalleryOwnerScope(args: {
  assessmentVersionId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
  legacyTeamBased: boolean;
  teamId: string | null;
  userId: string;
}):
  | { ownerKind: "individual" | "team"; ownerId: string }
  | { teamId: string }
  | { userId: string }
  | null {
  if (args.assessmentVersionId) {
    return args.ownerKind && args.ownerId
      ? { ownerKind: args.ownerKind, ownerId: args.ownerId }
      : null;
  }
  if (args.legacyTeamBased && args.teamId) return { teamId: args.teamId };
  return { userId: args.userId };
}

// ---------------------------------------------------------------------------
// syncGalleryItem — call after grading persists (worker) or from backfill
// ---------------------------------------------------------------------------

const GALLERY_STATUSES = ["graded", "finalised"] as const;
// Ungraded gallery types (aiGraded=false: memes, AI-image submissions) never
// reach "graded", so they publish to the gallery the moment they are submitted.
const PUBLISHED_STATUSES = ["submitted", "graded", "finalised"] as const;

function galleryStatusesFor(aiGraded: boolean): readonly string[] {
  return aiGraded ? GALLERY_STATUSES : PUBLISHED_STATUSES;
}

type GalleryItemRow = {
  id: string;
  submissionId: string;
  featured: boolean;
  caption: string | null;
  screenshotS3Key: string | null;
  screenshotS3VersionId: string | null;
};

type VersionedSibling = VersionedPublicationCandidate & {
  fields: Record<string, unknown>;
  policy: PublicationPolicy | null;
  evidence: {
    id: string;
    fieldKey: string;
    fileRole: string;
    scanState: string;
    sha256: string;
    s3VersionId: string;
    byteCount: number;
  }[];
  reviewedFingerprint: string | null;
  screenshotS3Key: string | null;
  screenshotS3VersionId: string | null;
  stagedPreviewS3Key: string | null;
  stagedPreviewS3VersionId: string | null;
};

function evidenceHasCleanRole(
  evidence: VersionedSibling["evidence"],
  role: string,
): boolean {
  return evidence.some((item) => item.fileRole === role && item.scanState === "clean");
}

function versionedPreviewReady(args: {
  siblingId: string;
  requestedSubmissionId: string;
  policy: PublicationPolicy;
  evidence: VersionedSibling["evidence"];
  existingScreenshotKey: string | null;
  stagedPreviewKey: string | null;
  incomingPreviewKey?: string;
}): boolean {
  if (evidenceHasCleanRole(args.evidence, args.policy.previewRole)) return true;
  if (args.policy.wall !== "app") return false;
  if (args.siblingId === args.requestedSubmissionId && args.incomingPreviewKey) return true;
  const previewKey = args.stagedPreviewKey ?? args.existingScreenshotKey;
  return Boolean(previewKey && previewKey !== SCREENSHOT_BLOCKED);
}

async function enqueuePreviewCapture(
  submissionId: string,
  deps: GalleryDeps,
): Promise<void> {
  if (deps.enqueuePreviewCapture) {
    await deps.enqueuePreviewCapture(submissionId);
    return;
  }
  const { enqueueScreenshotCapture } = await import("@/lib/queue");
  await enqueueScreenshotCapture(submissionId);
}

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
  const isVersioned = Boolean(submission.assessmentVersionId);
  if (!isVersioned && !submission.assignment.assignmentType.galleryEligible) return null;

  // Versioned ownership comes only from the immutable contract binding. The
  // mutable AssignmentType.teamBased flag remains an explicit legacy bridge.
  const ownerWhere = selectGalleryOwnerScope({
    assessmentVersionId: submission.assessmentVersionId,
    ownerKind: submission.ownerKind,
    ownerId: submission.ownerId,
    legacyTeamBased: submission.assignment.assignmentType.teamBased,
    teamId: submission.teamId,
    userId: submission.userId,
  });
  if (!ownerWhere) return null;
  const siblings = await db.submission.findMany({
    where: { assignmentId: submission.assignmentId, ...ownerWhere },
    orderBy: { version: "desc" },
    select: {
      id: true,
      status: true,
      version: true,
      attempt: true,
      fields: true,
      assessmentVersionId: true,
      assessmentVersion: {
        select: { publicationPolicy: true, publicSchema: true },
      },
      assessmentResult: { select: { publishable: true } },
      publicationDecision: {
        select: {
          ownerConsent: true,
          ownerRevokedAt: true,
          instructorState: true,
          reviewedFingerprint: true,
          previewS3Key: true,
          previewS3VersionId: true,
        },
      },
      evidence: {
        select: {
          id: true,
          fieldKey: true,
          fileRole: true,
          scanState: true,
          sha256: true,
          s3VersionId: true,
          byteCount: true,
        },
      },
      galleryItem: { select: { screenshotS3Key: true, screenshotS3VersionId: true } },
    },
  });

  if (isVersioned) {
    const candidates: VersionedSibling[] = siblings.flatMap((row) => {
      const versioned = row as unknown as {
        id: string;
        status: string;
        version: number;
        attempt: number;
        fields: unknown;
        assessmentVersionId: string | null;
        assessmentVersion: { publicationPolicy: unknown; publicSchema: unknown } | null;
        assessmentResult: { publishable: boolean } | null;
        publicationDecision: {
          ownerConsent: boolean;
          ownerRevokedAt: Date | null;
          instructorState: "pending" | "approved" | "withheld" | "revoked";
          reviewedFingerprint: string | null;
          previewS3Key: string | null;
          previewS3VersionId: string | null;
        } | null;
        evidence: VersionedSibling["evidence"];
        galleryItem: {
          screenshotS3Key: string | null;
          screenshotS3VersionId: string | null;
        } | null;
      };
      if (!versioned.assessmentVersionId || !versioned.assessmentVersion) return [];
      const policy = parsePublicationPolicy(versioned.assessmentVersion.publicationPolicy);
      const fields =
        versioned.fields && typeof versioned.fields === "object" && !Array.isArray(versioned.fields)
          ? (versioned.fields as Record<string, unknown>)
          : {};
      const referencedEvidence = selectReferencedEvidence({
        publicSchema: versioned.assessmentVersion.publicSchema,
        fields,
        evidence: versioned.evidence,
      });
      const previewReady = policy
        ? versionedPreviewReady({
            siblingId: versioned.id,
            requestedSubmissionId: submissionId,
            policy,
            evidence: referencedEvidence,
            existingScreenshotKey: versioned.galleryItem?.screenshotS3Key ?? null,
            stagedPreviewKey: versioned.publicationDecision?.previewS3Key ?? null,
            incomingPreviewKey: deps.previewS3Key,
          })
        : false;
      const stagedPreviewS3Key =
        versioned.publicationDecision?.previewS3Key ??
        (versioned.id === submissionId ? deps.previewS3Key ?? null : null);
      const stagedPreviewS3VersionId =
        versioned.publicationDecision?.previewS3VersionId ??
        (versioned.id === submissionId ? deps.previewS3VersionId ?? null : null);
      const currentPreviewRef = stagedPreviewS3Key ?? versioned.galleryItem?.screenshotS3Key ?? null;
      const fingerprintReady =
        !policy ||
        policy.wall === "app" ||
        !policy.actions.some(
          (action) => action.kind === "external-url" && action.requireReviewedFingerprint,
        ) ||
        isExternalFingerprintMarker(currentPreviewRef);
      const currentFingerprint =
        policy && fingerprintReady && currentPreviewRef !== SCREENSHOT_BLOCKED
          ? fingerprintPublicationSource({
              policy,
              fields,
              evidence: referencedEvidence.map((item) => ({
                role: item.fileRole,
                sha256: item.sha256,
                s3VersionId: item.s3VersionId,
                byteCount: item.byteCount,
              })),
              previewRef: currentPreviewRef,
            })
          : null;
      return [
        {
          id: versioned.id,
          version: versioned.version,
          attempt: versioned.attempt,
          status: versioned.status,
          publishable: versioned.assessmentResult?.publishable === true,
          ownerConsent: versioned.publicationDecision?.ownerConsent === true,
          ownerRevokedAt: versioned.publicationDecision?.ownerRevokedAt ?? null,
          instructorState: versioned.publicationDecision?.instructorState ?? "pending",
          previewReady,
          reviewCurrent: Boolean(
            currentFingerprint &&
              versioned.publicationDecision?.reviewedFingerprint === currentFingerprint,
          ),
          fields,
          policy,
          evidence: referencedEvidence,
          reviewedFingerprint: versioned.publicationDecision?.reviewedFingerprint ?? null,
          screenshotS3Key: versioned.galleryItem?.screenshotS3Key ?? null,
          screenshotS3VersionId: versioned.galleryItem?.screenshotS3VersionId ?? null,
          stagedPreviewS3Key,
          stagedPreviewS3VersionId,
        },
      ];
    });
    const existing = await db.galleryItem.findFirst({
      where: { submissionId: { in: candidates.map((candidate) => candidate.id) } },
    });
    const newest = [...candidates].sort(
      (a, b) => b.version - a.version || b.attempt - a.attempt,
    )[0];
    if (
      newest &&
      (newest.ownerRevokedAt || newest.instructorState === "revoked")
    ) {
      if (existing && existing.submissionId !== newest.id) {
        await db.galleryItem.update({
          where: { id: existing.id },
          data: {
            submissionId: newest.id,
            screenshotS3Key: null,
            screenshotS3VersionId: null,
          },
        });
      }
      return null;
    }

    const selected = selectLatestPublishableCandidate(candidates);
    if (!selected) {
      const previewPending = candidates.find(
        (candidate) =>
          candidate.id === submissionId &&
          candidate.policy?.wall === "app" &&
          (candidate.status === "graded" || candidate.status === "finalised") &&
          candidate.publishable &&
          candidate.ownerConsent &&
          (candidate.instructorState === "pending" ||
            candidate.instructorState === "approved") &&
          !candidate.previewReady,
      );
      if (previewPending) await enqueuePreviewCapture(previewPending.id, deps);
      return existing;
    }

    const nextScreenshotKey =
      selected.stagedPreviewS3Key ??
      (selected.id === submissionId && deps.previewS3Key
        ? deps.previewS3Key
        : selected.screenshotS3Key);
    const nextScreenshotVersionId =
      !nextScreenshotKey ||
      nextScreenshotKey === SCREENSHOT_BLOCKED ||
      isExternalFingerprintMarker(nextScreenshotKey)
        ? null
        : selected.stagedPreviewS3Key
          ? selected.stagedPreviewS3VersionId
          : selected.id === submissionId && deps.previewS3Key
            ? (deps.previewS3VersionId ?? null)
            : selected.screenshotS3VersionId;
    const needsExternalFingerprint = Boolean(
      selected.policy?.wall !== "app" &&
        selected.policy?.actions.some(
          (action) => action.kind === "external-url" && action.requireReviewedFingerprint,
        ) &&
        !isExternalFingerprintMarker(nextScreenshotKey),
    );
    const finish = async (item: GalleryItemRow): Promise<GalleryItemRow> => {
      if (needsExternalFingerprint) await enqueuePreviewCapture(selected.id, deps);
      return item;
    };
    if (existing) {
      if (
        existing.submissionId === selected.id &&
        existing.screenshotS3Key === nextScreenshotKey &&
        existing.screenshotS3VersionId === nextScreenshotVersionId
      ) {
        return finish(existing);
      }
      return finish(
        await db.galleryItem.update({
          where: { id: existing.id },
          data: {
            submissionId: selected.id,
            screenshotS3Key: nextScreenshotKey,
            screenshotS3VersionId: nextScreenshotVersionId,
          },
        }),
      );
    }
    return finish(
      await db.galleryItem.create({
        data: {
          submissionId: selected.id,
          screenshotS3Key: nextScreenshotKey,
          screenshotS3VersionId: nextScreenshotVersionId,
        },
      }),
    );
  }

  const statuses = galleryStatusesFor(submission.assignment.assignmentType.aiGraded);
  const latestGraded = siblings.find((s) => statuses.includes(s.status));
  if (!latestGraded) return null; // nothing publishable yet in this chain

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
      data: {
        submissionId: latestGraded.id,
        screenshotS3Key: null,
        screenshotS3VersionId: null,
      },
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
      status: { in: [...PUBLISHED_STATUSES] },
      OR: [
        { assessmentVersionId: { not: null } },
        {
          assessmentVersionId: null,
          assignment: { assignmentType: { galleryEligible: true } },
        },
      ],
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
  /** Presigned legacy map downloads. Workflow raw files are never exposed. */
  files: { label: string; url: string }[];
  /** Policy-approved versioned actions; never includes raw blueprint/log files. */
  actions: { label: string; url: string }[];
  /** True when private legacy workflow files exist but are intentionally withheld. */
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
  if (/\.pdf$/i.test(base)) return `Map PDF · ${base}`;
  if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return `Map image · ${base}`;
  return base;
}

async function presignOrNull(key: string, versionId?: string | null): Promise<string | null> {
  if (!s3Configured()) return null;
  try {
    return await presignGet(key, { versionId: versionId ?? undefined });
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
          OR: [
            { assessmentVersionId: { not: null } },
            {
              assignment: {
                assignmentType: { slug: { in: Object.values(WALL_SLUGS) } },
              },
            },
          ],
        },
      },
      // STRICT projection: no grade relation is ever selected here.
      select: {
        id: true,
        featured: true,
        caption: true,
        screenshotS3Key: true,
        screenshotS3VersionId: true,
        submission: {
          select: {
            id: true,
            assignmentId: true,
            fields: true,
            files: true,
            ownerKind: true,
            ownerId: true,
            assessmentVersionId: true,
            assessmentVersion: {
              select: { publicationPolicy: true, publicSchema: true },
            },
            assessmentResult: { select: { publishable: true } },
            publicationDecision: {
              select: {
                ownerConsent: true,
                ownerRevokedAt: true,
                instructorState: true,
                reviewedFingerprint: true,
                previewS3Key: true,
                previewS3VersionId: true,
              },
            },
            evidence: {
              select: {
                id: true,
                fieldKey: true,
                fileRole: true,
                scanState: true,
                sha256: true,
                s3VersionId: true,
                byteCount: true,
              },
            },
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
  const chainRevocations = await loadVersionedPublicationChainRevocations(
    rows.map((row) => row.submission),
    db,
  );

  for (const row of rows) {
    const sub = row.submission;
    const versionedSub = sub as typeof sub & {
      assignmentId: string;
      assessmentVersionId: string | null;
      ownerKind: "individual" | "team" | null;
      ownerId: string | null;
      assessmentVersion: { publicationPolicy: unknown; publicSchema: unknown } | null;
      assessmentResult: { publishable: boolean } | null;
      publicationDecision: {
        ownerConsent: boolean;
        ownerRevokedAt: Date | null;
        instructorState: "pending" | "approved" | "withheld" | "revoked";
        reviewedFingerprint: string | null;
        previewS3Key: string | null;
        previewS3VersionId: string | null;
      } | null;
      evidence: {
        id: string;
        fieldKey: string;
        fileRole: string;
        scanState: string;
        sha256: string;
        s3VersionId: string;
        byteCount: number;
      }[];
    };
    const section = sub.team?.section ?? sub.user?.section ?? null;
    const sectorName = sub.team?.sectorName ?? null;

    if (filter.sectionId && section?.id !== filter.sectionId) continue;
    if (filter.sector && sectorName !== filter.sector) continue;

    const fields = (sub.fields ?? {}) as Record<string, unknown>;
    const displayName =
      versionedSub.assessmentVersionId && versionedSub.ownerKind === "individual"
        ? (sub.user?.name ?? "Unknown")
        : (sub.team?.name ?? sub.user?.name ?? "Unknown");

    if (versionedSub.assessmentVersionId) {
      if (versionedPublicationChainRevokedFromBatch(versionedSub, chainRevocations)) {
        continue;
      }
      const policy = parsePublicationPolicy(versionedSub.assessmentVersion?.publicationPolicy);
      const decision = versionedSub.publicationDecision;
      if (
        !policy ||
        !versionedSub.assessmentResult?.publishable ||
        !decision ||
        decision.ownerRevokedAt ||
        !decision.ownerConsent ||
        decision.instructorState !== "approved"
      ) {
        continue;
      }
      const referencedEvidence = selectReferencedEvidence({
        publicSchema: versionedSub.assessmentVersion?.publicSchema,
        fields,
        evidence: versionedSub.evidence,
      });

      const allowedRoles = new Set([
        policy.previewRole,
        ...policy.actions.flatMap((action) =>
          action.kind === "roster-file" ? [action.role] : [],
        ),
      ]);
      const evidence: PublicationEvidence[] = referencedEvidence
        .filter((item) => allowedRoles.has(item.fileRole))
        .map((item) => ({
          role: item.fileRole,
          publicUrl: `/api/gallery/evidence/${encodeURIComponent(sub.id)}/${encodeURIComponent(item.fileRole)}`,
          state:
            item.scanState === "clean"
              ? "clean"
              : item.scanState === "quarantined"
                ? "quarantined"
                : item.scanState === "deleted"
                  ? "replaced"
                  : "pending",
        }));
      if (
        policy.wall === "app" &&
        row.screenshotS3Key &&
        row.screenshotS3Key !== SCREENSHOT_BLOCKED &&
        !evidence.some((item) => item.role === policy.previewRole)
      ) {
        evidence.push({
          role: policy.previewRole,
          publicUrl: `/api/gallery/image/${encodeURIComponent(sub.id)}`,
          state: "clean",
        });
      }
      const requiresExternalFingerprint = policy.actions.some(
        (action) => action.kind === "external-url" && action.requireReviewedFingerprint,
      ) && policy.wall !== "app";
      const currentFingerprint =
        requiresExternalFingerprint &&
        !isExternalFingerprintMarker(
          decision.previewS3Key ?? row.screenshotS3Key,
        )
          ? null
          : (decision.previewS3Key ?? row.screenshotS3Key) === SCREENSHOT_BLOCKED
            ? null
          : fingerprintPublicationSource({
              policy,
              fields,
              evidence: referencedEvidence.map((item) => ({
                role: item.fileRole,
                sha256: item.sha256,
                s3VersionId: item.s3VersionId,
                byteCount: item.byteCount,
              })),
              previewRef: decision.previewS3Key ?? row.screenshotS3Key,
            });
      const projection = buildVersionedGalleryProjection({
        policy,
        fields,
        evidence,
        ownerConsent: decision.ownerConsent,
        instructorState: decision.instructorState,
        reviewedFingerprint: decision.reviewedFingerprint,
        currentFingerprint,
      });
      if (!projection.published) continue;

      if (sectorName) allSectors.add(sectorName);
      walls[projection.wall].push({
        id: row.id,
        submissionId: sub.id,
        wall: projection.wall,
        title: sub.assignment.title,
        caption: projection.caption,
        displayName,
        sectionCode: section?.code ?? null,
        sectorName,
        featured: row.featured,
        screenshotUrl: projection.previewUrl,
        links: {},
        files: [],
        actions: projection.actions.map((action) => ({
          label: action.label,
          url: action.target,
        })),
        filesWithheld: false,
        placeholderInitial: (displayName.trim()[0] ?? "?").toUpperCase(),
      });
      continue;
    }

    const wall = slugToWall.get(sub.assignment.assignmentType.slug);
    if (!wall) continue;
    if (sectorName) allSectors.add(sectorName);

    const links: GalleryWallItem["links"] = {};
    if (wall === "app") {
      if (typeof fields.appUrl === "string") links.appUrl = fields.appUrl;
      if (typeof fields.githubUrl === "string") links.githubUrl = fields.githubUrl;
    }

    // Explicit legacy compatibility: maps retain their historical downloads.
    // Workflow files never do — featuring is curation, not declassification.
    let files: GalleryWallItem["files"] = [];
    const filesWithheld = wall === "workflow" && sub.files.length > 0;
    if (wall === "maps") {
      files = (
        await Promise.all(
          sub.files.map(async (key) => {
            const url = await presignOrNull(key);
            return url ? [{ label: fileLabel(key), url }] : [];
          }),
        )
      ).flat();
    }

    const screenshotUrl =
      row.screenshotS3Key && row.screenshotS3Key !== SCREENSHOT_BLOCKED
        ? await presignOrNull(row.screenshotS3Key, row.screenshotS3VersionId)
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
      actions: [],
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
