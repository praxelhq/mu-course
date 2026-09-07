-- CreateTable
CREATE TABLE "InterviewRetake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "usedByInterviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewRetake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewRetake_userId_idx" ON "InterviewRetake"("userId");
