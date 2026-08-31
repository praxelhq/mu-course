-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'arrival',
    "phaseStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phaseEndsAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "board" JSONB NOT NULL DEFAULT '{}',
    "lockedAt" TIMESTAMP(3),
    "pitching" BOOLEAN NOT NULL DEFAULT false,
    "votedForId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_sectionCode_key" ON "Room"("sectionCode");

-- CreateIndex
CREATE INDEX "Player_roomId_lockedAt_idx" ON "Player"("roomId", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Player_roomId_handle_key" ON "Player"("roomId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "Player_roomId_seat_key" ON "Player"("roomId", "seat");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

