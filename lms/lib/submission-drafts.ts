import type {
  AssessmentVersion,
  ContractMode,
  OwnerKind,
  Prisma,
  ResubmissionGrant,
  Submission,
} from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parentSessionPageIdFor, resolveGate } from "@/lib/gates";
import {
  parseSubmissionSchema,
  validateSubmissionFields,
  type SubmissionSchema,
} from "@/lib/submission-schema";

export class ContractBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractBindingError";
  }
}

export class DraftConflictError extends Error {
  constructor(message = "This draft changed in another tab. Refresh before saving again.") {
    super(message);
    this.name = "DraftConflictError";
  }
}

export class DraftAccessError extends Error {
  constructor(message = "You cannot access this draft.") {
    super(message);
    this.name = "DraftAccessError";
  }
}

export class RevisionNotAllowedError extends Error {
  constructor(message = "No eligible one-use revision grant is available for this assignment.") {
    super(message);
    this.name = "RevisionNotAllowedError";
  }
}

export class DraftGateClosedError extends Error {
  constructor(message = "Submissions are closed for this assignment.") {
    super(message);
    this.name = "DraftGateClosedError";
  }
}

type AssessmentContractVersion = Pick<
  AssessmentVersion,
  "id" | "assignmentId" | "publishedAt" | "publicSchema" | "ownerKind"
>;

type AssignmentContractRecord = {
  id: string;
  contractMode: ContractMode;
  assignmentType: {
    teamBased: boolean;
    allowSelfReplace?: boolean;
    submissionSchema: Prisma.JsonValue;
  };
  activeAssessmentVersion: AssessmentContractVersion | null;
};

/** Return the next learner-visible version while preserving every prior row. */
export function nextSelfReplaceVersion(latestVersion: number | null): number {
  return (latestVersion ?? 0) + 1;
}

/** Versioned revisions are grant-bound unless the assignment explicitly opts into self-replace. */
export function revisionNeedsGrant(args: {
  version: number;
  attempt: number;
  allowSelfReplace: boolean;
}): boolean {
  return (args.version > 1 || args.attempt > 1) && !args.allowSelfReplace;
}

export type ResolvedSubmissionContract = {
  mode: ContractMode;
  assessmentVersion: AssessmentContractVersion | null;
  schema: SubmissionSchema;
  ownerKind: OwnerKind;
};

/** Pure compatibility boundary shared by reads, drafts and tests. */
export function resolveSubmissionContract(
  assignment: AssignmentContractRecord,
): ResolvedSubmissionContract {
  if (assignment.contractMode === "legacy") {
    const schema = parseSubmissionSchema(assignment.assignmentType.submissionSchema);
    if (!schema) throw new ContractBindingError("Legacy submission schema is malformed.");
    return {
      mode: "legacy",
      assessmentVersion: null,
      schema,
      ownerKind: assignment.assignmentType.teamBased ? "team" : "individual",
    };
  }

  const version = assignment.activeAssessmentVersion;
  if (!version || version.assignmentId !== assignment.id || !version.publishedAt) {
    throw new ContractBindingError(
      "This versioned assignment has no published active assessment contract.",
    );
  }
  const schema = parseSubmissionSchema(version.publicSchema);
  if (!schema) throw new ContractBindingError("The active assessment schema is malformed.");
  return { mode: "versioned", assessmentVersion: version, schema, ownerKind: version.ownerKind };
}

type OwnerUser = { id: string; role: string; sectionId: string | null; teamId: string | null };

function ownerIdFor(user: OwnerUser, ownerKind: OwnerKind): string {
  if (ownerKind === "individual") return user.id;
  if (!user.teamId) {
    throw new ContractBindingError(
      "This assessment uses team ownership, but you are not currently assigned to a team.",
    );
  }
  return user.teamId;
}

async function assignmentGateOpen(user: OwnerUser, assignmentId: string): Promise<boolean> {
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

async function loadUser(userId: string): Promise<OwnerUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, sectionId: true, teamId: true },
  });
  if (!user) throw new DraftAccessError("Unknown user.");
  return user;
}

async function loadAssignment(assignmentId: string): Promise<AssignmentContractRecord> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { assignmentType: true, activeAssessmentVersion: true },
  });
  if (!assignment) throw new ContractBindingError("Unknown assignment.");
  return assignment;
}

export function grantForDraftSelection(
  grants: ResubmissionGrant[],
  user: Pick<OwnerUser, "id" | "teamId">,
  requestedGrantId?: string,
): ResubmissionGrant | null {
  const eligible = grants.filter(
    (grant) =>
      (grant.ownerKind === "individual" && grant.ownerId === user.id) ||
      (grant.ownerKind === "team" && grant.ownerId === user.teamId),
  );
  if (requestedGrantId) {
    const selected = eligible.find((grant) => grant.id === requestedGrantId);
    if (!selected) throw new RevisionNotAllowedError("The selected revision grant is unavailable.");
    return selected;
  }
  if (eligible.length > 1) {
    throw new RevisionNotAllowedError(
      "Multiple revision grants are eligible. Choose the repair or improvement lane before saving.",
    );
  }
  return eligible[0] ?? null;
}

async function contractForGrant(
  assignment: AssignmentContractRecord,
  grant: ResubmissionGrant,
): Promise<ResolvedSubmissionContract> {
  const version = await prisma.assessmentVersion.findUnique({ where: { id: grant.assessmentVersionId } });
  if (!version || version.assignmentId !== assignment.id || !version.publishedAt) {
    throw new ContractBindingError("The revision grant is not bound to a published assessment version.");
  }
  if (version.ownerKind !== grant.ownerKind) {
    throw new ContractBindingError("The revision grant owner kind does not match its assessment version.");
  }
  const schema = parseSubmissionSchema(version.publicSchema);
  if (!schema) throw new ContractBindingError("The grant-bound assessment schema is malformed.");
  return { mode: "versioned", assessmentVersion: version, schema, ownerKind: version.ownerKind };
}

export type BoundDraft = {
  draft: Submission;
  contractMode: ContractMode;
  assessmentVersionId: string | null;
  schema: SubmissionSchema;
  grantId: string | null;
};

type DraftOwnerClause = {
  ownerKind: OwnerKind;
  ownerId: string;
};

/**
 * Draft access follows the immutable ownership tuple, never the user who
 * happened to create the row. Team access therefore changes with current
 * membership and legacy/malformed rows fail closed.
 */
export function userCanAccessDraft(
  user: Pick<OwnerUser, "id" | "teamId">,
  draft: Pick<Submission, "ownerKind" | "ownerId">,
): boolean {
  if (draft.ownerKind === "individual") return draft.ownerId === user.id;
  if (draft.ownerKind === "team") {
    return Boolean(user.teamId && draft.ownerId === user.teamId);
  }
  return false;
}

/** Canonical owner selectors for implicit resume; creator identity is excluded. */
export function draftOwnerClausesForUser(
  user: Pick<OwnerUser, "id" | "teamId">,
): DraftOwnerClause[] {
  return [
    { ownerKind: "individual", ownerId: user.id },
    ...(user.teamId
      ? [{ ownerKind: "team" as const, ownerId: user.teamId }]
      : []),
  ];
}

async function loadExistingDraft(
  user: OwnerUser,
  assignmentId: string,
  draftId?: string,
): Promise<Submission | null> {
  if (draftId) {
    const draft = await prisma.submission.findUnique({ where: { id: draftId } });
    if (!draft || draft.assignmentId !== assignmentId || draft.status !== "draft") {
      throw new DraftConflictError("The requested draft is stale or already submitted.");
    }
    if (!userCanAccessDraft(user, draft)) throw new DraftAccessError();
    return draft;
  }
  const draft = await prisma.submission.findFirst({
    where: {
      assignmentId,
      status: "draft",
      OR: draftOwnerClausesForUser(user),
    },
    orderBy: [{ version: "desc" }, { attempt: "desc" }, { createdAt: "desc" }],
  });
  if (draft && !userCanAccessDraft(user, draft)) throw new DraftAccessError();
  return draft;
}

async function contextForExistingDraft(
  assignment: AssignmentContractRecord,
  draft: Submission,
): Promise<ResolvedSubmissionContract> {
  if (draft.assessmentVersionId) {
    const version = await prisma.assessmentVersion.findUnique({
      where: { id: draft.assessmentVersionId },
    });
    if (!version || version.assignmentId !== assignment.id || !version.publishedAt) {
      throw new ContractBindingError("The draft's bound assessment version is unavailable.");
    }
    const schema = parseSubmissionSchema(version.publicSchema);
    if (!schema) throw new ContractBindingError("The draft's bound assessment schema is malformed.");
    return { mode: "versioned", assessmentVersion: version, schema, ownerKind: version.ownerKind };
  }
  if (assignment.contractMode !== "legacy") {
    throw new ContractBindingError("A versioned draft is missing its assessment binding.");
  }
  return resolveSubmissionContract(assignment);
}

/**
 * Create the server-owned draft identity on first save/presign, or return the
 * existing bound draft. A grant chooses its immutable target before the active
 * pointer, so publishing v2 cannot retarget a pending v1 repair.
 */
export async function ensureSubmissionDraft(args: {
  userId: string;
  assignmentId: string;
  draftId?: string;
  grantId?: string;
  initialFields?: Record<string, unknown>;
  now?: Date;
}): Promise<BoundDraft> {
  const now = args.now ?? new Date();
  const [user, assignment] = await Promise.all([
    loadUser(args.userId),
    loadAssignment(args.assignmentId),
  ]);

  const existingDraft = await loadExistingDraft(user, assignment.id, args.draftId);
  if (existingDraft) {
    if (args.grantId && existingDraft.resubmissionGrantId !== args.grantId) {
      throw new DraftConflictError("This draft is already bound to a different revision grant.");
    }
    const contract = await contextForExistingDraft(assignment, existingDraft);
    return {
      draft: existingDraft,
      contractMode: contract.mode,
      assessmentVersionId: existingDraft.assessmentVersionId,
      schema: contract.schema,
      grantId: existingDraft.resubmissionGrantId,
    };
  }

  const grants =
    assignment.contractMode === "versioned"
      ? await prisma.resubmissionGrant.findMany({
          where: {
            assignmentId: assignment.id,
            consumedAt: null,
            expiresAt: { gt: now },
            OR: [
              { ownerKind: "individual", ownerId: user.id },
              ...(user.teamId ? [{ ownerKind: "team" as const, ownerId: user.teamId }] : []),
            ],
          },
        })
      : [];
  const grant = grantForDraftSelection(grants, user, args.grantId);
  const contract = grant
    ? await contractForGrant(assignment, grant)
    : resolveSubmissionContract(assignment);
  const ownerId = ownerIdFor(user, contract.ownerKind);

  const priorSubmitted = await prisma.submission.findFirst({
    where:
      contract.mode === "legacy"
        ? {
            assignmentId: assignment.id,
            status: { not: "draft" },
            OR: [
              { userId: user.id },
              ...(user.teamId ? [{ teamId: user.teamId }] : []),
            ],
          }
        : {
            assignmentId: assignment.id,
            ownerKind: contract.ownerKind,
            ownerId,
            status: { not: "draft" },
          },
    orderBy: [{ version: "desc" }, { attempt: "desc" }, { createdAt: "desc" }],
    select: { id: true, version: true },
  });
  if (priorSubmitted && !grant && !assignment.assignmentType.allowSelfReplace) {
    throw new RevisionNotAllowedError();
  }
  if (!grant && !(await assignmentGateOpen(user, assignment.id))) throw new DraftGateClosedError();

  const version = grant?.targetVersion ?? nextSelfReplaceVersion(priorSubmitted?.version ?? null);
  const attempt = grant?.targetAttempt ?? 1;
  const fields = args.initialFields ?? {};
  const validation = validateSubmissionFields(contract.schema, fields, {
    partial: true,
    submissionVersion: version,
  });
  if (!validation.ok) throw new ContractBindingError(validation.errors.join("; "));

  const assessmentVersionId = contract.assessmentVersion?.id ?? null;
  try {
    const draft = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        userId: user.id,
        // Individual assessment ownership still retains the learner's team
        // context for staff aggregation and team-run nomination.
        teamId: user.teamId,
        status: "draft",
        fields: fields as Prisma.InputJsonValue,
        files: [],
        version,
        attempt,
        assessmentVersionId,
        ownerKind: contract.ownerKind,
        ownerId,
        resubmissionGrantId: grant?.id ?? null,
      },
    });
    return {
      draft,
      contractMode: contract.mode,
      assessmentVersionId,
      schema: contract.schema,
      grantId: grant?.id ?? null,
    };
  } catch (error) {
    if (!(error instanceof PrismaRuntime.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const draft = await prisma.submission.findFirst({
      where: {
        assignmentId: assignment.id,
        assessmentVersionId,
        ownerKind: contract.ownerKind,
        ownerId,
        version,
        attempt,
        resubmissionGrantId: grant?.id ?? null,
        status: "draft",
      },
    });
    if (!draft) throw new DraftConflictError("That version and attempt already exists.");
    return {
      draft,
      contractMode: contract.mode,
      assessmentVersionId,
      schema: contract.schema,
      grantId: grant?.id ?? null,
    };
  }
}

export async function saveSubmissionDraft(args: {
  userId: string;
  assignmentId: string;
  draftId?: string;
  grantId?: string;
  fields: Record<string, unknown>;
  expectedUpdatedAt?: Date;
}): Promise<BoundDraft> {
  const bound = await ensureSubmissionDraft({
    userId: args.userId,
    assignmentId: args.assignmentId,
    draftId: args.draftId,
    grantId: args.grantId,
    initialFields: args.fields,
  });
  const validation = validateSubmissionFields(bound.schema, args.fields, {
    partial: true,
    submissionVersion: bound.draft.version,
  });
  if (!validation.ok) throw new ContractBindingError(validation.errors.join("; "));

  const updated = await prisma.submission.updateMany({
    where: {
      id: bound.draft.id,
      status: "draft",
      ...(args.expectedUpdatedAt ? { updatedAt: args.expectedUpdatedAt } : {}),
    },
    data: { fields: args.fields as Prisma.InputJsonValue },
  });
  if (updated.count !== 1) throw new DraftConflictError();
  const draft = await prisma.submission.findUniqueOrThrow({ where: { id: bound.draft.id } });
  return { ...bound, draft };
}

export async function getBoundDraftContext(args: {
  userId: string;
  draftId: string;
}): Promise<BoundDraft> {
  const draft = await prisma.submission.findUnique({ where: { id: args.draftId } });
  if (!draft) throw new DraftAccessError();
  const user = await loadUser(args.userId);
  if (!userCanAccessDraft(user, draft)) throw new DraftAccessError();
  const assignment = await loadAssignment(draft.assignmentId);
  const contract = await contextForExistingDraft(assignment, draft);
  return {
    draft,
    contractMode: contract.mode,
    assessmentVersionId: draft.assessmentVersionId,
    schema: contract.schema,
    grantId: draft.resubmissionGrantId,
  };
}

/** Read an existing draft without creating one; used to resume autosaved work. */
export async function loadSubmissionDraft(args: {
  userId: string;
  assignmentId: string;
}): Promise<
  | (BoundDraft & {
      evidence: {
        id: string;
        fieldKey: string;
        scanState: "pending" | "clean" | "quarantined" | "deleted";
        quarantineReasonCode: string | null;
        filename: string;
      }[];
    })
  | null
> {
  const [user, assignment] = await Promise.all([
    loadUser(args.userId),
    loadAssignment(args.assignmentId),
  ]);
  const draft = await loadExistingDraft(user, assignment.id);
  if (!draft) return null;
  const contract = await contextForExistingDraft(assignment, draft);
  const evidence = await prisma.submissionEvidence.findMany({
    where: { submissionId: draft.id },
    orderBy: { committedAt: "asc" },
    select: {
      id: true,
      fieldKey: true,
      scanState: true,
      quarantineReasonCode: true,
      reservation: { select: { filename: true } },
    },
  });
  return {
    draft,
    contractMode: contract.mode,
    assessmentVersionId: draft.assessmentVersionId,
    schema: contract.schema,
    grantId: draft.resubmissionGrantId,
    evidence: evidence.map(({ reservation, ...row }) => ({
      ...row,
      filename: reservation.filename,
    })),
  };
}
