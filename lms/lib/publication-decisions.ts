import type { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { SCREENSHOT_BLOCKED, syncGalleryItem } from "@/lib/galleries";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import {
  fingerprintPublicationSource,
  parsePublicationPolicy,
} from "@/lib/publication-policy";

export type PublicationReviewState = "pending" | "approved" | "withheld" | "revoked";

export type PublicationDecisionRecord = {
  id: string;
  submissionId: string;
  ownerConsent: boolean;
  ownerConsentBy: string | null;
  ownerConsentAt: Date | null;
  ownerRevokedAt: Date | null;
  instructorState: PublicationReviewState;
  instructorDecidedBy: string | null;
  instructorDecidedAt: Date | null;
  instructorReason: string | null;
  reviewedFingerprint: string | null;
  reviewedAt: Date | null;
  /** Private staging reference for instructor preview; never serialized publicly. */
  previewS3Key: string | null;
};

export type PublicationDecisionPatch = Partial<
  Omit<PublicationDecisionRecord, "id" | "submissionId">
>;

export type PublicationSubmissionOwner = {
  id: string;
  userId: string;
  teamId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
};

export type PublicationSubmissionSource = PublicationSubmissionOwner & {
  fields: Record<string, unknown>;
  publicationPolicy: unknown;
  evidence: Array<{
    id: string;
    fieldKey: string;
    fileRole: string;
    sha256: string;
    s3VersionId: string;
    byteCount: number;
    scanState: "pending" | "clean" | "quarantined" | "deleted";
  }>;
  previewRef: string | null;
};

type PublicationAuditEntry = {
  actorId: string;
  action: string;
  targetType: "submission";
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export type PublicationDecisionStore = {
  getOwnership: (submissionId: string) => Promise<PublicationSubmissionOwner | null>;
  getReviewSource: (submissionId: string) => Promise<PublicationSubmissionSource | null>;
  getDecision: (submissionId: string) => Promise<PublicationDecisionRecord | null>;
  saveDecision: (
    submissionId: string,
    patch: PublicationDecisionPatch,
  ) => Promise<PublicationDecisionRecord>;
  createAudit: (entry: PublicationAuditEntry) => Promise<void>;
};

export type PublicationDecisionDeps = {
  now?: () => Date;
  transaction?: <T>(work: (store: PublicationDecisionStore) => Promise<T>) => Promise<T>;
  /** Best-effort projection reconciliation; policy reads still fail closed if this is delayed. */
  syncProjection?: (submissionId: string) => Promise<void>;
};

type PublicationDecisionView = {
  submissionId: string;
  ownerConsent: boolean;
  ownerConsentAt: string | null;
  ownerRevokedAt: string | null;
  instructorState: PublicationReviewState;
  instructorReason: string | null;
  reviewedFingerprint: string | null;
  reviewedAt: string | null;
};

export class PublicationDecisionError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "PublicationDecisionError";
    this.status = status;
  }
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function prismaStore(tx: Prisma.TransactionClient): PublicationDecisionStore {
  return {
    getOwnership: (submissionId) =>
      tx.submission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          userId: true,
          teamId: true,
          ownerKind: true,
          ownerId: true,
        },
      }),
    getReviewSource: async (submissionId) => {
      const row = await tx.submission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          userId: true,
          teamId: true,
          ownerKind: true,
          ownerId: true,
          fields: true,
          assessmentVersion: {
            select: { publicationPolicy: true, publicSchema: true },
          },
          evidence: {
            where: { scanState: "clean" },
            select: {
              id: true,
              fieldKey: true,
              fileRole: true,
              sha256: true,
              s3VersionId: true,
              byteCount: true,
              scanState: true,
            },
          },
          publicationDecision: { select: { previewS3Key: true } },
          galleryItem: { select: { screenshotS3Key: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        teamId: row.teamId,
        ownerKind: row.ownerKind,
        ownerId: row.ownerId,
        fields: jsonRecord(row.fields),
        publicationPolicy: row.assessmentVersion?.publicationPolicy ?? null,
        evidence: selectReferencedEvidence({
          publicSchema: row.assessmentVersion?.publicSchema,
          fields: row.fields,
          evidence: row.evidence,
        }),
        previewRef:
          row.publicationDecision?.previewS3Key ??
          row.galleryItem?.screenshotS3Key ??
          null,
      };
    },
    getDecision: (submissionId) =>
      tx.publicationDecision.findUnique({ where: { submissionId } }),
    saveDecision: (submissionId, patch) =>
      tx.publicationDecision.upsert({
        where: { submissionId },
        create: { submissionId, ...patch },
        update: patch,
      }),
    createAudit: async (entry) => {
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          before: entry.before
            ? (entry.before as Prisma.InputJsonValue)
            : undefined,
          after: entry.after as Prisma.InputJsonValue,
        },
      });
    },
  };
}

function transactionRunner(deps: PublicationDecisionDeps) {
  return (
    deps.transaction ??
    (<T>(work: (store: PublicationDecisionStore) => Promise<T>) =>
      defaultPrisma.$transaction((tx) => work(prismaStore(tx))))
  );
}

function isOwner(
  submission: PublicationSubmissionOwner,
  actor: { userId: string; teamId: string | null },
): boolean {
  if (submission.ownerKind === "team") {
    return Boolean(actor.teamId && submission.ownerId === actor.teamId);
  }
  if (submission.ownerKind === "individual") return submission.ownerId === actor.userId;
  // Explicit legacy compatibility only: old rows predate canonical owner fields.
  if (submission.teamId) return submission.teamId === actor.teamId;
  return submission.userId === actor.userId;
}

function view(decision: PublicationDecisionRecord): PublicationDecisionView {
  return {
    submissionId: decision.submissionId,
    ownerConsent: decision.ownerConsent,
    ownerConsentAt: decision.ownerConsentAt?.toISOString() ?? null,
    ownerRevokedAt: decision.ownerRevokedAt?.toISOString() ?? null,
    instructorState: decision.instructorState,
    instructorReason: decision.instructorReason,
    reviewedFingerprint: decision.reviewedFingerprint,
    reviewedAt: decision.reviewedAt?.toISOString() ?? null,
  };
}

function auditSnapshot(decision: PublicationDecisionRecord | null): Record<string, unknown> | null {
  if (!decision) return null;
  return view(decision);
}

async function reconcileProjection(
  submissionId: string,
  changed: boolean,
  deps: PublicationDecisionDeps,
): Promise<"updated" | "deferred" | "not-needed"> {
  if (!changed) return "not-needed";
  const sync =
    deps.syncProjection ??
    (async (id: string) => {
      await syncGalleryItem(id);
    });
  try {
    await sync(submissionId);
    return "updated";
  } catch {
    // The decision remains authoritative and gallery/Praxy reads fail closed.
    // A later grading/capture/backfill pass can reconcile the materialized row.
    return "deferred";
  }
}

export async function setPublicationConsent(
  input: {
    submissionId: string;
    actor: { userId: string; teamId: string | null };
    consent: boolean;
  },
  deps: PublicationDecisionDeps = {},
): Promise<{
  changed: boolean;
  decision: PublicationDecisionView;
  projectionSync: "updated" | "deferred" | "not-needed";
}> {
  const now = deps.now ?? (() => new Date());
  const mutation = await transactionRunner(deps)(async (store) => {
    const submission = await store.getOwnership(input.submissionId);
    if (!submission) throw new PublicationDecisionError(404, "Unknown submission");
    if (!isOwner(submission, input.actor)) {
      throw new PublicationDecisionError(403, "Only the submission owner can change consent");
    }

    const before = await store.getDecision(input.submissionId);
    const alreadyCurrent = input.consent
      ? before?.ownerConsent === true && before.ownerRevokedAt === null
      : before?.ownerConsent === false && before.ownerRevokedAt !== null;
    if (alreadyCurrent && before) return { changed: false, decision: before };

    const at = now();
    const patch: PublicationDecisionPatch = input.consent
      ? {
          ownerConsent: true,
          ownerConsentBy: input.actor.userId,
          ownerConsentAt: at,
          ownerRevokedAt: null,
        }
      : { ownerConsent: false, ownerRevokedAt: at };
    const decision = await store.saveDecision(input.submissionId, patch);
    await store.createAudit({
      actorId: input.actor.userId,
      action: input.consent ? "publication.consent.grant" : "publication.consent.revoke",
      targetType: "submission",
      targetId: input.submissionId,
      before: auditSnapshot(before),
      after: view(decision),
    });
    return { changed: true, decision };
  });
  return {
    changed: mutation.changed,
    decision: view(mutation.decision),
    projectionSync: await reconcileProjection(input.submissionId, mutation.changed, deps),
  };
}

export async function setInstructorPublicationDecision(
  input: {
    submissionId: string;
    actor: { userId: string; role: "student" | "instructor" | "admin" };
    state: Exclude<PublicationReviewState, "pending">;
    reason?: string;
  },
  deps: PublicationDecisionDeps = {},
): Promise<{
  changed: boolean;
  decision: PublicationDecisionView;
  projectionSync: "updated" | "deferred" | "not-needed";
}> {
  if (input.actor.role !== "instructor" && input.actor.role !== "admin") {
    throw new PublicationDecisionError(403, "Instructor role required");
  }
  const reason = input.reason?.trim() || null;
  if (input.state !== "approved" && !reason) {
    throw new PublicationDecisionError(400, "A reason is required to withhold or revoke");
  }

  const now = deps.now ?? (() => new Date());
  const mutation = await transactionRunner(deps)(async (store) => {
    const submission = await store.getReviewSource(input.submissionId);
    if (!submission) throw new PublicationDecisionError(404, "Unknown submission");
    const before = await store.getDecision(input.submissionId);

    let fingerprint: string | null = null;
    if (input.state === "approved") {
      const policy = parsePublicationPolicy(submission.publicationPolicy);
      if (!policy) {
        throw new PublicationDecisionError(
          409,
          "The bound assessment version has no valid publication policy",
        );
      }
      const previewReady =
        policy.wall === "app"
          ? Boolean(
              submission.previewRef && submission.previewRef !== SCREENSHOT_BLOCKED,
            )
          : submission.evidence.some((item) => item.fileRole === policy.previewRole);
      if (!previewReady) {
        throw new PublicationDecisionError(
          409,
          "The exact safe preview must be ready before instructor approval",
        );
      }
      fingerprint = fingerprintPublicationSource({
        policy,
        fields: submission.fields,
        evidence: submission.evidence
          .filter((item) => item.scanState === "clean")
          .map((item) => ({
            role: item.fileRole,
            sha256: item.sha256,
            s3VersionId: item.s3VersionId,
            byteCount: item.byteCount,
          })),
        previewRef: submission.previewRef,
      });
    }

    const alreadyCurrent =
      before?.instructorState === input.state &&
      before.instructorReason === reason &&
      before.reviewedFingerprint === fingerprint;
    if (alreadyCurrent && before) return { changed: false, decision: before };

    const at = now();
    const decision = await store.saveDecision(input.submissionId, {
      instructorState: input.state,
      instructorDecidedBy: input.actor.userId,
      instructorDecidedAt: at,
      instructorReason: reason,
      reviewedFingerprint: fingerprint,
      reviewedAt: input.state === "approved" ? at : null,
    });
    await store.createAudit({
      actorId: input.actor.userId,
      action: `publication.instructor.${input.state}`,
      targetType: "submission",
      targetId: input.submissionId,
      before: auditSnapshot(before),
      after: view(decision),
    });
    return { changed: true, decision };
  });

  return {
    changed: mutation.changed,
    decision: view(mutation.decision),
    projectionSync: await reconcileProjection(input.submissionId, mutation.changed, deps),
  };
}
