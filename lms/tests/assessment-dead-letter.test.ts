import { describe, expect, it, vi } from "vitest";
import { markAssessmentSubmissionDeadLettered } from "../lib/assessments/dead-letter";
import { reconcileGradeSubmissionDeadLetters } from "../worker/jobs/reconcile-grade-dead-letters";

describe("AssessmentResult dead-letter transition", () => {
  it("atomically marks the exhausted evaluation terminal and emits hold/audit/notification once", async () => {
    let status = "failed";
    let deadLetteredAt: Date | null = null;
    const deterministicResult = { objective: { correctCount: 3, totalCount: 4 } };
    const holds: unknown[] = [];
    const audits: unknown[] = [];
    const notifications: unknown[] = [];
    const tx = {
      assessmentResult: {
        findUnique: vi.fn(async () => ({
          id: "result-1",
          status,
          errorCode: "provider-failure",
          deterministicResult,
          submission: {
            id: "submission-1",
            userId: "student-1",
            assignment: { title: "S5 workflow" },
          },
        })),
        updateMany: vi.fn(async ({ data }: { data: { status: string; deadLetteredAt: Date } }) => {
          if (["completed", "repair_required", "dead_lettered"].includes(status)) {
            return { count: 0 };
          }
          status = data.status;
          deadLetteredAt = data.deadLetteredAt;
          return { count: 1 };
        }),
      },
      grade: { findFirst: vi.fn(async () => null) },
      gradeHold: { create: vi.fn(async ({ data }: { data: unknown }) => holds.push(data)) },
      auditLog: { create: vi.fn(async ({ data }: { data: unknown }) => audits.push(data)) },
      notification: {
        create: vi.fn(async ({ data }: { data: unknown }) => notifications.push(data)),
      },
    };
    const db = {
      $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const now = new Date("2026-07-30T12:00:00Z");

    await expect(
      markAssessmentSubmissionDeadLettered(
        {
          submissionId: "submission-1",
          sourceJobId: "job-dead-1",
          exhaustedAt: now,
        },
        { prisma: db as never },
      ),
    ).resolves.toEqual({ kind: "marked", assessmentResultId: "result-1" });
    await expect(
      markAssessmentSubmissionDeadLettered(
        {
          submissionId: "submission-1",
          sourceJobId: "job-dead-1",
          exhaustedAt: now,
        },
        { prisma: db as never },
      ),
    ).resolves.toEqual({ kind: "already-terminal", assessmentResultId: "result-1" });

    expect(status).toBe("dead_lettered");
    expect(deadLetteredAt).toEqual(now);
    expect(deterministicResult).toEqual({ objective: { correctCount: 3, totalCount: 4 } });
    expect(holds).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it("reconciles queued dead jobs without consuming them and tolerates legacy jobs", async () => {
    const source = {
      findJobs: vi.fn(async () => [
        { id: "dead-1", data: { submissionId: "submission-1" } },
        { id: "dead-legacy", data: { submissionId: "legacy-submission" } },
        { id: "malformed", data: {} },
      ]),
    };
    const mark = vi.fn(async ({ submissionId }: { submissionId: string }) =>
      submissionId === "submission-1"
        ? ({ kind: "marked", assessmentResultId: "result-1" } as const)
        : ({ kind: "legacy-or-missing", assessmentResultId: null } as const),
    );
    await expect(
      reconcileGradeSubmissionDeadLetters(source, {
        markDeadLettered: mark,
        now: () => new Date("2026-07-30T12:00:00Z"),
      }),
    ).resolves.toEqual({ examined: 3, marked: 1, failed: 1 });
    expect(source.findJobs).toHaveBeenCalledWith("grade.submission.dead", { queued: true });
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it("creates a terminal result for a bound version whose config failed before claim", async () => {
    const createdResults: Array<Record<string, unknown>> = [];
    const tx = {
      assessmentResult: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdResults.push(data);
          return { id: "result-created" };
        }),
      },
      submission: {
        findUnique: vi.fn(async () => ({
          id: "submission-unclaimed",
          userId: "student-1",
          version: 1,
          attempt: 1,
          ownerKind: "individual",
          ownerId: "student-1",
          assessmentVersionId: "assessment-v1",
          assignment: { title: "S3 analysis", contractMode: "versioned" },
          assessmentVersion: {
            purpose: "graded",
            checksumSha256: "assessment-hash",
            datasetRelease: { checksumSha256: "dataset-hash" },
            evaluatorConfig: null,
          },
        })),
      },
      grade: { findFirst: vi.fn(async () => null) },
      gradeHold: { create: vi.fn(async () => undefined) },
      auditLog: { create: vi.fn(async () => undefined) },
      notification: { create: vi.fn(async () => undefined) },
    };
    const db = {
      $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    await expect(
      markAssessmentSubmissionDeadLettered(
        {
          submissionId: "submission-unclaimed",
          sourceJobId: "dead-unclaimed",
          exhaustedAt: new Date("2026-07-30T12:00:00Z"),
        },
        { prisma: db as never },
      ),
    ).resolves.toEqual({ kind: "marked", assessmentResultId: "result-created" });
    expect(createdResults).toEqual([
      expect.objectContaining({
        status: "dead_lettered",
        evaluationKey: "assessment:submission-unclaimed:assessment-v1:v1:a1",
        assessmentHash: "assessment-hash",
        datasetHash: "dataset-hash",
        evaluatorHash: null,
      }),
    ]);
  });
});
