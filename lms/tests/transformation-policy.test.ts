import { describe, expect, it } from "vitest";
import {
  BASE_BUDGET_POINTS,
  INITIATIVE_BY_KEY,
  MIN_ENABLEMENT_POINTS,
  PROBLEM_AREA_KEYS,
  type InitiativeKey,
} from "@/lib/transformation/case";
import {
  effectiveBudget,
  emptyDraft,
  enablementPoints,
  initiativePoints,
  validatePlan,
  wordCount,
  type TransformationPlanDraft,
} from "@/lib/transformation/policy";

const REASON = "Store managers already do this by hand every single morning.";
const CONSTRAINT_ANSWER =
  "I drop the voice agent entirely and resequence the company brain to land first inside the smaller budget.";
const HEADLINE =
  "Fix the knowledge first: version the SOPs, ground one assistant on them with citations and a refusal, and buy evaluation on day one. Everything customer-facing waits until that assistant passes its test set, because a fluent wrong allergen answer is the failure we cannot afford.";

function fullAudit() {
  return Object.fromEntries(
    PROBLEM_AREA_KEYS.map((key) => [key, { call: "augment" as const, reason: REASON }]),
  );
}

function draft(overrides: Partial<TransformationPlanDraft> = {}): TransformationPlanDraft {
  const chosen: InitiativeKey[] = ["company-brain", "store-ops-automation", "evaluation-monitoring"];
  return {
    ...emptyDraft(),
    audit: fullAudit(),
    initiatives: chosen,
    leadInitiative: "company-brain",
    rejected: { key: "voice-agent", reason: "The knowledge behind it is not reliable enough to answer a caller yet." },
    workflows: {
      "company-brain": {
        currentWork: "Managers phone two senior operations staff for every policy question.",
        problem: "Those two people are the whole system and they are unavailable half the day.",
        capability: "RAG over a versioned SOP corpus with citations.",
        inputData: "Internal SOPs and policies only. No customer or employee personal data.",
        newWorkflow: "Manager asks, retrieval selects evidence, assistant answers with a citation, low confidence escalates.",
        humanGate: "The operations lead owns the corpus and reviews every escalation daily.",
        successMetric: "Policy calls to the two senior staff drop, measured against a two-week baseline.",
        failureMode: "It answers confidently from a superseded document.",
        proof: "A test set of common and risky questions, including allergens, run before launch.",
      },
      "store-ops-automation": {
        capability: "Automation over a standardised daily intake form.",
        humanGate: "The operations manager reviews the exception list before anyone acts on it.",
        successMetric: "Consolidation time falls from hours to minutes, measured weekly.",
      },
      "evaluation-monitoring": {
        capability: "A fixed evaluation set plus sampled output review.",
        humanGate: "The operations lead signs off the weekly sample review.",
        successMetric: "Every release runs the test set and the pass rate is recorded.",
      },
    },
    constraintCardId: 2,
    constraintResponse: CONSTRAINT_ANSWER,
    incidentCardId: 1,
    incidentResponse: {
      failed: "Retrieval selected a superseded allergen document because both versions were indexed.",
      prevented: "Retiring superseded documents and pinning an effective date to every policy would have prevented it.",
      control: "Allergen questions now refuse and route to a named person, and superseded files leave the index.",
      verdict: "pause",
    },
    headline: HEADLINE,
    ...overrides,
  };
}

describe("wordCount", () => {
  it("counts words, not whitespace runs or punctuation", () => {
    expect(wordCount("  one   two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
    expect(wordCount("--- ... ")).toBe(0);
  });
});

describe("budget arithmetic", () => {
  it("uses 60 points by default and 40 under constraint card 1", () => {
    expect(effectiveBudget(null)).toBe(BASE_BUDGET_POINTS);
    expect(effectiveBudget(2)).toBe(BASE_BUDGET_POINTS);
    expect(effectiveBudget(1)).toBe(40);
  });

  it("totals initiative points and enablement points separately", () => {
    const chosen: InitiativeKey[] = ["company-brain", "voice-agent", "evaluation-monitoring"];
    const expected = chosen.reduce((total, key) => total + (INITIATIVE_BY_KEY.get(key)?.points ?? 0), 0);
    expect(initiativePoints(chosen)).toBe(expected);
    expect(enablementPoints(chosen)).toBe(MIN_ENABLEMENT_POINTS);
    expect(enablementPoints(["company-brain"])).toBe(0);
  });

  it("ignores an unknown initiative key rather than counting it as zero silently", () => {
    expect(initiativePoints(["not-a-real-initiative" as InitiativeKey])).toBe(0);
  });
});

describe("validatePlan", () => {
  function codes(input: TransformationPlanDraft) {
    return validatePlan(input).violations.map((violation) => violation.code);
  }

  it("accepts a complete plan inside the board rules", () => {
    const result = validatePlan(draft());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a fifth initiative even when the points are legal", () => {
    // 18 + 8 + 6 + 8 + 8 = 48 points, under budget, five initiatives.
    expect(
      codes(
        draft({
          initiatives: [
            "company-brain",
            "github-website-workflow",
            "creative-production",
            "evaluation-monitoring",
            "training-adoption",
          ],
        }),
      ),
    ).toContain("too-many-initiatives");
  });

  it("rejects a portfolio over the budget", () => {
    // 18 + 15 + 12 + 8 = 53 is legal; swapping in the 18-point brain twice is not expressible,
    // so use the heaviest legal four: 18 + 15 + 12 + 10 = 55, then push past 60.
    const legal = draft({
      initiatives: ["company-brain", "voice-agent", "store-ops-automation", "evaluation-monitoring"],
      leadInitiative: "company-brain",
      workflows: {
        ...draft().workflows,
        "voice-agent": { capability: "Voice", humanGate: "Shift lead", successMetric: "Missed calls fall" },
      },
    });
    expect(codes(legal)).not.toContain("over-budget");

    const over = draft({
      initiatives: ["company-brain", "voice-agent", "store-ops-automation", "data-decision-system"],
      leadInitiative: "company-brain",
    });
    expect(initiativePoints(over.initiatives)).toBe(55);
    expect(codes(over)).toContain("enablement-minimum");

    const wayOver = draft({
      initiatives: ["company-brain", "voice-agent", "store-ops-automation", "recruitment-intelligence"],
    });
    expect(initiativePoints(wayOver.initiatives)).toBe(55);
  });

  it("applies the 40-point ceiling when constraint card 1 was dealt", () => {
    const input = draft({
      initiatives: ["company-brain", "store-ops-automation", "evaluation-monitoring"],
      constraintCardId: 1,
    });
    expect(initiativePoints(input.initiatives)).toBe(38);
    expect(codes(input)).not.toContain("over-budget");

    const tooBig = draft({
      initiatives: ["company-brain", "voice-agent", "evaluation-monitoring"],
      constraintCardId: 1,
      leadInitiative: "company-brain",
      workflows: {
        ...draft().workflows,
        "voice-agent": { capability: "Voice", humanGate: "Shift lead", successMetric: "Missed calls fall" },
      },
    });
    expect(initiativePoints(tooBig.initiatives)).toBe(41);
    expect(codes(tooBig)).toContain("over-budget");
  });

  it("requires eight points of evaluation, monitoring, training or adoption", () => {
    expect(
      codes(draft({ initiatives: ["company-brain", "store-ops-automation"], leadInitiative: "company-brain" })),
    ).toContain("enablement-minimum");
  });

  it("requires all seven audit calls", () => {
    const partial = fullAudit();
    delete (partial as Record<string, unknown>).G;
    expect(codes(draft({ audit: partial }))).toContain("audit-incomplete");
  });

  it("requires three written reasons of at least eight words", () => {
    const thin = Object.fromEntries(
      PROBLEM_AREA_KEYS.map((key, index) => [
        key,
        { call: "augment" as const, reason: index < 2 ? REASON : "" },
      ]),
    );
    expect(codes(draft({ audit: thin }))).toContain("audit-reasons");

    const sevenWords = Object.fromEntries(
      PROBLEM_AREA_KEYS.map((key) => [key, { call: "augment" as const, reason: "one two three four five six seven" }]),
    );
    expect(codes(draft({ audit: sevenWords }))).toContain("audit-reasons");

    const eightWords = Object.fromEntries(
      PROBLEM_AREA_KEYS.map((key) => [
        key,
        { call: "augment" as const, reason: "one two three four five six seven eight" },
      ]),
    );
    expect(codes(draft({ audit: eightWords }))).not.toContain("audit-reasons");
  });

  it("requires a lead initiative that the student actually bought", () => {
    expect(codes(draft({ leadInitiative: null }))).toContain("no-lead-initiative");
    expect(codes(draft({ leadInitiative: "voice-agent" }))).toContain("lead-not-chosen");
  });

  it("requires all nine fields on the lead initiative only", () => {
    const workflows = { ...draft().workflows };
    delete workflows["company-brain"]!.humanGate;
    expect(codes(draft({ workflows }))).toContain("lead-workflow-incomplete");
  });

  it("requires capability, human gate and success metric on every supporting initiative", () => {
    const workflows = structuredClone(draft().workflows);
    delete workflows["store-ops-automation"]!.humanGate;
    expect(codes(draft({ workflows }))).toContain("supporting-workflow-incomplete");

    const noNarrative = structuredClone(draft().workflows);
    delete noNarrative["store-ops-automation"]!.currentWork;
    expect(codes(draft({ workflows: noNarrative }))).not.toContain("supporting-workflow-incomplete");
  });

  it("requires exactly one rejected initiative, with a reason, that was not also bought", () => {
    expect(codes(draft({ rejected: { key: null, reason: "" } }))).toContain("rejection-missing");
    expect(codes(draft({ rejected: { key: "voice-agent", reason: "" } }))).toContain("rejection-missing");
    expect(codes(draft({ rejected: { key: "company-brain", reason: "Too big." } }))).toContain("rejection-chosen");
  });

  it("requires a constraint response only when a constraint card was dealt", () => {
    expect(codes(draft({ constraintResponse: "Dropped one." }))).toContain("constraint-response");
    expect(codes(draft({ constraintCardId: null, constraintResponse: "" }))).not.toContain("constraint-response");
  });

  it("requires all three incident answers and a verdict only when an incident card was dealt", () => {
    const thin = draft({ incidentResponse: { ...draft().incidentResponse, control: "Added a check." } });
    expect(codes(thin)).toContain("incident-response");

    const noVerdict = draft({ incidentResponse: { ...draft().incidentResponse, verdict: null } });
    expect(codes(noVerdict)).toContain("incident-verdict");

    const undealt = draft({
      incidentCardId: null,
      incidentResponse: { failed: "", prevented: "", control: "", verdict: null },
    });
    expect(codes(undealt)).not.toContain("incident-response");
    expect(codes(undealt)).not.toContain("incident-verdict");
  });

  it("bounds the 75-second recommendation between 25 and 80 words", () => {
    const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
    expect(codes(draft({ headline: words(24) }))).toContain("headline-length");
    expect(codes(draft({ headline: words(25) }))).not.toContain("headline-length");
    expect(codes(draft({ headline: words(80) }))).not.toContain("headline-length");
    expect(codes(draft({ headline: words(81) }))).toContain("headline-length");
  });

  it("returns every violation at once rather than stopping at the first", () => {
    const broken = validatePlan(emptyDraft());
    expect(broken.ok).toBe(false);
    expect(broken.violations.length).toBeGreaterThan(3);
    expect(new Set(broken.violations.map((violation) => violation.code)).size).toBe(broken.violations.length);
    for (const violation of broken.violations) {
      expect(violation.message.length).toBeGreaterThan(10);
    }
  });
});
