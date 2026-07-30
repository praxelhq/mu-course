import type { Prisma } from "@prisma/client";
import { parseScoringPolicy } from "@/lib/assessment-policies";
import { prisma as defaultPrisma } from "@/lib/db";

export type TeamNominationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export type WorkflowSubmissionSource = {
  id: string;
  status: string;
  assignmentId: string;
  teamId: string | null;
  purpose: "graded" | "formative" | null;
  scoringPolicy: unknown;
  hasFinalGrade: boolean;
  scoreable: boolean;
};

export type TeamWorkflowNominationRecord = {
  id: string;
  teamId: string;
  assignmentId: string;
  submissionId: string;
  nominatedBy: string;
  reason: string;
  status: TeamNominationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

export type TeamWorkflowSelectionRecord = {
  id: string;
  teamId: string;
  assignmentId: string;
  submissionId: string;
  nominationId: string | null;
  selectedBy: string;
  reason: string;
};

type WorkflowAuditEntry = {
  actorId: string;
  action: "team-workflow.nominate" | "team-workflow.select";
  targetType: "teamWorkflowNomination" | "teamWorkflowSelection";
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export type TeamWorkflowStore = {
  getSubmission: (submissionId: string) => Promise<WorkflowSubmissionSource | null>;
  findPendingNomination: (input: {
    teamId: string;
    assignmentId: string;
    submissionId: string;
    nominatedBy: string;
  }) => Promise<TeamWorkflowNominationRecord | null>;
  getNomination: (id: string) => Promise<TeamWorkflowNominationRecord | null>;
  createNomination: (
    input: Omit<
      TeamWorkflowNominationRecord,
      "id" | "status" | "reviewedBy" | "reviewedAt"
    >,
  ) => Promise<TeamWorkflowNominationRecord>;
  updateNomination: (
    id: string,
    patch: Partial<Pick<TeamWorkflowNominationRecord, "status" | "reviewedBy" | "reviewedAt">>,
  ) => Promise<TeamWorkflowNominationRecord>;
  getSelection: (
    teamId: string,
    assignmentId: string,
  ) => Promise<TeamWorkflowSelectionRecord | null>;
  saveSelection: (
    input: Omit<TeamWorkflowSelectionRecord, "id">,
  ) => Promise<TeamWorkflowSelectionRecord>;
  createAudit: (entry: WorkflowAuditEntry) => Promise<void>;
};

export type TeamWorkflowDeps = {
  now?: () => Date;
  transaction?: <T>(work: (store: TeamWorkflowStore) => Promise<T>) => Promise<T>;
};

export class TeamWorkflowSelectionError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "TeamWorkflowSelectionError";
    this.status = status;
  }
}

function prismaStore(tx: Prisma.TransactionClient): TeamWorkflowStore {
  return {
    getSubmission: async (submissionId) => {
      const submission = await tx.submission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          status: true,
          assignmentId: true,
          teamId: true,
          assessmentVersion: { select: { purpose: true, scoringPolicy: true } },
          assessmentResult: { select: { scoreable: true } },
          grades: {
            where: { provisional: false },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!submission) return null;
      return {
        id: submission.id,
        status: submission.status,
        assignmentId: submission.assignmentId,
        teamId: submission.teamId,
        purpose: submission.assessmentVersion?.purpose ?? null,
        scoringPolicy: submission.assessmentVersion?.scoringPolicy ?? null,
        hasFinalGrade: submission.grades.length > 0,
        scoreable: submission.assessmentResult?.scoreable === true,
      };
    },
    findPendingNomination: (input) =>
      tx.teamWorkflowNomination.findFirst({
        where: { ...input, status: "pending" },
        orderBy: { createdAt: "desc" },
      }),
    getNomination: (id) => tx.teamWorkflowNomination.findUnique({ where: { id } }),
    createNomination: (input) => tx.teamWorkflowNomination.create({ data: input }),
    updateNomination: (id, patch) =>
      tx.teamWorkflowNomination.update({ where: { id }, data: patch }),
    getSelection: (teamId, assignmentId) =>
      tx.teamWorkflowSelection.findUnique({
        where: { teamId_assignmentId: { teamId, assignmentId } },
      }),
    saveSelection: (input) =>
      tx.teamWorkflowSelection.upsert({
        where: {
          teamId_assignmentId: { teamId: input.teamId, assignmentId: input.assignmentId },
        },
        create: input,
        update: {
          submissionId: input.submissionId,
          nominationId: input.nominationId ?? null,
          selectedBy: input.selectedBy,
          reason: input.reason,
        },
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

function transactionRunner(deps: TeamWorkflowDeps) {
  return (
    deps.transaction ??
    (<T>(work: (store: TeamWorkflowStore) => Promise<T>) =>
      defaultPrisma.$transaction((tx) => work(prismaStore(tx))))
  );
}

function normalizedReason(reason: string): string {
  const value = reason.trim();
  if (!value || value.length > 1_000) {
    throw new TeamWorkflowSelectionError(400, "Reason must be between 1 and 1000 characters");
  }
  return value;
}

function validateWorkflowTarget(
  source: WorkflowSubmissionSource,
  requested: { teamId: string; assignmentId: string },
  options: { requireScoreable: boolean },
): void {
  if (source.teamId !== requested.teamId) {
    throw new TeamWorkflowSelectionError(409, "Submission does not belong to this team");
  }
  if (source.assignmentId !== requested.assignmentId) {
    throw new TeamWorkflowSelectionError(409, "Submission does not belong to this assignment");
  }
  if (source.status !== "finalised") {
    throw new TeamWorkflowSelectionError(409, "Workflow submission is not finalised");
  }
  if (!source.hasFinalGrade) {
    throw new TeamWorkflowSelectionError(409, "Workflow submission has no final grade");
  }
  const scoringPolicy = parseScoringPolicy(source.scoringPolicy);
  if (source.purpose !== "graded" || scoringPolicy?.component !== "workflow") {
    throw new TeamWorkflowSelectionError(409, "Submission is not a graded workflow version");
  }
  if (options.requireScoreable && !source.scoreable) {
    throw new TeamWorkflowSelectionError(409, "Workflow assessment result is not scoreable");
  }
}

function nominationView(row: TeamWorkflowNominationRecord): Record<string, unknown> {
  return {
    id: row.id,
    teamId: row.teamId,
    assignmentId: row.assignmentId,
    submissionId: row.submissionId,
    nominatedBy: row.nominatedBy,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function selectionView(row: TeamWorkflowSelectionRecord): Record<string, unknown> {
  return {
    id: row.id,
    teamId: row.teamId,
    assignmentId: row.assignmentId,
    submissionId: row.submissionId,
    nominationId: row.nominationId ?? null,
    selectedBy: row.selectedBy,
    reason: row.reason,
  };
}

export async function nominateTeamWorkflow(
  input: {
    assignmentId: string;
    submissionId: string;
    reason: string;
    actor: { userId: string; teamId: string | null };
  },
  deps: TeamWorkflowDeps = {},
): Promise<{ changed: boolean; nomination: TeamWorkflowNominationRecord }> {
  if (!input.actor.teamId) {
    throw new TeamWorkflowSelectionError(403, "A team member is required to nominate work");
  }
  const teamId = input.actor.teamId;
  const reason = normalizedReason(input.reason);
  return transactionRunner(deps)(async (store) => {
    const submission = await store.getSubmission(input.submissionId);
    if (!submission) throw new TeamWorkflowSelectionError(404, "Unknown submission");
    if (submission.teamId !== teamId) {
      throw new TeamWorkflowSelectionError(403, "Only a member of the submission team may nominate it");
    }
    validateWorkflowTarget(
      submission,
      { teamId, assignmentId: input.assignmentId },
      { requireScoreable: false },
    );

    const existing = await store.findPendingNomination({
      teamId,
      assignmentId: input.assignmentId,
      submissionId: input.submissionId,
      nominatedBy: input.actor.userId,
    });
    if (existing && existing.reason === reason) return { changed: false, nomination: existing };

    const nomination = await store.createNomination({
      teamId,
      assignmentId: input.assignmentId,
      submissionId: input.submissionId,
      nominatedBy: input.actor.userId,
      reason,
    });
    await store.createAudit({
      actorId: input.actor.userId,
      action: "team-workflow.nominate",
      targetType: "teamWorkflowNomination",
      targetId: nomination.id,
      before: null,
      after: nominationView(nomination),
    });
    return { changed: true, nomination };
  });
}

export async function selectTeamWorkflow(
  input: {
    teamId: string;
    assignmentId: string;
    submissionId: string;
    nominationId?: string;
    reason: string;
    actor: { userId: string; role: "student" | "instructor" | "admin" };
  },
  deps: TeamWorkflowDeps = {},
): Promise<{ changed: boolean; selection: TeamWorkflowSelectionRecord }> {
  if (input.actor.role !== "instructor" && input.actor.role !== "admin") {
    throw new TeamWorkflowSelectionError(403, "Instructor role required");
  }
  const reason = normalizedReason(input.reason);
  const now = deps.now ?? (() => new Date());

  return transactionRunner(deps)(async (store) => {
    const submission = await store.getSubmission(input.submissionId);
    if (!submission) throw new TeamWorkflowSelectionError(404, "Unknown submission");
    validateWorkflowTarget(
      submission,
      { teamId: input.teamId, assignmentId: input.assignmentId },
      { requireScoreable: true },
    );

    let nomination: TeamWorkflowNominationRecord | null = null;
    if (input.nominationId) {
      nomination = await store.getNomination(input.nominationId);
      if (
        !nomination ||
        nomination.teamId !== input.teamId ||
        nomination.assignmentId !== input.assignmentId ||
        nomination.submissionId !== input.submissionId ||
        (nomination.status !== "pending" && nomination.status !== "accepted")
      ) {
        throw new TeamWorkflowSelectionError(409, "Nomination does not match the selected workflow");
      }
    }

    const before = await store.getSelection(input.teamId, input.assignmentId);
    const nominationId = nomination?.id ?? null;
    const alreadyCurrent =
      before?.submissionId === input.submissionId &&
      (before.nominationId ?? null) === nominationId &&
      before.reason === reason &&
      before.selectedBy === input.actor.userId;
    if (alreadyCurrent && before) return { changed: false, selection: before };

    const selection = await store.saveSelection({
      teamId: input.teamId,
      assignmentId: input.assignmentId,
      submissionId: input.submissionId,
      nominationId,
      selectedBy: input.actor.userId,
      reason,
    });
    const reviewedAt = now();
    if (before?.nominationId && before.nominationId !== nominationId) {
      await store.updateNomination(before.nominationId, {
        status: "rejected",
        reviewedBy: input.actor.userId,
        reviewedAt,
      });
    }
    if (nomination) {
      await store.updateNomination(nomination.id, {
        status: "accepted",
        reviewedBy: input.actor.userId,
        reviewedAt,
      });
    }
    await store.createAudit({
      actorId: input.actor.userId,
      action: "team-workflow.select",
      targetType: "teamWorkflowSelection",
      targetId: selection.id,
      before: before ? selectionView(before) : null,
      after: selectionView(selection),
    });
    return { changed: true, selection };
  });
}
