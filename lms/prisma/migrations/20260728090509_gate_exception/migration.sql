-- CreateTable
CREATE TABLE "GateException" (
    "id" TEXT NOT NULL,
    "targetType" "GateTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GateException_userId_idx" ON "GateException"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GateException_targetType_targetId_userId_key" ON "GateException"("targetType", "targetId", "userId");
