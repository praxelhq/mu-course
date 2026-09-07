import { describe, expect, it } from "vitest";
import {
  TeamWorkflowSelectionError,
  nominateTeamWorkflow,
  selectTeamWorkflow,
  type TeamWorkflowNominationRecord,
  type TeamWorkflowSelectionRecord,
  type TeamWorkflowStore,
  type WorkflowSubmissionSource,
} from "../lib/team-workflow-selection";

function workflowSource(
  patch: Partial<WorkflowSubmissionSource> = {},
): WorkflowSubmissionSource {
  return {
    id: "sub-final",
    status: "finalised",
    assignmentId: "assignment-5",
    teamId: "team-a",
    purpose: "graded",
    scoringPolicy: {
      component: "workflow",
      dimensions: {
        usefulness: ["craft", "relevance"],
        execution: "functionality",
        ownership: "verification-evidence",
      },
    },
    hasFinalGrade: true,
    scoreable: true,
    ...patch,
  };
}

function harness(initialSource = workflowSource()) {
  const nominations: TeamWorkflowNominationRecord[] = [];
  let selection: TeamWorkflowSelectionRecord | null = null;
  const audits: Parameters<TeamWorkflowStore["createAudit"]>[0][] = [];
  const store: TeamWorkflowStore = {
    getSubmission: async (submissionId) =>
      submissionId === initialSource.id ? initialSource : null,
    findPendingNomination: async ({ teamId, assignmentId, submissionId, nominatedBy }) =>
      nominations.find(
        (row) =>
          row.teamId === teamId &&
          row.assignmentId === assignmentId &&
          row.submissionId === submissionId &&
          row.nominatedBy === nominatedBy &&
          row.status === "pending",
      ) ?? null,
    getNomination: async (id) => nominations.find((row) => row.id === id) ?? null,
    createNomination: async (input) => {
      const row: TeamWorkflowNominationRecord = {
        id: `nomination-${nominations.length + 1}`,
        ...input,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
      };
      nominations.push(row);
      return row;
    },
    updateNomination: async (id, patch) => {
      const row = nominations.find((item) => item.id === id);
      if (!row) throw new Error("missing nomination");
      Object.assign(row, patch);
      return row;
    },
    getSelection: async () => selection,
    saveSelection: async (input) => {
      selection = {
        id: selection?.id ?? "selection-1",
        ...input,
      };
      return selection;
    },
    createAudit: async (entry) => {
      audits.push(entry);
    },
  };
  const deps = {
    now: () => new Date("2026-08-01T10:00:00.000Z"),
    transaction: async <T>(work: (tx: TeamWorkflowStore) => Promise<T>) => work(store),
  };
  return { audits, deps, nominations, get selection() { return selection; } };
}

describe("team workflow nomination and selection", () => {
  it("records a same-team nomination as advisory without creating a selection", async () => {
    const h = harness();
    const result = await nominateTeamWorkflow(
      {
        assignmentId: "assignment-5",
        submissionId: "sub-final",
        reason: "Best verified run.",
        actor: { userId: "student-1", teamId: "team-a" },
      },
      h.deps,
    );
    expect(result.nomination.status).toBe("pending");
    expect(h.selection).toBeNull();
    expect(h.audits[0].action).toBe("team-workflow.nominate");
  });

  it("rejects nomination by a non-member and rejects a non-final workflow", async () => {
    const h = harness();
    await expect(
      nominateTeamWorkflow(
        {
          assignmentId: "assignment-5",
          submissionId: "sub-final",
          reason: "Attempted nomination.",
          actor: { userId: "student-9", teamId: "team-b" },
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 403 });

    const notFinal = harness(workflowSource({ status: "graded" }));
    await expect(
      nominateTeamWorkflow(
        {
          assignmentId: "assignment-5",
          submissionId: "sub-final",
          reason: "Not ready.",
          actor: { userId: "student-1", teamId: "team-a" },
        },
        notFinal.deps,
      ),
    ).rejects.toBeInstanceOf(TeamWorkflowSelectionError);
  });

  it("lets only staff select one existing finalised, same-team, same-assignment graded workflow", async () => {
    const h = harness();
    await expect(
      selectTeamWorkflow(
        {
          teamId: "team-a",
          assignmentId: "assignment-5",
          submissionId: "sub-final",
          reason: "Verified against acceptance tests.",
          actor: { userId: "student-1", role: "student" },
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 403 });

    const selected = await selectTeamWorkflow(
      {
        teamId: "team-a",
        assignmentId: "assignment-5",
        submissionId: "sub-final",
        reason: "Verified against acceptance tests.",
        actor: { userId: "instructor-1", role: "instructor" },
      },
      h.deps,
    );
    expect(selected.selection).toMatchObject({
      teamId: "team-a",
      assignmentId: "assignment-5",
      submissionId: "sub-final",
      selectedBy: "instructor-1",
    });
    expect(h.audits[0].action).toBe("team-workflow.select");
  });

  it.each([
    ["team mismatch", { teamId: "team-b" }],
    ["assignment mismatch", { assignmentId: "other-assignment" }],
    ["not finalised", { status: "graded" }],
    ["not graded", { hasFinalGrade: false }],
    ["not scoreable", { scoreable: false }],
    ["formative", { purpose: "formative" }],
    ["not workflow", { scoringPolicy: { component: "none" } }],
  ])("rejects %s targets", async (_label, patch) => {
    const h = harness(workflowSource(patch as Partial<WorkflowSubmissionSource>));
    await expect(
      selectTeamWorkflow(
        {
          teamId: "team-a",
          assignmentId: "assignment-5",
          submissionId: "sub-final",
          reason: "Should fail.",
          actor: { userId: "admin-1", role: "admin" },
        },
        h.deps,
      ),
    ).rejects.toBeInstanceOf(TeamWorkflowSelectionError);
  });

  it("validates an optional nomination against the exact target and marks only the selected nomination accepted", async () => {
    const h = harness();
    const nomination = await nominateTeamWorkflow(
      {
        assignmentId: "assignment-5",
        submissionId: "sub-final",
        reason: "Team choice.",
        actor: { userId: "student-1", teamId: "team-a" },
      },
      h.deps,
    );
    await selectTeamWorkflow(
      {
        teamId: "team-a",
        assignmentId: "assignment-5",
        submissionId: "sub-final",
        nominationId: nomination.nomination.id,
        reason: "Instructor verified the nominated run.",
        actor: { userId: "instructor-1", role: "instructor" },
      },
      h.deps,
    );
    expect(h.nominations[0]).toMatchObject({
      status: "accepted",
      reviewedBy: "instructor-1",
    });
  });
});
