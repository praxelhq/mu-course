import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parentSessionPageIdFor, resolveGateDetail } from "@/lib/gates";
import { parseChoices, parseQuestions } from "./shared";

// THE single student-facing quiz repository module (CLAUDE.md
// invariant): every student-surface quiz read goes through here, and every
// RETROSPECTIVE surface (history, tallies, best-of) excludes isDiagnostic
// rows unconditionally at the query layer. The live TAKING path (armed quiz,
// submit, immediate result) deliberately does NOT filter on isDiagnostic —
// a diagnostic quiz is presented, administered and answered identically to a
// normal one, so nothing about taking it is detectable. No return type in
// this module ever carries an isDiagnostic field.
//
// Instructor-facing reads (which DO see diagnostics) live in
// lib/quizzes/instructor — a separate import path on purpose.

/** Mid-close grace: a submit still lands this many seconds after gate close. */
export const GRACE_SECONDS = 120;

/** How many attempts count toward the grade (best-of-three). */
export const BEST_OF = 3;

// ---------------------------------------------------------------------------
// Student-facing types — note: NO isDiagnostic field anywhere, by design.
// ---------------------------------------------------------------------------

export type StudentQuizQuestion = { q: string; options: string[] };

export type StudentQuizForTaking = {
  id: string;
  title: string;
  sessionNo: number;
  questions: StudentQuizQuestion[];
};

export type ArmedQuizResult =
  | { status: "ready"; quiz: StudentQuizForTaking }
  | { status: "attempted" }
  | { status: "closed" }
  | { status: "not_available" };

export type QuizResultLine = {
  q: string;
  options: string[];
  yourAnswer: number;
  correctAnswer: number;
  correct: boolean;
};

export type QuizResult = {
  quizId: string;
  title: string;
  scorePct: number;
  correctCount: number;
  questionCount: number;
  lines: QuizResultLine[];
};

export type SubmitOutcome =
  | { status: "ok"; result: QuizResult }
  | { status: "duplicate"; result: QuizResult }
  | { status: "closed" }
  | { status: "not_available" }
  | { status: "invalid"; message: string };

export type QuizHistoryEntry = {
  attemptId: string;
  quizId: string;
  title: string;
  sessionNo: number;
  scorePct: number;
  submittedAt: Date;
  /** True for the top-BEST_OF attempts; false = feedback only. */
  countsTowardGrade: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type QuizRow = {
  id: string;
  title: string;
  sessionNo: number;
  sectionIds: string[];
  questions: unknown;
};

const quizSelect = {
  id: true,
  title: true,
  sessionNo: true,
  sectionIds: true,
  questions: true,
} as const; // isDiagnostic deliberately NOT selected on the taking path

async function loadStudentAndQuiz(
  userId: string,
  quizId: string,
): Promise<{ sectionId: string; quiz: QuizRow } | null> {
  const [user, quiz] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { sectionId: true } }),
    prisma.quiz.findUnique({ where: { id: quizId }, select: quizSelect }),
  ]);
  if (!user?.sectionId || !quiz) return null;
  if (!quiz.sectionIds.includes(user.sectionId)) return null;
  return { sectionId: user.sectionId, quiz };
}

async function quizGateDetail(quizId: string, sectionId: string, userId: string, now: Date) {
  return resolveGateDetail(
    {
      targetType: "quiz",
      targetId: quizId,
      sectionId,
      parentSessionPageId: await parentSessionPageIdFor("quiz", quizId),
      userId,
    },
    now,
  );
}

function resultFor(quiz: QuizRow, choices: number[], scorePct: number): QuizResult {
  const questions = parseQuestions(quiz.questions);
  const lines: QuizResultLine[] = questions.map((question, i) => ({
    q: question.q,
    options: question.options,
    yourAnswer: choices[i],
    correctAnswer: question.correctIndex,
    correct: choices[i] === question.correctIndex,
  }));
  return {
    quizId: quiz.id,
    title: quiz.title,
    scorePct,
    correctCount: lines.filter((l) => l.correct).length,
    questionCount: questions.length,
    lines,
  };
}

// ---------------------------------------------------------------------------
// Live taking path (identical for every quiz — diagnostics included)
// ---------------------------------------------------------------------------

/**
 * The quiz as presented for taking: questions WITHOUT correct answers, only
 * when armed for the student's section and not yet attempted. Every
 * unavailable state maps to the same small set of statuses regardless of the
 * quiz's kind.
 */
export async function getArmedQuizForStudent(
  userId: string,
  quizId: string,
  now: Date = new Date(),
): Promise<ArmedQuizResult> {
  const ctx = await loadStudentAndQuiz(userId, quizId);
  if (!ctx) return { status: "not_available" };

  const attempted = await prisma.quizAttempt.findUnique({
    where: { quizId_userId: { quizId, userId } },
    select: { id: true },
  });
  if (attempted) return { status: "attempted" };

  const gate = await quizGateDetail(quizId, ctx.sectionId, userId, now);
  if (!gate.available) {
    return gate.ownState === "closed" ? { status: "closed" } : { status: "not_available" };
  }

  const questions = parseQuestions(ctx.quiz.questions);
  return {
    status: "ready",
    quiz: {
      id: ctx.quiz.id,
      title: ctx.quiz.title,
      sessionNo: ctx.quiz.sessionNo,
      questions: questions.map((q) => ({ q: q.q, options: q.options })),
    },
  };
}

/**
 * Auto-graded submission. Idempotent under double-submit: the unique
 * (quizId, userId) constraint is the only guard — a losing racer gets
 * "duplicate" with the ORIGINAL result. A submit is still accepted for
 * GRACE_SECONDS after the gate closes (mid-class close while a student has
 * the form open). Returns the immediate formative result — score plus the
 * correct answer per question — identically for every quiz kind.
 */
export async function submitQuizAttempt(
  userId: string,
  quizId: string,
  answers: unknown,
  now: Date = new Date(),
): Promise<SubmitOutcome> {
  const ctx = await loadStudentAndQuiz(userId, quizId);
  if (!ctx) return { status: "not_available" };
  const questions = parseQuestions(ctx.quiz.questions);

  // Validate shape BEFORE any gate/attempt checks: 422s must not leak state.
  if (
    !Array.isArray(answers) ||
    answers.length !== questions.length ||
    answers.some((a) => typeof a !== "number" || !Number.isInteger(a))
  ) {
    return {
      status: "invalid",
      message: `Expected ${questions.length} integer answers, one per question.`,
    };
  }
  const choices = answers as number[];
  for (let i = 0; i < questions.length; i++) {
    if (choices[i] < 0 || choices[i] >= questions[i].options.length) {
      return { status: "invalid", message: `Answer ${i + 1} is out of range.` };
    }
  }

  const gate = await quizGateDetail(quizId, ctx.sectionId, userId, now);
  const inGrace =
    gate.ownState === "closed" &&
    gate.closedAt !== null &&
    now.getTime() - gate.closedAt.getTime() <= GRACE_SECONDS * 1000;
  if (!gate.available && !inGrace) {
    return gate.ownState === "closed" ? { status: "closed" } : { status: "not_available" };
  }

  const correctCount = questions.filter((q, i) => choices[i] === q.correctIndex).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);

  try {
    // Single-row insert, no transaction, no pre-check: the unique constraint
    // is the idempotency guard (60-writes/sec-friendly, no hot locks).
    await prisma.quizAttempt.create({
      data: { quizId, userId, answers: { choices }, scorePct, submittedAt: now },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.quizAttempt.findUnique({
        where: { quizId_userId: { quizId, userId } },
        select: { answers: true, scorePct: true },
      });
      if (existing) {
        return {
          status: "duplicate",
          result: resultFor(
            ctx.quiz,
            parseChoices(existing.answers, questions.length),
            existing.scorePct,
          ),
        };
      }
    }
    throw err;
  }

  return { status: "ok", result: resultFor(ctx.quiz, choices, scorePct) };
}

// ---------------------------------------------------------------------------
// Retrospective surfaces — diagnostics excluded AT THE QUERY LAYER
// ---------------------------------------------------------------------------

/**
 * A student's quiz history: every non-diagnostic attempt with its score and
 * whether it currently counts toward the grade (top BEST_OF by score) or is
 * feedback only. Diagnostic attempts never enter this query's result set.
 */
export async function getStudentQuizHistory(userId: string): Promise<QuizHistoryEntry[]> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, quiz: { isDiagnostic: false } }, // the query-layer exclusion
    select: {
      id: true,
      quizId: true,
      scorePct: true,
      submittedAt: true,
      quiz: { select: { title: true, sessionNo: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  // Top BEST_OF by score; deterministic tie-break by earlier submission.
  const counted = new Set(
    [...attempts]
      .sort(
        (a, b) =>
          b.scorePct - a.scorePct ||
          a.submittedAt.getTime() - b.submittedAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, BEST_OF)
      .map((a) => a.id),
  );

  return attempts.map((a) => ({
    attemptId: a.id,
    quizId: a.quizId,
    title: a.quiz.title,
    sessionNo: a.quiz.sessionNo,
    scorePct: a.scorePct,
    submittedAt: a.submittedAt,
    countsTowardGrade: counted.has(a.id),
  }));
}

/**
 * Average of the top-BEST_OF non-diagnostic scores, or null when the student
 * has no counting attempts. U15 consumes this for the 5% grade bucket — the
 * quiz component is always "current" (recomputed live, never finalised).
 */
export async function getBestOfThreeAvg(userId: string): Promise<number | null> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, quiz: { isDiagnostic: false } }, // the query-layer exclusion
    select: { scorePct: true },
    orderBy: { scorePct: "desc" },
    take: BEST_OF,
  });
  if (attempts.length === 0) return null;
  return attempts.reduce((sum, a) => sum + a.scorePct, 0) / attempts.length;
}

/** Minimal quiz shape a session hub renders. No isDiagnostic, by design. */
export type HubQuizRow = { id: string; title: string; sectionIds: string[] };

/**
 * Student-hub quiz listing. Routes the session hub's quiz read through this
 * module so every student-facing quiz query lives here (CLAUDE.md isolation
 * invariant), and the return type carries no isDiagnostic field. This is a
 * TAKING-adjacent surface, not a retrospective one: armed diagnostic quizzes
 * still appear on the hub identically to normal ones, so it does NOT filter
 * on isDiagnostic — arming/availability is decided by the gate system.
 */
export async function listQuizzesForHub(ids: string[]): Promise<HubQuizRow[]> {
  if (ids.length === 0) return [];
  return prisma.quiz.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, sectionIds: true },
  });
}
