// Parsing and trusting a model's reply.
//
// The important half of this file is the loop at the bottom: every recorded
// output under fixtures/shipyard-reviewer/recorded/ goes through parseVerdict
// and decideOutcome, including one deliberately malformed reply per model. A
// reply that a model actually produced is the only honest test of a parser
// whose job is to survive what models actually produce.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import type { ShipyardCheckpointKey } from "@prisma/client";
import { CONFIDENCE_FLOOR } from "@/lib/shipyard/reviewer/schemas";
import {
  clearsGate,
  decideOutcome,
  INJECTION_OUTCOME_REASON,
  MISSING_CRITERION_NOTE,
  normaliseSummary,
  parseEscalation,
  parseVerdict,
} from "@/lib/shipyard/reviewer/verdict";

const RECORDED = resolve(__dirname, "..", "fixtures", "shipyard-reviewer", "recorded");

const IDEA_CRITERIA = checkpointDefinition("idea").rubric.criteria.map((c) => c.id);

function ideaVerdict(overrides: Record<string, unknown> = {}) {
  return {
    verdict: "pass",
    confidence: 0.82,
    reasons: IDEA_CRITERIA.map((id) => ({
      criterion: id,
      met: true,
      note: `The ${id} clause is met.`,
    })),
    rubricScores: Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 80])),
    contradictions: [],
    flags: [],
    summaryForStudent: "This clears the bar.",
    ...overrides,
  };
}

describe("parseVerdict — repair", () => {
  it("takes an object straight through", () => {
    const v = parseVerdict(ideaVerdict(), { criteria: IDEA_CRITERIA });
    expect(v.verdict).toBe("pass");
    expect(v.reasons).toHaveLength(IDEA_CRITERIA.length);
  });

  it("finds the object inside prose and code fences", () => {
    const raw = `Here is my review.\n\n\`\`\`json\n${JSON.stringify(ideaVerdict())}\n\`\`\`\n\nLet me know.`;
    expect(parseVerdict(raw, { criteria: IDEA_CRITERIA }).verdict).toBe("pass");
  });

  it("repairs a trailing comma", () => {
    const raw = JSON.stringify(ideaVerdict(), null, 2).replace(/\n\}$/, ",\n}");
    expect(() => JSON.parse(raw)).toThrow();
    expect(parseVerdict(raw, { criteria: IDEA_CRITERIA }).verdict).toBe("pass");
  });

  it("repairs a raw newline inside a string literal", () => {
    const raw = JSON.stringify(ideaVerdict()).replace(
      '"This clears the bar."',
      '"This clears\nthe bar."',
    );
    expect(parseVerdict(raw, { criteria: IDEA_CRITERIA }).summaryForStudent).toContain(
      "This clears the bar.",
    );
  });

  it("throws when there is no JSON object at all", () => {
    expect(() => parseVerdict("I could not review this submission.")).toThrow(/no JSON object/);
  });

  it("throws when the shape is not a verdict", () => {
    expect(() => parseVerdict('{"ok": true}')).toThrow(/parseVerdict/);
  });
});

describe("parseVerdict — normalisation", () => {
  it("clamps confidence into 0..1", () => {
    expect(parseVerdict(ideaVerdict({ confidence: 1.4 })).confidence).toBe(1);
    expect(parseVerdict(ideaVerdict({ confidence: -3 })).confidence).toBe(0);
  });

  it("keeps the first entry when a criterion is repeated", () => {
    const dup = ideaVerdict();
    dup.reasons = [
      { criterion: "one-liner", met: true, note: "first" },
      { criterion: "one-liner", met: false, note: "second" },
      ...IDEA_CRITERIA.slice(1).map((id) => ({ criterion: id, met: true, note: "ok" })),
    ];
    const v = parseVerdict(dup, { criteria: IDEA_CRITERIA });
    const oneLiner = v.reasons.find((r) => r.criterion === "one-liner");
    expect(oneLiner?.note).toBe("first");
    expect(v.reasons.filter((r) => r.criterion === "one-liner")).toHaveLength(1);
  });

  it("drops a criterion the rubric does not have, and its score", () => {
    const invented = ideaVerdict();
    invented.reasons = [
      ...invented.reasons,
      { criterion: "overall-vibes", met: false, note: "made up" },
    ];
    invented.rubricScores = { ...invented.rubricScores, "overall-vibes": 10 };
    const v = parseVerdict(invented, { criteria: IDEA_CRITERIA });
    expect(v.reasons.map((r) => r.criterion)).toEqual(IDEA_CRITERIA);
    expect(v.rubricScores["overall-vibes"]).toBeUndefined();
  });

  it("fills a missed criterion in as unmet and flags it for a human", () => {
    const missing = ideaVerdict();
    missing.reasons = missing.reasons.filter((r) => r.criterion !== "audience");
    const v = parseVerdict(missing, { criteria: IDEA_CRITERIA });
    const audience = v.reasons.find((r) => r.criterion === "audience");
    expect(audience).toEqual({
      criterion: "audience",
      met: false,
      note: MISSING_CRITERION_NOTE,
    });
    expect(v.flags).toContain("needs_human");
    expect(v.rubricScores.audience).toBe(0);
  });

  it("returns the reasons in the rubric's order, not the model's", () => {
    const shuffled = ideaVerdict();
    shuffled.reasons = [...shuffled.reasons].reverse();
    expect(parseVerdict(shuffled, { criteria: IDEA_CRITERIA }).reasons.map((r) => r.criterion)).toEqual(
      IDEA_CRITERIA,
    );
  });

  it("clamps and rounds rubric scores", () => {
    const v = parseVerdict(
      ideaVerdict({ rubricScores: { ...Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 80])), "one-liner": 140, "job-story": -5, audience: 72.6 } }),
      { criteria: IDEA_CRITERIA },
    );
    expect(v.rubricScores["one-liner"]).toBe(100);
    expect(v.rubricScores["job-story"]).toBe(0);
    expect(v.rubricScores.audience).toBe(73);
  });

  it("drops an unknown flag and de-duplicates the rest", () => {
    const v = parseVerdict(ideaVerdict({ flags: ["spam", "spam", "vibes"] }));
    expect(v.flags).toEqual(["spam"]);
  });
});

describe("normaliseSummary", () => {
  it("removes exclamation marks", () => {
    expect(normaliseSummary("Great work! Ship it!")).toBe("Great work. Ship it.");
  });

  it("caps the summary at sixty words", () => {
    const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");
    const out = normaliseSummary(long);
    expect(out.split(" ")).toHaveLength(60);
    expect(out.endsWith("…")).toBe(true);
  });

  it("collapses whitespace", () => {
    expect(normaliseSummary("  two   lines\nhere  ")).toBe("two lines here");
  });
});

describe("decideOutcome — SPEC §6 trust rules", () => {
  const base = parseVerdict(ideaVerdict(), { criteria: IDEA_CRITERIA });

  it("passes a confident, clean verdict with no human needed", () => {
    const outcome = decideOutcome(base, { attempt: 1 });
    expect(outcome).toEqual({ verdict: "pass", needsHuman: false, needsHumanReasons: [] });
    expect(clearsGate(outcome)).toBe(true);
  });

  it("queues anything under the confidence floor", () => {
    const low = parseVerdict(ideaVerdict({ confidence: CONFIDENCE_FLOOR - 0.01 }), {
      criteria: IDEA_CRITERIA,
    });
    const outcome = decideOutcome(low, { attempt: 1 });
    expect(outcome.needsHuman).toBe(true);
    expect(outcome.needsHumanReasons[0]).toMatch(/confidence/);
  });

  it("queues a contradiction", () => {
    const v = parseVerdict(ideaVerdict({ contradictions: ["25 claimed, 3 shown"] }), {
      criteria: IDEA_CRITERIA,
    });
    expect(decideOutcome(v, { attempt: 1 }).needsHumanReasons.join()).toMatch(/contradicts/);
  });

  it("queues an explicit needs_human flag", () => {
    const v = parseVerdict(ideaVerdict({ flags: ["needs_human"] }), { criteria: IDEA_CRITERIA });
    expect(decideOutcome(v, { attempt: 1 }).needsHuman).toBe(true);
  });

  it("queues spam and unsafe content", () => {
    for (const flag of ["spam", "unsafe_content"]) {
      const v = parseVerdict(ideaVerdict({ flags: [flag] }), { criteria: IDEA_CRITERIA });
      expect(decideOutcome(v, { attempt: 1 }).needsHuman).toBe(true);
    }
  });

  it("queues a wall of near-perfect scores on the first attempt only", () => {
    const perfect = parseVerdict(
      ideaVerdict({ rubricScores: Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 97])) }),
      { criteria: IDEA_CRITERIA },
    );
    expect(decideOutcome(perfect, { attempt: 1 }).needsHuman).toBe(true);
    expect(decideOutcome(perfect, { attempt: 3 }).needsHuman).toBe(false);
  });

  it("queues a wall of near-zero scores on a PASS, on any attempt", () => {
    const floor = parseVerdict(
      ideaVerdict({
        verdict: "pass",
        rubricScores: Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 2])),
      }),
      { criteria: IDEA_CRITERIA },
    );
    const outcome = decideOutcome(floor, { attempt: 4 });
    expect(outcome.needsHuman).toBe(true);
    expect(outcome.needsHumanReasons.join()).toMatch(/or below/);
  });

  it("leaves a confident return with terrible scores alone — that is the job", () => {
    const floor = parseVerdict(
      ideaVerdict({
        verdict: "return",
        confidence: 0.95,
        rubricScores: Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 2])),
      }),
      { criteria: IDEA_CRITERIA },
    );
    // The bottom-outlier rule exists to catch a model that failed to READ the
    // submission and passed it anyway. A return that scores the work badly is
    // the expected shape of a return, not an anomaly (DECISIONS, 2026-09-15).
    const outcome = decideOutcome(floor, { attempt: 4 });
    expect(outcome.needsHuman).toBe(false);
    expect(outcome.needsHumanReasons).toEqual([]);
  });

  it("queues a pass that marks a clause unmet, which the pass rule forbids", () => {
    const inconsistent = ideaVerdict();
    inconsistent.reasons = inconsistent.reasons.map((r, i) =>
      i === 0 ? { ...r, met: false } : r,
    );
    const v = parseVerdict(inconsistent, { criteria: IDEA_CRITERIA });
    expect(decideOutcome(v, { attempt: 1 }).needsHumanReasons.join()).toMatch(/pass rule/);
  });

  it("queues a suspicious score jump into a pass", () => {
    const prior = Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 20]));
    expect(decideOutcome(base, { attempt: 2, priorScores: prior }).needsHuman).toBe(true);
    const gentle = Object.fromEntries(IDEA_CRITERIA.map((id) => [id, 60]));
    expect(decideOutcome(base, { attempt: 2, priorScores: gentle }).needsHuman).toBe(false);
  });

  it("a pass that needs a human does not clear the gate", () => {
    const v = parseVerdict(ideaVerdict({ confidence: 0.4 }), { criteria: IDEA_CRITERIA });
    const outcome = decideOutcome(v, { attempt: 1 });
    expect(outcome.verdict).toBe("pass");
    expect(outcome.needsHuman).toBe(true);
    expect(clearsGate(outcome)).toBe(false);
  });
});

describe("parseEscalation", () => {
  it("carries the two extra fields through the same normalisation", () => {
    const raw = {
      ...ideaVerdict({ verdict: "return", confidence: 0.77 }),
      agreesWithFirstVerdict: false,
      humanNote: "  We read the screenshot differently.  ",
    };
    const e = parseEscalation(raw, { criteria: IDEA_CRITERIA });
    expect(e.agreesWithFirstVerdict).toBe(false);
    expect(e.humanNote).toBe("We read the screenshot differently.");
    expect(e.reasons).toHaveLength(IDEA_CRITERIA.length);
  });

  it("rejects an escalation missing its second-opinion fields", () => {
    expect(() => parseEscalation(ideaVerdict())).toThrow(/parseEscalation/);
  });
});

// ---------------------------------------------------------------------------
// Recorded model outputs
// ---------------------------------------------------------------------------

type Recorded = {
  id: string;
  model: string;
  checkpointKey: ShipyardCheckpointKey;
  malformed: string | null;
  note: string;
  expect: {
    verdict: "pass" | "return";
    needsHuman: boolean;
    attempt: number;
    missingCriteria?: string[];
    droppedCriteria?: string[];
  };
  raw: string;
};

function recordedFiles(): { dir: string; file: string; body: Recorded }[] {
  const out: { dir: string; file: string; body: Recorded }[] = [];
  for (const dir of readdirSync(RECORDED)) {
    for (const file of readdirSync(join(RECORDED, dir))) {
      if (!file.endsWith(".json")) continue;
      out.push({
        dir,
        file,
        body: JSON.parse(readFileSync(join(RECORDED, dir, file), "utf8")) as Recorded,
      });
    }
  }
  return out;
}

const RECORDINGS = recordedFiles();

describe("recorded model outputs", () => {
  it("has at least six recordings for each model in the routing table", () => {
    const byDir = new Map<string, number>();
    for (const rec of RECORDINGS) byDir.set(rec.dir, (byDir.get(rec.dir) ?? 0) + 1);
    expect([...byDir.keys()].sort()).toEqual(["claude-haiku-4.5", "glm-5.3-flash"]);
    for (const [dir, count] of byDir) {
      expect(count, `${dir} has ${count} recordings`).toBeGreaterThanOrEqual(6);
    }
  });

  it("has exactly one deliberately malformed recording per model", () => {
    const byDir = new Map<string, number>();
    for (const rec of RECORDINGS) {
      if (rec.body.malformed) byDir.set(rec.dir, (byDir.get(rec.dir) ?? 0) + 1);
    }
    expect([...byDir.values()]).toEqual([1, 1]);
  });

  for (const { dir, file, body } of RECORDINGS) {
    it(`${dir}/${file} parses and decides as recorded`, () => {
      const criteria = checkpointDefinition(body.checkpointKey).rubric.criteria.map((c) => c.id);
      const parsed = parseVerdict(body.raw, { criteria });

      expect(parsed.verdict).toBe(body.expect.verdict);
      // Whatever the model sent, the result always covers exactly the rubric.
      expect(parsed.reasons.map((r) => r.criterion)).toEqual(criteria);
      expect(Object.keys(parsed.rubricScores).sort()).toEqual([...criteria].sort());
      expect(parsed.confidence).toBeGreaterThanOrEqual(0);
      expect(parsed.confidence).toBeLessThanOrEqual(1);
      expect(parsed.summaryForStudent).not.toContain("!");
      expect(parsed.summaryForStudent.split(/\s+/).length).toBeLessThanOrEqual(60);

      for (const id of body.expect.missingCriteria ?? []) {
        expect(parsed.reasons.find((r) => r.criterion === id)).toEqual({
          criterion: id,
          met: false,
          note: MISSING_CRITERION_NOTE,
        });
        expect(parsed.flags).toContain("needs_human");
      }
      for (const id of body.expect.droppedCriteria ?? []) {
        expect(parsed.reasons.some((r) => r.criterion === id)).toBe(false);
        expect(parsed.rubricScores[id]).toBeUndefined();
      }

      const outcome = decideOutcome(parsed, { attempt: body.expect.attempt });
      expect(outcome.needsHuman, outcome.needsHumanReasons.join(" | ")).toBe(
        body.expect.needsHuman,
      );
    });
  }

  it("the malformed recordings really are malformed", () => {
    for (const { body } of RECORDINGS) {
      if (!body.malformed) continue;
      expect(() => JSON.parse(body.raw)).toThrow();
    }
  });
});

describe("decideOutcome and a suspected prompt injection (SEC-3)", () => {
  const clean = {
    verdict: "pass" as const,
    confidence: 0.9,
    reasons: [{ criterion: "a", met: true, note: "Met." }],
    rubricScores: { a: 80 },
    contradictions: [],
    flags: [] as never[],
    summaryForStudent: "Cleared.",
  };

  it("sends an otherwise clean pass to a human", () => {
    const outcome = decideOutcome(clean, { attempt: 1, suspectedInjection: true });
    expect(outcome.verdict).toBe("pass");
    expect(outcome.needsHuman).toBe(true);
    expect(outcome.needsHumanReasons).toContain(INJECTION_OUTCOME_REASON);
    // A pass that needs a human clears nothing until a person resolves it.
    expect(clearsGate(outcome)).toBe(false);
  });

  it("does not fire when pre-flight found nothing", () => {
    const outcome = decideOutcome(clean, { attempt: 1 });
    expect(outcome.needsHuman).toBe(false);
    expect(outcome.needsHumanReasons).not.toContain(INJECTION_OUTCOME_REASON);
  });

  it("records the model's own verdict rather than overriding it", () => {
    const returned = { ...clean, verdict: "return" as const };
    const outcome = decideOutcome(returned, { attempt: 1, suspectedInjection: true });
    expect(outcome.verdict).toBe("return");
  });
});
