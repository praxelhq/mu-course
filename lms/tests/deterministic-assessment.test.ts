import { describe, expect, it } from "vitest";
import {
  evaluateObjectiveItem,
  evaluateObjectiveSet,
} from "../lib/assessments/evaluate-objective";
import { composeArtifactGrade } from "../lib/assessments/compose-grade";
import { applyObjectiveConsistencyRules } from "../lib/assessments/run-evaluation";
import type { ObjectiveAnswerSpec } from "../lib/assessments/types";

describe("deterministic objective assessment", () => {
  it("scores exact numbers and rejects non-finite or fractional integers", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      mode: "exact",
      expected: 641,
      integer: true,
    };

    expect(evaluateObjectiveItem("q1", spec, 641).status).toBe("correct");
    expect(evaluateObjectiveItem("q1", spec, "641").status).toBe("correct");
    expect(evaluateObjectiveItem("q1", spec, 641.2).reasonCode).toBe("integer_required");
    expect(evaluateObjectiveItem("q1", spec, Number.POSITIVE_INFINITY).reasonCode).toBe(
      "not_finite",
    );
  });

  it("treats both sides of an absolute-tolerance boundary as correct", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      mode: "tolerance",
      expected: 12.3,
      tolerance: 0.05,
      unit: "percentage-points",
    };

    expect(evaluateObjectiveItem("q2", spec, 12.25).status).toBe("correct");
    expect(evaluateObjectiveItem("q2", spec, "12.35%").status).toBe("correct");
    expect(evaluateObjectiveItem("q2", spec, 12.350001).status).toBe("incorrect");
  });

  it("uses the exact private value for a rounded-currency acceptance window", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      mode: "tolerance",
      expected: 4.4,
      tolerance: 0.5,
      unit: "USD",
      acceptedUnits: { USD: 1 },
    };

    expect(evaluateObjectiveItem("currency", spec, 4).status).toBe("correct");
    expect(evaluateObjectiveItem("currency", spec, 4.89).status).toBe("correct");
    expect(evaluateObjectiveItem("currency", spec, 3.51).status).toBe("incorrect");
  });

  it("supports rounded comparisons without changing the private expected value", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      mode: "rounded",
      expected: 1499.5,
      decimals: 0,
      unit: "USD",
    };

    expect(evaluateObjectiveItem("q3", spec, "$1,500").status).toBe("correct");
    expect(evaluateObjectiveItem("q3", spec, 1499).status).toBe("incorrect");
  });

  it("normalizes declared units only", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      mode: "tolerance",
      expected: 42,
      tolerance: 0.01,
      unit: "percentage-points",
      acceptedUnits: {
        "percentage-points": 1,
        percent: 1,
        fraction: 100,
      },
    };

    expect(
      evaluateObjectiveItem("q4", spec, { value: 0.42, unit: "fraction" }).status,
    ).toBe("correct");
    expect(
      evaluateObjectiveItem("q4", spec, { value: 42, unit: "bananas" }).reasonCode,
    ).toBe("unit_not_allowed");
  });

  it("normalizes strings by the published contract and accepts alternatives", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "string",
      expected: "Developer Tools",
      alternatives: ["Dev Tools"],
      trim: true,
      caseInsensitive: true,
    };

    expect(evaluateObjectiveItem("q5", spec, "  developer tools ").status).toBe("correct");
    expect(evaluateObjectiveItem("q5", spec, "DEV TOOLS").status).toBe("correct");
    expect(evaluateObjectiveItem("q5", spec, "Developer-Tools").status).toBe("incorrect");
  });

  it("compares sets without order while rejecting duplicates and undeclared values", () => {
    const spec: ObjectiveAnswerSpec = {
      kind: "set",
      expected: ["compare", "distribution"],
      allowed: ["compare", "distribution", "relationship"],
    };

    expect(evaluateObjectiveItem("q6", spec, ["distribution", "compare"]).status).toBe(
      "correct",
    );
    expect(evaluateObjectiveItem("q6", spec, ["compare", "compare"]).reasonCode).toBe(
      "duplicate_choice",
    );
    expect(evaluateObjectiveItem("q6", spec, ["compare", "timeline"]).reasonCode).toBe(
      "choice_not_allowed",
    );
  });

  it("evaluates a set without exposing private expected values in persisted results", () => {
    const result = evaluateObjectiveSet(
      {
        q1: { kind: "number", mode: "exact", expected: 2, integer: true },
        q2: { kind: "string", expected: "yes", caseInsensitive: true, trim: true },
      },
      { q1: 2, q2: "no" },
    );

    expect(result.correctCount).toBe(1);
    expect(result.items.q1.status).toBe("correct");
    expect(result.items.q2.status).toBe("incorrect");
    expect(JSON.stringify(result)).not.toContain('"expected"');
    expect(JSON.stringify(result)).not.toContain('"yes"');
  });

  it("uses authored weights when one question spans multiple response fields", () => {
    const result = evaluateObjectiveSet(
      {
        q1: { kind: "number", mode: "exact", expected: 1 },
        "q2.label": { kind: "string", expected: "A", weight: 0.5 },
        "q2.value": { kind: "number", mode: "exact", expected: 2, weight: 0.5 },
      },
      { q1: 1, "q2.label": "A", "q2.value": 0 },
    );

    expect(result.correctCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.correctWeight).toBe(1.5);
    expect(result.totalWeight).toBe(2);
  });

  it("caps Functionality when submitted count and percentage disagree", () => {
    const objective = evaluateObjectiveSet(
      {
        count: { kind: "number", mode: "exact", expected: 10 },
        denominator: { kind: "number", mode: "exact", expected: 100 },
        percentage: { kind: "number", mode: "tolerance", expected: 10, tolerance: 0.05 },
      },
      { count: 10, denominator: 100, percentage: "50%" },
    );
    const capped = applyObjectiveConsistencyRules({
      objective,
      dimensions: { functionality: { score: 10, rationale: "Objective score." } },
      rules: [
        {
          id: "count-rate",
          kind: "percentage_from_count",
          countField: "count",
          denominatorField: "denominator",
          percentageField: "percentage",
          tolerancePercentagePoints: 0.05,
          dimension: "functionality",
          cap: 8,
        },
      ],
    });

    expect(capped.functionality.score).toBe(8);
    expect(capped.functionality.rationale).toContain("count-rate");
  });
});

describe("artifact grade composition", () => {
  it("keeps deterministic Functionality authoritative and recomputes /40", () => {
    const grade = composeArtifactGrade({
      deterministic: {
        functionality: { score: 8, rationale: "Five of six objective checks passed." },
      },
      subjective: {
        functionality: { score: 10, rationale: "Model attempted to override it." },
        craft: { score: 7, rationale: "Reproducible working." },
        relevance: { score: 6, rationale: "Bounded recommendation." },
        "verification-evidence": { score: 5, rationale: "One weak independent check." },
      },
      dimensions: ["functionality", "craft", "relevance", "verification-evidence"],
    });

    expect(grade.rubricScores.functionality.score).toBe(8);
    expect(grade.total).toBe(26);
    expect(grade.conflicts).toEqual(["functionality"]);
  });

  it("clamps and totals against each frozen rubric maximum", () => {
    const grade = composeArtifactGrade({
      deterministic: {},
      subjective: {
        craft: { score: 8, rationale: "At the bound." },
        relevance: { score: 9, rationale: "Provider exceeded this dimension." },
      },
      dimensions: [
        { key: "craft", max: 8 },
        { key: "relevance", max: 6 },
      ],
    });
    expect(grade.rubricScores.craft.score).toBe(8);
    expect(grade.rubricScores.relevance.score).toBe(6);
    expect(grade.total).toBe(14);
  });
});
