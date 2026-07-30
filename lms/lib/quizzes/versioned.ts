import { createHash } from "node:crypto";

export const STABLE_QUIZ_CONTRACT_VERSION = 1;

export type StableQuizOption = {
  optionId: string;
  text: string;
};

export type StableStoredQuestion = {
  itemVersionId: string;
  q: string;
  options: StableQuizOption[];
  correctOptionId: string;
  rationale?: string;
  feedbackMd?: string;
};

export type StableStudentQuestion = Omit<StableStoredQuestion, "correctOptionId" | "rationale" | "feedbackMd">;

export type StableChoice = {
  itemVersionId: string;
  selectedOptionId: string;
};

export type StoredStableAnswers = {
  contractVersion: typeof STABLE_QUIZ_CONTRACT_VERSION;
  choices: StableChoice[];
  displayOrder: { itemVersionId: string; optionIds: string[] }[];
};

export type StableResultLine = {
  itemVersionId: string;
  q: string;
  options: StableQuizOption[];
  selectedOptionId: string;
  correctOptionId: string;
  correct: boolean;
  rationale?: string;
  feedbackMd?: string;
  /** Legacy-only positional fields stay absent from stable-ID responses. */
  yourAnswer?: never;
  correctAnswer?: never;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parse the complete stable-ID contract or fail closed. Unlike the legacy
 * parser, this never drops malformed items: doing so would change scoring.
 */
export function parseStableQuestions(raw: unknown): StableStoredQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const questions: StableStoredQuestion[] = [];
  const itemIds = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (!nonEmptyString(item.itemVersionId) || itemIds.has(item.itemVersionId)) return null;

    // Importers may normalize the authored `prompt` field to `q`. Accept
    // either spelling, but reject missing/blank/conflicting prompt text and
    // any legacy position-keyed answer mixed into a stable-ID item.
    if (item.q !== undefined && !nonEmptyString(item.q)) return null;
    if (item.prompt !== undefined && !nonEmptyString(item.prompt)) return null;
    const q = nonEmptyString(item.q) ? item.q : nonEmptyString(item.prompt) ? item.prompt : null;
    if (
      !q ||
      (nonEmptyString(item.q) && nonEmptyString(item.prompt) && item.q !== item.prompt) ||
      item.correctIndex !== undefined ||
      !Array.isArray(item.options) ||
      item.options.length < 2
    ) {
      return null;
    }

    const optionIds = new Set<string>();
    const options: StableQuizOption[] = [];
    for (const optionValue of item.options) {
      if (!optionValue || typeof optionValue !== "object" || Array.isArray(optionValue)) {
        return null;
      }
      const option = optionValue as Record<string, unknown>;
      if (
        !nonEmptyString(option.optionId) ||
        option.id !== undefined ||
        !nonEmptyString(option.text) ||
        optionIds.has(option.optionId)
      ) {
        return null;
      }
      optionIds.add(option.optionId);
      options.push({ optionId: option.optionId, text: option.text });
    }

    if (!nonEmptyString(item.correctOptionId) || !optionIds.has(item.correctOptionId)) return null;
    if (item.rationale !== undefined && !nonEmptyString(item.rationale)) return null;
    if (item.feedbackMd !== undefined && !nonEmptyString(item.feedbackMd)) return null;

    itemIds.add(item.itemVersionId);
    questions.push({
      itemVersionId: item.itemVersionId,
      q,
      options,
      correctOptionId: item.correctOptionId,
      ...(typeof item.rationale === "string" ? { rationale: item.rationale } : {}),
      ...(typeof item.feedbackMd === "string" ? { feedbackMd: item.feedbackMd } : {}),
    });
  }

  return questions;
}

function rank(seed: string, identity: string): string {
  return createHash("sha256").update(seed).update("\0").update(identity).digest("hex");
}

/** Stable across retries/reloads for a supplied attempt seed; never position-scored. */
export function questionsForStableAttempt(
  questions: StableStoredQuestion[],
  attemptSeed: string,
): StableStudentQuestion[] {
  return [...questions]
    .sort(
      (left, right) =>
        rank(`${attemptSeed}\0items`, left.itemVersionId).localeCompare(
          rank(`${attemptSeed}\0items`, right.itemVersionId),
        ) || left.itemVersionId.localeCompare(right.itemVersionId),
    )
    .map((question) => ({
      itemVersionId: question.itemVersionId,
      q: question.q,
      options: [...question.options].sort(
        (left, right) =>
          rank(`${attemptSeed}\0${question.itemVersionId}`, left.optionId).localeCompare(
            rank(`${attemptSeed}\0${question.itemVersionId}`, right.optionId),
          ) || left.optionId.localeCompare(right.optionId),
      ),
    }));
}

/** Hash the validated immutable content, preserving its authored canonical order. */
export function stableQuestionsContentHash(questions: StableStoredQuestion[]): string {
  return createHash("sha256").update(JSON.stringify(questions)).digest("hex");
}

export type StableAnswerParseResult =
  | { ok: true; choices: StableChoice[] }
  | { ok: false; message: string };

/** Validate exactly one stable option ID for every frozen item version. */
export function parseStableAnswerPayload(
  raw: unknown,
  questions: StableStoredQuestion[],
): StableAnswerParseResult {
  if (!Array.isArray(raw) || raw.length !== questions.length) {
    return { ok: false, message: `Expected ${questions.length} stable-ID answers.` };
  }

  const questionById = new Map(questions.map((question) => [question.itemVersionId, question]));
  const choicesById = new Map<string, StableChoice>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Every answer must name an item version and option ID." };
    }
    const answer = value as Record<string, unknown>;
    if (!nonEmptyString(answer.itemVersionId) || !nonEmptyString(answer.selectedOptionId)) {
      return { ok: false, message: "Every answer must name an item version and option ID." };
    }
    if (choicesById.has(answer.itemVersionId)) {
      return { ok: false, message: `Duplicate answer for ${answer.itemVersionId}.` };
    }
    const question = questionById.get(answer.itemVersionId);
    if (!question) return { ok: false, message: `Unknown item version ${answer.itemVersionId}.` };
    if (!question.options.some((option) => option.optionId === answer.selectedOptionId)) {
      return { ok: false, message: `Unknown option for ${answer.itemVersionId}.` };
    }
    choicesById.set(answer.itemVersionId, {
      itemVersionId: answer.itemVersionId,
      selectedOptionId: answer.selectedOptionId,
    });
  }

  return {
    ok: true,
    choices: questions.map((question) => choicesById.get(question.itemVersionId)!),
  };
}

export function storeStableAnswers(
  choices: StableChoice[],
  displayedQuestions: StableStudentQuestion[],
): StoredStableAnswers {
  return {
    contractVersion: STABLE_QUIZ_CONTRACT_VERSION,
    choices,
    displayOrder: displayedQuestions.map((question) => ({
      itemVersionId: question.itemVersionId,
      optionIds: question.options.map((option) => option.optionId),
    })),
  };
}

/** Parse a saved attempt against its original frozen quiz content. */
export function parseStoredStableAnswers(
  raw: unknown,
  questions: StableStoredQuestion[],
): StoredStableAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Record<string, unknown>;
  if (stored.contractVersion !== STABLE_QUIZ_CONTRACT_VERSION) return null;

  const parsedChoices = parseStableAnswerPayload(stored.choices, questions);
  if (!parsedChoices.ok || !Array.isArray(stored.displayOrder)) return null;
  const choices = parsedChoices.choices;

  const expected = new Map(
    questions.map((question) => [
      question.itemVersionId,
      new Set(question.options.map((option) => option.optionId)),
    ]),
  );
  const displayOrder: StoredStableAnswers["displayOrder"] = [];
  const seenItems = new Set<string>();
  for (const value of stored.displayOrder) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (!nonEmptyString(item.itemVersionId) || seenItems.has(item.itemVersionId)) return null;
    if (!Array.isArray(item.optionIds) || !item.optionIds.every(nonEmptyString)) return null;
    const expectedOptions = expected.get(item.itemVersionId);
    if (!expectedOptions || item.optionIds.length !== expectedOptions.size) return null;
    const optionIds = item.optionIds as string[];
    if (new Set(optionIds).size !== optionIds.length || optionIds.some((id) => !expectedOptions.has(id))) {
      return null;
    }
    seenItems.add(item.itemVersionId);
    displayOrder.push({ itemVersionId: item.itemVersionId, optionIds });
  }
  if (seenItems.size !== questions.length) return null;

  return { contractVersion: STABLE_QUIZ_CONTRACT_VERSION, choices, displayOrder };
}

export function scoreStableChoices(
  questions: StableStoredQuestion[],
  choices: StableChoice[],
): { correctCount: number; scorePct: number } {
  const selected = new Map(choices.map((choice) => [choice.itemVersionId, choice.selectedOptionId]));
  const correctCount = questions.filter(
    (question) => selected.get(question.itemVersionId) === question.correctOptionId,
  ).length;
  return {
    correctCount,
    scorePct: Math.round((correctCount / questions.length) * 1_000) / 10,
  };
}

/** Reconstruct released feedback from IDs saved with the immutable attempt. */
export function buildReleasedStableLines(
  questions: StableStoredQuestion[],
  stored: StoredStableAnswers,
): StableResultLine[] | null {
  const questionById = new Map(questions.map((question) => [question.itemVersionId, question]));
  const selectedById = new Map(
    stored.choices.map((choice) => [choice.itemVersionId, choice.selectedOptionId]),
  );
  const lines: StableResultLine[] = [];
  for (const displayed of stored.displayOrder) {
    const canonical = questionById.get(displayed.itemVersionId);
    const selectedOptionId = selectedById.get(displayed.itemVersionId);
    if (!canonical || !selectedOptionId) return null;
    const optionById = new Map(
      canonical.options.map((option) => [option.optionId, option]),
    );
    const options = displayed.optionIds.map((optionId) => optionById.get(optionId));
    if (options.some((option) => option === undefined)) return null;
    lines.push({
      itemVersionId: canonical.itemVersionId,
      q: canonical.q,
      options: options as StableQuizOption[],
      selectedOptionId,
      correctOptionId: canonical.correctOptionId,
      correct: selectedOptionId === canonical.correctOptionId,
      ...(canonical.rationale ? { rationale: canonical.rationale } : {}),
      ...(canonical.feedbackMd ? { feedbackMd: canonical.feedbackMd } : {}),
    });
  }
  return lines;
}
