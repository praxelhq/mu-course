CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'analyzing', 'review', 'approved', 'generating', 'complete', 'failed', 'deleting');
CREATE TYPE "JobKind" AS ENUM ('analyze', 'rethink', 'generate');
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'complete', 'failed');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "clerkUserId" TEXT NOT NULL,
  "email" TEXT,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "uiReferenceUrl" TEXT,
  "niche" TEXT NOT NULL,
  "usp" TEXT NOT NULL,
  "buildTarget" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
  "currentUnderstanding" INTEGER,
  "approvedVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UnderstandingVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnderstandingVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PromptSet" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "understandingVersion" INTEGER NOT NULL,
  "platform" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(10,6),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptSet_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProviderRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "JobKind" NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT NOT NULL,
  "requestedModel" TEXT,
  "servedModel" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(10,6),
  "sanitizedError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Entitlement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "productId" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebhookReceipt" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventTime" TIMESTAMP(3),
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" TEXT NOT NULL,
  CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
CREATE UNIQUE INDEX "UnderstandingVersion_projectId_version_key" ON "UnderstandingVersion"("projectId", "version");
CREATE UNIQUE INDEX "PromptSet_projectId_understandingVersion_platform_templateVersion_key" ON "PromptSet"("projectId", "understandingVersion", "platform", "templateVersion");
CREATE UNIQUE INDEX "ProviderRun_idempotencyKey_key" ON "ProviderRun"("idempotencyKey");
CREATE INDEX "ProviderRun_projectId_createdAt_idx" ON "ProviderRun"("projectId", "createdAt");
CREATE UNIQUE INDEX "Entitlement_userId_key" ON "Entitlement"("userId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnderstandingVersion" ADD CONSTRAINT "UnderstandingVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptSet" ADD CONSTRAINT "PromptSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderRun" ADD CONSTRAINT "ProviderRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
