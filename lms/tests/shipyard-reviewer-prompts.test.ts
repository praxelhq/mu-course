// The prompt is the product here, so the things that must be true of it are
// asserted rather than eyeballed: the cached prefix is stable, the bar and the
// criterion ids are in it verbatim, and nothing per-submission leaks into the
// half that is supposed to be cacheable.

import { describe, expect, it } from "vitest";
import { CHECKPOINT_DEFINITIONS, checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { emptySignals } from "@/lib/tracker/types";
import {
  buildEscalationPrompt,
  buildPreflightPrompt,
  buildVerdictPrompt,
  buildVerdictSystemPrompt,
  isModelReviewed,
  PROMPT_VERSION,
  REVIEWED_CHECKPOINT_KEYS,
} from "@/lib/shipyard/reviewer/prompts";
import type { VerdictOutput } from "@/lib/shipyard/reviewer/schemas";

const IDEA = checkpointDefinition("idea");
const WORKING = checkpointDefinition("working");
const LAUNCH = checkpointDefinition("launch");

const promptCheckpoint = (def: typeof IDEA) => ({
  key: def.key,
  title: def.title,
  barMarkdown: def.barMarkdown,
  rubric: def.rubric,
});

const submission = { fields: { productName: "DabbaRoute", signupCount: 41 } };

describe("the cached system prefix", () => {
  it("names the prompt version", () => {
    expect(buildVerdictSystemPrompt(promptCheckpoint(IDEA))).toContain(PROMPT_VERSION);
  });

  it("carries the published bar verbatim", () => {
    const system = buildVerdictSystemPrompt(promptCheckpoint(IDEA));
    expect(system).toContain(IDEA.barMarkdown);
  });

  it("carries every criterion id and its bar clause verbatim", () => {
    for (const def of CHECKPOINT_DEFINITIONS) {
      if (!isModelReviewed(def.key)) continue;
      const system = buildVerdictSystemPrompt(promptCheckpoint(def));
      for (const criterion of def.rubric.criteria) {
        expect(system, `${def.key}/${criterion.id}`).toContain(criterion.id);
        expect(system, `${def.key}/${criterion.id} clause`).toContain(criterion.clause);
        expect(system).toContain(criterion.passThreshold);
      }
    }
  });

  it("is identical for two different submissions of the same checkpoint", () => {
    const a = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
    });
    const b = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission: { fields: { productName: "GalatSawaal" } },
      attempt: 4,
      previousReasons: [{ criterion: "audience", met: false, note: "too broad" }],
      signals: emptySignals(new Date("2026-09-15")),
      images: [{ dataUrl: "data:image/png;base64,AAAA", label: "image 1 of 1" }],
    });
    expect(a.system).toBe(b.system);
  });

  it("differs between checkpoints", () => {
    expect(buildVerdictSystemPrompt(promptCheckpoint(IDEA))).not.toBe(
      buildVerdictSystemPrompt(promptCheckpoint(WORKING)),
    );
  });

  it("tells the money and launch reviewers the metric half is decided elsewhere", () => {
    for (const key of ["money", "launch"] as const) {
      const system = buildVerdictSystemPrompt(promptCheckpoint(checkpointDefinition(key)));
      expect(system).toMatch(/metric half/);
      expect(system).toMatch(/Shipped\.money/);
    }
  });

  it("tells the design and working reviewers what the images are", () => {
    expect(buildVerdictSystemPrompt(promptCheckpoint(checkpointDefinition("design")))).toMatch(
      /hand-drawn screens/,
    );
    expect(buildVerdictSystemPrompt(promptCheckpoint(WORKING))).toMatch(/headless-browser render/);
  });

  it("states the trust rules the pipeline depends on", () => {
    const system = buildVerdictSystemPrompt(promptCheckpoint(IDEA));
    expect(system).toMatch(/0\.7/); // the confidence floor
    expect(system).toMatch(/contradictions/);
    expect(system).toMatch(/needs_human/);
    expect(system).toMatch(/never learn the student's name/);
    expect(system).toMatch(/no exclamation marks/);
  });

  it("covers the five model-reviewed checkpoints and not workflow", () => {
    expect([...REVIEWED_CHECKPOINT_KEYS]).toEqual(["idea", "design", "working", "money", "launch"]);
    expect(isModelReviewed("workflow")).toBe(false);
  });
});

describe("the per-submission user content", () => {
  it("puts every field in, tagged by key", () => {
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("<productName>");
    expect(text).toContain("DabbaRoute");
    expect(text).toContain("<signupCount>");
    expect(text).toContain("41");
  });

  it("does not mention the previous attempt on a first submission", () => {
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
      previousReasons: [{ criterion: "audience", met: false, note: "too broad" }],
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).not.toMatch(/Last time/);
  });

  it("lists the previously unmet clauses on a resubmit", () => {
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 2,
      previousReasons: [
        { criterion: "audience", met: false, note: "'small businesses' is not an audience" },
        { criterion: "one-liner", met: true, note: "fine" },
      ],
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("This is attempt 2");
    expect(text).toContain("audience: 'small businesses' is not an audience");
    expect(text).not.toContain("one-liner: fine");
  });

  it("includes the render and calls out an empty shell", () => {
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(WORKING),
      submission: { fields: { liveUrl: "https://x.example.com" } },
      render: { domText: "Loading…", screenshotNote: "a white page" },
      attempt: 1,
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("<headless_render>");
    expect(text).toMatch(/empty shell/);
  });

  it("formats tracker money out of minor units", () => {
    const signals = { ...emptySignals(new Date("2026-09-15")), grossTotal: 4200, payingCustomers: 3 };
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(LAUNCH),
      submission: { fields: { launchWriteup: "…" } },
      signals,
      attempt: 1,
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("gross payments: 42.00 USD");
    expect(text).toContain("paying customers: 3");
    expect(text).toContain("blocking flags: none");
  });

  it("appends images as image_url parts after the text, and labels them", () => {
    const { user } = buildVerdictPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
      images: [
        { dataUrl: "data:image/png;base64,AAAA", label: "image 1 of 2 (tally.png)" },
        { dataUrl: "data:image/jpeg;base64,BBBB", label: "image 2 of 2 (count.jpg)" },
      ],
    });
    expect(user).toHaveLength(3);
    expect(user[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAA", detail: "high" },
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("image 1 of 2 (tally.png); image 2 of 2 (count.jpg)");
  });
});

describe("buildPreflightPrompt", () => {
  it("never carries a bar or a rubric", () => {
    const { system, user } = buildPreflightPrompt({ checkpointKey: "idea", text: "asdf" });
    expect(system).not.toContain(IDEA.barMarkdown);
    expect(system).toContain(PROMPT_VERSION);
    expect(system).toMatch(/blank/);
    expect(system).toMatch(/spam/);
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("<text>\nasdf\n</text>");
  });

  it("tells the model why the heuristics could not decide", () => {
    const { user } = buildPreflightPrompt({
      checkpointKey: "money",
      text: "ok",
      ambiguityNotes: ["the spam heuristic was inconclusive"],
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("the spam heuristic was inconclusive");
  });
});

describe("buildEscalationPrompt", () => {
  const first: VerdictOutput = {
    verdict: "return",
    confidence: 0.55,
    reasons: [{ criterion: "audience", met: false, note: "'students' is not narrow enough" }],
    rubricScores: { audience: 30 },
    contradictions: [],
    flags: [],
    summaryForStudent: "Narrow the audience and resubmit.",
  };

  it("keeps the verdict prefix and adds the second-opinion contract", () => {
    const { system } = buildEscalationPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
      firstVerdict: first,
      escalationReasons: ["confidence 0.55 is below 0.7"],
    });
    expect(system).toContain(IDEA.barMarkdown);
    expect(system).toContain("agreesWithFirstVerdict");
    expect(system).toContain("humanNote");
    expect(system).toMatch(/SECOND OPINION/);
  });

  it("shows the first review and why it was escalated", () => {
    const { user } = buildEscalationPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
      firstVerdict: first,
      escalationReasons: ["confidence 0.55 is below 0.7"],
      studentDispute: "I did name the audience, in the second paragraph.",
    });
    const text = user[0].type === "text" ? user[0].text : "";
    expect(text).toContain("<first_review>");
    expect(text).toContain("audience: NOT met");
    expect(text).toContain("confidence 0.55 is below 0.7");
    expect(text).toContain("I did name the audience");
  });

  it("carries the images through", () => {
    const { user } = buildEscalationPrompt({
      checkpoint: promptCheckpoint(IDEA),
      submission,
      attempt: 1,
      firstVerdict: first,
      escalationReasons: [],
      images: [{ dataUrl: "data:image/png;base64,AAAA", label: "image 1 of 1" }],
    });
    expect(user.filter((p) => p.type === "image_url")).toHaveLength(1);
    expect(user[0].type).toBe("text");
  });
});
