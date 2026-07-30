import type {
  ContractMode,
  Prisma,
  QuizAnswerMode,
  QuizClassification,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseChoices, parseQuestions, type StoredQuestion } from "./shared";
import {
  parseStableQuestions,
  parseStoredStableAnswers,
  stableQuestionsContentHash,
  type StableStoredQuestion,
} from "./versioned";

// INSTRUCTOR-ONLY quiz reads. This separate import path is the only quiz
// repository surface that returns diagnostic/classification metadata.

export type InstructorQuizSummary = {
  id: string;
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  contractMode: ContractMode;
  contractVersion: number;
  answerMode: QuizAnswerMode;
  classification: QuizClassification;
  countsTowardBestOf: boolean;
  classificationFinalizedAt: Date | null;
  feedbackReleaseAt: Date | null;
  publishedAt: Date | null;
  contentValid: boolean;
  canPublish: boolean;
  canArm: boolean;
  questionCount: number;
  attemptCount: number;
  avgScorePct: number | null;
};

const instructorQuizSelect = {
  id: true,
  sessionNo: true,
  title: true,
  isDiagnostic: true,
  questions: true,
  contractMode: true,
  contractVersion: true,
  answerMode: true,
  classification: true,
  countsTowardBestOf: true,
  classificationFinalizedAt: true,
  classifiedBy: true,
  feedbackReleaseAt: true,
  contentHash: true,
  publishedAt: true,
} as const;

type InstructorQuizRow = Prisma.QuizGetPayload<{ select: typeof instructorQuizSelect }>;

function stableQuestionsFor(quiz: InstructorQuizRow): StableStoredQuestion[] | null {
  if (quiz.contractMode !== "versioned" || quiz.answerMode !== "stable_id") return null;
  return parseStableQuestions(quiz.questions);
}

function contentValidFor(quiz: InstructorQuizRow): boolean {
  return quiz.contractMode === "legacy" ? quiz.answerMode === "legacy_index" : !!stableQuestionsFor(quiz);
}

function canArmVersionedQuiz(quiz: InstructorQuizRow, contentValid: boolean): boolean {
  if (quiz.contractMode === "legacy") return contentValid;
  const stableQuestions = stableQuestionsFor(quiz);
  return (
    contentValid &&
    stableQuestions !== null &&
    quiz.answerMode === "stable_id" &&
    quiz.publishedAt !== null &&
    quiz.classificationFinalizedAt !== null &&
    typeof quiz.classifiedBy === "string" &&
    quiz.classifiedBy.trim().length > 0 &&
    typeof quiz.contentHash === "string" &&
    quiz.contentHash.trim().length > 0 &&
    stableQuestionsContentHash(stableQuestions) === quiz.contentHash &&
    quiz.feedbackReleaseAt !== null &&
    (!quiz.countsTowardBestOf || quiz.classification === "summative")
  );
}

/** Every quiz — diagnostics included — with publication readiness and aggregate signal. */
export async function listQuizzesForInstructor(): Promise<InstructorQuizSummary[]> {
  const [quizzes, aggregates] = await Promise.all([
    prisma.quiz.findMany({
      select: instructorQuizSelect,
      orderBy: [{ sessionNo: "asc" }, { id: "asc" }],
    }),
    prisma.quizAttempt.groupBy({
      by: ["quizId"],
      _count: { _all: true },
      _avg: { scorePct: true },
    }),
  ]);
  const byQuiz = new Map(aggregates.map((aggregate) => [aggregate.quizId, aggregate]));
  return quizzes.map((quiz) => {
    const aggregate = byQuiz.get(quiz.id);
    const stableQuestions = stableQuestionsFor(quiz);
    const contentValid = contentValidFor(quiz);
    return {
      id: quiz.id,
      sessionNo: quiz.sessionNo,
      title: quiz.title,
      isDiagnostic: quiz.isDiagnostic,
      contractMode: quiz.contractMode,
      contractVersion: quiz.contractVersion,
      answerMode: quiz.answerMode,
      classification: quiz.classification,
      countsTowardBestOf: quiz.countsTowardBestOf,
      classificationFinalizedAt: quiz.classificationFinalizedAt,
      feedbackReleaseAt: quiz.feedbackReleaseAt,
      publishedAt: quiz.publishedAt,
      contentValid,
      canPublish:
        quiz.contractMode === "versioned" &&
        quiz.publishedAt === null &&
        quiz.answerMode === "stable_id" &&
        contentValid,
      canArm: canArmVersionedQuiz(quiz, contentValid),
      questionCount:
        quiz.contractMode === "versioned"
          ? (stableQuestions?.length ?? 0)
          : parseQuestions(quiz.questions).length,
      attemptCount: aggregate?._count._all ?? 0,
      avgScorePct: aggregate?._avg.scorePct ?? null,
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
  questions: (StoredQuestion | StableStoredQuestion)[];
  attemptCount: number;
  avgScorePct: number | null;
  perSection: SectionSignalRow[];
};

/** Instructor aggregates support both index-keyed legacy and stable-ID attempts. */
export async function getQuizResults(quizId: string): Promise<InstructorQuizResults | null> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: instructorQuizSelect,
  });
  if (!quiz) return null;

  const stableQuestions = stableQuestionsFor(quiz);
  const questions: (StoredQuestion | StableStoredQuestion)[] =
    quiz.contractMode === "versioned"
      ? (stableQuestions ?? [])
      : parseQuestions(quiz.questions);

  const [sections, attempts] = await Promise.all([
    prisma.section.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    prisma.quizAttempt.findMany({
      where: { quizId },
      select: {
        scorePct: true,
        answers: true,
        answerMode: true,
        quizContractVersion: true,
        user: { select: { sectionId: true } },
      },
    }),
  ]);

  type Accumulator = { count: number; scoreSum: number; correctPerQuestion: number[] };
  const bySection = new Map<string, Accumulator>();
  for (const section of sections) {
    bySection.set(section.id, {
      count: 0,
      scoreSum: 0,
      correctPerQuestion: questions.map(() => 0),
    });
  }

  for (const attempt of attempts) {
    const accumulator = attempt.user.sectionId
      ? bySection.get(attempt.user.sectionId)
      : undefined;
    if (!accumulator) continue;
    accumulator.count += 1;
    accumulator.scoreSum += attempt.scorePct;

    if (stableQuestions) {
      if (
        attempt.answerMode !== "stable_id" ||
        attempt.quizContractVersion !== quiz.contractVersion
      ) {
        continue;
      }
      const stored = parseStoredStableAnswers(attempt.answers, stableQuestions);
      if (!stored) continue;
      const selected = new Map(
        stored.choices.map((choice) => [choice.itemVersionId, choice.selectedOptionId]),
      );
      stableQuestions.forEach((question, index) => {
        if (selected.get(question.itemVersionId) === question.correctOptionId) {
          accumulator.correctPerQuestion[index] += 1;
        }
      });
    } else if (quiz.contractMode === "legacy" && attempt.answerMode === "legacy_index") {
      const legacyQuestions = questions as StoredQuestion[];
      const choices = parseChoices(attempt.answers, legacyQuestions.length);
      legacyQuestions.forEach((question, index) => {
        if (choices[index] === question.correctIndex) accumulator.correctPerQuestion[index] += 1;
      });
    }
  }

  const perSection: SectionSignalRow[] = sections.map((section) => {
    const accumulator = bySection.get(section.id)!;
    return {
      sectionId: section.id,
      sectionCode: section.code,
      attemptCount: accumulator.count,
      avgScorePct:
        accumulator.count > 0 ? accumulator.scoreSum / accumulator.count : null,
      perQuestionCorrectPct: accumulator.correctPerQuestion.map((correct) =>
        accumulator.count > 0 ? Math.round((correct / accumulator.count) * 100) : 0,
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
        ? attempts.reduce((sum, attempt) => sum + attempt.scorePct, 0) / attempts.length
        : null,
    perSection,
  };
}

export type CreateQuizInput = {
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  questions: StoredQuestion[];
  actorId?: string;
};

/** Create a legacy index quiz; the versioned importer owns stable content creation. */
export async function createQuiz(input: CreateQuizInput): Promise<{ id: string }> {
  const page = await prisma.sessionPage.findUnique({
    where: { sessionNo: input.sessionNo },
    select: { id: true, linkedQuizIds: true },
  });
  if (!page) throw new Error(`createQuiz: no session page for session ${input.sessionNo}`);
  const sections = await prisma.section.findMany({ select: { id: true } });

  return prisma.$transaction(async (transaction) => {
    const quiz = await transaction.quiz.create({
      data: {
        sessionNo: input.sessionNo,
        title: input.title,
        isDiagnostic: input.isDiagnostic,
        classification: input.isDiagnostic ? "diagnostic" : "summative",
        countsTowardBestOf: !input.isDiagnostic,
        classificationFinalizedAt: new Date(),
        classifiedBy: input.actorId ?? "instructor:legacy-create",
        contractMode: "legacy",
        answerMode: "legacy_index",
        sectionIds: sections.map((section) => section.id),
        questions: input.questions,
      },
      select: { id: true },
    });
    await transaction.sessionPage.update({
      where: { id: page.id },
      data: { linkedQuizIds: [...page.linkedQuizIds, quiz.id] },
    });
    return quiz;
  });
}

export type PublishVersionedQuizInput = {
  classification: QuizClassification;
  feedbackReleaseAt: Date;
  actorId: string;
};

export type PublishVersionedQuizOutcome =
  | { status: "published"; publishedAt: Date }
  | { status: "not_found" }
  | { status: "not_versioned" }
  | { status: "already_published" }
  | { status: "has_attempts" }
  | { status: "invalid"; message: string };

/**
 * Freeze counted-vs-retention classification and publish in one transaction.
 * Summative is counted; formative is the non-counted retention check.
 */
export async function publishVersionedQuiz(
  quizId: string,
  input: PublishVersionedQuizInput,
  now: Date = new Date(),
): Promise<PublishVersionedQuizOutcome> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { ...instructorQuizSelect, _count: { select: { attempts: true } } },
  });
  if (!quiz) return { status: "not_found" };
  if (quiz.contractMode !== "versioned") return { status: "not_versioned" };
  if (quiz.publishedAt) return { status: "already_published" };
  if (quiz._count.attempts > 0) return { status: "has_attempts" };
  if (quiz.answerMode !== "stable_id") {
    return { status: "invalid", message: "Versioned quizzes require stable-ID answers." };
  }
  if (input.feedbackReleaseAt.getTime() <= now.getTime()) {
    return {
      status: "invalid",
      message: "Feedback release must be later than the publication time.",
    };
  }

  const questions = parseStableQuestions(quiz.questions);
  if (!questions) {
    return {
      status: "invalid",
      message: "Stable quiz content is incomplete or mixes stable IDs with legacy indexes.",
    };
  }

  const countsTowardBestOf = input.classification === "summative";
  const isDiagnostic = input.classification === "diagnostic";
  const contentHash = stableQuestionsContentHash(questions);
  const published = await prisma.$transaction(async (transaction) => {
    const update = await transaction.quiz.updateMany({
      where: {
        id: quizId,
        contractMode: "versioned",
        contractVersion: quiz.contractVersion,
        answerMode: "stable_id",
        questions: { equals: quiz.questions as Prisma.InputJsonValue },
        publishedAt: null,
        attempts: { none: {} },
      },
      data: {
        classification: input.classification,
        isDiagnostic,
        countsTowardBestOf,
        classificationFinalizedAt: now,
        classifiedBy: input.actorId,
        feedbackReleaseAt: input.feedbackReleaseAt,
        contentHash,
        publishedAt: now,
      },
    });
    if (update.count !== 1) return false;
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "quiz.publish",
        targetType: "quiz",
        targetId: quizId,
        before: {
          classification: quiz.classification,
          countsTowardBestOf: quiz.countsTowardBestOf,
          publishedAt: null,
        },
        after: {
          classification: input.classification,
          countsTowardBestOf,
          feedbackReleaseAt: input.feedbackReleaseAt.toISOString(),
          contentHash,
          publishedAt: now.toISOString(),
        },
      },
    });
    return true;
  });

  if (!published) {
    const current = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: { publishedAt: true, _count: { select: { attempts: true } } },
    });
    if (current?.publishedAt) return { status: "already_published" };
    if (current && current._count.attempts > 0) return { status: "has_attempts" };
    return { status: "invalid", message: "Quiz publication could not be finalized." };
  }
  return { status: "published", publishedAt: now };
}
