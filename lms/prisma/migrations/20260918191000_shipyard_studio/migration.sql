-- CreateTable
CREATE TABLE "ShipyardStudioIdentity" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardStudioIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioWorkspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardStudioWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "checkpoint" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "members" JSONB NOT NULL,
    "rubric" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "review" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioAppeal" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "emailPayload" JSONB NOT NULL,
    "emailStatus" TEXT NOT NULL DEFAULT 'pending',
    "emailId" TEXT,
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardStudioFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardStudioKnowledge" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardStudioKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioIdentity_clerkId_key" ON "ShipyardStudioIdentity"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioIdentity_email_key" ON "ShipyardStudioIdentity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioMember_identityId_key" ON "ShipyardStudioMember"("identityId");

-- CreateIndex
CREATE INDEX "ShipyardStudioMember_workspaceId_idx" ON "ShipyardStudioMember"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioInvitation_tokenHash_key" ON "ShipyardStudioInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "ShipyardStudioInvitation_email_expiresAt_idx" ON "ShipyardStudioInvitation"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioRevision_workspaceId_version_key" ON "ShipyardStudioRevision"("workspaceId", "version");

-- CreateIndex
CREATE INDEX "ShipyardStudioSubmission_workspaceId_checkpoint_createdAt_idx" ON "ShipyardStudioSubmission"("workspaceId", "checkpoint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioSubmission_workspaceId_checkpoint_version_key" ON "ShipyardStudioSubmission"("workspaceId", "checkpoint", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioAppeal_submissionId_key" ON "ShipyardStudioAppeal"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioJob_requestKey_key" ON "ShipyardStudioJob"("requestKey");

-- CreateIndex
CREATE INDEX "ShipyardStudioJob_status_createdAt_idx" ON "ShipyardStudioJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardStudioJob_workspaceId_createdAt_idx" ON "ShipyardStudioJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardStudioFile_key_key" ON "ShipyardStudioFile"("key");

-- CreateIndex
CREATE INDEX "ShipyardStudioFile_workspaceId_idx" ON "ShipyardStudioFile"("workspaceId");

-- CreateIndex
CREATE INDEX "ShipyardStudioKnowledge_source_idx" ON "ShipyardStudioKnowledge"("source");

-- AddForeignKey
ALTER TABLE "ShipyardStudioMember" ADD CONSTRAINT "ShipyardStudioMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioMember" ADD CONSTRAINT "ShipyardStudioMember_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "ShipyardStudioIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioInvitation" ADD CONSTRAINT "ShipyardStudioInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioRevision" ADD CONSTRAINT "ShipyardStudioRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioSubmission" ADD CONSTRAINT "ShipyardStudioSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioAppeal" ADD CONSTRAINT "ShipyardStudioAppeal_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ShipyardStudioSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioJob" ADD CONSTRAINT "ShipyardStudioJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardStudioFile" ADD CONSTRAINT "ShipyardStudioFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ShipyardStudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE INDEX "ShipyardStudioKnowledge_search_idx" ON "ShipyardStudioKnowledge" USING GIN (to_tsvector('english', title || ' ' || text));
