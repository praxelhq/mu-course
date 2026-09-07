CREATE TYPE "DataRacePhase" AS ENUM ('waiting', 'question', 'feedback', 'leaderboard', 'complete');

CREATE TABLE "DataRace" (
    "id" TEXT NOT NULL,
    "sessionNo" INTEGER NOT NULL DEFAULT 3,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Data Race',
    "datasetId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "phase" "DataRacePhase" NOT NULL DEFAULT 'waiting',
    "currentPosition" INTEGER NOT NULL DEFAULT 0,
    "questionStartedAt" TIMESTAMP(3),
    "questionEndsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataRace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRaceQuestion" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOptionId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "sourceNote" TEXT,
    CONSTRAINT "DataRaceQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRaceResponse" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "streak" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataRaceResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataRace_sessionNo_sectionId_key" ON "DataRace"("sessionNo", "sectionId");
CREATE INDEX "DataRace_sectionId_idx" ON "DataRace"("sectionId");
CREATE UNIQUE INDEX "DataRaceQuestion_raceId_position_key" ON "DataRaceQuestion"("raceId", "position");
CREATE INDEX "DataRaceQuestion_raceId_idx" ON "DataRaceQuestion"("raceId");
CREATE UNIQUE INDEX "DataRaceResponse_questionId_userId_key" ON "DataRaceResponse"("questionId", "userId");
CREATE INDEX "DataRaceResponse_userId_idx" ON "DataRaceResponse"("userId");
CREATE INDEX "DataRaceResponse_questionId_points_idx" ON "DataRaceResponse"("questionId", "points");

ALTER TABLE "DataRace" ADD CONSTRAINT "DataRace_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataRaceQuestion" ADD CONSTRAINT "DataRaceQuestion_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "DataRace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRaceResponse" ADD CONSTRAINT "DataRaceResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DataRaceQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRaceResponse" ADD CONSTRAINT "DataRaceResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
