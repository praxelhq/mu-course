import { Prisma, type ContractMode, type QuizAnswerMode, type QuizClassification } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parentSessionPageIdFor, resolveGateDetail } from "@/lib/gates";
import { parseChoices, parseQuestions, type StoredQuestion } from "./shared";
import {
  buildReleasedStableLines,
  parseStableAnswerPayload,
  parseStableQuestions,
  parseStoredStableAnswers,
  questionsForStableAttempt,
  scoreStableChoices,
  stableQuestionsContentHash,
  storeStableAnswers,
  type StableResultLine,
  type StableStoredQuestion,
  type StableStudentQuestion,
} from "./versioned";

// THE single student-facing quiz repository module (CLAUDE.md invariant):
// every student-surface quiz read goes through here. Retrospective queries
// exclude isDiagnostic rows at the query layer. The taking path deliberately
// does not select or return isDiagnostic/classification metadata.

/** Mid-close grace: a submit still lands this many seconds after gate close. */
export const GRACE_SECONDS = 120;

/** How many eligible attempts count toward the grade (best-of-three). */
export const BEST_OF = 3;

export type StudentQuizQuestion = { q: string; options: string[] };
export type StudentStableQuizQuestion = StableStudentQuestion;

export type StudentQuizForTaking = {
  id: string;
  title: string;
  sessionNo: number;
  questions: (StudentQuizQuestion | StudentStableQuizQuestion)[];
};

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
  lines: (QuizResultLine | StableResultLine)[];
};

export type QuizAttemptReceipt = {
  attemptId: string;
  quizId: string;
  title: string;
  sessionNo: number;
  submittedAt: Date;
  feedbackReleaseAt: Date;
};

type AttemptView =
  | { feedbackStatus: "pending"; receipt: QuizAttemptReceipt }
  | { feedbackStatus: "released"; receipt?: QuizAttemptReceipt; result: QuizResult };

export type ArmedQuizResult =
  | { status: "ready"; quiz: StudentQuizForTaking }
  | { status: "attempted"; receipt?: QuizAttemptReceipt; result?: QuizResult }
  | { status: "closed" }
  | { status: "not_available" };

// Keep legacy service statuses/result typing intact. Versioned submissions
// use the separate receipt statuses until their configured release time.
export type SubmitOutcome =
  | { status: "ok"; result: QuizResult }
  | { status: "duplicate"; result: QuizResult }
  | { status: "received"; receipt: QuizAttemptReceipt }
  | { status: "duplicate_received"; receipt: QuizAttemptReceipt }
  | { status: "closed" }
  | { status: "not_available" }
  | { status: "invalid"; message: string };

export type QuizHistoryEntry = {
  attemptId: string;
  quizId: string;
  title: string;
  sessionNo: number;
  submittedAt: Date;
  feedbackStatus: "pending" | "released";
  feedbackReleaseAt?: Date;
  scorePct?: number;
  countsTowardGrade?: boolean;
  result?: QuizResult;
};

type QuizRow = {
  id: string;
  title: string;
  sessionNo: number;
  sectionIds: string[];
  questions: unknown;
  contractMode: ContractMode;
  contractVersion: number;
  classification: QuizClassification;
  countsTowardBestOf: boolean;
  classificationFinalizedAt: Date | null;
  classifiedBy: string | null;
  feedbackReleaseAt: Date | null;
  answerMode: QuizAnswerMode;
  contentHash: string | null;
  publishedAt: Date | null;
};

type AttemptRow = {
  id: string;
  answers: unknown;
  quizContractVersion: number;
  answerMode: QuizAnswerMode;
  scorePct: number;
  submittedAt: Date;
};

type LegacyRuntimeContract = { mode: "legacy"; questions: StoredQuestion[] };
type StableRuntimeContract = {
  mode: "stable";
  questions: StableStoredQuestion[];
  feedbackReleaseAt: Date;
};
type RuntimeContract = LegacyRuntimeContract | StableRuntimeContract;

const quizSelect = {
  id: true,
  title: true,
  sessionNo: true,
  sectionIds: true,
  questions: true,
  contractMode: true,
  contractVersion: true,
  classification: true,
  countsTowardBestOf: true,
  classificationFinalizedAt: true,
  classifiedBy: true,
  feedbackReleaseAt: true,
  answerMode: true,
  contentHash: true,
  publishedAt: true,
} as const;

const attemptSelect = {
  id: true,
  answers: true,
  quizContractVersion: true,
  answerMode: true,
  scorePct: true,
  submittedAt: true,
} as const;

function nonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Resolve one and only one runtime contract; mixed stable/index rows fail closed. */
function runtimeContractFor(quiz: QuizRow): RuntimeContract | null {
  if (quiz.contractMode === "legacy") {
    if (quiz.answerMode !== "legacy_index") return null;
    return { mode: "legacy", questions: parseQuestions(quiz.questions) };
  }

  if (
    quiz.answerMode !== "stable_id" ||
    !Number.isInteger(quiz.contractVersion) ||
    quiz.contractVersion < 1 ||
    !quiz.publishedAt ||
    !quiz.classificationFinalizedAt ||
    !nonEmptyString(quiz.classifiedBy) ||
    !quiz.feedbackReleaseAt ||
    !nonEmptyString(quiz.contentHash) ||
    (quiz.countsTowardBestOf && quiz.classification !== "summative")
  ) {
    return null;
  }

  const questions = parseStableQuestions(quiz.questions);
  if (!questions || stableQuestionsContentHash(questions) !== quiz.contentHash) return null;
  return { mode: "stable", questions, feedbackReleaseAt: quiz.feedbackReleaseAt };
}

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

function stableAttemptSeed(quiz: QuizRow, userId: string): string {
  return `${quiz.id}\0${quiz.contractVersion}\0${userId}`;
}

function legacyResultFor(quiz: QuizRow, choices: number[], scorePct: number): QuizResult {
  const questions = parseQuestions(quiz.questions);
  const lines: QuizResultLine[] = questions.map((question, index) => ({
    q: question.q,
    options: question.options,
    yourAnswer: choices[index],
    correctAnswer: question.correctIndex,
    correct: choices[index] === question.correctIndex,
  }));
  return {
    quizId: quiz.id,
    title: quiz.title,
    scorePct,
    correctCount: lines.filter((line) => line.correct).length,
    questionCount: questions.length,
    lines,
  };
}

function receiptFor(
  quiz: QuizRow,
  attempt: AttemptRow,
  feedbackReleaseAt: Date,
): QuizAttemptReceipt {
  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    title: quiz.title,
    sessionNo: quiz.sessionNo,
    submittedAt: attempt.submittedAt,
    feedbackReleaseAt,
  };
}

/** Validate the frozen attempt snapshot before returning even receipt metadata. */
function attemptViewFor(
  quiz: QuizRow,
  contract: RuntimeContract,
  attempt: AttemptRow,
  now: Date,
): AttemptView | null {
  if (
    attempt.quizContractVersion !== quiz.contractVersion ||
    attempt.answerMode !== quiz.answerMode
  ) {
    return null;
  }

  if (contract.mode === "legacy") {
    return {
      feedbackStatus: "released",
      result: legacyResultFor(
        quiz,
        parseChoices(attempt.answers, contract.questions.length),
        attempt.scorePct,
      ),
    };
  }

  const stored = parseStoredStableAnswers(attempt.answers, contract.questions);
  if (!stored) return null;
  const computed = scoreStableChoices(contract.questions, stored.choices);
  if (Math.abs(computed.scorePct - attempt.scorePct) > Number.EPSILON) return null;

  const receipt = receiptFor(quiz, attempt, contract.feedbackReleaseAt);
  if (now.getTime() < contract.feedbackReleaseAt.getTime()) {
    return { feedbackStatus: "pending", receipt };
  }

  const lines = buildReleasedStableLines(contract.questions, stored);
  if (!lines) return null;
  return {
    feedbackStatus: "released",
    receipt,
    result: {
      quizId: quiz.id,
      title: quiz.title,
      scorePct: computed.scorePct,
      correctCount: computed.correctCount,
      questionCount: contract.questions.length,
      lines,
    },
  };
}

function submittedOutcome(view: AttemptView, duplicate: boolean): SubmitOutcome {
  if (view.feedbackStatus === "pending") {
    return duplicate
      ? { status: "duplicate_received", receipt: view.receipt }
      : { status: "received", receipt: view.receipt };
  }
  return duplicate
    ? { status: "duplicate", result: view.result }
    : { status: "ok", result: view.result };
}

/**
 * The quiz as presented for taking: stable contracts are published, complete,
 * and shuffled deterministically; correct answers never leave this module.
 */
export async function getArmedQuizForStudent(
  userId: string,
  quizId: string,
  now: Date = new Date(),
): Promise<ArmedQuizResult> {
  const ctx = await loadStudentAndQuiz(userId, quizId);
  if (!ctx) return { status: "not_available" };
  const contract = runtimeContractFor(ctx.quiz);
  if (!contract) return { status: "not_available" };

  const attempted = await prisma.quizAttempt.findUnique({
    where: { quizId_userId: { quizId, userId } },
    select: attemptSelect,
  });
  if (attempted) {
    if (contract.mode === "legacy") return { status: "attempted" };
    const view = attemptViewFor(ctx.quiz, contract, attempted, now);
    if (!view) return { status: "not_available" };
    return view.feedbackStatus === "pending"
      ? { status: "attempted", receipt: view.receipt }
      : {
          status: "attempted",
          ...(view.receipt ? { receipt: view.receipt } : {}),
          result: view.result,
        };
  }

  const gate = await quizGateDetail(quizId, ctx.sectionId, userId, now);
  if (!gate.available) {
    return gate.ownState === "closed" ? { status: "closed" } : { status: "not_available" };
  }

  const questions =
    contract.mode === "legacy"
      ? contract.questions.map((question) => ({ q: question.q, options: question.options }))
      : questionsForStableAttempt(contract.questions, stableAttemptSeed(ctx.quiz, userId));
  return {
    status: "ready",
    quiz: {
      id: ctx.quiz.id,
      title: ctx.quiz.title,
      sessionNo: ctx.quiz.sessionNo,
      questions,
    },
  };
}

/**
 * Auto-grade one immutable attempt. Invalid payloads are rejected before gate
 * or duplicate checks, and the database uniqueness constraint is the race-safe
 * idempotency guard.
 */
export async function submitQuizAttempt(
  userId: string,
  quizId: string,
  answers: unknown,
  now: Date = new Date(),
): Promise<SubmitOutcome> {
  const ctx = await loadStudentAndQuiz(userId, quizId);
  if (!ctx) return { status: "not_available" };
  const contract = runtimeContractFor(ctx.quiz);
  if (!contract) return { status: "not_available" };

  let storedAnswers: Prisma.InputJsonValue;
  let scorePct: number;

  if (contract.mode === "legacy") {
    if (
      !Array.isArray(answers) ||
      answers.length !== contract.questions.length ||
      answers.some((answer) => typeof answer !== "number" || !Number.isInteger(answer))
    ) {
      return {
        status: "invalid",
        message: `Expected ${contract.questions.length} integer answers, one per question.`,
      };
    }
    const choices = answers as number[];
    for (let index = 0; index < contract.questions.length; index += 1) {
      if (choices[index] < 0 || choices[index] >= contract.questions[index].options.length) {
        return { status: "invalid", message: `Answer ${index + 1} is out of range.` };
      }
    }
    const correctCount = contract.questions.filter(
      (question, index) => choices[index] === question.correctIndex,
    ).length;
    scorePct = Math.round((correctCount / contract.questions.length) * 100);
    storedAnswers = { choices };
  } else {
    const parsed = parseStableAnswerPayload(answers, contract.questions);
    if (!parsed.ok) return { status: "invalid", message: parsed.message };
    const displayed = questionsForStableAttempt(
      contract.questions,
      stableAttemptSeed(ctx.quiz, userId),
    );
    const score = scoreStableChoices(contract.questions, parsed.choices);
    scorePct = score.scorePct;
    storedAnswers = storeStableAnswers(
      parsed.choices,
      displayed,
    ) as unknown as Prisma.InputJsonValue;
  }

  const gate = await quizGateDetail(quizId, ctx.sectionId, userId, now);
  const inGrace =
    gate.ownState === "closed" &&
    gate.closedAt !== null &&
    now.getTime() - gate.closedAt.getTime() <= GRACE_SECONDS * 1000;
  if (!gate.available && !inGrace) {
    // A retry after the instructor closes the gate still receives the
    // original immutable receipt/result. Only a genuinely new late attempt is
    // rejected as closed; this keeps idempotency independent of gate timing.
    const existing = await prisma.quizAttempt.findUnique({
      where: { quizId_userId: { quizId, userId } },
      select: attemptSelect,
    });
    if (existing) {
      const view = attemptViewFor(ctx.quiz, contract, existing, now);
      if (view) return submittedOutcome(view, true);
      return { status: "not_available" };
    }
    return gate.ownState === "closed" ? { status: "closed" } : { status: "not_available" };
  }

  try {
    const created = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        answers: storedAnswers,
        quizContractVersion: ctx.quiz.contractVersion,
        answerMode: ctx.quiz.answerMode,
        scorePct,
        submittedAt: now,
      },
      select: attemptSelect,
    });
    const view = attemptViewFor(ctx.quiz, contract, created, now);
    return view ? submittedOutcome(view, false) : { status: "not_available" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.quizAttempt.findUnique({
        where: { quizId_userId: { quizId, userId } },
        select: attemptSelect,
      });
      if (existing) {
        const view = attemptViewFor(ctx.quiz, contract, existing, now);
        if (view) return submittedOutcome(view, true);
        return { status: "not_available" };
      }
    }
    throw error;
  }
}

function eligibleForBestOf(quiz: QuizRow): boolean {
  if (quiz.contractMode === "legacy") return true;
  return (
    quiz.classification === "summative" &&
    quiz.countsTowardBestOf &&
    quiz.classificationFinalizedAt !== null &&
    quiz.publishedAt !== null
  );
}

/**
 * Every non-diagnostic attempt. A versioned attempt is receipt-only until its
 * release time; score, grade status, answer IDs, and feedback are omitted.
 */
export async function getStudentQuizHistory(
  userId: string,
  now: Date = new Date(),
): Promise<QuizHistoryEntry[]> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, quiz: { isDiagnostic: false } },
    select: {
      ...attemptSelect,
      quizId: true,
      quiz: { select: quizSelect },
    },
    orderBy: { submittedAt: "asc" },
  });

  const readable = attempts.flatMap((attempt) => {
    const contract = runtimeContractFor(attempt.quiz);
    if (!contract) return [];
    const view = attemptViewFor(attempt.quiz, contract, attempt, now);
    if (!view) return [];
    return [{ attempt, view, eligible: eligibleForBestOf(attempt.quiz) }];
  });

  const counted = new Set(
    readable
      .filter(
        (entry): entry is typeof entry & { view: Extract<AttemptView, { feedbackStatus: "released" }> } =>
          entry.eligible && entry.view.feedbackStatus === "released",
      )
      .sort(
        (left, right) =>
          right.view.result.scorePct - left.view.result.scorePct ||
          left.attempt.submittedAt.getTime() - right.attempt.submittedAt.getTime() ||
          left.attempt.id.localeCompare(right.attempt.id),
      )
      .slice(0, BEST_OF)
      .map((entry) => entry.attempt.id),
  );

  return readable.map(({ attempt, view }) => {
    const base = {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      title: attempt.quiz.title,
      sessionNo: attempt.quiz.sessionNo,
      submittedAt: attempt.submittedAt,
    };
    if (view.feedbackStatus === "pending") {
      return {
        ...base,
        feedbackStatus: "pending" as const,
        feedbackReleaseAt: view.receipt.feedbackReleaseAt,
      };
    }
    return {
      ...base,
      feedbackStatus: "released" as const,
      scorePct: view.result.scorePct,
      countsTowardGrade: counted.has(attempt.id),
      result: view.result,
    };
  });
}

/** Average of the top three released, eligible, non-diagnostic scores. */
export async function getBestOfThreeAvg(
  userId: string,
  now: Date = new Date(),
): Promise<number | null> {
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      userId,
      quiz: {
        isDiagnostic: false,
        OR: [
          { contractMode: "legacy" },
          {
            contractMode: "versioned",
            classification: "summative",
            countsTowardBestOf: true,
            classificationFinalizedAt: { not: null },
            publishedAt: { not: null },
            feedbackReleaseAt: { lte: now },
          },
        ],
      },
    },
    select: {
      ...attemptSelect,
      quiz: { select: quizSelect },
    },
  });

  const scores = attempts.flatMap((attempt) => {
    const contract = runtimeContractFor(attempt.quiz);
    if (!contract || !eligibleForBestOf(attempt.quiz)) return [];
    const view = attemptViewFor(attempt.quiz, contract, attempt, now);
    return view?.feedbackStatus === "released" ? [view.result.scorePct] : [];
  });
  scores.sort((left, right) => right - left);
  const best = scores.slice(0, BEST_OF);
  if (best.length === 0) return null;
  return best.reduce((sum, score) => sum + score, 0) / best.length;
}

/** Minimal quiz shape a session hub renders. No classification metadata. */
export type HubQuizRow = { id: string; title: string; sectionIds: string[] };

export async function listQuizzesForHub(ids: string[]): Promise<HubQuizRow[]> {
  if (ids.length === 0) return [];
  const quizzes = await prisma.quiz.findMany({
    where: { id: { in: ids } },
    select: quizSelect,
  });
  return quizzes
    .filter((quiz) => runtimeContractFor(quiz) !== null)
    .map((quiz) => ({ id: quiz.id, title: quiz.title, sectionIds: quiz.sectionIds }));
}
