import { Prisma, type DataRacePhase } from "@prisma/client";
import { prisma } from "@/lib/db";

export type RaceOption = { id: string; label: string };

export class DataRaceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "DataRaceError";
  }
}

export function scoreDataRaceAnswer(input: {
  correct: boolean;
  responseMs: number;
  durationSeconds: number;
  previousStreak: number;
}) {
  if (!input.correct) return { points: 0, streak: 0 };
  const durationMs = input.durationSeconds * 1_000;
  const elapsed = Math.max(0, Math.min(input.responseMs, durationMs));
  const speed = Math.round(400 * (1 - elapsed / durationMs));
  const streak = input.previousStreak + 1;
  const streakBonus = Math.min(Math.max(0, streak - 1) * 50, 250);
  return { points: 600 + speed + streakBonus, streak };
}

function parseOptions(value: Prisma.JsonValue): RaceOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const id = "id" in item ? item.id : null;
    const label = "label" in item ? item.label : null;
    return typeof id === "string" && typeof label === "string" ? [{ id, label }] : [];
  });
}

async function expireQuestion(raceId: string, now = new Date()) {
  return prisma.dataRace.updateMany({
    where: { id: raceId, phase: "question", questionEndsAt: { lte: now } },
    data: { phase: "feedback", version: { increment: 1 } },
  });
}

async function raceForSection(sectionId: string) {
  const race = await prisma.dataRace.findUnique({
    where: { sessionNo_sectionId: { sessionNo: 3, sectionId } },
    include: {
      section: { select: { code: true, name: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!race) throw new DataRaceError("Data Race is not configured for this section.", 404);
  if (race.phase !== "question" || !race.questionEndsAt || race.questionEndsAt > new Date()) {
    return race;
  }
  const expired = await expireQuestion(race.id);
  if (expired.count === 0) return race;
  return prisma.dataRace.findUniqueOrThrow({
    where: { id: race.id },
    include: {
      section: { select: { code: true, name: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
}

async function userSection(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sectionId: true },
  });
  if (!user?.sectionId) throw new DataRaceError("You are not assigned to a section.", 409);
  return user.sectionId;
}

export async function getStudentRaceState(userId: string, knownSectionId?: string | null) {
  const sectionId = knownSectionId ?? await userSection(userId);
  if (!sectionId) throw new DataRaceError("You are not assigned to a section.", 409);
  const race = await raceForSection(sectionId);
  const question = race.questions.find((item) => item.position === race.currentPosition) ?? null;
  const response = question
    ? await prisma.dataRaceResponse.findUnique({
        where: { questionId_userId: { questionId: question.id, userId } },
        select: { selectedOptionId: true, correct: true, submittedAt: true },
      })
    : null;

  return {
    serverNow: new Date().toISOString(),
    title: race.title,
    sectionCode: race.section.code,
    phase: race.phase,
    version: race.version,
    currentPosition: race.currentPosition,
    totalQuestions: race.questions.length,
    question:
      question && race.phase !== "waiting" && race.phase !== "complete"
        ? {
            id: question.id,
            position: question.position,
            prompt: question.prompt,
            options: parseOptions(question.options),
            difficulty: question.difficulty,
            durationSeconds: question.durationSeconds,
            endsAt: race.questionEndsAt?.toISOString() ?? null,
          }
        : null,
    submitted: Boolean(response),
    selectedOptionId: response?.selectedOptionId ?? null,
    result:
      race.phase === "feedback" || race.phase === "leaderboard"
        ? response
          ? { answered: true, correct: response.correct }
          : { answered: false, correct: false }
        : null,
  };
}

export async function submitDataRaceAnswer(input: {
  userId: string;
  sectionId?: string | null;
  questionId: string;
  selectedOptionId: string;
}) {
  const sectionId = input.sectionId ?? await userSection(input.userId);
  if (!sectionId) throw new DataRaceError("You are not assigned to a section.", 409);
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string; phase: DataRacePhase; currentPosition: number;
        questionStartedAt: Date | null; questionEndsAt: Date | null;
      }>>(Prisma.sql`
        SELECT "id", "phase", "currentPosition", "questionStartedAt", "questionEndsAt"
        FROM "DataRace"
        WHERE "sessionNo" = 3 AND "sectionId" = ${sectionId}
        FOR UPDATE
      `);
      const race = locked[0];
      if (!race) throw new DataRaceError("Data Race is not configured for this section.", 404);
      if (race.phase !== "question") throw new DataRaceError("Answers are closed for this question.", 409);
      const question = await tx.dataRaceQuestion.findFirst({
        where: { id: input.questionId, raceId: race.id, position: race.currentPosition },
      });
      if (!question || !race.questionStartedAt || !race.questionEndsAt) {
        throw new DataRaceError("This is not the active question.", 409);
      }
      const now = new Date();
      if (now > race.questionEndsAt) throw new DataRaceError("Time is up for this question.", 409);
      const options = parseOptions(question.options);
      if (!options.some((option) => option.id === input.selectedOptionId)) {
        throw new DataRaceError("Choose one of the available answers.");
      }
      const previous = question.position > 1
        ? await tx.dataRaceResponse.findFirst({
            where: {
              userId: input.userId,
              question: { raceId: race.id, position: question.position - 1 },
            },
            select: { streak: true },
          })
        : null;
      const responseMs = Math.max(0, now.getTime() - race.questionStartedAt.getTime());
      const correct = input.selectedOptionId === question.correctOptionId;
      const score = scoreDataRaceAnswer({ correct, responseMs, durationSeconds: question.durationSeconds, previousStreak: previous?.streak ?? 0 });
      await tx.dataRaceResponse.create({
        data: { questionId: question.id, userId: input.userId, selectedOptionId: input.selectedOptionId, correct, responseMs, points: score.points, streak: score.streak },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DataRaceError("Your answer is already recorded.", 409);
    }
    throw error;
  }
  return { recorded: true };
}

type LeaderRow = {
  userId: string;
  name: string;
  correct: number;
  answered: number;
  totalPoints: number;
  avgMs: number;
  streak: number;
};

function rankRows(rows: LeaderRow[]) {
  return [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.correct - a.correct ||
      a.avgMs - b.avgMs ||
      a.name.localeCompare(b.name) ||
      a.userId.localeCompare(b.userId),
  );
}

async function leaderboard(raceId: string, throughPosition: number) {
  const responses = await prisma.dataRaceResponse.findMany({
    where: { question: { raceId, position: { lte: throughPosition } } },
    select: {
      userId: true,
      correct: true,
      points: true,
      responseMs: true,
      streak: true,
      user: { select: { name: true } },
      question: { select: { position: true } },
    },
  });
  const grouped = new Map<string, LeaderRow & { latestPosition: number }>();
  for (const item of responses) {
    const row = grouped.get(item.userId) ?? {
      userId: item.userId,
      name: item.user.name,
      correct: 0,
      answered: 0,
      totalPoints: 0,
      avgMs: 0,
      streak: 0,
      latestPosition: 0,
    };
    row.correct += item.correct ? 1 : 0;
    row.answered += 1;
    row.totalPoints += item.points;
    row.avgMs += item.responseMs;
    if (item.question.position >= row.latestPosition) {
      row.latestPosition = item.question.position;
      row.streak = item.streak;
    }
    grouped.set(item.userId, row);
  }
  return rankRows(
    [...grouped.values()].map((row) => ({
      ...row,
      avgMs: row.answered ? Math.round(row.avgMs / row.answered) : 0,
    })),
  );
}

export async function getInstructorRaceState(sectionCode: string) {
  const section = await prisma.section.findUnique({
    where: { code: sectionCode.trim().toUpperCase() },
    select: { id: true },
  });
  if (!section) throw new DataRaceError("Unknown section.", 404);
  const race = await raceForSection(section.id);
  const question = race.questions.find((item) => item.position === race.currentPosition) ?? null;
  const responseCount = question
    ? await prisma.dataRaceResponse.count({ where: { questionId: question.id } })
    : 0;
  const currentRows = race.phase === "leaderboard" ? await leaderboard(race.id, race.currentPosition) : [];
  const previousRows = race.phase === "leaderboard" ? await leaderboard(race.id, Math.max(0, race.currentPosition - 1)) : [];
  const priorRank = new Map(previousRows.map((row, index) => [row.userId, index + 1]));
  return {
    serverNow: new Date().toISOString(),
    id: race.id,
    title: race.title,
    sectionCode: race.section.code,
    phase: race.phase,
    version: race.version,
    currentPosition: race.currentPosition,
    totalQuestions: race.questions.length,
    question:
      question && race.phase !== "waiting" && race.phase !== "complete"
        ? {
            id: question.id,
            position: question.position,
            prompt: question.prompt,
            options: parseOptions(question.options),
            difficulty: question.difficulty,
            durationSeconds: question.durationSeconds,
            endsAt: race.questionEndsAt?.toISOString() ?? null,
          }
        : null,
    responseCount,
    participantCount: await prisma.user.count({ where: { sectionId: section.id, role: "student" } }),
    leaderboard: currentRows.map((row, index) => ({
      rank: index + 1,
      movement: priorRank.has(row.userId) ? (priorRank.get(row.userId) ?? index + 1) - (index + 1) : 0,
      name: row.name,
      correct: row.correct,
      accuracy: row.answered ? Math.round((row.correct / row.answered) * 100) : 0,
      avgSeconds: Number((row.avgMs / 1_000).toFixed(1)),
      streak: row.streak,
      totalPoints: row.totalPoints,
    })),
  };
}

export type DataRaceAction = "start" | "show_leaderboard" | "next" | "reset" | "end";

export async function controlDataRace(input: {
  sectionCode: string;
  action: DataRaceAction;
  actorId: string;
}) {
  const state = await getInstructorRaceState(input.sectionCode);
  const now = new Date();
  let data: {
    phase: DataRacePhase;
    currentPosition?: number;
    questionStartedAt?: Date | null;
    questionEndsAt?: Date | null;
  };

  if (input.action === "start") {
    if (state.phase !== "waiting") throw new DataRaceError("The race has already started.", 409);
    const question = await prisma.dataRaceQuestion.findUniqueOrThrow({
      where: { raceId_position: { raceId: state.id, position: 1 } },
    });
    data = {
      phase: "question",
      currentPosition: 1,
      questionStartedAt: now,
      questionEndsAt: new Date(now.getTime() + question.durationSeconds * 1_000),
    };
  } else if (input.action === "show_leaderboard") {
    if (state.phase !== "feedback") throw new DataRaceError("Wait for the timer to finish first.", 409);
    data = { phase: "leaderboard" };
  } else if (input.action === "next") {
    if (state.phase !== "leaderboard") throw new DataRaceError("Show the leaderboard before the next question.", 409);
    const nextPosition = state.currentPosition + 1;
    if (nextPosition > state.totalQuestions) {
      data = { phase: "complete", questionStartedAt: null, questionEndsAt: null };
    } else {
      const question = await prisma.dataRaceQuestion.findUniqueOrThrow({
        where: { raceId_position: { raceId: state.id, position: nextPosition } },
      });
      data = {
        phase: "question",
        currentPosition: nextPosition,
        questionStartedAt: now,
        questionEndsAt: new Date(now.getTime() + question.durationSeconds * 1_000),
      };
    }
  } else if (input.action === "reset") {
    try {
      await prisma.$transaction([
        prisma.dataRace.update({
        where: { id: state.id },
        data: {
          phase: "waiting",
          currentPosition: 0,
          questionStartedAt: null,
          questionEndsAt: null,
          version: { increment: 1 },
        },
        }),
        prisma.dataRaceResponse.deleteMany({ where: { question: { raceId: state.id } } }),
        prisma.auditLog.create({
        data: { actorId: input.actorId, action: "data_race.reset", targetType: "DataRace", targetId: state.id },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new DataRaceError("Race state changed. Refresh and try again.", 409);
      }
      throw error;
    }
    return getInstructorRaceState(input.sectionCode);
  } else {
    data = { phase: "complete", questionStartedAt: null, questionEndsAt: null };
  }

  try {
    await prisma.$transaction([
      prisma.dataRace.update({
      where: { id: state.id, version: state.version },
      data: { ...data, version: { increment: 1 } },
      }),
      prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `data_race.${input.action}`,
        targetType: "DataRace",
        targetId: state.id,
        before: { phase: state.phase, position: state.currentPosition },
        after: { phase: data.phase, position: data.currentPosition ?? state.currentPosition },
      },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new DataRaceError("Race state changed. Refresh and try again.", 409);
    }
    throw error;
  }
  return getInstructorRaceState(input.sectionCode);
}
