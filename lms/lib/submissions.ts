import { createHash } from "node:crypto";
import type { Prisma, Submission, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncGalleryItem } from "@/lib/galleries";
import { parentSessionPageIdFor, resolveGate } from "@/lib/gates";
import {
  parseSubmissionSchema,
  validateSubmissionFields,
  type SubmissionSchema,
} from "@/lib/submission-schema";

// Schema-driven submission core. The form renders FROM the type's
// submissionSchema and this module validates/writes against the same schema,
// so a new AssignmentType row is a working submission pipeline with zero code
// changes. Versioning: resubmission creates a NEW row at version+1 — history
// rows are never mutated.

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
  /** Parsed field defs; null when the stored JSON is malformed. */
  schema: SubmissionSchema | null;
  /** May this student submit right now (gates + exceptions)? */
  available: boolean;
  /** My (or my team's) versions, newest first. */
  history: SubmissionHistoryRow[];
  latest: SubmissionHistoryRow | null;
};

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
    include: { assignmentType: true },
  });
  if (!assignment) return null;

  const type = assignment.assignmentType;
  const mineOrTeam =
    type.teamBased && user.teamId
      ? [{ userId }, { teamId: user.teamId }]
      : [{ userId }];

  const [available, history] = await Promise.all([
    assignmentAvailableTo(user, assignmentId),
    prisma.submission.findMany({
      where: { assignmentId, OR: mineOrTeam },
      select: { id: true, version: true, status: true, submittedAt: true, createdAt: true },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    }),
  ]);

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
    schema: parseSubmissionSchema(type.submissionSchema),
    available,
    history,
    latest: history[0] ?? null,
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
};

/**
 * Validate + write one submission. Throws SubmissionValidationError (422),
 * GateClosedError (409) or ForeignFileKeyError (403). Resubmission creates a
 * new row at version+1; prior versions are untouched.
 */
export async function submitAssignment(input: SubmitInput): Promise<Submission> {
  const { userId, assignmentId, fields, files } = input;

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

  const schema = parseSubmissionSchema(assignment.assignmentType.submissionSchema);
  if (!schema) {
    throw new SubmissionValidationError([
      "this assignment type's submission schema is malformed — tell your instructor",
    ]);
  }

  // Field validation (per-field messages).
  const result = validateSubmissionFields(schema, fields);
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
