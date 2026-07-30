import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

type StableQuiz = {
  id: string;
  title: string;
  sessionNo: number;
  sectionIds: string[];
  questions: unknown;
  isDiagnostic: boolean;
  contractMode: "versioned";
  contractVersion: number;
  classification: "diagnostic" | "formative" | "summative";
  countsTowardBestOf: boolean;
  classificationFinalizedAt: Date | null;
  classifiedBy: string | null;
  feedbackReleaseAt: Date | null;
  answerMode: "stable_id";
  contentHash: string | null;
  publishedAt: Date | null;
};

type StableAttempt = {
  id: string;
  quizId: string;
  answers: unknown;
  quizContractVersion: number;
  answerMode: "stable_id";
  scorePct: number;
  submittedAt: Date;
};

const state = vi.hoisted(() => ({
  quiz: null as StableQuiz | null,
  attempt: null as StableAttempt | null,
  gateAvailable: true,
  gateOwnState: "open" as "open" | "closed",
  gateClosedAt: null as Date | null,
  quizAttemptFindManyCalls: [] as unknown[],
  auditRows: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  quizFindUnique: vi.fn(async (args: { select?: { _count?: unknown } }) => {
    if (!state.quiz) return null;
    return args.select?._count
      ? { ...state.quiz, _count: { attempts: state.attempt ? 1 : 0 } }
      : state.quiz;
  }),
  quizFindMany: vi.fn(async () => (state.quiz ? [state.quiz] : [])),
  quizUpdateMany: vi.fn(async (args: { data: Partial<StableQuiz> }) => {
    if (!state.quiz || state.quiz.publishedAt || state.attempt) return { count: 0 };
    state.quiz = { ...state.quiz, ...args.data } as StableQuiz;
    return { count: 1 };
  }),
  attemptFindUnique: vi.fn(async () => state.attempt),
  attemptFindMany: vi.fn(async (args: unknown) => {
    state.quizAttemptFindManyCalls.push(args);
    return state.quiz && state.attempt
      ? [{ ...state.attempt, quiz: state.quiz }]
      : [];
  }),
  attemptCreate: vi.fn(async (args: { data: Omit<StableAttempt, "id"> }) => {
    if (state.attempt) {
      throw new Prisma.PrismaClientKnownRequestError("duplicate quiz attempt", {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { modelName: "QuizAttempt" },
      });
    }
    state.attempt = { id: "attempt_stable_1", ...args.data };
    return state.attempt;
  }),
}));

vi.mock("@/lib/db", () => {
  const transaction = {
    quiz: { updateMany: db.quizUpdateMany },
    auditLog: {
      create: vi.fn(async (args: unknown) => {
        state.auditRows.push(args);
        return {};
      }),
    },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(async () => ({ sectionId: "sec_A" })) },
      quiz: {
        findUnique: db.quizFindUnique,
        findMany: db.quizFindMany,
      },
      quizAttempt: {
        findUnique: db.attemptFindUnique,
        findMany: db.attemptFindMany,
        create: db.attemptCreate,
      },
      auditLog: transaction.auditLog,
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    },
  };
});

vi.mock("@/lib/gates", () => ({
  parentSessionPageIdFor: vi.fn(async () => "spage_4"),
  resolveGateDetail: vi.fn(async () => ({
    available: state.gateAvailable,
    ownState: state.gateOwnState,
    parentOpen: true,
    closedAt: state.gateClosedAt,
  })),
}));

import {
  getArmedQuizForStudent,
  getBestOfThreeAvg,
  getStudentQuizHistory,
  listQuizzesForHub,
  submitQuizAttempt,
} from "../lib/quizzes";
import { publishVersionedQuiz } from "../lib/quizzes/instructor";
import { parseStableQuestions, stableQuestionsContentHash } from "../lib/quizzes/versioned";

const questions = [
  {
    itemVersionId: "S4-Q1@1",
    q: "Which contract is strongest?",
    options: [
      { optionId: "feature-list", text: "Longest feature list" },
      { optionId: "end-to-end", text: "Observable end-to-end behavior" },
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
    feedbackMd: "Use fictional fixtures rather than production credentials.",
  },
];

function quizFixture(overrides: Partial<StableQuiz> = {}): StableQuiz {
  const parsedQuestions = parseStableQuestions(questions);
  if (!parsedQuestions) throw new Error("stable quiz fixture should parse");
  return {
    id: "quiz_s4_versioned",
    title: "S4 product judgment",
    sessionNo: 4,
    sectionIds: ["sec_A"],
    questions,
    isDiagnostic: false,
    contractMode: "versioned",
    contractVersion: 4,
    classification: "summative",
    countsTowardBestOf: true,
    classificationFinalizedAt: new Date("2026-07-30T04:00:00.000Z"),
    classifiedBy: "user_instructor",
    feedbackReleaseAt: new Date("2026-07-30T08:00:00.000Z"),
    answerMode: "stable_id",
    contentHash: stableQuestionsContentHash(parsedQuestions),
    publishedAt: new Date("2026-07-30T04:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  state.quiz = quizFixture();
  state.attempt = null;
  state.gateAvailable = true;
  state.gateOwnState = "open";
  state.gateClosedAt = null;
  state.quizAttemptFindManyCalls.length = 0;
  state.auditRows.length = 0;
  vi.clearAllMocks();
});

describe("versioned quiz repository", () => {
  it("stores stable IDs/display order, returns only the original receipt, then rebuilds released feedback", async () => {
    const beforeRelease = new Date("2026-07-30T06:00:00.000Z");
    const afterRelease = new Date("2026-07-30T09:00:00.000Z");

    const first = await getArmedQuizForStudent("student_1", state.quiz!.id, beforeRelease);
    const reload = await getArmedQuizForStudent("student_1", state.quiz!.id, beforeRelease);
    expect(first).toEqual(reload);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") throw new Error("expected ready quiz");
    expect(JSON.stringify(first)).not.toMatch(
      /correctOptionId|rationale|feedbackMd|correctIndex/,
    );

    const answers = [
      { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
      { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
    ];
    const submitted = await submitQuizAttempt(
      "student_1",
      state.quiz!.id,
      answers,
      beforeRelease,
    );
    expect(submitted.status).toBe("received");
    expect(JSON.stringify(submitted)).not.toMatch(
      /scorePct|correctOptionId|rationale|feedbackMd/,
    );
    if (submitted.status !== "received") throw new Error("expected receipt");

    const stored = state.attempt!.answers as {
      choices: { itemVersionId: string; selectedOptionId: string }[];
      displayOrder: { itemVersionId: string; optionIds: string[] }[];
    };
    expect(stored.choices).toEqual([
      { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
      { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
    ]);
    expect(stored.displayOrder.map((item) => item.itemVersionId)).toEqual(
      first.quiz.questions.map((question) =>
        "itemVersionId" in question ? question.itemVersionId : "legacy",
      ),
    );
    expect(state.attempt).toMatchObject({
      quizContractVersion: 4,
      answerMode: "stable_id",
      scorePct: 100,
    });

    state.gateAvailable = false;
    state.gateOwnState = "closed";
    state.gateClosedAt = new Date("2026-07-30T05:00:00.000Z");
    const duplicate = await submitQuizAttempt(
      "student_1",
      state.quiz!.id,
      answers,
      beforeRelease,
    );
    expect(duplicate).toEqual({
      status: "duplicate_received",
      receipt: submitted.receipt,
    });
    state.gateAvailable = true;
    state.gateOwnState = "open";
    state.gateClosedAt = null;

    const pendingRevisit = await getArmedQuizForStudent(
      "student_1",
      state.quiz!.id,
      beforeRelease,
    );
    expect(pendingRevisit).toEqual({ status: "attempted", receipt: submitted.receipt });
    const pendingHistory = await getStudentQuizHistory("student_1", beforeRelease);
    expect(pendingHistory).toHaveLength(1);
    expect(pendingHistory[0].feedbackStatus).toBe("pending");
    expect(JSON.stringify(pendingHistory)).not.toMatch(/scorePct|correctOptionId|selectedOptionId/);
    expect(await getBestOfThreeAvg("student_1", beforeRelease)).toBeNull();

    const released = await getArmedQuizForStudent("student_1", state.quiz!.id, afterRelease);
    expect(released.status).toBe("attempted");
    if (released.status !== "attempted" || !released.result) {
      throw new Error("expected released feedback");
    }
    expect(released.result.scorePct).toBe(100);
    expect(released.result.lines.map((line) =>
      "itemVersionId" in line ? line.itemVersionId : "legacy",
    )).toEqual(stored.displayOrder.map((item) => item.itemVersionId));
    expect(JSON.stringify(released.result)).toContain("correctOptionId");
    expect(JSON.stringify(released.result)).toContain("optionId");

    const releasedHistory = await getStudentQuizHistory("student_1", afterRelease);
    expect(releasedHistory[0]).toMatchObject({
      feedbackStatus: "released",
      scorePct: 100,
      countsTowardGrade: true,
    });
    expect(await getBestOfThreeAvg("student_1", afterRelease)).toBe(100);
    expect(state.quizAttemptFindManyCalls).toContainEqual(
      expect.objectContaining({
        where: expect.objectContaining({ quiz: expect.objectContaining({ isDiagnostic: false }) }),
      }),
    );
  });

  it("keeps released formative retention attempts out of best-of", async () => {
    state.quiz = quizFixture({ classification: "formative", countsTowardBestOf: false });
    const submittedAt = new Date("2026-07-30T06:00:00.000Z");
    const releasedAt = new Date("2026-07-30T09:00:00.000Z");
    await submitQuizAttempt(
      "student_1",
      state.quiz.id,
      [
        { itemVersionId: "S4-Q1@1", selectedOptionId: "end-to-end" },
        { itemVersionId: "S4-Q2@1", selectedOptionId: "fixture" },
      ],
      submittedAt,
    );

    expect(await getBestOfThreeAvg("student_1", releasedAt)).toBeNull();
    expect((await getStudentQuizHistory("student_1", releasedAt))[0]).toMatchObject({
      feedbackStatus: "released",
      countsTowardGrade: false,
    });
  });

  it("fails malformed or mixed stable content closed on taking and hub surfaces", async () => {
    state.quiz = quizFixture({
      questions: [
        questions[0],
        {
          itemVersionId: "S4-Q2@1",
          q: "Mixed item",
          options: ["legacy A", "legacy B"],
          correctIndex: 0,
        },
      ],
    });

    await expect(
      getArmedQuizForStudent("student_1", state.quiz.id),
    ).resolves.toEqual({ status: "not_available" });
    await expect(
      submitQuizAttempt("student_1", state.quiz.id, []),
    ).resolves.toEqual({ status: "not_available" });
    await expect(listQuizzesForHub([state.quiz.id])).resolves.toEqual([]);
    expect(db.attemptCreate).not.toHaveBeenCalled();
  });

  it("fails a published content-hash mismatch closed on taking and hub surfaces", async () => {
    state.quiz = quizFixture({ contentHash: "0".repeat(64) });

    await expect(
      getArmedQuizForStudent("student_1", state.quiz.id),
    ).resolves.toEqual({ status: "not_available" });
    await expect(listQuizzesForHub([state.quiz.id])).resolves.toEqual([]);
    expect(db.attemptCreate).not.toHaveBeenCalled();
  });
});

describe("versioned quiz publication", () => {
  it("atomically finalizes counted-vs-retention classification before publication", async () => {
    const now = new Date("2026-07-30T04:00:00.000Z");
    const feedbackReleaseAt = new Date("2026-08-01T12:00:00.000Z");
    state.quiz = quizFixture({
      classificationFinalizedAt: null,
      classifiedBy: null,
      feedbackReleaseAt: null,
      contentHash: null,
      publishedAt: null,
    });

    const outcome = await publishVersionedQuiz(
      state.quiz.id,
      {
        classification: "formative",
        feedbackReleaseAt,
        actorId: "user_instructor",
      },
      now,
    );

    expect(outcome).toEqual({ status: "published", publishedAt: now });
    expect(state.quiz).toMatchObject({
      classification: "formative",
      countsTowardBestOf: false,
      isDiagnostic: false,
      classificationFinalizedAt: now,
      classifiedBy: "user_instructor",
      feedbackReleaseAt,
      publishedAt: now,
    });
    expect(state.quiz?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.quizUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contractVersion: 4,
          answerMode: "stable_id",
          questions: { equals: questions },
          publishedAt: null,
          attempts: { none: {} },
        }),
      }),
    );
    expect(state.auditRows).toHaveLength(1);
  });
});
