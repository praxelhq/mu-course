import { describe, expect, it, vi } from "vitest";
import {
  runAssessmentEvaluation,
  type AssessmentEvaluationPersistence,
  type AssessmentProviderResponse,
} from "../lib/assessments/run-evaluation";
import { assertAnchoredProviderScores } from "../lib/assessments/assessment-anchors";
import {
  S3_DATA_ANCHORS,
  S5_WORKFLOW_ANCHORS,
} from "../scripts/course-data/sessions3-5-anchor-packs";

const rubric = [
  { key: "functionality", label: "Functionality", max: 10 },
  { key: "craft", label: "Craft", max: 10 },
  { key: "relevance", label: "Relevance", max: 10 },
  { key: "verification-evidence", label: "Verification evidence", max: 10 },
];

function persistence(): AssessmentEvaluationPersistence {
  return {
    claim: vi.fn(async () => ({ kind: "claimed" as const, claimToken: "claim-anchor" })),
    persistDeterministic: vi.fn(async () => undefined),
    requireRepair: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

function provider(overrides: Partial<AssessmentProviderResponse> = {}): AssessmentProviderResponse {
  return {
    rubricScores: {
      craft: { score: 7, rationale: "The method is partly reproducible.", anchorBand: "proficient" },
      relevance: { score: 7, rationale: "The claim is bounded.", anchorBand: "proficient" },
      "verification-evidence": { score: 6, rationale: "Two methods are shown.", anchorBand: "proficient" },
    },
    feedbackMd: "Repair the highest-impact evidence gap.",
    confidence: 0.8,
    flags: [],
    citations: [
      { dimension: "craft", evidenceIds: ["rationale"] },
      { dimension: "relevance", evidenceIds: ["rationale"] },
      { dimension: "verification-evidence", evidenceIds: ["rationale"] },
    ],
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "calibration-model",
    raw: "{}",
    ...overrides,
  };
}

function input() {
  return {
    evaluationKey: "assessment:anchor-calibration:v1:a1",
    submissionId: "anchor-calibration",
    assessmentTitle: "S3 verified data memo",
    purpose: "graded" as const,
    fields: { objective: 1, rationale: "A bounded response with inspectable working." },
    answerSpecs: { objective: { kind: "number" as const, mode: "exact" as const, expected: 1 } },
    judgmentFieldIds: ["rationale"],
    trustedAggregateSummaries: [],
    rubric,
    anchors: S3_DATA_ANCHORS,
    approvedFlags: [
      "working_not_reproducible",
      "population_overclaim",
      "causality_overclaim",
      "same_method_twice",
    ],
    hashes: { assessment: "assessment-v1", dataset: "dataset-v1", evaluator: "evaluator-v1" },
  };
}

describe("authored-anchor calibration regressions", () => {
  it("fails the evaluation when a provider returns a score above a triggered authored cap", async () => {
    const store = persistence();
    await expect(
      runAssessmentEvaluation(input(), {
        persistence: store,
        callProvider: vi.fn(async () =>
          provider({ flags: ["working_not_reproducible"] }),
        ),
      }),
    ).rejects.toMatchObject({ code: "anchor-policy-violation" });
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "anchor-policy-violation" }),
    );
  });

  it("fails the evaluation when a provider labels a numeric score with the wrong authored band", async () => {
    const store = persistence();
    const response = provider();
    response.rubricScores.craft.anchorBand = "strong";
    await expect(
      runAssessmentEvaluation(input(), {
        persistence: store,
        callProvider: vi.fn(async () => response),
      }),
    ).rejects.toMatchObject({ code: "anchor-policy-violation" });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("places exact authored criteria in provider context without deterministic answers", async () => {
    const store = persistence();
    await runAssessmentEvaluation(input(), {
      persistence: store,
      callProvider: vi.fn(async (request) => {
        expect(request.system).toContain("working-not-reproducible-cap");
        expect(request.system).toContain("A prose-only or uninspectable method");
        expect(request.system).toContain(`sha256:${S3_DATA_ANCHORS.contentSha256}`);
        expect(request.system).toContain("rubricScores.craft");
        expect(request.system).toContain("anchorBand");
        expect(request.system).toContain("Return only one JSON object");
        expect(request.system).not.toContain('"expected":1');
        expect(request.user).not.toContain("objective: 1");
        return provider();
      }),
    });
    expect(store.complete).toHaveBeenCalledOnce();
  });

  it("keeps four-of-five Session 5 fixture authority at eight despite the diagnostic fixture flag", () => {
    expect(() =>
      assertAnchoredProviderScores({
        anchors: S5_WORKFLOW_ANCHORS,
        rubricScores: {
          functionality: {
            score: 8,
            rationale: "Four of five checksum-bound fixture cases passed.",
            anchorBand: "proficient",
          },
        },
        flags: ["fixture-failure"],
        requiredDimensionKeys: ["functionality"],
      }),
    ).not.toThrow();
  });
});
