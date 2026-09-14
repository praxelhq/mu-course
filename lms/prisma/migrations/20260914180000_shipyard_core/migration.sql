-- CreateEnum
CREATE TYPE "ShipyardCheckpointKey" AS ENUM ('idea', 'design', 'working', 'money', 'workflow', 'launch');

-- CreateEnum
CREATE TYPE "ShipyardGateType" AS ENUM ('review', 'metric', 'both');

-- CreateEnum
CREATE TYPE "ShipyardSubmissionStatus" AS ENUM ('draft', 'submitted', 'in_review', 'returned', 'passed');

-- CreateEnum
CREATE TYPE "ShipyardVerdict" AS ENUM ('pass', 'return');

-- CreateEnum
CREATE TYPE "ShipyardReviewer" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "ShipyardGateState" AS ENUM ('locked', 'open', 'passed');

-- CreateEnum
CREATE TYPE "ShipyardRoutingProfile" AS ENUM ('flash_verdicts', 'flash_everywhere');

-- CreateTable
CREATE TABLE "ShipyardProduct" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "liveUrl" TEXT,
    "waitlistUrl" TEXT,
    "trackerProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardCheckpoint" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "key" "ShipyardCheckpointKey" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "barMarkdown" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    "gateType" "ShipyardGateType" NOT NULL,
    "acceptsImages" BOOLEAN NOT NULL DEFAULT false,
    "fieldSchema" JSONB NOT NULL,
    "metricSignals" JSONB NOT NULL,
    "deadlineAt" TIMESTAMP(3),
    "resubmitWindowHours" INTEGER NOT NULL DEFAULT 72,
    "resubmitCooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardSubmission" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "productId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "status" "ShipyardSubmissionStatus" NOT NULL DEFAULT 'draft',
    "fields" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "nextAllowedResubmitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardReview" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "submissionId" TEXT NOT NULL,
    "verdict" "ShipyardVerdict" NOT NULL,
    "reasons" JSONB NOT NULL,
    "rubricScores" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "metricSignalsSeen" JSONB,
    "renderArtifacts" JSONB,
    "promptLog" JSONB,
    "modelUsed" TEXT NOT NULL,
    "providerUsed" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewedBy" "ShipyardReviewer" NOT NULL DEFAULT 'ai',
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "humanResolvedAt" TIMESTAMP(3),
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardCheckpointState" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "productId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "state" "ShipyardGateState" NOT NULL DEFAULT 'locked',
    "openedAt" TIMESTAMP(3),
    "passedAt" TIMESTAMP(3),
    "reviewClearedAt" TIMESTAMP(3),
    "metricClearedAt" TIMESTAMP(3),
    "manuallyOpenedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardCheckpointState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardGrade" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "productId" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "allCheckpointsCleared" BOOLEAN NOT NULL DEFAULT false,
    "weightsVersion" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "finalisedBy" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardWeights" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "version" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardWeights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardRouterState" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "anthropicExhausted" BOOLEAN NOT NULL DEFAULT false,
    "exhaustedAt" TIMESTAMP(3),
    "consecutiveByokFailures" INTEGER NOT NULL DEFAULT 0,
    "activeProfile" "ShipyardRoutingProfile" NOT NULL DEFAULT 'flash_verdicts',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardRouterState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardTrackerOverride" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL DEFAULT 'course-2',
    "productId" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardTrackerOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardProduct_userId_key" ON "ShipyardProduct"("userId");

-- CreateIndex
CREATE INDEX "ShipyardProduct_courseId_idx" ON "ShipyardProduct"("courseId");

-- CreateIndex
CREATE INDEX "ShipyardProduct_trackerProductId_idx" ON "ShipyardProduct"("trackerProductId");

-- CreateIndex
CREATE INDEX "ShipyardCheckpoint_courseId_order_idx" ON "ShipyardCheckpoint"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardCheckpoint_courseId_key_key" ON "ShipyardCheckpoint"("courseId", "key");

-- CreateIndex
CREATE INDEX "ShipyardSubmission_courseId_idx" ON "ShipyardSubmission"("courseId");

-- CreateIndex
CREATE INDEX "ShipyardSubmission_productId_checkpointId_idx" ON "ShipyardSubmission"("productId", "checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardSubmission_productId_checkpointId_version_key" ON "ShipyardSubmission"("productId", "checkpointId", "version");

-- CreateIndex
CREATE INDEX "ShipyardReview_submissionId_idx" ON "ShipyardReview"("submissionId");

-- CreateIndex
CREATE INDEX "ShipyardReview_needsHuman_createdAt_idx" ON "ShipyardReview"("needsHuman", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardReview_courseId_idx" ON "ShipyardReview"("courseId");

-- CreateIndex
CREATE INDEX "ShipyardCheckpointState_courseId_idx" ON "ShipyardCheckpointState"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardCheckpointState_productId_checkpointId_key" ON "ShipyardCheckpointState"("productId", "checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardGrade_productId_key" ON "ShipyardGrade"("productId");

-- CreateIndex
CREATE INDEX "ShipyardGrade_courseId_idx" ON "ShipyardGrade"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardWeights_version_key" ON "ShipyardWeights"("version");

-- CreateIndex
CREATE INDEX "ShipyardWeights_courseId_idx" ON "ShipyardWeights"("courseId");

-- CreateIndex
CREATE INDEX "ShipyardRouterState_courseId_idx" ON "ShipyardRouterState"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardTrackerOverride_productId_key" ON "ShipyardTrackerOverride"("productId");

-- CreateIndex
CREATE INDEX "ShipyardTrackerOverride_courseId_idx" ON "ShipyardTrackerOverride"("courseId");

-- AddForeignKey
ALTER TABLE "ShipyardProduct" ADD CONSTRAINT "ShipyardProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSubmission" ADD CONSTRAINT "ShipyardSubmission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShipyardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSubmission" ADD CONSTRAINT "ShipyardSubmission_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "ShipyardCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardReview" ADD CONSTRAINT "ShipyardReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ShipyardSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardCheckpointState" ADD CONSTRAINT "ShipyardCheckpointState_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShipyardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardCheckpointState" ADD CONSTRAINT "ShipyardCheckpointState_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "ShipyardCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardGrade" ADD CONSTRAINT "ShipyardGrade_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShipyardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardTrackerOverride" ADD CONSTRAINT "ShipyardTrackerOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShipyardProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

