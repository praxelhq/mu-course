import { prisma } from "@/lib/db";
import { parseChoices, parseQuestions, type StoredQuestion } from "./shared";

// INSTRUCTOR-ONLY quiz reads. This module is a separate import path
// from lib/quizzes on purpose: it is the only place isDiagnostic-flagged data
// is visible, aggregated, or returned. Nothing here may ever be imported from
// a student-facing route or page.

export type InstructorQuizSummary = {
  id: string;
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  questionCount: number;
  attemptCount: number;
  avgScorePct: number | null;
};

/** Every quiz — diagnostics included — with attempt count and average. */
export async function listQuizzesForInstructor(): Promise<InstructorQuizSummary[]> {
  const [quizzes, aggregates] = await Promise.all([
    prisma.quiz.findMany({
      select: { id: true, sessionNo: true, title: true, isDiagnostic: true, questions: true },
      orderBy: [{ sessionNo: "asc" }, { id: "asc" }],
    }),
    prisma.quizAttempt.groupBy({
      by: ["quizId"],
      _count: { _all: true },
      _avg: { scorePct: true },
    }),
  ]);
  const byQuiz = new Map(aggregates.map((a) => [a.quizId, a]));
  return quizzes.map((q) => {
    const agg = byQuiz.get(q.id);
    return {
      id: q.id,
      sessionNo: q.sessionNo,
      title: q.title,
      isDiagnostic: q.isDiagnostic,
      questionCount: parseQuestions(q.questions).length,
      attemptCount: agg?._count._all ?? 0,
      avgScorePct: agg?._avg.scorePct ?? null,
    };
  });
}

export type SectionSignalRow = {
  sectionId: string;
  sectionCode: string;
  attemptCount: number;
  avgScorePct: number | null;
  /** Percentage of the section's attempts that answered question i correctly. */
  perQuestionCorrectPct: number[];
};

export type InstructorQuizResults = {
  id: string;
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  questions: StoredQuestion[];
  attemptCount: number;
  avgScorePct: number | null;
  /** The per-section signal table (for a diagnostic: the pre-read signal). */
  perSection: SectionSignalRow[];
};

/**
 * Full results for one quiz: per-section attempt counts, averages and
 * per-question correct-rates. For the diagnostic this table IS the Session 1
 * pre-read signal.
 */
export async function getQuizResults(quizId: string): Promise<InstructorQuizResults | null> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, sessionNo: true, title: true, isDiagnostic: true, questions: true },
  });
  if (!quiz) return null;
  const questions = parseQuestions(quiz.questions);

  const [sections, attempts] = await Promise.all([
    prisma.section.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    prisma.quizAttempt.findMany({
      where: { quizId },
      select: { scorePct: true, answers: true, user: { select: { sectionId: true } } },
    }),
  ]);

  type Acc = { count: number; scoreSum: number; correctPerQ: number[] };
  const bySection = new Map<string, Acc>();
  for (const s of sections) {
    bySection.set(s.id, { count: 0, scoreSum: 0, correctPerQ: questions.map(() => 0) });
  }
  for (const a of attempts) {
    const acc = a.user.sectionId ? bySection.get(a.user.sectionId) : undefined;
    if (!acc) continue;
    acc.count += 1;
    acc.scoreSum += a.scorePct;
    const choices = parseChoices(a.answers, questions.length);
    questions.forEach((q, i) => {
      if (choices[i] === q.correctIndex) acc.correctPerQ[i] += 1;
    });
  }

  const perSection: SectionSignalRow[] = sections.map((s) => {
    const acc = bySection.get(s.id)!;
    return {
      sectionId: s.id,
      sectionCode: s.code,
      attemptCount: acc.count,
      avgScorePct: acc.count > 0 ? acc.scoreSum / acc.count : null,
      perQuestionCorrectPct: acc.correctPerQ.map((n) =>
        acc.count > 0 ? Math.round((n / acc.count) * 100) : 0,
      ),
    };
  });

  return {
    id: quiz.id,
    sessionNo: quiz.sessionNo,
    title: quiz.title,
    isDiagnostic: quiz.isDiagnostic,
    questions,
    attemptCount: attempts.length,
    avgScorePct:
      attempts.length > 0
        ? attempts.reduce((sum, a) => sum + a.scorePct, 0) / attempts.length
        : null,
    perSection,
  };
}

export type CreateQuizInput = {
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  questions: StoredQuestion[];
};

/**
 * Create a quiz for a session (all sections) and link it into the session
 * page so gate arming and the hub quiz slot pick it up. Gates start absent
 * (= locked) until the instructor arms a section.
 */
export async function createQuiz(input: CreateQuizInput): Promise<{ id: string }> {
  const page = await prisma.sessionPage.findUnique({
    where: { sessionNo: input.sessionNo },
    select: { id: true, linkedQuizIds: true },
  });
  if (!page) throw new Error(`createQuiz: no session page for session ${input.sessionNo}`);
  const sections = await prisma.section.findMany({ select: { id: true } });

  return prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.create({
      data: {
        sessionNo: input.sessionNo,
        title: input.title,
        isDiagnostic: input.isDiagnostic,
        sectionIds: sections.map((s) => s.id),
        questions: input.questions,
      },
      select: { id: true },
    });
    await tx.sessionPage.update({
      where: { id: page.id },
      data: { linkedQuizIds: [...page.linkedQuizIds, quiz.id] },
    });
    return quiz;
  });
}
