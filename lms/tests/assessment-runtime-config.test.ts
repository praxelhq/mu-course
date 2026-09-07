import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AssessmentRuntimeConfigError,
  assertApprovedAssessmentProcessor,
  parseAssessmentRuntimeConfig,
} from "../lib/assessments/runtime-config";
import { createAssessmentAnchorPack } from "../lib/assessments/assessment-anchors";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/grading/versioned-assessment.json", import.meta.url), "utf8"),
) as {
  rubric: unknown;
  evaluator: { config: unknown; answerKey: unknown };
};

function anchorsFor(dimensions: Array<{ key: string; max: number }>) {
  return createAssessmentAnchorPack({
    safeForProcessor: true,
    dimensions: dimensions.map((dimension) => ({
      key: dimension.key,
      bands: [
        { key: "emerging", min: 0, max: Math.max(0, dimension.max - 1), criteria: ["Evidence is incomplete."] },
        { key: "strong", min: dimension.max, max: dimension.max, criteria: ["Evidence satisfies the full contract."] },
      ],
      caps: [],
      safeExamples: [{
        key: `${dimension.key}-abstract`,
        bandKey: "strong",
        source: "authored-abstract",
        summary: "An abstract authored example satisfies the declared evidence contract.",
      }],
    })),
  });
}

describe("assessment evaluator runtime contract", () => {
  it("normalizes the private adapter without adding private values to processor summaries", () => {
    const config = parseAssessmentRuntimeConfig({
      rubric: fixture.rubric,
      evaluatorConfig: fixture.evaluator.config,
      answerKey: fixture.evaluator.answerKey,
      anchors: anchorsFor([
        { key: "functionality", max: 10 },
        { key: "craft", max: 10 },
      ]),
    });

    expect(config.answerSpecs.q1).toEqual({
      kind: "number",
      mode: "exact",
      expected: 42,
      integer: true,
    });
    expect(config.judgmentFieldIds).toEqual(["q2"]);
    expect(config.trustedAggregateSummaries).toEqual([
      {
        id: "shape-summary",
        text: "The supplied teaching distribution is right-skewed.",
      },
    ]);
    expect(config.providerMode).toBe("auto");
    expect(config.approvedProcessor).toBe("anthropic");
    expect(config.approvedFlags).toEqual(["insufficient-evidence", "possible-injection"]);
    expect(config.citationsPerDimension).toBe(2);
    expect(config.rubric.map((dimension) => dimension.key)).toEqual([
      "functionality",
      "craft",
    ]);
  });

  it("checks anchor leakage against the normalized answer specs, not retained adapter structure", () => {
    const rubric = {
      dimensions: [{ key: "craft", label: "Craft", max: 10 }],
    };
    const anchors = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [{
        key: "craft",
        bands: [
          { key: "emerging", min: 0, max: 9, criteria: ["The output contract is incomplete."] },
          { key: "strong", min: 10, max: 10, criteria: ["The output contract is explicit and reproducible."] },
        ],
        caps: [],
        safeExamples: [{
          key: "craft-output-abstract",
          bandKey: "strong",
          source: "authored-abstract",
          summary: "An abstract submission declares its output shape without revealing an answer.",
        }],
      }],
    });
    const answerKey = {
      specs: {
        q1: { kind: "number", mode: "exact", expected: 641, integer: true },
      },
      items: {
        q1: {
          private_key: {
            output: { record_count: 641 },
          },
        },
      },
    };

    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric,
        evaluatorConfig: {
          providerMode: "auto",
          approvedProcessor: "anthropic",
          judgmentFieldIds: ["rationale"],
        },
        answerKey,
        anchors,
      }),
    ).not.toThrow();

    const leakingAnchors = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [{
        ...anchors.content.dimensions[0]!,
        bands: [
          { key: "emerging", min: 0, max: 9, criteria: ["The evidence is incomplete."] },
          { key: "strong", min: 10, max: 10, criteria: ["The private expected answer is 641."] },
        ],
      }],
    });
    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric,
        evaluatorConfig: {
          providerMode: "auto",
          approvedProcessor: "anthropic",
          judgmentFieldIds: ["rationale"],
        },
        answerKey,
        anchors: leakingAnchors,
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-answer-key-leak" }));
  });

  it("supports explicit number, string, and set answer specs", () => {
    const config = parseAssessmentRuntimeConfig({
      rubric: { dimensions: [{ key: "functionality", label: "Functionality", max: 10 }] },
      evaluatorConfig: {},
      answerKey: {
        specs: {
          number: { kind: "number", mode: "tolerance", expected: 12.3, tolerance: 0.05 },
          text: { kind: "string", expected: "yes", alternatives: ["y"], caseInsensitive: true },
          choices: { kind: "set", expected: ["a", "b"], allowed: ["a", "b", "c"] },
        },
      },
    });
    expect(Object.keys(config.answerSpecs)).toEqual(["number", "text", "choices"]);
  });

  it("fails closed when judgment work requests a processor not approved by the bound release", () => {
    expect(() =>
      assertApprovedAssessmentProcessor({
        configuredProcessor: "anthropic",
        approvedProcessors: ["openai"],
        providerWorkRequired: true,
      }),
    ).toThrow(AssessmentRuntimeConfigError);
    expect(() =>
      assertApprovedAssessmentProcessor({
        configuredProcessor: null,
        approvedProcessors: [],
        providerWorkRequired: false,
      }),
    ).not.toThrow();
  });

  it("rejects an absent or non-normalized frozen evaluator processor reference", () => {
    for (const approvedProcessor of [
      undefined,
      "",
      "Anthropic",
      " anthropic ",
      "anthropic/provider",
    ]) {
      expect(() =>
        parseAssessmentRuntimeConfig({
          rubric: { dimensions: [{ key: "craft", label: "Craft", max: 10 }] },
          evaluatorConfig: {
            providerMode: "auto",
            judgmentFieldIds: ["rationale"],
            approvedProcessor,
          },
          answerKey: {},
          anchors: anchorsFor([{ key: "craft", max: 10 }]),
        }),
      ).toThrowError(expect.objectContaining({ code: "approved-processor-invalid" }));
    }
  });

  it("rejects malformed or duplicate frozen flag and citation policy", () => {
    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [{ key: "craft", label: "Craft", max: 10 }] },
        evaluatorConfig: { approvedFlags: ["review", "review"] },
        answerKey: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "approved-flags-invalid" }));
    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [{ key: "craft", label: "Craft", max: 10 }] },
        evaluatorConfig: { citationsPerDimension: 0 },
        answerKey: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "citation-policy-invalid" }));
  });

  it("fails closed when processor-bound judgment work has no checksum-covered anchor pack", () => {
    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [{ key: "craft", label: "Craft", max: 10 }] },
        evaluatorConfig: {
          providerMode: "auto",
          approvedProcessor: "anthropic",
          judgmentFieldIds: ["rationale"],
        },
        answerKey: {},
        anchors: null,
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-pack-invalid" }));
  });

  it("rejects an unused anchor pack on a local-only evaluator", () => {
    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [{ key: "craft", label: "Craft", max: 10 }] },
        evaluatorConfig: { providerMode: "none" },
        answerKey: {},
        anchors: anchorsFor([{ key: "craft", max: 10 }]),
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-policy-conflict" }));
  });

  it("supports an explicit local-only milestone and rejects conflicting provider config", () => {
    const localOnly = parseAssessmentRuntimeConfig({
      rubric: { dimensions: [] },
      evaluatorConfig: { providerMode: "none" },
      answerKey: {},
    });
    expect(localOnly.providerMode).toBe("none");
    expect(localOnly.judgmentFieldIds).toEqual([]);

    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [] },
        evaluatorConfig: {
          providerMode: "none",
          approvedProcessor: "anthropic",
        },
        answerKey: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "provider-mode-conflict" }));

    expect(() =>
      parseAssessmentRuntimeConfig({
        rubric: { dimensions: [] },
        evaluatorConfig: { providerMode: "offline" },
        answerKey: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "provider-mode-invalid" }));
  });
});
