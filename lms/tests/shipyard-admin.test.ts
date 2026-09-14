import { describe, expect, it } from "vitest";
import {
  assertGateConsistency,
  patchMovesGates,
  validateCheckpointPatch,
  validateFieldSchema,
  validateGateType,
  validateMetricSignals,
  validateRubric,
} from "@/lib/shipyard/checkpoint-admin";
import { CHECKPOINT_DEFINITIONS, checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { ShipyardError } from "@/lib/shipyard/errors";
import { validateVersion, validateWeightsInput } from "@/lib/shipyard/weights";
import { WEIGHTS_V1 } from "@/lib/shipyard/scoring";

function refusal(fn: () => unknown): ShipyardError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ShipyardError) return err;
    throw err;
  }
  throw new Error("expected a ShipyardError, got none");
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

describe("validateWeightsInput", () => {
  it("accepts the seeded v1 split", () => {
    expect(validateWeightsInput(WEIGHTS_V1)).toEqual(WEIGHTS_V1);
  });

  it("accepts any split that sums to 100, including an uneven one", () => {
    const split = { productQuality: 40, realNumbers: 25, workflow: 20, distribution: 15 };
    expect(validateWeightsInput(split)).toEqual(split);
    // Zero is legal: a course that stops weighting a component still has four.
    expect(
      validateWeightsInput({ productQuality: 50, realNumbers: 50, workflow: 0, distribution: 0 }),
    ).toBeTruthy();
  });

  it("refuses a split that does not sum to 100, and says what it summed to", () => {
    const err = refusal(() =>
      validateWeightsInput({ productQuality: 30, realNumbers: 30, workflow: 20, distribution: 10 }),
    );
    expect(err.status).toBe(400);
    expect(err.body.sum).toBe(90);
    expect(err.body.error).toContain("100");
  });

  it("refuses a negative weight, a missing component, and a non-object", () => {
    expect(
      refusal(() =>
        validateWeightsInput({ productQuality: -10, realNumbers: 60, workflow: 30, distribution: 20 }),
      ).status,
    ).toBe(400);
    expect(refusal(() => validateWeightsInput({ productQuality: 100 })).status).toBe(400);
    expect(refusal(() => validateWeightsInput(null)).status).toBe(400);
    expect(refusal(() => validateWeightsInput("v1")).status).toBe(400);
  });
});

describe("validateVersion", () => {
  it("accepts a short label", () => {
    expect(validateVersion("v2")).toBe("v2");
    expect(validateVersion(" 2026-09-autumn ")).toBe("2026-09-autumn");
  });

  it("refuses an empty, spaced or wild label", () => {
    for (const bad of ["", "   ", "a b", "v2/../v1", "-leading"]) {
      expect(refusal(() => validateVersion(bad)).status, bad).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// The checkpoint editor's validators
// ---------------------------------------------------------------------------

describe("validateRubric", () => {
  it("accepts every seeded rubric unchanged", () => {
    for (const definition of CHECKPOINT_DEFINITIONS) {
      const parsed = validateRubric(definition.rubric);
      expect(parsed.criteria.map((c) => c.id), definition.key).toEqual(
        definition.rubric.criteria.map((c) => c.id),
      );
      expect(parsed.passRule).toBe("all-criteria-met");
    }
  });

  it("refuses duplicate criterion ids — they are the rubricScores keys", () => {
    const err = refusal(() =>
      validateRubric({
        passRule: "all-criteria-met",
        criteria: [
          { id: "same", clause: "one", weight: 50 },
          { id: "same", clause: "two", weight: 50 },
        ],
      }),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toContain("unique");
  });

  it("refuses a criterion with no id, no clause, or a bad weight", () => {
    const base = { id: "a", clause: "does a thing", weight: 10 };
    expect(refusal(() => validateRubric({ criteria: [{ ...base, id: "" }] })).status).toBe(400);
    expect(refusal(() => validateRubric({ criteria: [{ ...base, clause: "" }] })).status).toBe(400);
    expect(refusal(() => validateRubric({ criteria: [{ ...base, weight: -1 }] })).status).toBe(400);
    expect(refusal(() => validateRubric({ criteria: [{ ...base, weight: "ten" }] })).status).toBe(400);
  });

  it("refuses an empty rubric and an all-zero one", () => {
    expect(refusal(() => validateRubric({ criteria: [] })).status).toBe(400);
    expect(
      refusal(() => validateRubric({ criteria: [{ id: "a", clause: "c", weight: 0 }] })).status,
    ).toBe(400);
    expect(refusal(() => validateRubric(null)).status).toBe(400);
  });
});

describe("validateFieldSchema", () => {
  it("accepts every seeded field schema, through the one interpreter", () => {
    for (const definition of CHECKPOINT_DEFINITIONS) {
      expect(validateFieldSchema(definition.fieldSchema), definition.key).toHaveLength(
        definition.fieldSchema.length,
      );
    }
  });

  it("refuses a kind the submit form cannot render", () => {
    expect(
      refusal(() =>
        validateFieldSchema([{ key: "a", label: "A", kind: "spreadsheet", required: true }]),
      ).status,
    ).toBe(400);
  });

  it("refuses duplicate field keys and an empty schema", () => {
    const field = { key: "a", label: "A", kind: "text", required: true };
    expect(refusal(() => validateFieldSchema([field, field])).body.error).toContain("share the key");
    expect(refusal(() => validateFieldSchema([])).status).toBe(400);
  });
});

describe("validateMetricSignals and gate consistency", () => {
  it("accepts the signal names the tracker actually reports", () => {
    expect(validateMetricSignals(["paymentsLive", "trackerConnected"])).toEqual([
      "paymentsLive",
      "trackerConnected",
    ]);
    expect(validateMetricSignals([])).toEqual([]);
  });

  it("refuses a typo, and names the vocabulary", () => {
    const err = refusal(() => validateMetricSignals(["paymentsLiv"]));
    expect(err.status).toBe(400);
    expect(err.body.known).toContain("paymentsLive");
  });

  it("deduplicates rather than requiring a signal twice", () => {
    expect(validateMetricSignals(["paymentsLive", "paymentsLive"])).toEqual(["paymentsLive"]);
  });

  it("refuses a metric gate with nothing to clear it", () => {
    expect(refusal(() => assertGateConsistency("metric", [])).status).toBe(400);
    expect(refusal(() => assertGateConsistency("both", [])).status).toBe(400);
  });

  it("refuses a review gate that carries signals it would never read", () => {
    expect(refusal(() => assertGateConsistency("review", ["paymentsLive"])).status).toBe(400);
  });

  it("agrees with all six seeded definitions", () => {
    for (const definition of CHECKPOINT_DEFINITIONS) {
      expect(() =>
        assertGateConsistency(
          validateGateType(definition.gateType),
          definition.metricSignals,
        ),
        definition.key,
      ).not.toThrow();
    }
  });
});

describe("validateCheckpointPatch", () => {
  const current = { gateType: "review" as const, metricSignals: [] as string[] };

  it("normalises the simple edits", () => {
    const patch = validateCheckpointPatch(
      {
        title: "  A new title  ",
        resubmitCooldownMinutes: 30,
        deadlineAt: "2026-10-01T00:00:00.000Z",
      },
      current,
    );
    expect(patch.title).toBe("A new title");
    expect(patch.resubmitCooldownMinutes).toBe(30);
    expect(patch.deadlineAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("clears a deadline with an explicit null", () => {
    expect(validateCheckpointPatch({ deadlineAt: null }, current).deadlineAt).toBeNull();
  });

  it("checks gate consistency on the RESULT, not the patch alone", () => {
    // Turning a review gate into `both` needs signals in the same patch…
    expect(refusal(() => validateCheckpointPatch({ gateType: "both" }, current)).status).toBe(400);
    expect(() =>
      validateCheckpointPatch({ gateType: "both", metricSignals: ["paymentsLive"] }, current),
    ).not.toThrow();
    // …but changing gateType alone is fine when the row already has them.
    expect(() =>
      validateCheckpointPatch(
        { gateType: "metric" },
        { gateType: "both", metricSignals: ["workflowTenRuns"] },
      ),
    ).not.toThrow();
  });

  it("refuses a field nobody may edit here, and names what is editable", () => {
    const err = refusal(() => validateCheckpointPatch({ key: "idea" } as never, current));
    expect(err.status).toBe(400);
    expect(err.body.editable).toContain("barMarkdown");
  });

  it("refuses a bar too short to be a published bar", () => {
    expect(refusal(() => validateCheckpointPatch({ barMarkdown: "Do good work." }, current)).status)
      .toBe(400);
  });

  it("accepts the seeded money definition as a patch of itself", () => {
    const money = checkpointDefinition("money");
    expect(() =>
      validateCheckpointPatch(
        {
          title: money.title,
          barMarkdown: money.barMarkdown,
          rubric: money.rubric,
          gateType: money.gateType,
          acceptsImages: money.acceptsImages,
          fieldSchema: money.fieldSchema,
          metricSignals: money.metricSignals,
        },
        { gateType: "both", metricSignals: money.metricSignals },
      ),
    ).not.toThrow();
  });
});

describe("patchMovesGates", () => {
  const current = { gateType: "both" as const, metricSignals: ["paymentsLive", "trackerConnected"] };

  it("is false for a bar, a rubric, a deadline — nothing a gate reads", () => {
    expect(patchMovesGates({ title: "x", barMarkdown: "y".repeat(50) }, current)).toBe(false);
  });

  it("is true when the gate type changes", () => {
    expect(patchMovesGates({ gateType: "metric" }, current)).toBe(true);
  });

  it("is true when the required signals change, and false when only reordered", () => {
    expect(patchMovesGates({ metricSignals: ["paymentsLive"] }, current)).toBe(true);
    expect(
      patchMovesGates({ metricSignals: ["trackerConnected", "paymentsLive"] }, current),
    ).toBe(false);
  });
});
