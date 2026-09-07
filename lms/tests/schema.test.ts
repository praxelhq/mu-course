import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";

// A live local Postgres was available when this unit was built, so the DB
// round-trip tests below run for real. They self-skip (describe.skipIf) when
// DATABASE_URL is absent or the DB is unreachable.

describe("prisma schema", () => {
  it("validates", () => {
    // Throws (non-zero exit) if the schema is invalid.
    execFileSync("pnpm", ["prisma", "validate"], { stdio: "pipe" });
  });
});

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

describe.skipIf(!live)("database round-trip (rolled back)", () => {
  const prisma = new PrismaClient();
  const ROLLBACK = new Error("rollback");

  it("creates and reads one row per core model inside a rolled-back transaction", async () => {
    await expect(
      prisma
        .$transaction(async (tx) => {
          const section = await tx.section.create({
            data: { code: `T${Date.now()}`, name: "Test Section" },
          });
          const team = await tx.team.create({
            data: { sectionId: section.id, name: "Team 1", sectorName: "Fintech" },
          });
          const user = await tx.user.create({
            data: {
              email: `test-${Date.now()}@example.com`,
              name: "Test User",
              role: "student",
              sectionId: section.id,
              teamId: team.id,
            },
          });
          const type = await tx.assignmentType.create({
            data: {
              slug: `test-type-${Date.now()}`,
              title: "Test Type",
              description: "d",
              submissionSchema: {},
              rubric: {},
            },
          });
          const assignment = await tx.assignment.create({
            data: {
              assignmentTypeId: type.id,
              title: "A1",
              brief: "b",
              sectionIds: [section.id],
            },
          });
          const submission = await tx.submission.create({
            data: {
              assignmentId: assignment.id,
              userId: user.id,
              fields: { answer: "x" },
              files: [],
            },
          });
          const grade = await tx.grade.create({
            data: {
              submissionId: submission.id,
              rubricScores: {},
              total: 80,
              confidence: 0.9,
              feedbackMd: "ok",
              flags: [],
              gradedBy: "ai",
            },
          });
          const interview = await tx.interview.create({
            data: { userId: user.id },
          });
          await tx.interviewTurn.create({
            data: {
              interviewId: interview.id,
              turnNo: 1,
              speaker: "agent",
              text: "hello",
              startedAt: new Date(),
            },
          });
          const quiz = await tx.quiz.create({
            data: { sessionNo: 1, title: "Q1", questions: [], sectionIds: [] },
          });
          await tx.quizAttempt.create({
            data: { quizId: quiz.id, userId: user.id, answers: {}, scorePct: 50 },
          });
          const gate = await tx.gate.create({
            data: {
              targetType: "session",
              targetId: "session-1",
              sectionId: section.id,
              state: "open",
            },
          });

          // Read back a few rows to prove round-trip.
          const readUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
          expect(readUser.email).toBe(user.email);
          const readSub = await tx.submission.findUniqueOrThrow({
            where: { id: submission.id },
          });
          expect(readSub.status).toBe("draft");
          expect(readSub.version).toBe(1);
          const readGrade = await tx.grade.findUniqueOrThrow({ where: { id: grade.id } });
          expect(readGrade.provisional).toBe(true);
          expect(gate.state).toBe("open");

          throw ROLLBACK; // never persist test rows
        })
        .catch((e) => {
          if (e !== ROLLBACK) throw e;
        }),
    ).resolves.toBeUndefined();
  });

  it("rejects a duplicate Gate (targetType, targetId, sectionId)", async () => {
    await expect(
      prisma
        .$transaction(async (tx) => {
          const section = await tx.section.create({
            data: { code: `G${Date.now()}`, name: "Gate Section" },
          });
          await tx.gate.create({
            data: {
              targetType: "quiz",
              targetId: "quiz-1",
              sectionId: section.id,
              state: "locked",
            },
          });
          await tx.gate.create({
            data: {
              targetType: "quiz",
              targetId: "quiz-1",
              sectionId: section.id,
              state: "open",
            },
          });
        })
        .catch((e) => {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            throw new Error("UNIQUE_VIOLATION");
          }
          throw e;
        }),
    ).rejects.toThrow("UNIQUE_VIOLATION");
  });
});
