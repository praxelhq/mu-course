import { describe, expect, it, vi } from "vitest";
import {
  AssessmentEvaluationError,
  runAssessmentEvaluation,
  type AssessmentEvaluationPersistence,
  type AssessmentProviderCall,
} from "../lib/assessments/run-evaluation";
import { createAssessmentAnchorPack } from "../lib/assessments/assessment-anchors";

const rubric = [
  { key: "functionality", label: "Functionality", max: 10 },
  { key: "craft", label: "Craft", max: 10 },
  { key: "relevance", label: "Relevance", max: 10 },
  { key: "verification-evidence", label: "Verification evidence", max: 10 },
];

function anchorsFor(dimensions: Array<{ key: string; max: number }>) {
  return createAssessmentAnchorPack({
    safeForProcessor: true,
    dimensions: dimensions.map((dimension) => ({
      key: dimension.key,
      bands: [
        { key: "emerging", min: 0, max: 2, criteria: ["Evidence is missing or unsupported."] },
        { key: "developing", min: 3, max: 5, criteria: ["Evidence is partial."] },
        {
          key: "proficient",
          min: 6,
          max: 8,
          criteria: ["Evidence is bounded, reproducible, and independently verified."],
        },
        {
          key: "strong",
          min: 9,
          max: dimension.max,
          criteria: ["Evidence satisfies the complete authored evaluation contract."],
        },
      ],
      caps: [{
        key: "unsupported-cap",
        max: 5,
        whenFlags: ["unsupported-claim"],
        rationale:
          "Unsupported claims cannot exceed the developing authored evaluation band.",
      }],
      safeExamples: [{
        key: `${dimension.key}-abstract`,
        bandKey: "proficient",
        source: "authored-abstract",
        summary: "A bounded authored example cites reproducible evidence and a limitation.",
      }],
    })),
  });
}

function persistence(
  overrides: Partial<AssessmentEvaluationPersistence> = {},
): AssessmentEvaluationPersistence {
  return {
    claim: vi.fn(async () => ({ kind: "claimed" as const, claimToken: "claim-1" })),
    persistDeterministic: vi.fn(async () => undefined),
    requireRepair: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    ...overrides,
  };
}

function providerResponse() {
  return {
    rubricScores: {
      functionality: { score: 9, rationale: "Model attempted an override.", anchorBand: "strong" },
      craft: { score: 7, rationale: "The work is reproducible.", anchorBand: "proficient" },
      relevance: { score: 6, rationale: "The recommendation is bounded.", anchorBand: "proficient" },
      "verification-evidence": { score: 5, rationale: "One check is shown.", anchorBand: "developing" },
    },
    feedbackMd: "Ground the conclusion in one more independent check.",
    confidence: 0.84,
    flags: [] as string[],
    citations: [
      { dimension: "craft", evidenceIds: ["S3-DATA-07"] },
      { dimension: "relevance", evidenceIds: ["summary-shape"] },
      { dimension: "verification-evidence", evidenceIds: ["S3-DATA-07"] },
    ],
    total: 40,
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "approved-test-model",
    raw: "private provider response kept server-side",
  };
}

describe("version-bound assessment evaluation", () => {
  it("persists deterministic results before provider work and ignores a model objective override", async () => {
    const events: string[] = [];
    const store = persistence({
      persistDeterministic: vi.fn(async () => {
        events.push("deterministic");
      }),
      complete: vi.fn(async () => {
        events.push("complete");
      }),
    });
    const callProvider: AssessmentProviderCall = vi.fn(async (request) => {
      events.push("provider");
      expect(JSON.stringify(request)).not.toContain("641");
      expect(JSON.stringify(request)).not.toContain('"expected"');
      expect(JSON.stringify(request)).not.toContain("never-send-this");
      return providerResponse();
    });

    const result = await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:sub-1:v1:a1",
        submissionId: "sub-1",
        assessmentTitle: "S3 verified data memo",
        purpose: "graded",
        fields: {
          "S3-DATA-01": 641,
          "S3-DATA-07": "The distribution is skewed; compare the median and maximum.",
          hiddenAnswerKey: "never-send-this",
        },
        answerSpecs: {
          "S3-DATA-01": { kind: "number", mode: "exact", expected: 641, integer: true },
        },
        judgmentFieldIds: ["S3-DATA-07"],
        trustedAggregateSummaries: [
          { id: "summary-shape", text: "The distribution is strongly right-skewed." },
        ],
        rubric,
        anchors: anchorsFor(rubric),
        hashes: { assessment: "assessment-v1", dataset: "dataset-v1", evaluator: "key-v1" },
      },
      { persistence: store, callProvider },
    );

    expect(events).toEqual(["deterministic", "provider", "complete"]);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.objective.items["S3-DATA-01"].status).toBe("correct");
    expect(result.grade?.rubricScores.functionality.score).toBe(10);
    expect(result.grade?.rubricScores.functionality.rationale).toMatch(/1 of 1/i);
    expect(result.grade?.total).toBe(28);
    expect(result.grade?.conflicts).toEqual(["functionality"]);
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "graded",
        grade: expect.objectContaining({ total: 28 }),
      }),
    );
    const persistedProvider = vi.mocked(store.complete).mock.calls[0]?.[0].provider;
    expect(Object.keys(persistedProvider ?? {}).sort()).toEqual([
      "citations",
      "confidence",
      "feedbackMd",
      "flags",
      "model",
      "rubricScores",
      "usage",
    ]);
    expect(JSON.stringify(persistedProvider)).not.toContain(
      "private provider response kept server-side",
    );
  });

  it("does not call a provider for objective-only work", async () => {
    const store = persistence();
    const callProvider = vi.fn<AssessmentProviderCall>();

    const result = await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:sub-objective:v1:a1",
        submissionId: "sub-objective",
        assessmentTitle: "Objective check",
        purpose: "graded",
        fields: { q1: "yes" },
        answerSpecs: { q1: { kind: "string", expected: "yes", caseInsensitive: true } },
        judgmentFieldIds: [],
        trustedAggregateSummaries: [],
        rubric: [{ key: "functionality", label: "Functionality", max: 10 }],
        hashes: { assessment: "a", dataset: null, evaluator: "e" },
      },
      { persistence: store, callProvider },
    );

    expect(result.kind).toBe("completed");
    expect(callProvider).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: null,
        grade: expect.objectContaining({ total: 10 }),
      }),
    );
  });

  it("persists formative feedback as an AssessmentResult without creating a weighted grade", async () => {
    const store = persistence();
    const response = providerResponse();
    response.rubricScores = {
      relevance: { score: 6, rationale: "The recommendation is bounded.", anchorBand: "proficient" },
    } as typeof response.rubricScores;
    response.citations = [{ dimension: "relevance", evidenceIds: ["rationale"] }];
    await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:flowchart:v1:a1",
        submissionId: "flowchart",
        assessmentTitle: "Workflow design feedback",
        purpose: "formative",
        fields: { rationale: "Retry twice, then send to a manual queue." },
        answerSpecs: {},
        judgmentFieldIds: ["rationale"],
        trustedAggregateSummaries: [],
        rubric: [{ key: "relevance", label: "Coverage", max: 10 }],
        anchors: anchorsFor([{ key: "relevance", max: 10 }]),
        hashes: { assessment: "a", dataset: null, evaluator: "e" },
      },
      { persistence: store, callProvider: vi.fn(async () => response) },
    );

    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "formative", grade: null }),
    );
  });

  it("retains deterministic state and fails the evaluation when citations are invalid", async () => {
    const store = persistence();
    const response = providerResponse();
    response.citations = [
      { dimension: "craft", evidenceIds: ["hidden-evaluator-row"] },
    ];

    await expect(
      runAssessmentEvaluation(
        {
          evaluationKey: "assessment:bad-citation:v1:a1",
          submissionId: "bad-citation",
          assessmentTitle: "S3 verified data memo",
          purpose: "graded",
          fields: { rationale: "A bounded claim." },
          answerSpecs: { q1: { kind: "number", mode: "exact", expected: 1 } },
          judgmentFieldIds: ["rationale"],
          trustedAggregateSummaries: [],
          rubric,
          anchors: anchorsFor(rubric),
          hashes: { assessment: "a", dataset: "d", evaluator: "e" },
        },
        { persistence: store, callProvider: vi.fn(async () => response) },
      ),
    ).rejects.toMatchObject({ code: "invalid-citations" } satisfies Partial<AssessmentEvaluationError>);

    expect(store.persistDeterministic).toHaveBeenCalledOnce();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invalid-citations" }),
    );
  });

  it("provider-fails before persistence when the model invents an unapproved hold flag", async () => {
    const store = persistence();
    const response = providerResponse();
    response.flags = ["invented-policy-flag"];
    response.citations = [
      { dimension: "craft", evidenceIds: ["rationale"] },
      { dimension: "relevance", evidenceIds: ["rationale"] },
      { dimension: "verification-evidence", evidenceIds: ["rationale"] },
    ];
    await expect(
      runAssessmentEvaluation(
        {
          evaluationKey: "assessment:bad-flag:v1:a1",
          submissionId: "bad-flag",
          assessmentTitle: "S3 verified data memo",
          purpose: "graded",
          fields: { rationale: "A bounded claim." },
          answerSpecs: { q1: { kind: "number", mode: "exact", expected: 1 } },
          judgmentFieldIds: ["rationale"],
          trustedAggregateSummaries: [],
          rubric,
          approvedFlags: ["insufficient-evidence"],
          anchors: anchorsFor(rubric),
          hashes: { assessment: "a", dataset: "d", evaluator: "e" },
        },
        { persistence: store, callProvider: vi.fn(async () => response) },
      ),
    ).rejects.toMatchObject({ code: "invalid-flags" });
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invalid-flags" }),
    );
  });

  it.each([
    {
      channel: "feedback",
      leak: (response: ReturnType<typeof providerResponse>) => {
        response.feedbackMd =
          "A bounded authored example cites reproducible evidence and a limitation.";
      },
    },
    {
      channel: "near-verbatim rubric rationale",
      leak: (response: ReturnType<typeof providerResponse>) => {
        response.rubricScores.craft.rationale =
          "Unsupported claims cannot exceed the preliminary authored evaluation band.";
      },
    },
    {
      channel: "raw provider response",
      leak: (response: ReturnType<typeof providerResponse>) => {
        response.raw = JSON.stringify({
          hiddenContext: "is bounded, reproducible, and independently verified.",
        });
      },
    },
    {
      channel: "zero-width-obfuscated feedback",
      leak: (response: ReturnType<typeof providerResponse>) => {
        response.feedbackMd =
          "A bou\u200Bnded auth\u200Bored example cites reproducible evid\u200Bence and a limitation.";
      },
    },
  ])("fails closed before persistence when $channel overlaps evaluator anchors", async ({ leak }) => {
    const store = persistence();
    const response = providerResponse();
    response.citations = [
      { dimension: "craft", evidenceIds: ["rationale"] },
      { dimension: "relevance", evidenceIds: ["rationale"] },
      { dimension: "verification-evidence", evidenceIds: ["rationale"] },
    ];
    leak(response);

    await expect(
      runAssessmentEvaluation(
        {
          evaluationKey: "assessment:anchor-exfiltration:v1:a1",
          submissionId: "anchor-exfiltration",
          assessmentTitle: "S3 verified data memo",
          purpose: "graded",
          fields: { rationale: "A bounded student rationale." },
          answerSpecs: { q1: { kind: "number", mode: "exact", expected: 1 } },
          judgmentFieldIds: ["rationale"],
          trustedAggregateSummaries: [],
          rubric,
          anchors: anchorsFor(rubric),
          hashes: { assessment: "a", dataset: "d", evaluator: "e" },
        },
        { persistence: store, callProvider: vi.fn(async () => response) },
      ),
    ).rejects.toMatchObject({ code: "evaluator-anchor-overlap" });

    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "evaluator-anchor-overlap" }),
    );
  });

  it("returns without provider work when the evaluation key is already complete or claimed", async () => {
    const callProvider = vi.fn<AssessmentProviderCall>();
    const base = {
      evaluationKey: "assessment:duplicate:v1:a1",
      submissionId: "duplicate",
      assessmentTitle: "Duplicate",
      purpose: "graded" as const,
      fields: {},
      answerSpecs: {},
      judgmentFieldIds: [],
      trustedAggregateSummaries: [],
      rubric: [],
      hashes: { assessment: "a", dataset: null, evaluator: "e" },
    };

    const completed = await runAssessmentEvaluation(base, {
      persistence: persistence({ claim: vi.fn(async () => ({ kind: "completed" as const, resultId: "r1" })) }),
      callProvider,
    });
    const busy = await runAssessmentEvaluation(base, {
      persistence: persistence({ claim: vi.fn(async () => ({ kind: "busy" as const, resultId: "r1" })) }),
      callProvider,
    });

    expect(completed).toEqual({ kind: "already-completed", resultId: "r1" });
    expect(busy).toEqual({ kind: "already-claimed", resultId: "r1" });
    expect(callProvider).not.toHaveBeenCalled();
  });

  it("persists a redacted repair result and performs no provider call after unsafe local preflight", async () => {
    const store = persistence();
    const callProvider = vi.fn<AssessmentProviderCall>();
    const result = await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:unsafe:v1:a1",
        submissionId: "unsafe",
        assessmentTitle: "Workflow evidence",
        purpose: "graded",
        fields: { rationale: "Submitted" },
        answerSpecs: {},
        judgmentFieldIds: ["rationale"],
        trustedAggregateSummaries: [],
        rubric,
        hashes: { assessment: "a", dataset: null, evaluator: "e" },
        preflightFailure: {
          errorCode: "unsafe-evidence",
          feedback: "workflowPngFile: secret-token at offset 17. Remove or redact it.",
          quarantinedEvidenceIds: ["evidence-1"],
        },
      },
      { persistence: store, callProvider },
    );

    expect(result).toEqual({
      kind: "repair-required",
      objective: expect.objectContaining({ totalCount: 0 }),
    });
    expect(callProvider).not.toHaveBeenCalled();
    expect(store.requireRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "unsafe-evidence",
        quarantinedEvidenceIds: ["evidence-1"],
      }),
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("locally screens rendered judgment fields and withholds email and api-key values", async () => {
    const store = persistence();
    const callProvider = vi.fn<AssessmentProviderCall>();
    const email = "learner@private-campus.edu";
    const apiKey = `sk_live_${"J".repeat(24)}`;

    const result = await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:unsafe-judgment:v1:a1",
        submissionId: "unsafe-judgment",
        assessmentTitle: "Workflow rationale",
        purpose: "graded",
        fields: {
          rationale: [`Contact: ${email}`, `api_key=${apiKey}`],
        },
        answerSpecs: {},
        judgmentFieldIds: ["rationale"],
        trustedAggregateSummaries: [],
        rubric: [{ key: "craft", label: "Craft", max: 10 }],
        hashes: { assessment: "a", dataset: null, evaluator: "e" },
      },
      { persistence: store, callProvider },
    );

    expect(result.kind).toBe("repair-required");
    expect(callProvider).not.toHaveBeenCalled();
    expect(store.requireRepair).toHaveBeenCalledOnce();
    const repairCall = vi.mocked(store.requireRepair).mock.calls[0]?.[0];
    expect(repairCall).toMatchObject({
      errorCode: "unsafe-evidence",
      quarantinedEvidenceIds: [],
    });
    expect(JSON.stringify(repairCall)).not.toContain(email);
    expect(JSON.stringify(repairCall)).not.toContain(apiKey);
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("merges judgment findings into an existing evidence repair without losing quarantine IDs", async () => {
    const store = persistence();
    const callProvider = vi.fn<AssessmentProviderCall>();
    const apiKey = `sk_live_${"L".repeat(24)}`;

    await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:combined-repair:v1:a1",
        submissionId: "combined-repair",
        assessmentTitle: "Workflow rationale",
        purpose: "graded",
        fields: { rationale: `api_key=${apiKey}` },
        answerSpecs: {},
        judgmentFieldIds: ["rationale"],
        trustedAggregateSummaries: [],
        rubric: [{ key: "craft", label: "Craft", max: 10 }],
        hashes: { assessment: "a", dataset: null, evaluator: "e" },
        preflightFailure: {
          errorCode: "unsafe-evidence",
          feedback: "workflowPngFile: image-unreadable at offset 0.",
          quarantinedEvidenceIds: ["evidence-1", "evidence-1"],
        },
      },
      { persistence: store, callProvider },
    );

    expect(callProvider).not.toHaveBeenCalled();
    const repairCall = vi.mocked(store.requireRepair).mock.calls[0]?.[0];
    expect(repairCall).toMatchObject({
      errorCode: "unsafe-evidence",
      quarantinedEvidenceIds: ["evidence-1"],
    });
    expect(repairCall?.feedback).toContain("workflowPngFile: image-unreadable");
    expect(repairCall?.feedback).toContain("rationale: sensitive-key");
    expect(JSON.stringify(repairCall)).not.toContain(apiKey);
  });
});
