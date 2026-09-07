import { describe, expect, it } from "vitest";
import {
  selectedWorkflowParts,
  validateWorkflowSelectionTarget,
} from "../lib/scoring/assemble";

const workflowPolicy = {
  component: "workflow" as const,
  dimensions: {
    usefulness: ["craft", "relevance"],
    execution: "functionality",
    ownership: "verification-evidence",
  },
};

const selectedRubric = {
  craft: { score: 8 },
  relevance: { score: 10 },
  functionality: { score: 7 },
  "verification-evidence": { score: 3 },
};

const ownRubric = {
  craft: { score: 1 },
  relevance: { score: 1 },
  functionality: { score: 1 },
  "verification-evidence": { score: 9 },
};

describe("team workflow policy", () => {
  it("uses exactly the instructor-selected final workflow for team parts and the student's own final for ownership", () => {
    expect(
      selectedWorkflowParts({
        selected: { rubricScores: selectedRubric, policy: workflowPolicy },
        own: { rubricScores: ownRubric, policy: workflowPolicy },
      }),
    ).toEqual({ usefulness0to30: 27, execution0to20: 14, ownership0to10: 9 });
  });

  it("does not average member prototypes or fabricate ownership when no own final exists", () => {
    expect(
      selectedWorkflowParts({
        selected: { rubricScores: selectedRubric, policy: workflowPolicy },
        own: null,
      }),
    ).toEqual({ usefulness0to30: 27, execution0to20: 14, ownership0to10: null });
  });

  it("accepts only an existing finalised same-team/same-assignment workflow", () => {
    expect(
      validateWorkflowSelectionTarget({
        requestedTeamId: "team-a",
        requestedAssignmentId: "assignment-5",
        submission: {
          id: "sub-1",
          status: "finalised",
          assignmentId: "assignment-5",
          submitterTeamId: "team-a",
          scoringPolicy: workflowPolicy,
          purpose: "graded",
          scoreable: true,
        },
      }),
    ).toEqual({ ok: true });

    for (const submission of [
      {
        id: "sub-1",
        status: "graded",
        assignmentId: "assignment-5",
        submitterTeamId: "team-a",
        scoringPolicy: workflowPolicy,
        purpose: "graded" as const,
        scoreable: true,
      },
      {
        id: "sub-1",
        status: "finalised",
        assignmentId: "other",
        submitterTeamId: "team-a",
        scoringPolicy: workflowPolicy,
        purpose: "graded" as const,
        scoreable: true,
      },
      {
        id: "sub-1",
        status: "finalised",
        assignmentId: "assignment-5",
        submitterTeamId: "team-b",
        scoringPolicy: workflowPolicy,
        purpose: "graded" as const,
        scoreable: true,
      },
    ]) {
      expect(
        validateWorkflowSelectionTarget({
          requestedTeamId: "team-a",
          requestedAssignmentId: "assignment-5",
          submission,
        }).ok,
      ).toBe(false);
    }
  });

  it("fails closed when the selected final is not scoreable", () => {
    expect(
      validateWorkflowSelectionTarget({
        requestedTeamId: "team-a",
        requestedAssignmentId: "assignment-5",
        submission: {
          id: "sub-1",
          status: "finalised",
          assignmentId: "assignment-5",
          submitterTeamId: "team-a",
          scoringPolicy: workflowPolicy,
          purpose: "graded",
          scoreable: false,
        },
      }),
    ).toEqual({ ok: false, reason: "submission-not-scoreable" });
  });
});
