import { describe, expect, it } from "vitest";
import {
  buildReleasedStableLines,
  parseStableAnswerPayload,
  parseStableQuestions,
  parseStoredStableAnswers,
  questionsForStableAttempt,
  scoreStableChoices,
  stableQuestionsContentHash,
  storeStableAnswers,
} from "../lib/quizzes/versioned";

const raw = [
  {
    itemVersionId: "S4-Q1@1",
    q: "Which contract is strongest?",
    options: [
      { optionId: "feature-list", text: "Longest feature list" },
      { optionId: "end-to-end", text: "Observable end-to-end behavior" },
      { optionId: "highest-mrr", text: "Highest MRR" },
      { optionId: "visual", text: "Most visual" },
    ],
    correctOptionId: "end-to-end",
    rationale: "Feasible behavior is the build target.",
  },
  {
    itemVersionId: "S4-Q2@1",
    q: "What is safe evidence?",
    options: [
      { optionId: "secret", text: "A production credential" },
      { optionId: "fixture", text: "A labelled fictional fixture" },
    ],
    correctOptionId: "fixture",
  },
];

describe("stable-ID quiz contract", () => {
  it("fails the complete contract closed instead of silently dropping malformed items", () => {
    expect(parseStableQuestions(raw)).toHaveLength(2);
    expect(parseStableQuestions([...raw, { q: "missing IDs" }])).toBeNull();
    expect(
      parseStableQuestions([
        ...raw,
        { ...raw[0], itemVersionId: "S4-Q3@1", correctOptionId: "not-an-option" },
      ]),
    ).toBeNull();
    expect(parseStableQuestions([raw[0], raw[0]])).toBeNull();
    expect(
      parseStableQuestions([
        { ...raw[0], q: "   ", itemVersionId: "S4-Q3@1" },
      ]),
    ).toBeNull();
    expect(
      parseStableQuestions([
        {
          ...raw[0],
          itemVersionId: "S4-Q3@1",
          options: [{ optionId: "blank", text: "" }, raw[0].options[1]],
        },
      ]),
    ).toBeNull();
    expect(
      parseStableQuestions([
        {
          ...raw[0],
          itemVersionId: "S4-Q3@1",
          options: [{ id: "legacy", text: "Mixed representation" }, raw[0].options[1]],
        },
      ]),
    ).toBeNull();
  });

  it("accepts authored prompt text and rejects conflicting prompt/q text", () => {
    expect(
      parseStableQuestions([{ ...raw[0], q: undefined, prompt: raw[0].q }])?.[0].q,
    ).toBe(raw[0].q);
    expect(parseStableQuestions([{ ...raw[0], prompt: "A conflicting prompt" }])).toBeNull();
  });

  it("shuffles items and options deterministically without exposing the answer key", () => {
    const questions = parseStableQuestions(raw)!;
    const first = questionsForStableAttempt(questions, "quiz:user:1");
    const again = questionsForStableAttempt(questions, "quiz:user:1");
    expect(again).toEqual(first);
    expect(JSON.stringify(first)).not.toContain("correctOptionId");
    for (const displayed of first) {
      const canonical = raw.find((question) => question.itemVersionId === displayed.itemVersionId)!;
      expect(new Set(displayed.options.map((option) => option.optionId))).toEqual(
        new Set(canonical.options.map((option) => option.optionId)),
      );
    }
    expect(stableQuestionsContentHash(questions)).toMatch(/^[0-9a-f]{64}$/);
    expect(stableQuestionsContentHash(questions)).toBe(stableQuestionsContentHash(questions));
  });

  it("scores stable IDs independent of display position", () => {
    const questions = parseStableQuestions(raw)!;
    const displayed = questionsForStableAttempt(questions, "quiz:user:1");
    const answers = [
      { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
      { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
    ];
    const parsed = parseStableAnswerPayload(answers, questions);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.choices.map((choice) => choice.itemVersionId)).toEqual([
      "S4-Q1@1",
      "S4-Q2@1",
    ]);
    expect(scoreStableChoices(questions, parsed.choices)).toEqual({
      correctCount: 2,
      scorePct: 100,
    });

    const saved = storeStableAnswers(parsed.choices, displayed);
    expect(parseStoredStableAnswers(saved, questions)).toEqual(saved);
    expect(JSON.stringify(saved)).not.toMatch(/correctOptionId|correctIndex/);
    const released = buildReleasedStableLines(questions, saved);
    const firstDisplayed = saved.displayOrder[0];
    expect(released?.[0]).toMatchObject({
      itemVersionId: firstDisplayed.itemVersionId,
    });
    const q1 = released?.find((line) => line.itemVersionId === "S4-Q1@1");
    expect(q1).toMatchObject({
      itemVersionId: "S4-Q1@1",
      selectedOptionId: "end-to-end",
      correctOptionId: "end-to-end",
      correct: true,
      rationale: "Feasible behavior is the build target.",
    });
    expect(released?.[0].options.map((option) => option.optionId)).toEqual(
      firstDisplayed.optionIds,
    );
  });

  it("rejects position answers, missing/duplicate items, and forged option IDs", () => {
    const questions = parseStableQuestions(raw)!;
    expect(parseStableAnswerPayload([0, 1], questions).ok).toBe(false);
    expect(
      parseStableAnswerPayload(
        [
          { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
          { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
        ],
        questions,
      ).ok,
    ).toBe(false);
    expect(
      parseStableAnswerPayload(
        [
          { itemVersionId: "S4-Q1@1", selectedOptionId: "forged" },
          { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
        ],
        questions,
      ).ok,
    ).toBe(false);
  });

  it("rejects a tampered saved display order", () => {
    const questions = parseStableQuestions(raw)!;
    const displayed = questionsForStableAttempt(questions, "quiz:user:1");
    const parsed = parseStableAnswerPayload(
      [
        { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
        { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
      ],
      questions,
    );
    if (!parsed.ok) throw new Error("fixture should parse");
    const stored = storeStableAnswers(parsed.choices, displayed);
    stored.displayOrder[0].optionIds[0] = "forged";
    expect(parseStoredStableAnswers(stored, questions)).toBeNull();
  });
});
