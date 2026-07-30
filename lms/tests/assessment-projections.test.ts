import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getLearnerAssignmentProjection,
  listInstructorGradeHoldProjections,
  listInstructorWorkflowCandidates,
  projectLearnerAssessmentFeedback,
} from "../lib/assessment-projections";

const at = (iso: string) => new Date(iso);

const privatePublicationPolicy = {};
const workflowPublicationPolicy = {
  wall: "workflow",
  consentField: "galleryConsent",
  captionField: "gallerySummary",
  publicTextFields: ["workflowTitle", "gallerySummary"],
  previewRole: "workflowPngFile",
  actions: [],
};
const workflowScoringPolicy = {
  component: "workflow",
  dimensions: {
    usefulness: ["craft", "relevance"],
    execution: "functionality",
    ownership: "verification-evidence",
  },
};

function learnerDb() {
  return {
    user: { findUnique: async () => ({ teamId: "team-a" }) },
    assignment: {
      findUnique: async () => ({
        id: "assignment-5",
        title: "Safe Make workflow",
        contractMode: "versioned",
        activeAssessmentVersion: {
          id: "assessment-v2",
          version: 2,
          checksumSha256: "assessment-checksum-v2",
          datasetRelease: {
            id: "dataset-1",
            slug: "synthetic-fixtures",
            version: 1,
            title: "Synthetic workflow fixtures",
            checksumSha256: "dataset-checksum",
          },
        },
      }),
    },
    submission: {
      findMany: async () => [
        {
          id: "submission-v1",
          version: 1,
          attempt: 1,
          status: "finalised",
          submittedAt: at("2026-08-01T09:00:00.000Z"),
          createdAt: at("2026-08-01T08:00:00.000Z"),
          assessmentVersion: {
            id: "assessment-v1",
            version: 1,
            checksumSha256: "assessment-checksum-v1",
            purpose: "graded",
            scoringPolicy: workflowScoringPolicy,
            publicationPolicy: workflowPublicationPolicy,
            datasetRelease: null,
          },
          assessmentResult: {
            status: "completed",
            scoreable: true,
            publishable: true,
            completedAt: at("2026-08-01T10:00:00.000Z"),
            structuredFeedback: {
              feedbackMd: "Add an explicit retry branch before the approval step.",
              actionItems: ["Test a duplicate delivery before publishing."],
              confidence: 0.99,
              rubricScores: { craft: 9 },
            },
            citations: [{ dimension: "craft", evidenceIds: ["private-receipt-id"] }],
          },
          grades: [
            {
              id: "grade-v1",
              provisional: false,
              createdAt: at("2026-08-01T10:00:00.000Z"),
              appeals: [
                {
                  id: "appeal-1",
                  gradeId: "grade-v1",
                  reason: "Please recheck the timeout fixture.",
                  status: "resolved",
                  outcome: "accepted",
                  createdAt: at("2026-08-01T11:00:00.000Z"),
                  updatedAt: at("2026-08-01T12:00:00.000Z"),
                  resolvedAt: at("2026-08-01T12:00:00.000Z"),
                },
              ],
            },
          ],
          publicationDecision: null,
        },
        {
          id: "submission-v2",
          version: 2,
          attempt: 1,
          status: "submitted",
          submittedAt: at("2026-08-02T09:00:00.000Z"),
          createdAt: at("2026-08-02T08:00:00.000Z"),
          assessmentVersion: {
            id: "assessment-v2",
            version: 2,
            checksumSha256: "assessment-checksum-v2",
            purpose: "graded",
            scoringPolicy: workflowScoringPolicy,
            publicationPolicy: privatePublicationPolicy,
            datasetRelease: null,
          },
          assessmentResult: {
            status: "provider_pending",
            scoreable: false,
            publishable: false,
            completedAt: null,
            structuredFeedback: null,
            citations: null,
          },
          grades: [],
          publicationDecision: null,
        },
      ],
    },
    resubmissionGrant: {
      findMany: async () => [
        {
          id: "grant-1",
          assessmentVersionId: "assessment-v2",
          kind: "improvement",
          targetVersion: 2,
          targetAttempt: 1,
          expiresAt: at("2026-08-10T00:00:00.000Z"),
          consumedAt: null,
        },
      ],
    },
    teamWorkflowNomination: {
      findMany: async () => [
        {
          id: "nomination-1",
          submissionId: "submission-v1",
          status: "pending",
          createdAt: at("2026-08-01T13:00:00.000Z"),
          updatedAt: at("2026-08-01T13:00:00.000Z"),
        },
      ],
    },
    teamWorkflowSelection: { findUnique: async () => null },
  } as unknown as PrismaClient;
}

describe("safe assessment read projections", () => {
  it("returns learner history, active identity and workflow state without private grader/evidence fields", async () => {
    const projection = await getLearnerAssignmentProjection(
      {
        userId: "student-1",
        assignmentId: "assignment-5",
        now: at("2026-08-03T00:00:00.000Z"),
      },
      { prisma: learnerDb() },
    );
    expect(projection).not.toBeNull();
    expect(projection?.activeAssessment).toMatchObject({
      assessmentVersionId: "assessment-v2",
      dataset: { slug: "synthetic-fixtures", version: 1 },
    });
    expect(projection?.history.map((row) => [row.submissionId, row.version, row.attempt])).toEqual([
      ["submission-v2", 2, 1],
      ["submission-v1", 1, 1],
    ]);
    expect(projection?.latestSubmittedId).toBe("submission-v2");
    expect(projection?.latestScoreableId).toBe("submission-v1");
    expect(projection?.history[1]).toMatchObject({
      workflowNominationEligible: true,
      latestGrade: { gradeId: "grade-v1", state: "final" },
      publication: { ownerState: "not-consented", instructorState: "pending" },
      feedback: {
        summaryMd: "Add an explicit retry branch before the approval step.",
        citations: [{ dimension: "craft", evidenceCount: 1 }],
      },
    });
    expect(projection?.grants[0].state).toBe("eligible");
    expect(projection?.workflow.nominations[0].status).toBe("pending");

    const serialized = JSON.stringify(projection).toLowerCase();
    for (const privateTerm of [
      "private-receipt-id",
      "rubricscores",
      "confidence",
      "promptlog",
      "evaluatorconfig",
      "holdid",
      "s3key",
    ]) {
      expect(serialized).not.toContain(privateTerm);
    }
  });

  it("fails closed instead of returning secret-bearing or private-system feedback", () => {
    expect(
      projectLearnerAssessmentFeedback(
        { feedbackMd: "Paste api_token=secret-value into the webhook." },
        [],
      ),
    ).toBeNull();
    expect(
      projectLearnerAssessmentFeedback(
        { feedbackMd: "The evaluator prompt log says the answer key is hidden." },
        [],
      ),
    ).toBeNull();
  });

  it("projects instructor holds with optimistic identity but no hold evidence or grade values", async () => {
    const db = {
      gradeHold: {
        findMany: async () => [
          {
            id: "hold-1",
            kind: "flag",
            code: "needs-verification",
            reason: "Verify the timeout fixture.",
            createdAt: at("2026-08-01T10:00:00.000Z"),
            updatedAt: at("2026-08-01T11:00:00.000Z"),
            submission: {
              id: "submission-v1",
              ownerKind: "individual",
              version: 1,
              attempt: 1,
              status: "graded",
              assignment: { id: "assignment-5", title: "Safe Make workflow" },
              user: { name: "Asha", section: { code: "A" } },
              team: { name: "Team A", section: { code: "A" } },
            },
          },
        ],
      },
    } as unknown as PrismaClient;
    const rows = await listInstructorGradeHoldProjections({}, { prisma: db });
    expect(rows[0]).toMatchObject({
      holdId: "hold-1",
      expectedUpdatedAt: "2026-08-01T11:00:00.000Z",
      cause: "flag:needs-verification",
      display: { ownerName: "Asha", assignmentId: "assignment-5" },
    });
    expect(JSON.stringify(rows)).not.toContain("evidence");
    expect(JSON.stringify(rows)).not.toContain("confidence");
  });

  it("lists exact selectable workflow versions without serializing member grades", async () => {
    const db = {
      submission: {
        findMany: async () => [
          {
            id: "submission-v1",
            version: 1,
            attempt: 2,
            teamId: "team-a",
            assignment: { id: "assignment-5", title: "Safe Make workflow" },
            user: { name: "Asha" },
            team: { id: "team-a", name: "Team A" },
            assessmentVersion: { purpose: "graded", scoringPolicy: workflowScoringPolicy },
            assessmentResult: { status: "completed", scoreable: true },
            grades: [{ id: "private-grade-id" }],
            workflowNominations: [
              {
                id: "nomination-1",
                status: "pending",
                reason: "Best verified run.",
                createdAt: at("2026-08-01T13:00:00.000Z"),
              },
            ],
            workflowSelections: [],
          },
        ],
      },
    } as unknown as PrismaClient;
    const rows = await listInstructorWorkflowCandidates({}, { prisma: db });
    expect(rows[0]).toMatchObject({
      submissionId: "submission-v1",
      teamId: "team-a",
      version: 1,
      attempt: 2,
      scoreable: true,
      hasFinalGrade: true,
      selectable: true,
    });
    expect(JSON.stringify(rows)).not.toContain("private-grade-id");
  });
});
