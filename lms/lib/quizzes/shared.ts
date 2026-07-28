// Quiz JSON parsing shared by the student (lib/quizzes) and instructor
// (lib/quizzes/instructor) repositories. The MODULES stay separate on purpose
// (isDiagnostic visibility); only these pure, defensive parsers are common.

export type StoredQuestion = { q: string; options: string[]; correctIndex: number };

/** Quiz.questions parsed defensively — malformed items are dropped. */
export function parseQuestions(raw: unknown): StoredQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { q, options, correctIndex } = item as Record<string, unknown>;
    if (
      typeof q === "string" &&
      Array.isArray(options) &&
      options.every((o) => typeof o === "string") &&
      typeof correctIndex === "number"
    ) {
      out.push({ q, options: options as string[], correctIndex });
    }
  }
  return out;
}

/** QuizAttempt.answers → one choice index per question (-1 when missing). */
export function parseChoices(raw: unknown, count: number): number[] {
  const choices =
    raw && typeof raw === "object" && Array.isArray((raw as { choices?: unknown }).choices)
      ? ((raw as { choices: unknown[] }).choices as unknown[])
      : [];
  return Array.from({ length: count }, (_, i) =>
    typeof choices[i] === "number" ? (choices[i] as number) : -1,
  );
}
