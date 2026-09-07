import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizeGradingEvidence } from "../lib/evidence/grading-authorization";
import {
  handleGradeSubmission,
  prepareVersionedEvidence,
} from "../worker/jobs/grade-submission";
import {
  AssessmentAnchorError,
  assertAssessmentEvaluatorChecksum,
} from "../lib/assessments/assessment-anchors";

type VersionedSubmission = Parameters<typeof prepareVersionedEvidence>[0];

const publicSchema = {
  fields: [
    {
      key: "workflowFile",
      label: "Workflow file",
      kind: "file",
      required: true,
      fileRole: "runLogFile",
      acceptedMimeTypes: ["application/json"],
      maxBytes: 50_000,
    },
  ],
};

function receipt(id: string, bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fieldKey: "workflowFile",
    fileRole: "runLogFile",
    s3Key: `submissions/student/submission/${id}`,
    s3VersionId: `version-${id}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.byteLength,
    inspectedMimeType: "application/json",
    scanState: "clean",
    ...overrides,
  };
}

function submission(fields: Record<string, unknown>, evidence: ReturnType<typeof receipt>[]) {
  return {
    version: 1,
    fields,
    evidence,
    assessmentVersion: { publicSchema },
  } as unknown as VersionedSubmission;
}

describe("grading evidence authorization", () => {
  it("reads and marks only receipts frozen into the published submission fields", async () => {
    const referencedBytes = Buffer.from('{"status":"ok"}');
    const unreferencedBytes = Buffer.from('{"status":"private draft"}');
    const referenced = receipt("referenced", referencedBytes);
    const unreferenced = receipt("unreferenced", unreferencedBytes);
    const readEvidence = vi.fn(async (item: ReturnType<typeof receipt>) =>
      item.id === referenced.id ? referencedBytes : unreferencedBytes,
    );

    const result = await prepareVersionedEvidence(
      submission({ workflowFile: referenced.id }, [referenced, unreferenced]),
      { readEvidence },
    );

    expect(readEvidence).toHaveBeenCalledOnce();
    expect(readEvidence).toHaveBeenCalledWith(expect.objectContaining({ id: referenced.id }));
    expect(result?.safeForProvider).toBe(true);
    expect(result?.authorizedEvidenceIds).toEqual([referenced.id]);
    expect(result?.textEvidence.map((item) => item.id)).toEqual(["runLogFile:referenced"]);
  });

  it("fails closed without reading when a frozen receipt is missing or mismatched", async () => {
    const bytes = Buffer.from('{"status":"ok"}');
    const mismatched = receipt("mismatched", bytes, { fileRole: "blueprintFile" });
    const readEvidence = vi.fn(async () => bytes);

    const missing = await prepareVersionedEvidence(
      submission({ workflowFile: "missing" }, []),
      { readEvidence },
    );
    const mismatch = await prepareVersionedEvidence(
      submission({ workflowFile: mismatched.id }, [mismatched]),
      { readEvidence },
    );

    expect(missing).toMatchObject({
      safeForProvider: false,
      quarantinedEvidenceIds: [],
      attachments: [],
      textEvidence: [],
    });
    expect(mismatch).toMatchObject({
      safeForProvider: false,
      quarantinedEvidenceIds: [mismatched.id],
      attachments: [],
      textEvidence: [],
    });
    expect(readEvidence).not.toHaveBeenCalled();
  });

  it("ignores extra receipts but requires every frozen receipt to be clean and exact", () => {
    const bytes = Buffer.from('{"status":"ok"}');
    const referenced = receipt("referenced", bytes);
    const extra = receipt("extra", bytes);
    const pending = receipt("pending", bytes, { scanState: "pending" });

    expect(
      authorizeGradingEvidence({
        publicSchema,
        submissionVersion: 1,
        fields: { workflowFile: referenced.id },
        evidence: [referenced, extra],
      }),
    ).toMatchObject({ ok: true, receipts: [referenced] });
    expect(
      authorizeGradingEvidence({
        publicSchema,
        submissionVersion: 1,
        fields: { workflowFile: pending.id },
        evidence: [pending, extra],
      }),
    ).toMatchObject({
      ok: false,
      receipts: [],
      quarantinedEvidenceIds: [pending.id],
    });
    expect(
      authorizeGradingEvidence({
        publicSchema: {
          fields: [
            {
              key: "optionalFile",
              label: "Optional file",
              kind: "file",
              required: false,
            },
          ],
        },
        submissionVersion: 1,
        fields: {},
        evidence: [],
      }),
    ).toMatchObject({ ok: false, receipts: [] });
  });

  it("does not read, send, or mark an unreferenced receipt clean on successful grading", async () => {
    const bytes = Buffer.from('{"status":"private draft"}');
    const extra = receipt("unreferenced-pending", bytes, { scanState: "pending" });
    const model = vi.fn();
    const readEvidence = vi.fn(async () => bytes);
    const submissionEvidenceUpdate = vi.fn(async () => ({ count: 1 }));
    const submissionUpdate = vi.fn(async () => ({}));
    const assessmentResultUpdate = vi.fn(async () => ({ count: 1 }));
    const evaluatorJson = {
      config: { providerMode: "none" },
      answerKey: {},
      anchors: null,
      normalization: null,
    };
    const db: Record<string, unknown> = {
      submission: {
        findUnique: vi.fn(async () => ({
          id: "submission-formative",
          assignmentId: "assignment-formative",
          userId: "student-1",
          status: "submitted",
          version: 1,
          attempt: 1,
          ownerKind: "individual",
          ownerId: "student-1",
          contentHash: "a".repeat(64),
          fields: {},
          assessmentVersionId: "assessment-v1",
          assignment: {
            title: "Formative checkpoint",
            contractMode: "versioned",
            assignmentType: {},
          },
          assessmentVersion: {
            id: "assessment-v1",
            purpose: "formative",
            publicSchema: { fields: [] },
            rubric: { dimensions: [] },
            scoringPolicy: { component: "none" },
            checksumSha256: "assessment-hash",
            evaluatorConfig: {
              ...evaluatorJson,
              checksumSha256: assertAssessmentEvaluatorChecksum({
                ...evaluatorJson,
                expectedSha256: null,
              }),
            },
            datasetRelease: null,
          },
          evidence: [extra],
        })),
        update: submissionUpdate,
      },
      assessmentResult: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "result-1",
          evaluationKey: data.evaluationKey,
          status: "claimed",
          claimToken: data.claimToken,
          claimedAt: data.claimedAt,
        })),
        updateMany: assessmentResultUpdate,
      },
      submissionEvidence: { updateMany: submissionEvidenceUpdate },
      configKV: { findUnique: vi.fn(async () => null) },
      notification: { create: vi.fn(async () => ({})) },
    };
    db.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db));

    await handleGradeSubmission("submission-formative", {
      prisma: db as never,
      model,
      readEvidence,
      claimToken: () => "claim-1",
      now: () => new Date("2026-07-30T00:00:00Z"),
    });

    expect(readEvidence).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
    expect(submissionEvidenceUpdate).not.toHaveBeenCalled();
    expect(submissionUpdate).toHaveBeenCalledTimes(2);
    expect(assessmentResultUpdate).toHaveBeenCalledTimes(2);
  });

  it("fails before evaluation when frozen evaluator JSON does not match its DB checksum", async () => {
    const model = vi.fn();
    const submissionUpdate = vi.fn(async () => ({}));
    const db = {
      submission: {
        findUnique: vi.fn(async () => ({
          id: "submission-tampered-evaluator",
          assignmentId: "assignment-formative",
          userId: "student-1",
          status: "submitted",
          version: 1,
          attempt: 1,
          ownerKind: "individual",
          ownerId: "student-1",
          contentHash: "b".repeat(64),
          fields: {},
          assessmentVersionId: "assessment-v1",
          assignment: {
            title: "Formative checkpoint",
            contractMode: "versioned",
            assignmentType: {},
          },
          assessmentVersion: {
            id: "assessment-v1",
            purpose: "formative",
            publicSchema: { fields: [] },
            rubric: { dimensions: [] },
            scoringPolicy: { component: "none" },
            checksumSha256: "assessment-hash",
            evaluatorConfig: {
              config: { providerMode: "none", tampered: true },
              answerKey: {},
              anchors: null,
              normalization: null,
              checksumSha256: "0".repeat(64),
            },
            datasetRelease: null,
          },
          evidence: [],
        })),
        update: submissionUpdate,
      },
    };

    await expect(
      handleGradeSubmission("submission-tampered-evaluator", {
        prisma: db as never,
        model,
      }),
    ).rejects.toMatchObject({
      code: "evaluator-checksum-mismatch",
    } satisfies Partial<AssessmentAnchorError>);
    expect(model).not.toHaveBeenCalled();
    expect(submissionUpdate).toHaveBeenCalledOnce();
  });
});
