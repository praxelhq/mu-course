// The fixture set is a release gate (SPEC §1 rule 8), so it gets the same
// treatment as code: its shape, its coverage and its internal consistency are
// asserted, not assumed. A fixture that names a criterion the rubric does not
// have would quietly weaken the gate it exists to enforce.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ShipyardCheckpointKey } from "@prisma/client";
import { CHECKPOINT_DEFINITIONS, checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { validateSubmissionFields } from "@/lib/shipyard/fields";
import { trackerSignalsSchema } from "@/lib/tracker/types";
import { isModelReviewed } from "@/lib/shipyard/reviewer/prompts";

const FIXTURES = resolve(__dirname, "..", "fixtures", "shipyard-reviewer");
const CASES = join(FIXTURES, "cases");

type EvalCase = {
  id: string;
  checkpointKey: ShipyardCheckpointKey;
  expected: "pass" | "return";
  expectedUnmetCriteria: string[];
  fields: Record<string, unknown>;
  extractedText?: string;
  images?: { file: string }[];
  render?: { domText: string; screenshotNote: string };
  signals?: unknown;
  notes?: string;
};

function load(): { dir: string; file: string; body: EvalCase }[] {
  const out: { dir: string; file: string; body: EvalCase }[] = [];
  for (const dir of readdirSync(CASES).sort()) {
    for (const file of readdirSync(join(CASES, dir)).sort()) {
      if (!file.endsWith(".json")) continue;
      out.push({
        dir,
        file,
        body: JSON.parse(readFileSync(join(CASES, dir, file), "utf8")) as EvalCase,
      });
    }
  }
  return out;
}

const ALL = load();

describe("the fixture set", () => {
  it("covers every checkpoint, ten each for the five the model judges", () => {
    const counts: Record<string, number> = {};
    for (const { dir } of ALL) counts[dir] = (counts[dir] ?? 0) + 1;
    expect(counts).toEqual({
      design: 10,
      idea: 10,
      launch: 10,
      money: 10,
      workflow: 5,
      working: 10,
    });
    expect(ALL).toHaveLength(55);
    for (const def of CHECKPOINT_DEFINITIONS) expect(counts[def.key]).toBeGreaterThan(0);
  });

  it("has unique ids, and the directory matches the checkpoint key", () => {
    const ids = new Set<string>();
    for (const { dir, file, body } of ALL) {
      expect(body.checkpointKey, `${dir}/${file}`).toBe(dir);
      expect(ids.has(body.id), `duplicate id ${body.id}`).toBe(false);
      ids.add(body.id);
    }
  });

  it("names only real rubric criteria in expectedUnmetCriteria", () => {
    for (const { dir, file, body } of ALL) {
      const criteria = checkpointDefinition(body.checkpointKey).rubric.criteria.map((c) => c.id);
      for (const id of body.expectedUnmetCriteria) {
        expect(criteria, `${dir}/${file} names ${id}`).toContain(id);
      }
    }
  });

  it("keeps expectation and verdict consistent: a pass has nothing unmet", () => {
    for (const { dir, file, body } of ALL) {
      if (body.expected === "pass") {
        expect(body.expectedUnmetCriteria, `${dir}/${file}`).toEqual([]);
      } else {
        expect(body.expectedUnmetCriteria.length, `${dir}/${file}`).toBeGreaterThan(0);
      }
    }
  });

  it("carries a deliberate mix of passes and returns on every reviewed checkpoint", () => {
    for (const def of CHECKPOINT_DEFINITIONS) {
      if (!isModelReviewed(def.key)) continue;
      const cases = ALL.filter((c) => c.dir === def.key);
      const passes = cases.filter((c) => c.body.expected === "pass").length;
      const returns = cases.length - passes;
      expect(passes, `${def.key} passes`).toBeGreaterThanOrEqual(4);
      expect(returns, `${def.key} returns`).toBeGreaterThanOrEqual(4);
    }
  });

  it("validates every case's fields against its checkpoint's own field schema", () => {
    for (const { dir, file, body } of ALL) {
      const def = checkpointDefinition(body.checkpointKey);
      const result = validateSubmissionFields(def.fieldSchema, body.fields);
      expect(result.ok ? [] : result.errors, `${dir}/${file}`).toEqual([]);
    }
  });

  it("gives every `working` case a render and every metric case real signals", () => {
    for (const { dir, file, body } of ALL) {
      if (body.checkpointKey === "working") {
        expect(body.render, `${dir}/${file}`).toBeDefined();
        expect(typeof body.render?.domText).toBe("string");
        expect(typeof body.render?.screenshotNote).toBe("string");
      }
      const def = checkpointDefinition(body.checkpointKey);
      if (def.gateType !== "review") {
        expect(body.signals, `${dir}/${file}`).toBeDefined();
        expect(trackerSignalsSchema.safeParse(body.signals).success, `${dir}/${file}`).toBe(true);
      }
    }
  });

  it("never blames a metric signal for a write-up return", () => {
    // The model judges the write-up half only; the metric half is read from
    // the tracker and decided outside the review (SPEC §5).
    for (const { dir, file, body } of ALL) {
      if (body.checkpointKey !== "money") continue;
      for (const id of body.expectedUnmetCriteria) {
        expect(["paymentsLive", "trackerConnected"], `${dir}/${file}`).not.toContain(id);
      }
    }
  });

  it("keeps workflow informational: its expectation tracks the run count alone", () => {
    const workflow = ALL.filter((c) => c.dir === "workflow");
    expect(workflow).toHaveLength(5);
    for (const { file, body } of workflow) {
      const signals = body.signals as { workflowTenRuns: boolean };
      expect(body.expected, file).toBe(signals.workflowTenRuns ? "pass" : "return");
      expect(isModelReviewed(body.checkpointKey)).toBe(false);
    }
  });

  it("points every non-synthetic image at a file that exists", () => {
    let real = 0;
    for (const { dir, file, body } of ALL) {
      for (const image of body.images ?? []) {
        if (image.file.startsWith("synthetic:")) continue;
        real++;
        expect(existsSync(join(FIXTURES, image.file)), `${dir}/${file} -> ${image.file}`).toBe(true);
      }
    }
    // At least one real PNG per image-bearing checkpoint, so the vision path
    // is genuinely exercised and not only described in prose.
    expect(real).toBeGreaterThanOrEqual(4);
  });

  it("gives every image-accepting checkpoint's cases at least one image", () => {
    for (const { dir, file, body } of ALL) {
      const def = checkpointDefinition(body.checkpointKey);
      if (!def.acceptsImages || def.key === "working" || def.key === "money") continue;
      expect((body.images ?? []).length, `${dir}/${file}`).toBeGreaterThan(0);
    }
  });

  it("reads like a real cohort: every case carries a note and substantial prose", () => {
    for (const { dir, file, body } of ALL) {
      expect(body.notes, `${dir}/${file}`).toBeTruthy();
      const prose = Object.values(body.fields)
        .filter((v): v is string => typeof v === "string")
        .join(" ");
      expect(prose.length, `${dir}/${file}`).toBeGreaterThan(120);
    }
  });
});
