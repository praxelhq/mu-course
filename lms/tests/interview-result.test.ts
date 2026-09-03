import { describe, expect, it } from "vitest";
import { buildInterviewResult, formatInterviewResultText } from "../lib/interview/result";

// Students now see their own score and the grader's reasoning. What they must
// never see is why an interview was escalated, how confident the grader was,
// or which integrity flags fired — that hands a cheater a feedback loop.

const graded = {
  status: "graded",
  completedAt: new Date("2026-09-04T10:00:00.000Z"),
  rubricScores: {
    conceptual_understanding: { score: 36, rationale: "Reasoned about failure modes." },
    work_integrity: { score: 31, rationale: "Defended the trigger criteria." },
  },
};

describe("what the student sees", () => {
  it("shows both axes, their reasoning, and the total", () => {
    const view = buildInterviewResult(graded);
    expect(view.state).toBe("ready");
    if (view.state !== "ready") return;
    expect(view.axes.map((a) => a.score)).toEqual([36, 31]);
    expect(view.axes[0].rationale).toMatch(/failure modes/);
    expect(view.total).toBe(67);
    expect(view.max).toBe(100);
  });

  it("waits while grading is still queued", () => {
    expect(buildInterviewResult({ ...graded, rubricScores: null }).state).toBe("grading");
  });

  it("says nothing at all before an interview exists", () => {
    expect(buildInterviewResult(null).state).toBe("none");
    expect(buildInterviewResult({ ...graded, status: "pending", rubricScores: null }).state).toBe("none");
  });

  it("does not leak a result mid-interview", () => {
    expect(buildInterviewResult({ ...graded, status: "live" }).state).toBe("live");
  });
});

describe("what the student must NOT see", () => {
  it("never carries confidence, flags, or the escalation reason", () => {
    // The row carries far more than the view; anything not allow-listed must
    // not survive into the response body.
    const row = {
      ...graded,
      confidence: 0.42,
      escalationReason: "possible coaching detected",
      systemFlags: ["video-lost"],
    };
    const view = buildInterviewResult(row);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toMatch(/confidence/i);
    expect(serialised).not.toMatch(/escalat/i);
    expect(serialised).not.toMatch(/coaching/i);
    expect(serialised).not.toMatch(/video-lost/);
    expect(serialised).not.toMatch(/0\.42/);
  });

  it("shows an escalated interview exactly like a graded one", () => {
    // Branching the UI on escalation would tell the student they were flagged.
    const escalated = buildInterviewResult({ ...graded, status: "escalated" });
    expect(escalated).toEqual(buildInterviewResult(graded));
  });
});

describe("the shape the worker actually writes", () => {
  // grade-interview flattens the grade: bare numbers per axis, reasoning in a
  // sibling `rationales` object. Reading only scores[key] gave the student a
  // score with no feedback at all, which is what shipped.
  const flattened = {
    status: "graded",
    completedAt: new Date("2026-09-04T10:00:00.000Z"),
    rubricScores: {
      conceptual_understanding: 38,
      work_integrity: 32,
      total: 70,
      rationales: {
        conceptual_understanding: "Solid on context separation and data privacy distinctions.",
        work_integrity: "Defended the trigger choice; error handling was thin.",
      },
      flags: ["possible-coaching"],
    },
  };

  it("shows the reasoning that lives in the sibling object", () => {
    const view = buildInterviewResult(flattened);
    if (view.state !== "ready") throw new Error("expected ready");
    expect(view.axes[0].score).toBe(38);
    expect(view.axes[0].rationale).toMatch(/context separation/);
    expect(view.axes[1].rationale).toMatch(/trigger choice/);
  });

  it("still does not leak the flags stored alongside them", () => {
    const serialised = JSON.stringify(buildInterviewResult(flattened));
    expect(serialised).not.toMatch(/possible-coaching/);
    expect(serialised).not.toMatch(/flags/);
  });

  it("totals from the axes rather than trusting the stored total", () => {
    const view = buildInterviewResult(flattened);
    if (view.state !== "ready") throw new Error("expected ready");
    expect(view.total).toBe(70);
    expect(view.axes).toHaveLength(2);
  });
});

describe("historical rows still render", () => {
  it("reads the retired four-category rubric at 25 points each", () => {
    const view = buildInterviewResult({
      ...graded,
      rubricScores: {
        industry_command: { score: 20, rationale: "a" },
        defence_of_submissions: { score: 18, rationale: "b" },
        operators_loop: { score: 15, rationale: "c" },
        transfer: { score: 12, rationale: "d" },
      },
    });
    expect(view.state).toBe("ready");
    if (view.state !== "ready") return;
    expect(view.max).toBe(100);
    expect(view.axes[0].max).toBe(25);
    expect(view.total).toBe(65);
  });

  it("survives a legacy row that stored a bare number", () => {
    const view = buildInterviewResult({
      ...graded,
      rubricScores: { conceptual_understanding: 30, work_integrity: 20 },
    });
    if (view.state !== "ready") throw new Error("expected ready");
    expect(view.total).toBe(50);
    expect(view.axes[0].rationale).toBe("");
  });
});

describe("download", () => {
  it("writes the score and every rationale into the text file", () => {
    const view = buildInterviewResult(graded);
    if (view.state !== "ready") throw new Error("expected ready");
    const text = formatInterviewResultText(view, "Asha Rao");
    expect(text).toContain("Asha Rao");
    expect(text).toContain("67 / 100");
    expect(text).toContain("Conceptual understanding: 36 / 50");
    expect(text).toContain("Defended the trigger criteria.");
  });

  it("does not put anything confidential in the downloadable file", () => {
    const view = buildInterviewResult({ ...graded, status: "escalated" });
    if (view.state !== "ready") throw new Error("expected ready");
    const text = formatInterviewResultText(view, "Asha Rao").toLowerCase();
    expect(text).not.toMatch(/confidence|escalat|coaching|flag/);
  });
});
