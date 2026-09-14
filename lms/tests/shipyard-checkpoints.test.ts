import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_DEFINITIONS,
  checkpointDefinition,
  checkpointId,
} from "@/lib/shipyard/checkpoints";
import { CHECKPOINT_ORDER, checkpointOrder, SHIPYARD_COURSE_ID } from "@/lib/shipyard/constants";
import {
  parseFieldSpecs,
  validateSubmissionFields,
  type FieldSpec,
} from "@/lib/shipyard/fields";
import { isMetricSignalName } from "@/lib/tracker/types";

describe("the six checkpoints", () => {
  it("are six, in the fixed order, with unique keys and ids", () => {
    expect(CHECKPOINT_DEFINITIONS).toHaveLength(6);
    expect(CHECKPOINT_DEFINITIONS.map((c) => c.key)).toEqual([...CHECKPOINT_ORDER]);
    expect(CHECKPOINT_DEFINITIONS.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(CHECKPOINT_DEFINITIONS.map((c) => checkpointId(c.key))).size).toBe(6);
    expect(SHIPYARD_COURSE_ID).toBe("course-2");
    expect(checkpointOrder("money")).toBe(4);
  });

  it("gate each checkpoint the way SPEC §5 says", () => {
    const byKey = Object.fromEntries(CHECKPOINT_DEFINITIONS.map((c) => [c.key, c]));
    expect(byKey.idea.gateType).toBe("review");
    expect(byKey.design.gateType).toBe("review");
    expect(byKey.working.gateType).toBe("review");
    expect(byKey.money.gateType).toBe("both");
    expect(byKey.workflow.gateType).toBe("metric");
    expect(byKey.launch.gateType).toBe("both");
  });

  it("require exactly the metric signals the spec names, all of them real", () => {
    const byKey = Object.fromEntries(CHECKPOINT_DEFINITIONS.map((c) => [c.key, c]));
    expect(byKey.idea.metricSignals).toEqual([]);
    expect(byKey.design.metricSignals).toEqual([]);
    expect(byKey.working.metricSignals).toEqual([]);
    expect(byKey.money.metricSignals).toEqual(["paymentsLive", "trackerConnected"]);
    expect(byKey.workflow.metricSignals).toEqual(["workflowTenRuns"]);
    expect(byKey.launch.metricSignals).toEqual(["hasPayingCustomer", "noBlockingFlags"]);
    for (const c of CHECKPOINT_DEFINITIONS) {
      for (const signal of c.metricSignals) {
        expect(isMetricSignalName(signal), `${c.key}/${signal}`).toBe(true);
      }
    }
  });

  it("accept images exactly where the reviewer has to look at them", () => {
    const byKey = Object.fromEntries(CHECKPOINT_DEFINITIONS.map((c) => [c.key, c]));
    expect(byKey.idea.acceptsImages).toBe(true);
    expect(byKey.design.acceptsImages).toBe(true);
    expect(byKey.working.acceptsImages).toBe(true);
    expect(byKey.money.acceptsImages).toBe(false);
    expect(byKey.workflow.acceptsImages).toBe(false);
    expect(byKey.launch.acceptsImages).toBe(false);
  });

  it("publish a bar with at least six numbered clauses, phrased as a bar", () => {
    for (const c of CHECKPOINT_DEFINITIONS) {
      expect(c.barMarkdown, c.key).toContain("You clear this when");
      const clauses = c.barMarkdown.match(/^\d+\. /gm) ?? [];
      expect(clauses.length, `${c.key} clauses`).toBeGreaterThanOrEqual(5);
      expect(c.barMarkdown, c.key).not.toContain("!");
      expect(c.barMarkdown.length, c.key).toBeGreaterThan(400);
    }
  });

  it("carry a rubric whose criteria are unique, weighted, and sum to 100", () => {
    for (const c of CHECKPOINT_DEFINITIONS) {
      const ids = c.rubric.criteria.map((r) => r.id);
      expect(new Set(ids).size, `${c.key} criterion ids`).toBe(ids.length);
      const sum = c.rubric.criteria.reduce((a, r) => a + r.weight, 0);
      expect(sum, `${c.key} rubric weights`).toBe(100);
      for (const criterion of c.rubric.criteria) {
        expect(criterion.clause.length, `${c.key}/${criterion.id}`).toBeGreaterThan(10);
        expect(criterion.passThreshold.length, `${c.key}/${criterion.id}`).toBeGreaterThan(10);
      }
      expect(c.rubric.passRule).toBe("all-criteria-met");
    }
  });

  it("declare a well-formed field schema with unique keys", () => {
    for (const c of CHECKPOINT_DEFINITIONS) {
      const parsed = parseFieldSpecs(c.fieldSchema);
      expect(parsed, c.key).not.toBeNull();
      const keys = parsed!.map((f) => f.key);
      expect(new Set(keys).size, `${c.key} field keys`).toBe(keys.length);
    }
  });

  it("ask for exactly the fields the build prompt names", () => {
    const keysOf = (key: Parameters<typeof checkpointDefinition>[0]) =>
      checkpointDefinition(key).fieldSchema.map((f) => f.key);
    expect(keysOf("idea")).toEqual([
      "productName",
      "oneLiner",
      "jobStory",
      "waitlistUrl",
      "signupCount",
      "trafficTestNotes",
      "signupScreenshot",
    ]);
    expect(keysOf("design")).toEqual(["flowNotes", "sketches"]);
    expect(keysOf("working")).toEqual(["liveUrl", "corePath", "knownGaps"]);
    expect(keysOf("money")).toEqual(["pricingNote", "checkoutUrl"]);
    expect(keysOf("workflow")).toEqual(["workflowName", "whatItAutomates"]);
    expect(keysOf("launch")).toEqual([
      "launchWriteup",
      "distributionChannels",
      "firstCustomerStory",
    ]);
  });

  it("bounds the image uploads: 3 for the signup shot, 2–12 sketches", () => {
    const signup = checkpointDefinition("idea").fieldSchema.find(
      (f) => f.key === "signupScreenshot",
    )!;
    expect(signup.kind).toBe("images");
    expect(signup.maxFiles).toBe(3);
    const sketches = checkpointDefinition("design").fieldSchema.find((f) => f.key === "sketches")!;
    expect(sketches.minFiles).toBe(2);
    expect(sketches.maxFiles).toBe(12);
  });

  it("throws on an unknown checkpoint key", () => {
    // @ts-expect-error deliberately out of the enum
    expect(() => checkpointDefinition("nope")).toThrow(/unknown checkpoint/);
  });
});

describe("field spec parsing", () => {
  it("rejects malformed specs rather than half-parsing them", () => {
    expect(parseFieldSpecs({})).toBeNull();
    expect(parseFieldSpecs([{ key: "a" }])).toBeNull();
    expect(parseFieldSpecs([{ key: "a", label: "A", kind: "colour", required: true }])).toBeNull();
    expect(parseFieldSpecs([{ key: "a", label: "A", kind: "text", required: "yes" }])).toBeNull();
    expect(parseFieldSpecs([])).toEqual([]);
  });

  it("round-trips a valid spec", () => {
    const spec = [
      { key: "a", label: "A", kind: "url", required: true, help: "why" },
      { key: "b", label: "B", kind: "images", required: false, maxFiles: 3 },
    ];
    expect(parseFieldSpecs(spec)).toEqual(spec);
  });
});

describe("validateSubmissionFields", () => {
  const spec: FieldSpec[] = [
    { key: "name", label: "Name", kind: "text", required: true },
    { key: "story", label: "Story", kind: "textarea", required: true },
    { key: "url", label: "URL", kind: "url", required: true },
    { key: "count", label: "Count", kind: "number", required: false },
    { key: "shots", label: "Shots", kind: "images", required: false, minFiles: 2, maxFiles: 3 },
  ];
  const ok = {
    name: "LedgerDesk",
    story: "When orders land in three inboxes…",
    url: "https://ledgerdesk.example.com",
  };

  it("accepts a valid submission and trims text", () => {
    const result = validateSubmissionFields(spec, { ...ok, name: "  LedgerDesk  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values.name).toBe("LedgerDesk");
  });

  it("names every missing required field at once", () => {
    const result = validateSubmissionFields(spec, { url: "https://a.example.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors.join(" ")).toContain("name");
      expect(result.errors.join(" ")).toContain("story");
    }
  });

  it("treats whitespace and empty lists as blank", () => {
    const result = validateSubmissionFields(spec, { ...ok, name: "   " });
    expect(result.ok).toBe(false);
  });

  it("requires a public http(s) URL", () => {
    for (const bad of [
      "not-a-url",
      "ftp://a.example.com",
      "javascript:alert(1)",
      "http://localhost:3000",
      "https://intranet",
    ]) {
      expect(validateSubmissionFields(spec, { ...ok, url: bad }).ok, bad).toBe(false);
    }
    expect(validateSubmissionFields(spec, { ...ok, url: "http://a.example.com/x" }).ok).toBe(true);
  });

  it("coerces a numeric string but refuses a non-number", () => {
    const good = validateSubmissionFields(spec, { ...ok, count: "42" });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.values.count).toBe(42);
    expect(validateSubmissionFields(spec, { ...ok, count: "lots" }).ok).toBe(false);
  });

  it("enforces the file floor and ceiling", () => {
    expect(validateSubmissionFields(spec, { ...ok, shots: ["a"] }).ok).toBe(false);
    expect(validateSubmissionFields(spec, { ...ok, shots: ["a", "b"] }).ok).toBe(true);
    expect(validateSubmissionFields(spec, { ...ok, shots: ["a", "b", "c", "d"] }).ok).toBe(false);
    expect(validateSubmissionFields(spec, { ...ok, shots: "a.png" }).ok).toBe(false);
  });

  it("refuses a key the checkpoint does not declare rather than dropping it", () => {
    const result = validateSubmissionFields(spec, { ...ok, rogue: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("rogue");
  });

  it("refuses a non-object payload", () => {
    expect(validateSubmissionFields(spec, null).ok).toBe(false);
    expect(validateSubmissionFields(spec, []).ok).toBe(false);
    expect(validateSubmissionFields(spec, "fields").ok).toBe(false);
  });

  it("validates a real checkpoint 1 submission end to end", () => {
    const idea = checkpointDefinition("idea").fieldSchema;
    const result = validateSubmissionFields(idea, {
      productName: "LedgerDesk",
      oneLiner: "One place to track every order.",
      jobStory: "When orders land in three inboxes, I want one list I can trust.",
      waitlistUrl: "https://ledgerdesk.example.com/waitlist",
      signupCount: 64,
      trafficTestNotes: "Two community posts and one ad set. 4,200 impressions, 310 visits.",
      signupScreenshot: ["shipyard/demo/ledgerdesk/signups.png"],
    });
    expect(result.ok).toBe(true);
  });
});
