import { createHash } from "node:crypto";
import type {
  OwnerKind,
  Prisma,
  ResubmissionGrant,
  Submission,
  SubmissionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseRubric } from "@/lib/ai/grading";
import { syncGalleryItem } from "@/lib/galleries";
import { parentSessionPageIdFor, resolveGate } from "@/lib/gates";
import { parseRubricScores } from "@/lib/review-queue";
import { presignGet, s3Configured } from "@/lib/s3";
import {
  getBoundDraftContext,
  revisionNeedsGrant,
  RevisionNotAllowedError,
} from "@/lib/submission-drafts";
import {
  parseSubmissionSchema,
  validateSubmissionFields,
  type SubmissionSchema,
} from "@/lib/submission-schema";
import {
  improvementGrantExpiry,
  selectSubmissionVersions,
} from "@/lib/submission-versions";

// Schema-driven submission core. Legacy work renders from AssignmentType;
// versioned work renders from its immutable AssessmentVersion binding, with
// the active pointer consulted only before any draft/history exists. This
// module validates and writes against that same bound contract. Versioning:
// resubmission creates a NEW row at version+1 — history rows are never mutated.

// ---------------------------------------------------------------------------
// Typed failures (routes map these to HTTP statuses)
// ---------------------------------------------------------------------------

/** 422 — per-field validation messages. */
export class SubmissionValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "SubmissionValidationError";
    this.errors = errors;
  }
}

/** 409 — the assignment's gate is not open for this student. */
export class GateClosedError extends Error {
  constructor(message = "Submissions are closed for this assignment. If you believe you should still be able to submit, ask your instructor for a reopen.") {
    super(message);
    this.name = "GateClosedError";
  }
}

/** 403 — a file key outside the student's own submissions/ namespace. */
export class ForeignFileKeyError extends Error {
  constructor(key: string) {
    super(`File key outside your upload namespace: ${key}`);
    this.name = "ForeignFileKeyError";
  }
}

// ---------------------------------------------------------------------------
// Content hash (near-duplicate detection input for U9)
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** sha256 over the canonical JSON of {fields, files} (sorted keys, sorted-stable). */
export function contentHashOf(fields: Record<string, unknown>, files: string[]): string {
  const canonical = JSON.stringify(canonicalize({ fields, files: [...files].sort() }));
  return createHash("sha256").update(canonical).digest("hex");
}

export function isLockedAssignmentUndiscoverable(args: {
  available: boolean;
  hasLiveGrant: boolean;
  historyCount: number;
}): boolean {
  return !args.available && !args.hasLiveGrant && args.historyCount === 0;
}

// ---------------------------------------------------------------------------
// Gate helper
// ---------------------------------------------------------------------------

async function assignmentAvailableTo(
  user: { id: string; role: string; sectionId: string | null },
  assignmentId: string,
): Promise<boolean> {
  if (user.role !== "student") return true;
  if (!user.sectionId) return false;
  return resolveGate({
    targetType: "assignment",
    targetId: assignmentId,
    sectionId: user.sectionId,
    parentSessionPageId: await parentSessionPageIdFor("assignment", assignmentId),
    userId: user.id,
  });
}

/**
 * Gate check for the upload-url route: throws GateClosedError when the
 * student may not submit (so no presigned URL is ever handed out for a
 * closed assignment).
 */
export async function assertAssignmentOpen(userId: string, assignmentId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, sectionId: true },
  });
  if (!user) throw new GateClosedError("Unknown user.");
  const exists = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });
  if (!exists) throw new GateClosedError("Unknown assignment.");
  if (!(await assignmentAvailableTo(user, assignmentId))) throw new GateClosedError();
}

// ---------------------------------------------------------------------------
// Read side — everything the submit page renders
// ---------------------------------------------------------------------------

export type SubmissionHistoryRow = {
  id: string;
  version: number;
  attempt: number;
  status: SubmissionStatus;
  submittedAt: Date | null;
  createdAt: Date;
};

export type AssignmentForStudent = {
  assignment: {
    id: string;
    title: string;
    brief: string;
    sessionNo: number | null;
    dueAt: Date | null;
  };
  type: {
    id: string;
    slug: string;
    title: string;
    description: string;
    teamBased: boolean;
  };
  /** Parsed bound field defs; null when the immutable contract is unavailable or malformed. */
  schema: SubmissionSchema | null;
  /** May this student submit right now (gates + exceptions)? */
  available: boolean;
  /** My (or my team's) versions, newest first. */
  history: SubmissionHistoryRow[];
  latest: SubmissionHistoryRow | null;
  /** What was actually submitted (latest version) so the student can see it. */
  submitted: {
    fields: Record<string, unknown>;
    /** Presigned view URLs for uploaded files, keyed by the field they came from. */
    fileUrls: { field: string; label: string; url: string | null; key: string }[];
    submittedAt: Date | null;
  } | null;
  /** The AI grade for the latest version, once graded. */
  grade: {
    total: number;
    provisional: boolean;
    feedbackMd: string;
    dimensions: { key: string; label: string; score: number; max: number; rationale: string }[];
  } | null;
  /** This artifact's gallery, when it is a votable one (link target). */
  galleryEligible: boolean;
  /**
   * False once a submission exists — one submission per student (course rule).
   * An instructor reopen (GateException) is the sanctioned way back in, unless
   * the type sets allowSelfReplace, which keeps this true while the gate is open.
   */
  canSubmit: boolean;
  /**
   * True when submitting again would replace existing work rather than create
   * a first submission, so the form can say so before the learner commits.
   */
  canReplace: boolean;
};

export type SubmittedFileEvidenceRow = {
  id: string;
  fieldKey: string;
  s3Key: string;
  s3VersionId: string | null;
  scanState: string;
};

/**
 * Resolve what a submission field points at into the object to sign.
 *
 * The uploader stores an EVIDENCE ID in the field, not the S3 key, and it does
 * so for legacy-contract rows as well — evidence is not exclusive to versioned
 * submissions. Resolving this only when `assessmentVersionId` was set left every
 * legacy row signing the raw id, which yields a valid-looking presigned URL to
 * an object that does not exist, so learners could not reopen their own upload.
 *
 * Rows written before the uploader changed stored the S3 key directly in the
 * field; those match no evidence row and correctly fall through as themselves.
 */
export function resolveSubmittedFileObject(
  reference: string,
  fieldKey: string,
  evidence: readonly SubmittedFileEvidenceRow[],
): { key: string; versionId: string | undefined } {
  const receipt = evidence.find(
    (candidate) =>
      candidate.id === reference &&
      candidate.fieldKey === fieldKey &&
      candidate.scanState === "clean",
  );
  return { key: receipt?.s3Key ?? reference, versionId: receipt?.s3VersionId ?? undefined };
}

export type SubmissionSchemaBindingRow = {
  assessmentVersionId: string | null;
  assessmentVersion: {
    id: string;
    assignmentId: string;
    publicSchema: unknown;
  } | null;
};

type ActiveSubmissionSchemaVersion = {
  id: string;
  assignmentId: string;
  publishedAt: Date | null;
  publicSchema: unknown;
};

function schemaForStudentBinding(args: {
  assignmentId: string;
  contractMode: "legacy" | "versioned";
  assignmentTypeSchema: unknown;
  activeAssessmentVersion: ActiveSubmissionSchemaVersion | null;
  existing: SubmissionSchemaBindingRow | null;
}): SubmissionSchema | null {
  if (args.existing) {
    if (!args.existing.assessmentVersionId) {
      return parseSubmissionSchema(args.assignmentTypeSchema);
    }
    const bound = args.existing.assessmentVersion;
    if (
      !bound ||
      bound.id !== args.existing.assessmentVersionId ||
      bound.assignmentId !== args.assignmentId
    ) {
      return null;
    }
    return parseSubmissionSchema(bound.publicSchema);
  }

  if (args.contractMode === "legacy") {
    return parseSubmissionSchema(args.assignmentTypeSchema);
  }
  const active = args.activeAssessmentVersion;
  return active && active.assignmentId === args.assignmentId && active.publishedAt
    ? parseSubmissionSchema(active.publicSchema)
    : null;
}

/**
 * Existing work always renders from its immutable contract. The mutable active
 * pointer is consulted only when no draft or historical receipt exists.
 */
export function resolveStudentSubmissionSchemas(args: {
  assignmentId: string;
  contractMode: "legacy" | "versioned";
  assignmentTypeSchema: unknown;
  activeAssessmentVersion: ActiveSubmissionSchemaVersion | null;
  history: readonly SubmissionSchemaBindingRow[];
  latestSubmitted: SubmissionSchemaBindingRow | null;
}): { formSchema: SubmissionSchema | null; submittedSchema: SubmissionSchema | null } {
  const common = {
    assignmentId: args.assignmentId,
    contractMode: args.contractMode,
    assignmentTypeSchema: args.assignmentTypeSchema,
    activeAssessmentVersion: args.activeAssessmentVersion,
  };
  return {
    formSchema: schemaForStudentBinding({
      ...common,
      existing: args.history[0] ?? null,
    }),
    submittedSchema: args.latestSubmitted
      ? schemaForStudentBinding({ ...common, existing: args.latestSubmitted })
      : null,
  };
}

export async function getAssignmentForStudent(
  userId: string,
  assignmentId: string,
): Promise<AssignmentForStudent | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, sectionId: true, teamId: true },
  });
  if (!user) return null;
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { assignmentType: true, activeAssessmentVersion: true },
  });
  if (!assignment) return null;

  const type = assignment.assignmentType;
  const mineOrTeam = [
    { assessmentVersionId: null, userId },
    ...(user.teamId ? [{ assessmentVersionId: null, teamId: user.teamId }] : []),
    { ownerKind: "individual" as const, ownerId: userId },
    ...(user.teamId ? [{ ownerKind: "team" as const, ownerId: user.teamId }] : []),
  ];

  const [available, rows] = await Promise.all([
    assignmentAvailableTo(user, assignmentId),
    prisma.submission.findMany({
      where: { assignmentId, OR: mineOrTeam },
      select: {
        id: true,
        version: true,
        attempt: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        fields: true,
        files: true,
        assessmentVersionId: true,
        assessmentVersion: {
          select: {
            id: true,
            assignmentId: true,
            publicSchema: true,
            rubric: true,
          },
        },
        assessmentResult: {
          select: {
            status: true,
            scoreable: true,
            publishable: true,
            completedAt: true,
          },
        },
        evidence: {
          select: {
            id: true,
            fieldKey: true,
            s3Key: true,
            s3VersionId: true,
            scanState: true,
          },
        },
        grades: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { total: true, provisional: true, feedbackMd: true, rubricScores: true },
        },
      },
      orderBy: [{ version: "desc" }, { attempt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const selected = selectSubmissionVersions(rows);
  const history: SubmissionHistoryRow[] = selected.history.map((r) => ({
    id: r.id,
    version: r.version,
    attempt: r.attempt,
    status: r.status,
    submittedAt: r.submittedAt,
    createdAt: r.createdAt,
  }));

  const newest = selected.latestSubmitted;
  const resolvedSchemas = resolveStudentSubmissionSchemas({
    assignmentId: assignment.id,
    contractMode: assignment.contractMode,
    assignmentTypeSchema: type.submissionSchema,
    activeAssessmentVersion: assignment.activeAssessmentVersion,
    history: selected.history,
    latestSubmitted: newest,
  });
  const schema = resolvedSchemas.formSchema;

  // What they submitted, with presigned links for any uploaded files so the
  // student can actually open their own work back up.
  let submitted: AssignmentForStudent["submitted"] = null;
  if (newest) {
    const fields = (newest.fields ?? {}) as Record<string, unknown>;
    const fileUrls: NonNullable<AssignmentForStudent["submitted"]>["fileUrls"] = [];
    for (const def of resolvedSchemas.submittedSchema?.fields ?? []) {
      if (def.kind !== "file" && def.kind !== "files") continue;
      const raw = fields[def.key];
      const references = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
      for (const reference of references) {
        if (typeof reference !== "string") continue;
        const { key, versionId } = resolveSubmittedFileObject(
          reference,
          def.key,
          newest.evidence,
        );
        let url: string | null = null;
        if (s3Configured()) {
          try {
            url = await presignGet(key, { versionId: versionId ?? undefined });
          } catch {
            url = null; // a broken link must not break the page
          }
        }
        fileUrls.push({ field: def.key, label: def.label, url, key });
      }
    }
    submitted = { fields, fileUrls, submittedAt: newest.submittedAt };
  }

  // The AI grade for that version, with the rubric's own labels.
  let grade: AssignmentForStudent["grade"] = null;
  const scoreable = selected.latestScoreable;
  const g = scoreable?.grades[0];
  if (g) {
    const dims = parseRubric(scoreable.assessmentVersion?.rubric ?? type.rubric);
    const scores = parseRubricScores(g.rubricScores);
    grade = {
      total: g.total,
      provisional: g.provisional,
      feedbackMd: g.feedbackMd,
      dimensions: dims.map((d) => ({
        key: d.key,
        label: d.label,
        max: d.max,
        score: scores[d.key]?.score ?? 0,
        rationale: scores[d.key]?.rationale ?? "",
      })),
    };
  }

  const liveGrant =
    assignment.contractMode === "versioned"
      ? await prisma.resubmissionGrant.findFirst({
          where: {
            assignmentId,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            OR: [
              { ownerKind: "individual", ownerId: userId },
              ...(user.teamId
                ? [{ ownerKind: "team" as const, ownerId: user.teamId }]
                : []),
            ],
          },
          select: { id: true },
        })
      : null;

  // A first-time learner must not be able to discover a locked assignment's
  // title, brief, or schema by guessing its stable URL. Existing work and an
  // explicit live grant remain visible so learners can review prior evidence.
  if (isLockedAssignmentUndiscoverable({
    available,
    hasLiveGrant: Boolean(liveGrant),
    historyCount: history.length,
  })) return null;

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      brief: assignment.brief,
      sessionNo: assignment.sessionNo,
      dueAt: assignment.dueAt,
    },
    type: {
      id: type.id,
      slug: type.slug,
      title: type.title,
      description: type.description,
      teamBased: type.teamBased,
    },
    schema,
    // Targeted one-use revision grants deliberately bypass the assignment
    // gate, so a live grant keeps this page actionable.
    available: available || Boolean(liveGrant),
    history,
    latest: selected.latestSubmitted
      ? history.find((row) => row.id === selected.latestSubmitted!.id) ?? null
      : null,
    submitted,
    grade,
    galleryEligible: type.galleryEligible,
    // Legacy remains one-shot. Versioned work may resume a bound draft or use
    // exactly one live improvement/repair grant independently of gate reopen.
    // Types that opt into self-replace stay open for as long as their gate is,
    // so a learner can correct a wrong upload without an instructor grant.
    canSubmit:
      assignment.contractMode === "legacy"
        ? available && (type.allowSelfReplace || !selected.latestSubmitted)
        : Boolean(schema) &&
          (Boolean(selected.history.find((row) => row.status === "draft")) ||
            Boolean(liveGrant) ||
            (available && (type.allowSelfReplace || !selected.latestSubmitted))),
    canReplace: Boolean(type.allowSelfReplace && available && selected.latestSubmitted),
  };
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

export type SubmitInput = {
  userId: string;
  assignmentId: string;
  fields: Record<string, unknown>;
  files: string[];
  draftId?: string;
  evidenceIds?: string[];
};

/**
 * Validate + write one submission. Throws SubmissionValidationError (422),
 * GateClosedError (409) or ForeignFileKeyError (403). Resubmission creates a
 * new row at version+1; prior versions are untouched.
 */
export async function submitAssignment(input: SubmitInput): Promise<Submission> {
  const { userId, assignmentId, fields, files } = input;
  if (input.draftId) {
    return finalizeSubmissionDraft({
      userId,
      assignmentId,
      draftId: input.draftId,
      fields,
      evidenceIds: input.evidenceIds ?? [],
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, sectionId: true, teamId: true },
  });
  if (!user) throw new SubmissionValidationError(["unknown user"]);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { assignmentType: true },
  });
  if (!assignment) throw new SubmissionValidationError(["unknown assignment"]);

  if (assignment.contractMode === "versioned") {
    throw new SubmissionValidationError([
      "Versioned assignments must finalize a server-created, assessment-bound draft.",
    ]);
  }

  const schema = parseSubmissionSchema(assignment.assignmentType.submissionSchema);
  if (!schema) {
    throw new SubmissionValidationError([
      "this assignment type's submission schema is malformed — tell your instructor",
    ]);
  }

  // Field validation (per-field messages).
  const result = validateSubmissionFields(schema, fields, { submissionVersion: 1 });
  if (!result.ok) throw new SubmissionValidationError(result.errors);

  // Every uploaded key must live in the submitting student's own namespace.
  const myPrefix = `submissions/${userId}/`;
  for (const key of files) {
    if (!key.startsWith(myPrefix)) throw new ForeignFileKeyError(key);
  }

  // Team-based types write the team.
  let teamId: string | null = null;
  if (assignment.assignmentType.teamBased) {
    if (!user.teamId) {
      throw new SubmissionValidationError([
        "this is a team assignment but you are not on a team yet — ask your instructor to place you on one",
      ]);
    }
    teamId = user.teamId;
  }

  // Gate re-enforcement inside the mutation path (routes must not pre-trust
  // their own earlier check — a gate can close between render and submit).
  if (!(await assignmentAvailableTo(user, assignmentId))) throw new GateClosedError();

  // ONE SUBMISSION PER STUDENT (course rule). Enforced here, not just in the
  // UI, so a stale form or a direct API call cannot create a second version.
  // An instructor who wants to let someone resubmit deletes the submission or
  // grants a reopen; that is the deliberate, audited path.
  //
  // Types that set allowSelfReplace opt out of the one-shot rule while their
  // gate is open: the learner's new upload becomes the next version and
  // supersedes the previous one everywhere reads take the latest. Nothing is
  // deleted, so grades, gallery items and publication decisions keep pointing
  // at the version that produced them. The gate was re-checked immediately
  // above, so reaching here means the assignment is still live.
  const alreadySubmitted = await prisma.submission.findFirst({
    where: teamId ? { assignmentId, OR: [{ userId }, { teamId }] } : { assignmentId, userId },
    select: { id: true },
  });
  if (alreadySubmitted && !assignment.assignmentType.allowSelfReplace) {
    throw new SubmissionValidationError([
      "You have already submitted this artifact. Only one submission per student is allowed — ask your instructor if you need it reopened.",
    ]);
  }

  const contentHash = contentHashOf(fields, files);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    // Version is per-OWNER: individual types count by user; team-based types
    // count over the whole team (OR userId/teamId, mirroring the read-side
    // mineOrTeam filter) so a resubmission by a different teammate continues
    // the team's sequence (v3 over v2) instead of resetting to a fresh v1.
    const latest = await tx.submission.findFirst({
      where: teamId ? { assignmentId, OR: [{ userId }, { teamId }] } : { assignmentId, userId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return tx.submission.create({
      data: {
        assignmentId,
        userId,
        teamId,
        status: "submitted",
        submittedAt: now,
        fields: fields as Prisma.InputJsonValue,
        files,
        version: (latest?.version ?? 0) + 1,
        contentHash,
      },
    });
  });

  if (assignment.assignmentType.aiGraded) {
    // U9: enqueue AI grading. Best-effort — a queue outage must never fail the
    // submission (docs/DECISIONS.md); admins re-enqueue via /api/admin/regrade.
    await enqueueGradeSubmission(created.id);
  } else {
    // Ungraded gallery artifacts (memes, AI images) never touch the grader —
    // they publish straight to the section gallery on submit. Best-effort: a
    // gallery hiccup must not fail the submission (a backfill re-syncs later).
    try {
      await syncGalleryItem(created.id);
    } catch {
      // swallow — submission is saved; backfillGalleryItems recovers it
    }
  }

  return created;
}

function evidenceReferencesFor(
  schema: SubmissionSchema,
  fields: Record<string, unknown>,
): { evidenceId: string; fieldKey: string; fileRole: string }[] {
  const references: { evidenceId: string; fieldKey: string; fileRole: string }[] = [];
  for (const field of schema.fields) {
    if (field.kind !== "file" && field.kind !== "files") continue;
    const raw = fields[field.key];
    const ids = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
    for (const evidenceId of ids) {
      if (typeof evidenceId === "string") {
        references.push({
          evidenceId,
          fieldKey: field.key,
          fileRole: field.fileRole ?? field.key,
        });
      }
    }
  }
  return references;
}

export type FinalEvidenceReceiptIdentity = {
  id: string;
  submissionId: string;
  fieldKey: string;
  fileRole: string;
  scanState: string;
};

/** Fail closed unless the final payload names each exact clean field/role receipt once. */
export function finalEvidenceAuthorizationErrors(args: {
  schema: SubmissionSchema;
  fields: Record<string, unknown>;
  evidenceIds: string[];
  evidence: FinalEvidenceReceiptIdentity[];
  draftId: string;
}): string[] {
  const references = evidenceReferencesFor(args.schema, args.fields);
  const referencedEvidence = new Set(references.map((reference) => reference.evidenceId));
  const requestedEvidence = new Set(args.evidenceIds);
  if (
    referencedEvidence.size !== references.length ||
    requestedEvidence.size !== args.evidenceIds.length ||
    requestedEvidence.size !== referencedEvidence.size ||
    [...requestedEvidence].some((evidenceId) => !referencedEvidence.has(evidenceId))
  ) {
    return ["final submission evidence must match the committed file-field receipts exactly"];
  }

  const byId = new Map(args.evidence.map((row) => [row.id, row]));
  for (const reference of references) {
    const receipt = byId.get(reference.evidenceId);
    if (
      !receipt ||
      receipt.submissionId !== args.draftId ||
      receipt.fieldKey !== reference.fieldKey ||
      receipt.fileRole !== reference.fileRole ||
      receipt.scanState !== "clean"
    ) {
      return [`field "${reference.fieldKey}" requires a committed clean evidence receipt`];
    }
  }
  if (args.evidence.length !== requestedEvidence.size) {
    return ["one or more evidence receipts are missing"];
  }
  return [];
}

async function matchingGrantForDraft(args: {
  grantId: string | null;
  assignmentId: string;
  assessmentVersionId: string | null;
  ownerKind: OwnerKind | null;
  ownerId: string | null;
  version: number;
  attempt: number;
  now: Date;
}): Promise<ResubmissionGrant | null> {
  if (!args.grantId || !args.assessmentVersionId || !args.ownerKind || !args.ownerId) return null;
  const grant = await prisma.resubmissionGrant.findUnique({ where: { id: args.grantId } });
  if (
    !grant ||
    grant.assignmentId !== args.assignmentId ||
    grant.assessmentVersionId !== args.assessmentVersionId ||
    grant.ownerKind !== args.ownerKind ||
    grant.ownerId !== args.ownerId ||
    grant.targetVersion !== args.version ||
    grant.targetAttempt !== args.attempt ||
    grant.consumedAt !== null ||
    grant.expiresAt <= args.now
  ) {
    return null;
  }
  return grant;
}

/** Final draft receipt: evidence authorization, grant consumption and V2 grant creation are atomic. */
export async function finalizeSubmissionDraft(args: {
  userId: string;
  assignmentId: string;
  draftId: string;
  fields: Record<string, unknown>;
  evidenceIds: string[];
  now?: Date;
}): Promise<Submission> {
  const now = args.now ?? new Date();
  const bound = await getBoundDraftContext({ userId: args.userId, draftId: args.draftId });
  if (bound.draft.assignmentId !== args.assignmentId) {
    throw new SubmissionValidationError(["draft does not belong to this assignment"]);
  }
  const validation = validateSubmissionFields(bound.schema, args.fields, {
    submissionVersion: bound.draft.version,
  });
  if (!validation.ok) throw new SubmissionValidationError(validation.errors);

  const requestedEvidence = new Set(args.evidenceIds);
  const evidence = requestedEvidence.size
    ? await prisma.submissionEvidence.findMany({
        where: { id: { in: [...requestedEvidence] } },
      })
    : [];
  const evidenceErrors = finalEvidenceAuthorizationErrors({
    schema: bound.schema,
    fields: args.fields,
    evidenceIds: args.evidenceIds,
    evidence,
    draftId: bound.draft.id,
  });
  if (evidenceErrors.length > 0) throw new SubmissionValidationError(evidenceErrors);

  const assignment = await prisma.assignment.findUnique({
    where: { id: args.assignmentId },
    include: { assignmentType: true },
  });
  if (!assignment) throw new SubmissionValidationError(["unknown assignment"]);
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, role: true, sectionId: true },
  });
  if (!user) throw new SubmissionValidationError(["unknown user"]);

  const grant = await matchingGrantForDraft({
    grantId: bound.grantId,
    assignmentId: bound.draft.assignmentId,
    assessmentVersionId: bound.draft.assessmentVersionId,
    ownerKind: bound.draft.ownerKind,
    ownerId: bound.draft.ownerId,
    version: bound.draft.version,
    attempt: bound.draft.attempt,
    now,
  });
  const needsGrant = revisionNeedsGrant({
    version: bound.draft.version,
    attempt: bound.draft.attempt,
    allowSelfReplace: assignment.assignmentType.allowSelfReplace,
  });
  if (needsGrant && !grant) throw new RevisionNotAllowedError();
  if (!grant && !(await assignmentAvailableTo(user, args.assignmentId))) throw new GateClosedError();

  const fileKeys = evidence.map((receipt) => receipt.s3Key);
  const contentHash = contentHashOf(args.fields, fileKeys);
  const created = await prisma.$transaction(async (tx) => {
    if (grant) {
      const consumed = await tx.resubmissionGrant.updateMany({
        where: { id: grant.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now, consumedSubmissionId: bound.draft.id },
      });
      if (consumed.count !== 1) throw new RevisionNotAllowedError();
    }

    const submitted = await tx.submission.updateMany({
      where: { id: bound.draft.id, status: "draft" },
      data: {
        status: "submitted",
        submittedAt: now,
        fields: args.fields as Prisma.InputJsonValue,
        files: fileKeys,
        contentHash,
      },
    });
    if (submitted.count !== 1) {
      throw new SubmissionValidationError(["this draft was already submitted"]);
    }

    if (
      bound.draft.assessmentVersionId &&
      bound.draft.ownerKind &&
      bound.draft.ownerId &&
      bound.draft.version === 1 &&
      bound.draft.attempt === 1
    ) {
      const assessmentVersion = await tx.assessmentVersion.findUnique({
        where: { id: bound.draft.assessmentVersionId },
        select: { improvementAllowed: true, improvementWindowDays: true },
      });
      if (assessmentVersion?.improvementAllowed) {
        const expiresAt = improvementGrantExpiry(
          now,
          assessmentVersion.improvementWindowDays,
        );
        await tx.resubmissionGrant.upsert({
          where: {
            assignmentId_assessmentVersionId_ownerKind_ownerId_kind_targetVersion_targetAttempt: {
              assignmentId: bound.draft.assignmentId,
              assessmentVersionId: bound.draft.assessmentVersionId,
              ownerKind: bound.draft.ownerKind,
              ownerId: bound.draft.ownerId,
              kind: "improvement",
              targetVersion: 2,
              targetAttempt: 1,
            },
          },
          update: {},
          create: {
            assignmentId: bound.draft.assignmentId,
            assessmentVersionId: bound.draft.assessmentVersionId,
            ownerKind: bound.draft.ownerKind,
            ownerId: bound.draft.ownerId,
            kind: "improvement",
            targetVersion: 2,
            targetAttempt: 1,
            trigger: "v1_receipt",
            reason: "Course-policy improvement window",
            expiresAt,
            sourceSubmissionId: bound.draft.id,
          },
        });
      }
    }
    return tx.submission.findUniqueOrThrow({ where: { id: bound.draft.id } });
  });

  if (assignment.assignmentType.aiGraded) {
    await enqueueGradeSubmission(created.id);
  } else {
    try {
      await syncGalleryItem(created.id);
    } catch {
      // Submission receipt is authoritative; gallery backfill retries later.
    }
  }
  return created;
}

export {
  extendResubmissionGrant,
  issueRepairGrant,
} from "@/lib/resubmission-grant-admin";

/**
 * Age past which a submission still sitting at status 'submitted' is treated as
 * stuck (a reasonable upper bound on normal grading latency). See #13.
 */
export const STUCK_SUBMISSION_AGE_MS = 10 * 60_000;

export type StuckSubmissionRow = {
  id: string;
  version: number;
  submittedAt: Date | null;
  user: { email: string };
};

/**
 * Submissions stuck at status 'submitted' past the age cutoff — a grading job
 * that was never enqueued (a queue outage at submit time is best-effort and
 * silently skipped, so these rows never enter pg-boss and never appear in the
 * dead-letter list). Surfaced on /admin/costs so an admin can re-enqueue via
 * POST /api/admin/regrade.
 */
export async function listStuckSubmissions(
  olderThanMs: number = STUCK_SUBMISSION_AGE_MS,
): Promise<StuckSubmissionRow[]> {
  const cutoff = new Date(Date.now() - olderThanMs);
  return prisma.submission.findMany({
    where: { status: "submitted", submittedAt: { lt: cutoff } },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true,
      version: true,
      submittedAt: true,
      user: { select: { email: true } },
    },
  });
}

/**
 * U9: pg-boss enqueue of the grading job (best-effort, never throws). Kept as
 * the single integration seam introduced in U8.
 */
export async function enqueueGradeSubmission(submissionId: string): Promise<void> {
  try {
    const queue = await import("@/lib/queue");
    await queue.enqueueGradeSubmission(submissionId);
  } catch (err) {
    console.error(
      `[submissions] grading enqueue failed for ${submissionId} (submission recorded):`,
      err instanceof Error ? err.message : err,
    );
  }
}
