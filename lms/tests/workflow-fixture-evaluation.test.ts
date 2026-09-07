import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assertAssessmentEvaluatorChecksum } from "../lib/assessments/assessment-anchors";
import {
  authoritativeWorkflowParts,
  buildWorkflowEvaluatorAnswerKey,
  completeWorkflowFixtureEvaluation,
  evaluateSession5WorkflowFixtures,
  parseWorkflowFixtureEvaluation,
  SESSION_5_WORKFLOW_PACKS,
  workflowEvaluationForExactResult,
  WorkflowFixtureEvaluationError,
  type Session5WorkflowPackId,
  type WorkflowEvaluationBinding,
} from "../lib/assessments/workflow-fixture-evaluation";
import { S5_WORKFLOW_ANCHORS } from "../scripts/course-data/sessions3-5-anchor-packs";
import { handleGradeSubmission } from "../worker/jobs/grade-submission";

const bundle = JSON.parse(
  readFileSync(
    new URL("../course/session-05/fixtures/evaluator-bundle.v1.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

const answerKey = buildWorkflowEvaluatorAnswerKey({
  bundle,
  s3Key: "course/releases/session-05/evaluator-v1/bundle.json",
});

const gtmLog = readFileSync(
  new URL("../course/session-05/samples/redacted-run-log.jsonl", import.meta.url),
);

const binding: WorkflowEvaluationBinding = {
  submissionId: "sub_s5_exact",
  assessmentVersionId: "assess_s5_workflow_v1",
  ownerKind: "individual",
  ownerId: "user_s5_exact",
  version: 1,
  attempt: 1,
  contentHash: "c".repeat(64),
  assessmentSha256: "a".repeat(64),
  evaluatorSha256: "e".repeat(64),
  runLogEvidenceId: "evidence_run_log_exact",
  runLogS3VersionId: "s3-version-run-log-exact",
  runLogSha256: createHash("sha256").update(gtmLog).digest("hex"),
  runLogByteCount: gtmLog.byteLength,
};

function setPath(record: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> | unknown[] = record;
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      if (Array.isArray(current)) current[Number(part)] = value;
      else current[part] = value;
      return;
    }
    const nextPart = parts[index + 1]!;
    const next = /^\d+$/u.test(nextPart) ? [] : {};
    if (Array.isArray(current)) {
      const position = Number(part);
      current[position] ??= next;
      current = current[position] as Record<string, unknown> | unknown[];
    } else {
      current[part] ??= next;
      current = current[part] as Record<string, unknown> | unknown[];
    }
  }
}

function generatedPassingLog(packId: Session5WorkflowPackId): Uint8Array {
  const packs = (answerKey.bundle as { packs: Array<Record<string, unknown>> }).packs;
  const pack = packs.find((candidate) => candidate.packId === packId)!;
  const cases = pack.cases as Array<{
    fixtureId: string;
    checks: Array<{ path: string; operator: string; expected?: unknown }>;
  }>;
  const records = cases.map((fixture) => {
    const record: Record<string, unknown> = {
      suite_id: pack.suiteId,
      fixture_id: fixture.fixtureId,
    };
    for (const check of fixture.checks) {
      const value =
        check.operator === "present"
          ? "present"
          : check.operator === "contains"
            ? [check.expected]
            : check.expected;
      setPath(record, check.path, value);
    }
    return record;
  });
  return new TextEncoder().encode(records.map((record) => JSON.stringify(record)).join("\n"));
}

describe("Session 5 deterministic workflow fixture evaluation", () => {
  it("passes the authored GTM sample and persists only checksum-bound comparison receipts", () => {
    const evaluation = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding,
    });

    expect(evaluation.passedCaseCount).toBe(5);
    expect(evaluation.artifactFunctionality0to10).toBe(10);
    expect(evaluation.execution0to20).toBe(20);
    expect(evaluation.cases.map((fixture) => fixture.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    expect(JSON.stringify(evaluation)).not.toContain("growth_queue");
    expect(parseWorkflowFixtureEvaluation(evaluation)).toEqual(evaluation);
  });

  it.each(["S5-WP-GTM-01", "S5-WP-OPS-02", "S5-WP-REV-03"] as const)(
    "evaluates exactly five authored cases for %s",
    (packId) => {
      const runLogBytes = generatedPassingLog(packId);
      const evaluation = evaluateSession5WorkflowFixtures({
        packId,
        runLogBytes,
        answerKey,
        binding: {
          ...binding,
          runLogSha256: createHash("sha256").update(runLogBytes).digest("hex"),
          runLogByteCount: runLogBytes.byteLength,
        },
      });
      expect(evaluation.passedCaseCount).toBe(5);
      expect(evaluation.bindings.packId).toBe(packId);
      expect(evaluation.totalCaseCount).toBe(5);
    },
  );

  it("rejects a typo instead of silently choosing a default pack", () => {
    expect(() =>
      evaluateSession5WorkflowFixtures({
        packId: "S5-WP-GTM-1",
        runLogBytes: gtmLog,
        answerKey,
        binding,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "workflow-pack-invalid",
        disposition: "repair",
      }) as WorkflowFixtureEvaluationError,
    );
  });

  it("rejects a log from the wrong pack before comparison", () => {
    expect(() =>
      evaluateSession5WorkflowFixtures({
        packId: "S5-WP-OPS-02",
        runLogBytes: gtmLog,
        answerKey,
        binding,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "fixture-suite-mismatch",
        disposition: "repair",
      }) as WorkflowFixtureEvaluationError,
    );
  });

  it("rejects a stale evaluator-bundle hash as a retryable release fault", () => {
    const stale = structuredClone(answerKey);
    stale.bundleObject.sha256 = "f".repeat(64);
    expect(() =>
      evaluateSession5WorkflowFixtures({
        packId: "S5-WP-GTM-01",
        runLogBytes: gtmLog,
        answerKey: stale,
        binding,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "fixture-bundle-hash-stale",
        disposition: "retry",
      }) as WorkflowFixtureEvaluationError,
    );
  });

  it("rejects run-log bytes that do not match the committed evidence receipt", () => {
    const altered = new Uint8Array(gtmLog);
    altered[altered.byteLength - 1] = altered[altered.byteLength - 1] === 10 ? 32 : 10;
    expect(() =>
      evaluateSession5WorkflowFixtures({
        packId: "S5-WP-GTM-01",
        runLogBytes: altered,
        answerKey,
        binding,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "fixture-log-receipt-mismatch",
        disposition: "retry",
      }) as WorkflowFixtureEvaluationError,
    );
  });

  it("keeps five-case execution authoritative when model rubric evidence disagrees", () => {
    const records = gtmLog
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    records[0]!.reason = "model_claims_this_is_fine";
    const runLogBytes = new TextEncoder().encode(
      records.map((record) => JSON.stringify(record)).join("\n"),
    );
    const evaluation = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes,
      answerKey,
      binding: {
        ...binding,
        runLogSha256: createHash("sha256").update(runLogBytes).digest("hex"),
        runLogByteCount: runLogBytes.byteLength,
      },
    });

    const completed = completeWorkflowFixtureEvaluation({
      evaluation,
      rubricScores: {
          functionality: { score: 10 },
          relevance: { score: 7 },
          "verification-evidence": { score: 10 },
      },
      citations: [
        { dimension: "relevance", evidenceIds: ["usefulness"] },
        { dimension: "verification-evidence", evidenceIds: ["verificationNote"] },
      ],
      confidence: 0.88,
      flags: [],
    });
    const own = completeWorkflowFixtureEvaluation({
      evaluation,
      rubricScores: {
        relevance: { score: 4 },
        "verification-evidence": { score: 8 },
      },
      citations: [
        { dimension: "relevance", evidenceIds: ["usefulness"] },
        { dimension: "verification-evidence", evidenceIds: ["ownershipEvidence"] },
      ],
      confidence: 0.8,
      flags: [],
    });
    const result = authoritativeWorkflowParts({
      selected: { evaluation: completed },
      own: { evaluation: own },
    });

    expect(evaluation.passedCaseCount).toBe(4);
    expect(result).toEqual({ usefulness0to30: 21, execution0to20: 16, ownership0to10: 8 });
    expect(completed.componentScores).toEqual({
      usefulness0to30: 21,
      execution0to20: 16,
      ownership0to10: 10,
    });
    expect(parseWorkflowFixtureEvaluation(completed)).toEqual(completed);
    expect(completed.flags).toContain("fixture-failure");
  });

  it("refuses to complete a receipt without cited usefulness and ownership evidence", () => {
    const evaluation = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding,
    });

    expect(() =>
      completeWorkflowFixtureEvaluation({
        evaluation,
        rubricScores: {
          relevance: { score: 8 },
          "verification-evidence": { score: 7 },
        },
        citations: [{ dimension: "relevance", evidenceIds: ["usefulness"] }],
        confidence: 0.9,
        flags: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "workflow-provider-result-invalid",
        disposition: "retry",
      }) as WorkflowFixtureEvaluationError,
    );
  });

  it("produces the same immutable receipt on idempotent retry and a new identity for another attempt", () => {
    const first = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding,
    });
    const retry = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding: { ...binding },
    });
    const repairAttempt = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding: { ...binding, attempt: 2 },
    });

    expect(retry).toEqual(first);
    expect(retry.receiptSha256).toBe(first.receiptSha256);
    expect(repairAttempt.evaluationId).not.toBe(first.evaluationId);
  });

  it("is independently queryable only for the exact selected submission version and attempt", () => {
    const evaluation = evaluateSession5WorkflowFixtures({
      packId: "S5-WP-GTM-01",
      runLogBytes: gtmLog,
      answerKey,
      binding,
    });
    const exact = {
      submissionId: binding.submissionId,
      assessmentVersionId: binding.assessmentVersionId,
      ownerKind: binding.ownerKind,
      ownerId: binding.ownerId,
      version: binding.version,
      attempt: binding.attempt,
      assessmentHash: binding.assessmentSha256,
      evaluatorHash: binding.evaluatorSha256,
      structuredFeedback: { workflowEvaluation: evaluation },
      submission: {
        id: binding.submissionId,
        assessmentVersionId: binding.assessmentVersionId,
        ownerKind: binding.ownerKind,
        ownerId: binding.ownerId,
        version: binding.version,
        attempt: binding.attempt,
        contentHash: binding.contentHash,
      },
    };

    expect(workflowEvaluationForExactResult(exact)).toEqual(evaluation);
    expect(
      workflowEvaluationForExactResult({
        ...exact,
        submission: { ...exact.submission, version: 2 },
      }),
    ).toBeNull();
  });
});

const workflowRubric = {
  dimensions: [
    { key: "functionality", label: "Functionality", max: 10 },
    { key: "craft", label: "Craft", max: 10 },
    { key: "relevance", label: "Relevance", max: 10 },
    { key: "verification-evidence", label: "Verification evidence", max: 10 },
  ],
};

const workflowEvaluatorConfig = {
  mode: "composite-workflow-v1",
  providerMode: "auto",
  approvedProcessor: "anthropic",
  approvedFlags: [
    "low-confidence",
    "prompt-injection",
    "unreadable-artifact",
    "unsafe-external-action",
    "sensitive-data",
    "fixture-failure",
  ],
  citationsPerDimension: 1,
  judgmentFieldIds: ["usefulness", "verificationNote", "ownershipEvidence"],
  fixtureEvaluation: {
    contractVersion: "s5-workflow-evaluation-v1",
    packField: "workflowPack",
    runLogRole: "runLogFile",
    categories: ["normal", "duplicate", "malformed", "timeout", "approval"],
    deterministicDimension: "functionality",
  },
  workflowAuthority: {
    usefulnessMax: 30,
    executionMax: 20,
    ownershipMax: 10,
    usefulnessRubricKeys: ["relevance"],
    ownershipRubricKey: "verification-evidence",
  },
};

const workflowPublicSchema = {
  fields: [
    {
      key: "workflowPack",
      label: "Workflow pack",
      kind: "singleChoice",
      required: true,
      options: SESSION_5_WORKFLOW_PACKS,
    },
    { key: "usefulness", label: "Usefulness", kind: "writeup", required: true },
    {
      key: "verificationNote",
      label: "Verification note",
      kind: "writeup",
      required: true,
    },
    {
      key: "ownershipEvidence",
      label: "Ownership evidence",
      kind: "writeup",
      required: true,
    },
    {
      key: "runLogFile",
      label: "Run log",
      kind: "file",
      required: true,
      fileRole: "runLogFile",
      acceptedMimeTypes: ["application/x-ndjson"],
      maxBytes: 2_000_000,
    },
  ],
};

type WorkerHarnessOptions = {
  runLogBytes?: Uint8Array;
  includeRunLog?: boolean;
  evaluatorAnswerKey?: unknown;
};

function workerHarness(options: WorkerHarnessOptions = {}) {
  const runLogBytes = options.runLogBytes ?? generatedPassingLog("S5-WP-GTM-01");
  const includeRunLog = options.includeRunLog ?? true;
  const evaluatorAnswerKey = options.evaluatorAnswerKey ?? answerKey;
  const receipt = {
    id: "evidence-s5-run-log",
    fieldKey: "runLogFile",
    fileRole: "runLogFile",
    s3Key: "submissions/student/submission-s5/evidence-s5-run-log",
    s3VersionId: "version-s5-run-log-1",
    sha256: createHash("sha256").update(runLogBytes).digest("hex"),
    byteCount: runLogBytes.byteLength,
    inspectedMimeType: "application/x-ndjson",
    scanState: "clean",
  };
  const evaluatorJson = {
    config: workflowEvaluatorConfig,
    answerKey: evaluatorAnswerKey,
    anchors: S5_WORKFLOW_ANCHORS,
    normalization: { dimensionMin: 0, dimensionMax: 10, totalMax: 40 },
  };
  const evaluatorSha256 = assertAssessmentEvaluatorChecksum({
    ...evaluatorJson,
    expectedSha256: null,
  });
  const fields: Record<string, unknown> = {
    workflowPack: "S5-WP-GTM-01",
    usefulness:
      "A sales owner handles this twice daily; the bounded draft queue removes one manual routing pass.",
    verificationNote:
      "Expected and actual states are mapped by fixture; the timeout path remains a controlled mock.",
    ownershipEvidence:
      "I chose the idempotency key and approval boundary, then repaired the duplicate control.",
    ...(includeRunLog ? { runLogFile: receipt.id } : {}),
  };
  const submission = {
    id: "submission-s5-worker",
    assignmentId: "asg_s5_workflow",
    userId: "student-s5",
    status: "submitted",
    version: 1,
    attempt: 1,
    ownerKind: "individual",
    ownerId: "student-s5",
    contentHash: "c".repeat(64),
    fields,
    assessmentVersionId: "assess_s5_workflow_v1",
    assignment: {
      title: "Revenue-supporting Make workflow",
      contractMode: "versioned",
      assignmentType: {},
    },
    assessmentVersion: {
      id: "assess_s5_workflow_v1",
      purpose: "graded",
      publicSchema: workflowPublicSchema,
      rubric: workflowRubric,
      scoringPolicy: {
        component: "workflow",
        approvedAiProcessors: ["anthropic"],
        dimensions: {
          usefulness: ["relevance"],
          execution: "functionality",
          ownership: "verification-evidence",
        },
      },
      checksumSha256: "a".repeat(64),
      evaluatorConfig: { ...evaluatorJson, checksumSha256: evaluatorSha256 },
      datasetRelease: null,
    },
    evidence: includeRunLog ? [receipt] : [],
  };
  const assessmentWrites: Array<Record<string, unknown>> = [];
  const grades: Array<Record<string, unknown>> = [];
  const holds: Array<Record<string, unknown>> = [];
  const model = vi.fn(async () => ({
    data: {
      rubricScores: {
        functionality: {
          score: 10,
          rationale: "The model claims all cases pass.",
          anchorBand: "strong",
        },
        craft: {
          score: 6,
          rationale: "The module contract is readable.",
          anchorBand: "proficient",
        },
        relevance: {
          score: 7,
          rationale: "The owner, frequency, and bounded result are connected.",
          anchorBand: "proficient",
        },
        "verification-evidence": {
          score: 9,
          rationale: "The traces and repair note are explicit.",
          anchorBand: "strong",
        },
      },
      total: 400,
      feedbackMd: "Repair any locally failed fixture before finalisation.",
      confidence: 0.9,
      flags: [],
      citations: [
        { dimension: "craft", evidenceIds: ["verificationNote"] },
        { dimension: "relevance", evidenceIds: ["usefulness"] },
        { dimension: "verification-evidence", evidenceIds: ["ownershipEvidence"] },
      ],
    },
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "test-model",
    raw: "private raw response",
    retries: 0,
  }));
  const db: Record<string, unknown> = {
    submission: {
      findUnique: vi.fn(async () => submission),
      update: vi.fn(async () => ({})),
    },
    assessmentResult: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "result-s5-worker",
        evaluationKey: data.evaluationKey,
        status: "claimed",
        claimToken: data.claimToken,
        claimedAt: data.claimedAt,
      })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        assessmentWrites.push(data);
        return { count: 1 };
      }),
    },
    submissionEvidence: { updateMany: vi.fn(async () => ({ count: 1 })) },
    configKV: { findUnique: vi.fn(async () => null) },
    grade: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        grades.push(data);
        return { id: "grade-s5-worker" };
      }),
    },
    gradeHold: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        holds.push(data);
        return {};
      }),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        holds.push(...data);
        return { count: data.length };
      }),
    },
    costLog: { create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async () => ({})) },
  };
  db.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db));
  return {
    assessmentWrites,
    db,
    evaluatorSha256,
    grades,
    holds,
    model,
    receipt,
    runLogBytes,
    submission,
  };
}

describe("Session 5 workflow worker integration", () => {
  it.each([
    {
      name: "missing",
      harness: () => workerHarness({ includeRunLog: false }),
      errorCode: "unsafe-evidence",
    },
    {
      name: "unsafe",
      harness: () =>
        workerHarness({
          runLogBytes: new TextEncoder().encode(
            JSON.stringify({ token: `sk-proj-${"A".repeat(24)}` }),
          ),
        }),
      errorCode: "unsafe-evidence",
    },
  ])("turns a $name run log into repair without provider work", async ({ harness, errorCode }) => {
    const state = harness();
    await handleGradeSubmission("submission-s5-worker", {
      prisma: state.db as never,
      model: state.model as never,
      readEvidence: vi.fn(async () => state.runLogBytes),
      claimToken: () => "claim-s5-repair",
      now: () => new Date("2026-07-30T10:00:00.000Z"),
    });

    expect(state.model).not.toHaveBeenCalled();
    expect(state.assessmentWrites).toContainEqual(
      expect.objectContaining({ status: "repair_required", errorCode }),
    );
    expect(state.holds).toContainEqual(expect.objectContaining({ kind: "repair" }));
  });

  it("fails a stale evaluator-bundle hash as retryable release state without provider work", async () => {
    const staleAnswerKey = structuredClone(answerKey);
    staleAnswerKey.bundleObject.sha256 = "f".repeat(64);
    const state = workerHarness({ evaluatorAnswerKey: staleAnswerKey });

    await expect(
      handleGradeSubmission("submission-s5-worker", {
        prisma: state.db as never,
        model: state.model as never,
        readEvidence: vi.fn(async () => state.runLogBytes),
      }),
    ).rejects.toMatchObject({
      code: "fixture-bundle-hash-stale",
      disposition: "retry",
    } satisfies Partial<WorkflowFixtureEvaluationError>);
    expect(state.model).not.toHaveBeenCalled();
    expect(state.assessmentWrites).toEqual([]);
  });

  it("persists deterministic and provisional receipts and ignores a model functionality override", async () => {
    const records = new TextDecoder()
      .decode(generatedPassingLog("S5-WP-GTM-01"))
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    records[0]!.reason = "model_claims_this_is_fine";
    const runLogBytes = new TextEncoder().encode(
      records.map((record) => JSON.stringify(record)).join("\n"),
    );
    const state = workerHarness({ runLogBytes });

    await handleGradeSubmission("submission-s5-worker", {
      prisma: state.db as never,
      model: state.model as never,
      readEvidence: vi.fn(async () => runLogBytes),
      claimToken: () => "claim-s5-success",
      now: () => new Date("2026-07-30T10:00:00.000Z"),
    });

    const deterministicWrite = state.assessmentWrites.find(
      (write) => write.status === "deterministic_complete",
    );
    const completedWrite = state.assessmentWrites.find(
      (write) => write.status === "completed",
    );
    const deterministicResult = deterministicWrite?.deterministicResult as
      | Record<string, unknown>
      | undefined;
    const structuredFeedback = completedWrite?.structuredFeedback as
      | Record<string, unknown>
      | undefined;
    const deterministicReceipt = parseWorkflowFixtureEvaluation(
      deterministicResult?.workflowEvaluation,
    );
    const completedReceipt = parseWorkflowFixtureEvaluation(
      structuredFeedback?.workflowEvaluation,
    );

    expect(deterministicReceipt).toMatchObject({
      stage: "deterministic",
      passedCaseCount: 4,
      artifactFunctionality0to10: 8,
      execution0to20: 16,
    });
    expect(completedReceipt).toMatchObject({
      stage: "provisional",
      componentScores: {
        usefulness0to30: 21,
        execution0to20: 16,
        ownership0to10: 9,
      },
      flags: ["fixture-failure"],
    });
    expect(state.grades[0]).toMatchObject({
      total: 30,
      rubricScores: {
        functionality: expect.objectContaining({ score: 8 }),
      },
      flags: ["fixture-failure"],
    });
    const providerResult = completedWrite?.providerResult as Record<string, unknown>;
    const promptLog = state.grades[0]?.promptLog as Record<string, unknown>;
    expect(providerResult).not.toHaveProperty("raw");
    expect(providerResult).not.toHaveProperty("auditContext");
    expect(promptLog).toEqual({
      hashes: {
        assessment: state.submission.assessmentVersion.checksumSha256,
        dataset: null,
        evaluator: state.evaluatorSha256,
      },
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
      citations: [
        { dimension: "craft", evidenceIds: ["verificationNote"] },
        { dimension: "relevance", evidenceIds: ["usefulness"] },
        { dimension: "verification-evidence", evidenceIds: ["ownershipEvidence"] },
      ],
    });
    expect(JSON.stringify({ providerResult, promptLog })).not.toContain(
      "private raw response",
    );
    expect(structuredFeedback?.conflicts).toContain("functionality");
    expect(state.holds).toContainEqual(
      expect.objectContaining({ code: "fixture-failure", kind: "flag" }),
    );

    const exactEvaluation = workflowEvaluationForExactResult({
      submissionId: state.submission.id,
      assessmentVersionId: state.submission.assessmentVersionId,
      ownerKind: state.submission.ownerKind as "individual",
      ownerId: state.submission.ownerId,
      version: state.submission.version,
      attempt: state.submission.attempt,
      assessmentHash: state.submission.assessmentVersion.checksumSha256,
      evaluatorHash: state.evaluatorSha256,
      structuredFeedback,
      submission: {
        id: state.submission.id,
        assessmentVersionId: state.submission.assessmentVersionId,
        ownerKind: state.submission.ownerKind as "individual",
        ownerId: state.submission.ownerId,
        version: state.submission.version,
        attempt: state.submission.attempt,
        contentHash: state.submission.contentHash,
      },
    });
    expect(exactEvaluation).toEqual(completedReceipt);
    expect(
      authoritativeWorkflowParts({
        selected: exactEvaluation ? { evaluation: exactEvaluation } : null,
        own: exactEvaluation ? { evaluation: exactEvaluation } : null,
      }),
    ).toEqual({ usefulness0to30: 21, execution0to20: 16, ownership0to10: 9 });
  });
});
