import { describe, expect, it } from "vitest";
import {
  AssessmentAnchorError,
  assertAnchoredProviderScores,
  assertAssessmentEvaluatorChecksum,
  createAssessmentAnchorPack,
  parseAssessmentAnchorPack,
} from "../lib/assessments/assessment-anchors";
import { renderAssessmentAnchorPolicy } from "../lib/assessments/assessment-anchor-context";
import { assessmentProviderResponseSchemaFor } from "../lib/ai/assessment-grading";

const rubric = [
  { key: "craft", label: "Craft", max: 10 },
  { key: "relevance", label: "Relevance", max: 10 },
];

function authoredPack() {
  return createAssessmentAnchorPack({
    safeForProcessor: true,
    dimensions: [
      {
        key: "craft",
        bands: [
          { key: "emerging", min: 0, max: 2, criteria: ["No executable working is evidenced."] },
          { key: "developing", min: 3, max: 5, criteria: ["Working exists but assumptions remain hidden."] },
          { key: "proficient", min: 6, max: 8, criteria: ["Working is readable, bounded and rerunnable."] },
          { key: "strong", min: 9, max: 10, criteria: ["Working fails closed on material input drift."] },
        ],
        caps: [
          {
            key: "working-missing",
            max: 2,
            whenFlags: ["working-not-reproducible"],
            rationale: "A prose-only claim cannot exceed the emerging band.",
          },
        ],
        safeExamples: [
          {
            key: "craft-strong-abstract",
            bandKey: "strong",
            source: "authored-abstract",
            summary: "Executable working states its grain, null policy and a failing schema assertion.",
          },
        ],
      },
      {
        key: "relevance",
        bands: [
          { key: "emerging", min: 0, max: 2, criteria: ["No defensible decision is connected to evidence."] },
          { key: "developing", min: 3, max: 5, criteria: ["A decision is present but its limitation is missing."] },
          { key: "proficient", min: 6, max: 8, criteria: ["A concrete next action and limitation are evidenced."] },
          { key: "strong", min: 9, max: 10, criteria: ["Observation, inference and limitation are explicit."] },
        ],
        caps: [],
        safeExamples: [
          {
            key: "relevance-proficient-abstract",
            bandKey: "proficient",
            source: "authored-abstract",
            summary: "A bounded recommendation cites an aggregate and names selection bias.",
          },
        ],
      },
    ],
  });
}

describe("immutable authored assessment anchors", () => {
  it("accepts a content-addressed pack only when dimensions, bands, criteria, examples and flags match", () => {
    const pack = authoredPack();
    expect(pack.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      parseAssessmentAnchorPack({
        value: pack,
        rubric,
        approvedFlags: ["working-not-reproducible"],
      }),
    ).toEqual(pack);

    expect(() =>
      parseAssessmentAnchorPack({
        value: {
          ...pack,
          content: {
            ...pack.content,
            dimensions: pack.content.dimensions.map((dimension) =>
              dimension.key === "craft"
                ? { ...dimension, bands: dimension.bands.slice(1) }
                : dimension,
            ),
          },
        },
        rubric,
        approvedFlags: ["working-not-reproducible"],
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-checksum-mismatch" }));
  });

  it("fails closed on gaps, unknown dimensions, unknown cap flags and non-abstract or sensitive examples", () => {
    const pack = authoredPack();
    const craft = pack.content.dimensions[0];
    const relevance = pack.content.dimensions[1];
    const variants = [
      {
        dimensions: [
          { ...craft, bands: craft.bands.map((band) => band.key === "developing" ? { ...band, min: 4 } : band) },
          relevance,
        ],
        flags: ["working-not-reproducible"],
        code: "anchor-band-coverage-invalid",
      },
      {
        dimensions: [{ ...craft, key: "invented" }, relevance],
        flags: ["working-not-reproducible"],
        code: "anchor-dimension-mismatch",
      },
      {
        dimensions: [
          { ...craft, caps: [{ ...craft.caps[0], whenFlags: ["invented-flag"] }] },
          relevance,
        ],
        flags: ["working-not-reproducible"],
        code: "anchor-cap-flag-invalid",
      },
      {
        dimensions: [
          {
            ...craft,
            safeExamples: [{
              ...craft.safeExamples[0],
              source: "student-verbatim" as "authored-abstract",
            }],
          },
          relevance,
        ],
        flags: ["working-not-reproducible"],
        code: "anchor-pack-invalid",
      },
      {
        dimensions: [
          {
            ...craft,
            safeExamples: [{
              ...craft.safeExamples[0],
              summary: "Use sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 as proof.",
            }],
          },
          relevance,
        ],
        flags: ["working-not-reproducible"],
        code: "anchor-example-unsafe",
      },
    ];

    for (const variant of variants) {
      const changed = createAssessmentAnchorPack({
        safeForProcessor: true,
        dimensions: variant.dimensions,
      });
      expect(() =>
        parseAssessmentAnchorPack({ value: changed, rubric, approvedFlags: variant.flags }),
      ).toThrowError(expect.objectContaining({ code: variant.code }));
    }
  });

  it("renders exact authored criteria and abstract examples without answer-key material", () => {
    const rendered = renderAssessmentAnchorPolicy(authoredPack(), ["craft"]);
    expect(rendered).toContain("Working is readable, bounded and rerunnable.");
    expect(rendered).toContain("craft-strong-abstract");
    expect(rendered).toContain("working-not-reproducible");
    expect(rendered).not.toContain("answer key");
    expect(rendered).not.toContain("expected answer");
    expect(rendered).not.toContain("relevance-proficient-abstract");
  });

  it("rejects checksum-valid authored text that copies a protected answer-key leaf", () => {
    const pack = authoredPack();
    const craft = pack.content.dimensions[0];
    const changed = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [
        {
          ...craft,
          safeExamples: [{
            ...craft.safeExamples[0],
            summary: "The private expected answer is 641.",
          }],
        },
        pack.content.dimensions[1],
      ],
    });
    expect(() =>
      parseAssessmentAnchorPack({
        value: changed,
        rubric,
        approvedFlags: ["working-not-reproducible"],
        answerKey: { specs: { objective: { expected: 641 } } },
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-answer-key-leak" }));
  });

  it("does not classify an answer value already frozen in public evaluator context as private", () => {
    const pack = authoredPack();
    expect(() =>
      parseAssessmentAnchorPack({
        value: pack,
        rubric,
        approvedFlags: ["working-not-reproducible"],
        answerKey: { specs: { state: { expected: "proficient" } } },
        publicContext: { allowedPublicState: "proficient" },
      }),
    ).not.toThrow();
  });

  it("binds every score to its authored band and prevents a provider from ignoring a triggered cap", () => {
    const pack = authoredPack();
    const schema = assessmentProviderResponseSchemaFor(rubric, {
      approvedFlags: ["working-not-reproducible"],
      anchors: pack,
    });
    const base = {
      rubricScores: {
        craft: { score: 7, rationale: "The working can be rerun.", anchorBand: "proficient" },
        relevance: { score: 6, rationale: "The recommendation is bounded.", anchorBand: "proficient" },
      },
      total: 13,
      feedbackMd: "Repair the missing audit detail.",
      confidence: 0.8,
      flags: [] as string[],
      citations: [
        { dimension: "craft", evidenceIds: ["working"] },
        { dimension: "relevance", evidenceIds: ["rationale"] },
      ],
    };
    expect(schema.safeParse(base).success).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        rubricScores: {
          ...base.rubricScores,
          craft: { ...base.rubricScores.craft, anchorBand: "strong" },
        },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        flags: ["working-not-reproducible"],
      }).success,
    ).toBe(false);
    expect(() =>
      assertAnchoredProviderScores({
        anchors: pack,
        rubricScores: base.rubricScores,
        flags: ["working-not-reproducible"],
        requiredDimensionKeys: ["craft", "relevance"],
      }),
    ).toThrowError(expect.objectContaining({ code: "anchor-cap-violated" }));
  });

  it("verifies the frozen DB evaluator JSON against the stored evaluator checksum", () => {
    const pack = authoredPack();
    const frozen = {
      config: { providerMode: "auto", judgmentFieldIds: ["rationale"] },
      answerKey: null,
      anchors: pack,
      normalization: { dimensionMax: 10 },
    };
    const checksum = assertAssessmentEvaluatorChecksum({ ...frozen, expectedSha256: null });
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      assertAssessmentEvaluatorChecksum({
        ...frozen,
        config: { providerMode: "auto", judgmentFieldIds: ["different"] },
        expectedSha256: checksum,
      }),
    ).toThrowError(AssessmentAnchorError);
    for (const mutation of [
      { ...frozen, answerKey: { expected: "different" } },
      { ...frozen, anchors: { ...pack, contentSha256: "f".repeat(64) } },
      { ...frozen, normalization: { dimensionMax: 9 } },
    ]) {
      expect(() =>
        assertAssessmentEvaluatorChecksum({ ...mutation, expectedSha256: checksum }),
      ).toThrowError(expect.objectContaining({ code: "evaluator-checksum-mismatch" }));
    }
  });
});
