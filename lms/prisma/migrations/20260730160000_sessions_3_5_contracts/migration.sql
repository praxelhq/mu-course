-- Sessions 3–5 contract foundation. Forward-only and additive: all existing
-- assignments remain explicitly legacy until a loader publishes a version and
-- moves the active pointer.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Historical legacy grading stored raw prompts and provider responses. They
-- are not required for academic receipts and can contain learner evidence or
-- evaluator instructions. New writes retain only allowlisted metadata.
UPDATE "Grade" SET "promptLog" = NULL WHERE "promptLog" IS NOT NULL;
UPDATE "AuditLog"
SET
  "before" = CASE
    WHEN jsonb_typeof("before") = 'object'
      THEN "before" - ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
    ELSE "before"
  END,
  "after" = CASE
    WHEN jsonb_typeof("after") = 'object'
      THEN "after" - ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
    ELSE "after"
  END
WHERE (
    jsonb_typeof("before") = 'object'
    AND "before" ?| ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
  ) OR (
    jsonb_typeof("after") = 'object'
    AND "after" ?| ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
  );

-- Erased actor tokens are durable historical pseudonyms, never live User ids.
-- Reserving the namespace prevents a later roster import from making an old
-- academic attribution resolve to a new principal.
ALTER TABLE "User"
  ADD CONSTRAINT "User_id_not_dpdp_actor_pseudonym"
  CHECK ("id" NOT LIKE 'dpdp-erased-actor:v1:%') NOT VALID;

ALTER TABLE "User"
  VALIDATE CONSTRAINT "User_id_not_dpdp_actor_pseudonym";

CREATE TYPE "ContractMode" AS ENUM ('legacy', 'versioned');
CREATE TYPE "OwnerKind" AS ENUM ('individual', 'team');
CREATE TYPE "AssessmentPurpose" AS ENUM ('graded', 'formative');
CREATE TYPE "AssessmentResultStatus" AS ENUM ('pending', 'claimed', 'deterministic_complete', 'provider_pending', 'completed', 'repair_required', 'failed', 'dead_lettered');
CREATE TYPE "ResubmissionGrantKind" AS ENUM ('improvement', 'repair');
CREATE TYPE "EvidenceScanState" AS ENUM ('pending', 'clean', 'quarantined', 'deleted');
CREATE TYPE "GeneratedObjectPurpose" AS ENUM ('gallery_screenshot', 'publication_preview', 'interview_recording', 'interview_turn_audio');
CREATE TYPE "GradeAppealStatus" AS ENUM ('open', 'resolved', 'withdrawn');
CREATE TYPE "GradeHoldKind" AS ENUM ('low_confidence', 'flag', 'outlier', 'repair', 'appeal');
CREATE TYPE "GradeHoldStatus" AS ENUM ('open', 'resolved');
CREATE TYPE "PublicationReviewState" AS ENUM ('pending', 'approved', 'withheld', 'revoked');
CREATE TYPE "TeamNominationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE "QuizClassification" AS ENUM ('diagnostic', 'formative', 'summative');
CREATE TYPE "QuizAnswerMode" AS ENUM ('legacy_index', 'stable_id');

ALTER TABLE "Assignment"
  ADD COLUMN "activeAssessmentVersionId" TEXT,
  ADD COLUMN "contractMode" "ContractMode" NOT NULL DEFAULT 'legacy';

ALTER TABLE "Submission"
  ADD COLUMN "assessmentVersionId" TEXT,
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "ownerKind" "OwnerKind",
  ADD COLUMN "resubmissionGrantId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "GalleryItem"
  ADD COLUMN "screenshotS3VersionId" TEXT;

ALTER TABLE "Interview"
  ADD COLUMN "audioS3VersionId" TEXT;

ALTER TABLE "InterviewTurn"
  ADD COLUMN "audioS3VersionId" TEXT;

ALTER TABLE "Quiz"
  ADD COLUMN "contractMode" "ContractMode" NOT NULL DEFAULT 'legacy',
  ADD COLUMN "contractVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "classification" "QuizClassification" NOT NULL DEFAULT 'summative',
  ADD COLUMN "countsTowardBestOf" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "classificationFinalizedAt" TIMESTAMP(3),
  ADD COLUMN "classifiedBy" TEXT,
  ADD COLUMN "feedbackReleaseAt" TIMESTAMP(3),
  ADD COLUMN "answerMode" "QuizAnswerMode" NOT NULL DEFAULT 'legacy_index',
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Preserve the legacy engine while classifying existing diagnostics correctly.
-- Constraints are deliberately installed only after this backfill: adding the
-- diagnostic equality check in the column ALTER would reject pre-existing
-- isDiagnostic=true rows while their new enum still held its summative default.
UPDATE "Quiz"
SET
  "classification" = CASE WHEN "isDiagnostic" THEN 'diagnostic'::"QuizClassification" ELSE 'summative'::"QuizClassification" END,
  "countsTowardBestOf" = NOT "isDiagnostic",
  "classificationFinalizedAt" = CURRENT_TIMESTAMP,
  "classifiedBy" = 'migration:legacy-quiz-contract';

ALTER TABLE "Quiz"
  ADD CONSTRAINT "Quiz_contract_version_check" CHECK ("contractVersion" > 0) NOT VALID,
  ADD CONSTRAINT "Quiz_diagnostic_compatibility_check" CHECK (("classification" = 'diagnostic') = "isDiagnostic") NOT VALID,
  ADD CONSTRAINT "Quiz_best_of_classification_check" CHECK (NOT "countsTowardBestOf" OR "classification" = 'summative') NOT VALID,
  ADD CONSTRAINT "Quiz_classification_finalizer_check" CHECK (("classificationFinalizedAt" IS NULL) = ("classifiedBy" IS NULL)) NOT VALID,
  ADD CONSTRAINT "Quiz_versioned_answer_mode_check" CHECK ("contractMode" = 'legacy' OR "answerMode" = 'stable_id') NOT VALID,
  ADD CONSTRAINT "Quiz_published_contract_check" CHECK (
    "publishedAt" IS NULL OR (
      "contentHash" IS NOT NULL
      AND "classificationFinalizedAt" IS NOT NULL
      AND ("contractMode" = 'legacy' OR "feedbackReleaseAt" IS NOT NULL)
    )
  ) NOT VALID;

ALTER TABLE "Quiz"
  VALIDATE CONSTRAINT "Quiz_contract_version_check",
  VALIDATE CONSTRAINT "Quiz_diagnostic_compatibility_check",
  VALIDATE CONSTRAINT "Quiz_best_of_classification_check",
  VALIDATE CONSTRAINT "Quiz_classification_finalizer_check",
  VALIDATE CONSTRAINT "Quiz_versioned_answer_mode_check",
  VALIDATE CONSTRAINT "Quiz_published_contract_check";

ALTER TABLE "QuizAttempt"
  ADD COLUMN "quizContractVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "answerMode" "QuizAnswerMode" NOT NULL DEFAULT 'legacy_index',
  ADD CONSTRAINT "QuizAttempt_contract_version_check" CHECK ("quizContractVersion" > 0);

CREATE TABLE "RetentionPolicy" (
  "id" TEXT NOT NULL,
  "classKey" TEXT NOT NULL,
  "objectClass" TEXT NOT NULL,
  "expiresAfterDays" INTEGER,
  "deletionAuthority" TEXT NOT NULL,
  "legalHoldBehavior" TEXT NOT NULL,
  "s3CleanupRequired" BOOLEAN NOT NULL DEFAULT false,
  "databaseCleanupPolicy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionHold" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedBy" TEXT,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeletionReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "retentionPolicyId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "s3Key" TEXT,
  "s3VersionId" TEXT,
  "databaseTable" TEXT,
  "databaseRecordId" TEXT,
  "requestedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "s3VerifiedAt" TIMESTAMP(3),
  "databaseVerifiedAt" TIMESTAMP(3),
  "details" JSONB,
  CONSTRAINT "DeletionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DatasetRelease" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "lineage" JSONB NOT NULL,
  "sourceDate" TIMESTAMP(3),
  "audience" TEXT NOT NULL,
  "processingRules" JSONB NOT NULL,
  "approvedAiProcessors" TEXT[] NOT NULL,
  "manifest" JSONB NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "retentionPolicyId" TEXT,
  "supersedesId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatasetRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DatasetRelease_version_check" CHECK ("version" > 0),
  CONSTRAINT "DatasetRelease_checksum_check" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "DatasetReleaseFile" (
  "id" TEXT NOT NULL,
  "datasetReleaseId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatasetReleaseFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DatasetReleaseFile_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "DatasetReleaseFile_checksum_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "AssessmentVersion" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "ownerKind" "OwnerKind" NOT NULL,
  "purpose" "AssessmentPurpose" NOT NULL,
  "publicSchema" JSONB NOT NULL,
  "rubric" JSONB NOT NULL,
  "materialManifest" JSONB NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "scoringPolicy" JSONB NOT NULL,
  "portfolioPolicy" JSONB NOT NULL,
  "publicationPolicy" JSONB NOT NULL,
  "exportPolicy" JSONB NOT NULL,
  "previewPolicy" JSONB NOT NULL,
  "datasetReleaseId" TEXT,
  "retentionPolicyId" TEXT,
  "improvementAllowed" BOOLEAN NOT NULL DEFAULT false,
  "improvementWindowDays" INTEGER NOT NULL DEFAULT 10,
  "supersedesId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "AssessmentVersion_window_check" CHECK ("improvementWindowDays" > 0),
  CONSTRAINT "AssessmentVersion_checksum_check" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "AssessmentEvaluatorConfig" (
  "id" TEXT NOT NULL,
  "assessmentVersionId" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "answerKey" JSONB,
  "anchors" JSONB,
  "normalization" JSONB,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentEvaluatorConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentEvaluatorConfig_checksum_check" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "AssessmentResult" (
  "id" TEXT NOT NULL,
  "evaluationKey" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "assessmentVersionId" TEXT,
  "ownerKind" "OwnerKind",
  "ownerId" TEXT,
  "version" INTEGER NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "purpose" "AssessmentPurpose" NOT NULL,
  "status" "AssessmentResultStatus" NOT NULL DEFAULT 'pending',
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "deterministicResult" JSONB,
  "providerResult" JSONB,
  "structuredFeedback" JSONB,
  "citations" JSONB,
  "assessmentHash" TEXT,
  "datasetHash" TEXT,
  "evaluatorHash" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "deadLetteredAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "scoreable" BOOLEAN NOT NULL DEFAULT false,
  "publishable" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentResult_version_attempt_check" CHECK ("version" > 0 AND "attempt" > 0)
);

CREATE TABLE "UploadReservation" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "assessmentVersionId" TEXT,
  "ownerKind" "OwnerKind" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "fileRole" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "s3VersionId" TEXT,
  "declaredContentType" TEXT NOT NULL,
  "declaredBytes" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadReservation_declared_bytes_check" CHECK ("declaredBytes" > 0)
);

CREATE TABLE "GeneratedObjectReservation" (
  "id" TEXT NOT NULL,
  "purpose" "GeneratedObjectPurpose" NOT NULL,
  "submissionId" TEXT,
  "interviewId" TEXT,
  "targetId" TEXT,
  "s3Key" TEXT NOT NULL,
  "declaredContentType" TEXT,
  "declaredBytes" INTEGER,
  "s3VersionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedObjectReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeneratedObjectReservation_exactly_one_parent_check" CHECK (
    ("submissionId" IS NOT NULL)::INTEGER + ("interviewId" IS NOT NULL)::INTEGER = 1
  ),
  CONSTRAINT "GeneratedObjectReservation_purpose_parent_check" CHECK (
    ("purpose" IN ('gallery_screenshot', 'publication_preview') AND "submissionId" IS NOT NULL)
    OR
    ("purpose" IN ('interview_recording', 'interview_turn_audio') AND "interviewId" IS NOT NULL)
  ),
  CONSTRAINT "GeneratedObjectReservation_declared_bytes_check" CHECK (
    "declaredBytes" IS NULL OR "declaredBytes" > 0
  )
);

CREATE TABLE "SubmissionEvidence" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "fileRole" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "s3VersionId" TEXT NOT NULL,
  "etag" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "byteCount" INTEGER NOT NULL,
  "declaredContentType" TEXT NOT NULL,
  "inspectedMimeType" TEXT NOT NULL,
  "roleParserResult" JSONB,
  "scanState" "EvidenceScanState" NOT NULL,
  "quarantineReasonCode" TEXT,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replacesEvidenceId" TEXT,
  CONSTRAINT "SubmissionEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionEvidence_byte_count_check" CHECK ("byteCount" > 0),
  CONSTRAINT "SubmissionEvidence_checksum_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ResubmissionGrant" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "assessmentVersionId" TEXT NOT NULL,
  "ownerKind" "OwnerKind" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "ResubmissionGrantKind" NOT NULL,
  "targetVersion" INTEGER NOT NULL,
  "targetAttempt" INTEGER NOT NULL DEFAULT 1,
  "issuedBy" TEXT,
  "trigger" TEXT NOT NULL,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "extendedAt" TIMESTAMP(3),
  "extendedBy" TEXT,
  "extensionReason" TEXT,
  "consumedAt" TIMESTAMP(3),
  "consumedSubmissionId" TEXT,
  "sourceSubmissionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResubmissionGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResubmissionGrant_target_check" CHECK ("targetVersion" > 0 AND "targetAttempt" > 0)
);

CREATE TABLE "GradeAppeal" (
  "id" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "openedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "GradeAppealStatus" NOT NULL DEFAULT 'open',
  "outcome" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "holdId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeAppeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradeHold" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "gradeId" TEXT,
  "assessmentResultId" TEXT,
  "cohortFreezeId" TEXT,
  "kind" "GradeHoldKind" NOT NULL,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB,
  "status" "GradeHoldStatus" NOT NULL DEFAULT 'open',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedBy" TEXT,
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssessmentCohortFreeze" (
  "id" TEXT NOT NULL,
  "assessmentVersionId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "frozenAt" TIMESTAMP(3) NOT NULL,
  "frozenBy" TEXT NOT NULL,
  "membership" JSONB NOT NULL,
  "membershipHash" TEXT NOT NULL,
  "memberCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentCohortFreeze_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentCohortFreeze_membership_array_check" CHECK (jsonb_typeof("membership") = 'array'),
  CONSTRAINT "AssessmentCohortFreeze_member_count_check" CHECK ("memberCount" = jsonb_array_length("membership"))
);

CREATE TABLE "PublicationDecision" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "ownerConsent" BOOLEAN NOT NULL DEFAULT false,
  "ownerConsentBy" TEXT,
  "ownerConsentAt" TIMESTAMP(3),
  "ownerRevokedAt" TIMESTAMP(3),
  "instructorState" "PublicationReviewState" NOT NULL DEFAULT 'pending',
  "instructorDecidedBy" TEXT,
  "instructorDecidedAt" TIMESTAMP(3),
  "instructorReason" TEXT,
  "previewS3Key" TEXT,
  "previewS3VersionId" TEXT,
  "reviewedFingerprint" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicationDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamWorkflowSelection" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "nominationId" TEXT,
  "selectedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamWorkflowSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamWorkflowNomination" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "nominatedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "TeamNominationStatus" NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamWorkflowNomination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceHeartbeat" (
  "id" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "sourceSha" TEXT NOT NULL,
  "deploymentId" TEXT,
  "imageDigest" TEXT NOT NULL,
  "schemaHead" TEXT NOT NULL,
  "metadata" JSONB,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY ("id")
);

-- Abort before the canonical uniqueness index with an operator-readable
-- message. Versioned backfills must set every identity column together.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Submission"
    WHERE "assessmentVersionId" IS NOT NULL
    GROUP BY "assignmentId", "assessmentVersionId", "ownerKind", "ownerId", "version", "attempt"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'sessions_3_5_contracts preflight: duplicate owner/version/attempt submissions exist';
  END IF;
END $$;

ALTER TABLE "Submission"
  ADD CONSTRAINT "Submission_version_attempt_check" CHECK ("version" > 0 AND "attempt" > 0),
  ADD CONSTRAINT "Submission_versioned_owner_check" CHECK (
    "assessmentVersionId" IS NULL OR ("ownerKind" IS NOT NULL AND "ownerId" IS NOT NULL)
  );

CREATE UNIQUE INDEX "RetentionPolicy_classKey_key" ON "RetentionPolicy"("classKey");
CREATE INDEX "RetentionHold_targetType_targetId_releasedAt_idx" ON "RetentionHold"("targetType", "targetId", "releasedAt");
CREATE INDEX "DeletionReceipt_targetType_targetId_idx" ON "DeletionReceipt"("targetType", "targetId");
CREATE INDEX "DeletionReceipt_retentionPolicyId_idx" ON "DeletionReceipt"("retentionPolicyId");
CREATE UNIQUE INDEX "DeletionReceipt_idempotencyKey_key" ON "DeletionReceipt"("idempotencyKey");
CREATE INDEX "DatasetRelease_retentionPolicyId_idx" ON "DatasetRelease"("retentionPolicyId");
CREATE UNIQUE INDEX "DatasetRelease_slug_version_key" ON "DatasetRelease"("slug", "version");
CREATE INDEX "DatasetReleaseFile_datasetReleaseId_role_idx" ON "DatasetReleaseFile"("datasetReleaseId", "role");
CREATE UNIQUE INDEX "DatasetReleaseFile_datasetReleaseId_role_s3Key_key" ON "DatasetReleaseFile"("datasetReleaseId", "role", "s3Key");
CREATE INDEX "AssessmentVersion_datasetReleaseId_idx" ON "AssessmentVersion"("datasetReleaseId");
CREATE INDEX "AssessmentVersion_retentionPolicyId_idx" ON "AssessmentVersion"("retentionPolicyId");
CREATE UNIQUE INDEX "AssessmentVersion_assignmentId_version_key" ON "AssessmentVersion"("assignmentId", "version");
CREATE UNIQUE INDEX "AssessmentEvaluatorConfig_assessmentVersionId_key" ON "AssessmentEvaluatorConfig"("assessmentVersionId");
CREATE UNIQUE INDEX "AssessmentResult_evaluationKey_key" ON "AssessmentResult"("evaluationKey");
CREATE UNIQUE INDEX "AssessmentResult_submissionId_key" ON "AssessmentResult"("submissionId");
CREATE INDEX "AssessmentResult_ownerKind_ownerId_version_attempt_idx" ON "AssessmentResult"("ownerKind", "ownerId", "version", "attempt");
CREATE INDEX "AssessmentResult_assessmentVersionId_status_idx" ON "AssessmentResult"("assessmentVersionId", "status");
CREATE UNIQUE INDEX "UploadReservation_s3Key_key" ON "UploadReservation"("s3Key");
CREATE INDEX "UploadReservation_submissionId_fieldKey_idx" ON "UploadReservation"("submissionId", "fieldKey");
CREATE INDEX "UploadReservation_ownerKind_ownerId_assignmentId_createdAt_idx" ON "UploadReservation"("ownerKind", "ownerId", "assignmentId", "createdAt");
CREATE INDEX "UploadReservation_expiresAt_consumedAt_cancelledAt_idx" ON "UploadReservation"("expiresAt", "consumedAt", "cancelledAt");
CREATE UNIQUE INDEX "GeneratedObjectReservation_s3Key_key" ON "GeneratedObjectReservation"("s3Key");
CREATE INDEX "GeneratedObjectReservation_submissionId_purpose_createdAt_idx" ON "GeneratedObjectReservation"("submissionId", "purpose", "createdAt");
CREATE INDEX "GeneratedObjectReservation_interviewId_purpose_createdAt_idx" ON "GeneratedObjectReservation"("interviewId", "purpose", "createdAt");
CREATE INDEX "GeneratedObjectReservation_purpose_targetId_idx" ON "GeneratedObjectReservation"("purpose", "targetId");
CREATE INDEX "GeneratedObjectReservation_expiresAt_consumedAt_cancelledAt_idx" ON "GeneratedObjectReservation"("expiresAt", "consumedAt", "cancelledAt");
CREATE UNIQUE INDEX "SubmissionEvidence_reservationId_key" ON "SubmissionEvidence"("reservationId");
CREATE INDEX "SubmissionEvidence_submissionId_fieldKey_scanState_idx" ON "SubmissionEvidence"("submissionId", "fieldKey", "scanState");
CREATE INDEX "SubmissionEvidence_scanState_committedAt_id_idx" ON "SubmissionEvidence"("scanState", "committedAt", "id");
CREATE INDEX "SubmissionEvidence_replacesEvidenceId_scanState_idx" ON "SubmissionEvidence"("replacesEvidenceId", "scanState");
CREATE INDEX "SubmissionEvidence_s3Key_s3VersionId_idx" ON "SubmissionEvidence"("s3Key", "s3VersionId");
CREATE UNIQUE INDEX "ResubmissionGrant_consumedSubmissionId_key" ON "ResubmissionGrant"("consumedSubmissionId");
CREATE INDEX "ResubmissionGrant_ownerKind_ownerId_assignmentId_expiresAt_idx" ON "ResubmissionGrant"("ownerKind", "ownerId", "assignmentId", "expiresAt");
CREATE UNIQUE INDEX "ResubmissionGrant_owner_target_key" ON "ResubmissionGrant"("assignmentId", "assessmentVersionId", "ownerKind", "ownerId", "kind", "targetVersion", "targetAttempt");
CREATE INDEX "GradeAppeal_gradeId_status_idx" ON "GradeAppeal"("gradeId", "status");
CREATE UNIQUE INDEX "GradeAppeal_holdId_key" ON "GradeAppeal"("holdId");
CREATE UNIQUE INDEX "GradeAppeal_one_open_per_grade_key" ON "GradeAppeal"("gradeId") WHERE "status" = 'open';
CREATE INDEX "GradeHold_submissionId_status_idx" ON "GradeHold"("submissionId", "status");
CREATE INDEX "GradeHold_gradeId_status_idx" ON "GradeHold"("gradeId", "status");
CREATE INDEX "GradeHold_assessmentResultId_status_idx" ON "GradeHold"("assessmentResultId", "status");
CREATE INDEX "GradeHold_cohortFreezeId_status_idx" ON "GradeHold"("cohortFreezeId", "status");
CREATE UNIQUE INDEX "GradeHold_one_open_reason_key" ON "GradeHold"("submissionId", "kind", "code") WHERE "status" = 'open';
CREATE UNIQUE INDEX "AssessmentCohortFreeze_assessmentVersionId_sectionId_key" ON "AssessmentCohortFreeze"("assessmentVersionId", "sectionId");
CREATE INDEX "AssessmentCohortFreeze_cutoffAt_frozenAt_idx" ON "AssessmentCohortFreeze"("cutoffAt", "frozenAt");
CREATE UNIQUE INDEX "PublicationDecision_submissionId_key" ON "PublicationDecision"("submissionId");
CREATE INDEX "TeamWorkflowSelection_submissionId_idx" ON "TeamWorkflowSelection"("submissionId");
CREATE UNIQUE INDEX "TeamWorkflowSelection_teamId_assignmentId_key" ON "TeamWorkflowSelection"("teamId", "assignmentId");
CREATE UNIQUE INDEX "TeamWorkflowSelection_nominationId_key" ON "TeamWorkflowSelection"("nominationId");
CREATE INDEX "TeamWorkflowNomination_teamId_assignmentId_status_idx" ON "TeamWorkflowNomination"("teamId", "assignmentId", "status");
CREATE INDEX "TeamWorkflowNomination_submissionId_idx" ON "TeamWorkflowNomination"("submissionId");
CREATE INDEX "ServiceHeartbeat_serviceName_lastSeenAt_idx" ON "ServiceHeartbeat"("serviceName", "lastSeenAt");
CREATE UNIQUE INDEX "ServiceHeartbeat_serviceName_instanceId_key" ON "ServiceHeartbeat"("serviceName", "instanceId");
CREATE INDEX "Assignment_activeAssessmentVersionId_idx" ON "Assignment"("activeAssessmentVersionId");
CREATE INDEX "Submission_assessmentVersionId_idx" ON "Submission"("assessmentVersionId");
CREATE INDEX "Submission_ownerKind_ownerId_assignmentId_idx" ON "Submission"("ownerKind", "ownerId", "assignmentId");
CREATE UNIQUE INDEX "Submission_canonical_owner_version_attempt_key" ON "Submission"("assignmentId", "assessmentVersionId", "ownerKind", "ownerId", "version", "attempt");
CREATE UNIQUE INDEX "Submission_resubmissionGrantId_key" ON "Submission"("resubmissionGrantId");

ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_activeAssessmentVersionId_fkey" FOREIGN KEY ("activeAssessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_resubmissionGrantId_fkey" FOREIGN KEY ("resubmissionGrantId") REFERENCES "ResubmissionGrant"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "DeletionReceipt" ADD CONSTRAINT "DeletionReceipt_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "RetentionPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "RetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DatasetRelease" ADD CONSTRAINT "DatasetRelease_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DatasetRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DatasetReleaseFile" ADD CONSTRAINT "DatasetReleaseFile_datasetReleaseId_fkey" FOREIGN KEY ("datasetReleaseId") REFERENCES "DatasetRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_datasetReleaseId_fkey" FOREIGN KEY ("datasetReleaseId") REFERENCES "DatasetRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "RetentionPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentEvaluatorConfig" ADD CONSTRAINT "AssessmentEvaluatorConfig_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadReservation" ADD CONSTRAINT "UploadReservation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadReservation" ADD CONSTRAINT "UploadReservation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadReservation" ADD CONSTRAINT "UploadReservation_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedObjectReservation" ADD CONSTRAINT "GeneratedObjectReservation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedObjectReservation" ADD CONSTRAINT "GeneratedObjectReservation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionEvidence" ADD CONSTRAINT "SubmissionEvidence_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionEvidence" ADD CONSTRAINT "SubmissionEvidence_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UploadReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionEvidence" ADD CONSTRAINT "SubmissionEvidence_replacesEvidenceId_fkey" FOREIGN KEY ("replacesEvidenceId") REFERENCES "SubmissionEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResubmissionGrant" ADD CONSTRAINT "ResubmissionGrant_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResubmissionGrant" ADD CONSTRAINT "ResubmissionGrant_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResubmissionGrant" ADD CONSTRAINT "ResubmissionGrant_consumedSubmissionId_fkey" FOREIGN KEY ("consumedSubmissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResubmissionGrant" ADD CONSTRAINT "ResubmissionGrant_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeAppeal" ADD CONSTRAINT "GradeAppeal_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeAppeal" ADD CONSTRAINT "GradeAppeal_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "GradeHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeHold" ADD CONSTRAINT "GradeHold_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeHold" ADD CONSTRAINT "GradeHold_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeHold" ADD CONSTRAINT "GradeHold_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "AssessmentResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeHold" ADD CONSTRAINT "GradeHold_cohortFreezeId_fkey" FOREIGN KEY ("cohortFreezeId") REFERENCES "AssessmentCohortFreeze"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentCohortFreeze" ADD CONSTRAINT "AssessmentCohortFreeze_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicationDecision" ADD CONSTRAINT "PublicationDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowSelection" ADD CONSTRAINT "TeamWorkflowSelection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowSelection" ADD CONSTRAINT "TeamWorkflowSelection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowSelection" ADD CONSTRAINT "TeamWorkflowSelection_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowSelection" ADD CONSTRAINT "TeamWorkflowSelection_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "TeamWorkflowNomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowNomination" ADD CONSTRAINT "TeamWorkflowNomination_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowNomination" ADD CONSTRAINT "TeamWorkflowNomination_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamWorkflowNomination" ADD CONSTRAINT "TeamWorkflowNomination_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Parent rows and their private/file children become append-only at publish.
CREATE FUNCTION "reject_published_assessment_version_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'AssessmentVersion must be created as a draft before publish: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'published AssessmentVersion is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."publishedAt" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentEvaluatorConfig"
      WHERE "assessmentVersionId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'AssessmentVersion requires an evaluator config before publish: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."datasetReleaseId" IS NOT NULL THEN
      PERFORM dataset."id"
      FROM "DatasetRelease" dataset
      WHERE dataset."id" = NEW."datasetReleaseId"
      FOR SHARE OF dataset;
      IF NOT EXISTS (
        SELECT 1 FROM "DatasetRelease"
        WHERE "id" = NEW."datasetReleaseId" AND "publishedAt" IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'AssessmentVersion dataset release must be published before assessment publish: %', NEW."id" USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_published_AssessmentVersion"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentVersion"
FOR EACH ROW EXECUTE FUNCTION "reject_published_assessment_version_mutation"();

CREATE FUNCTION "protect_assessment_result_lifecycle"() RETURNS trigger AS $$
DECLARE
  old_terminal BOOLEAN;
  new_terminal BOOLEAN;
BEGIN
  new_terminal := NEW."status" IN ('completed', 'repair_required', 'dead_lettered');
  IF TG_OP = 'INSERT' THEN
    IF new_terminal AND NEW."completedAt" IS NULL THEN
      RAISE EXCEPTION 'terminal AssessmentResult requires completedAt: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    IF new_terminal AND (NEW."scoreable" OR NEW."publishable") THEN
      RAISE EXCEPTION 'terminal AssessmentResult must be instructor-finalised after worker completion: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."evaluationKey" IS DISTINCT FROM NEW."evaluationKey"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."assessmentVersionId" IS DISTINCT FROM NEW."assessmentVersionId"
    OR OLD."ownerKind" IS DISTINCT FROM NEW."ownerKind"
    OR OLD."ownerId" IS DISTINCT FROM NEW."ownerId"
    OR OLD."version" IS DISTINCT FROM NEW."version"
    OR OLD."attempt" IS DISTINCT FROM NEW."attempt"
    OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'AssessmentResult binding identity is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;

  old_terminal := OLD."status" IN ('completed', 'repair_required', 'dead_lettered');
  IF old_terminal THEN
    IF OLD."status" IS DISTINCT FROM NEW."status"
      OR OLD."claimToken" IS DISTINCT FROM NEW."claimToken"
      OR OLD."claimedAt" IS DISTINCT FROM NEW."claimedAt"
      OR OLD."deterministicResult" IS DISTINCT FROM NEW."deterministicResult"
      OR OLD."providerResult" IS DISTINCT FROM NEW."providerResult"
      OR OLD."structuredFeedback" IS DISTINCT FROM NEW."structuredFeedback"
      OR OLD."citations" IS DISTINCT FROM NEW."citations"
      OR OLD."assessmentHash" IS DISTINCT FROM NEW."assessmentHash"
      OR OLD."datasetHash" IS DISTINCT FROM NEW."datasetHash"
      OR OLD."evaluatorHash" IS DISTINCT FROM NEW."evaluatorHash"
      OR OLD."retryCount" IS DISTINCT FROM NEW."retryCount"
      OR OLD."deadLetteredAt" IS DISTINCT FROM NEW."deadLetteredAt"
      OR OLD."errorCode" IS DISTINCT FROM NEW."errorCode"
      OR OLD."completedAt" IS DISTINCT FROM NEW."completedAt"
    THEN
      RAISE EXCEPTION 'terminal AssessmentResult evidence is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."status" <> 'completed' AND (
      OLD."scoreable" IS DISTINCT FROM NEW."scoreable"
      OR OLD."publishable" IS DISTINCT FROM NEW."publishable"
    ) THEN
      RAISE EXCEPTION 'non-completed terminal AssessmentResult cannot be finalised: %', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'pending' AND NEW."status" IN ('claimed', 'failed', 'dead_lettered'))
    OR (OLD."status" = 'claimed' AND NEW."status" IN ('deterministic_complete', 'failed', 'dead_lettered'))
    OR (OLD."status" = 'deterministic_complete' AND NEW."status" IN ('provider_pending', 'completed', 'repair_required', 'failed', 'dead_lettered'))
    OR (OLD."status" = 'provider_pending' AND NEW."status" IN ('completed', 'failed', 'dead_lettered'))
    OR (OLD."status" = 'failed' AND NEW."status" IN ('claimed', 'dead_lettered'))
  ) THEN
    RAISE EXCEPTION 'AssessmentResult has an invalid status transition: % -> %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  IF new_terminal AND NEW."completedAt" IS NULL THEN
    RAISE EXCEPTION 'terminal AssessmentResult requires completedAt: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  IF new_terminal AND (NEW."scoreable" OR NEW."publishable") THEN
    RAISE EXCEPTION 'terminal AssessmentResult must be instructor-finalised after worker completion: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_AssessmentResult_lifecycle"
BEFORE INSERT OR UPDATE ON "AssessmentResult"
FOR EACH ROW EXECUTE FUNCTION "protect_assessment_result_lifecycle"();

-- Policy terms are versioned by row identity/classKey. Published assessment
-- versions freeze only the policy id, so mutating a referenced row would
-- silently rewrite historical eligibility. The loader already treats these
-- values as assert-same; the database makes that contract authoritative.
CREATE FUNCTION "reject_retention_policy_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RetentionPolicy is immutable; create a versioned policy row instead: %', OLD."id"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_RetentionPolicy_immutable"
BEFORE UPDATE OR DELETE ON "RetentionPolicy"
FOR EACH ROW EXECUTE FUNCTION "reject_retention_policy_mutation"();

CREATE FUNCTION "reject_published_dataset_release_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'DatasetRelease must be created as a draft before publish: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'published DatasetRelease is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."publishedAt" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "DatasetReleaseFile"
    WHERE "datasetReleaseId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'DatasetRelease requires at least one declared file before publish: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_published_DatasetRelease"
BEFORE INSERT OR UPDATE OR DELETE ON "DatasetRelease"
FOR EACH ROW EXECUTE FUNCTION "reject_published_dataset_release_mutation"();

CREATE FUNCTION "reject_published_quiz_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'published Quiz contract is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_published_Quiz"
BEFORE UPDATE OR DELETE ON "Quiz"
FOR EACH ROW EXECUTE FUNCTION "reject_published_quiz_mutation"();

-- Existing quiz creation paths only know `isDiagnostic`. Keep those writes
-- compatible while making the new enum/counting fields authoritative for the
-- versioned engine.
CREATE FUNCTION "synchronize_legacy_quiz_classification"() RETURNS trigger AS $$
BEGIN
  IF NEW."contractMode" = 'legacy' THEN
    NEW."classification" := CASE
      WHEN NEW."isDiagnostic" THEN 'diagnostic'::"QuizClassification"
      ELSE 'summative'::"QuizClassification"
    END;
    NEW."countsTowardBestOf" := NOT NEW."isDiagnostic";
    NEW."classificationFinalizedAt" := COALESCE(NEW."classificationFinalizedAt", CURRENT_TIMESTAMP);
    NEW."classifiedBy" := COALESCE(NEW."classifiedBy", 'legacy:auto-classification');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "synchronize_legacy_Quiz_classification"
BEFORE INSERT OR UPDATE OF "isDiagnostic", "contractMode", "classification", "countsTowardBestOf" ON "Quiz"
FOR EACH ROW EXECUTE FUNCTION "synchronize_legacy_quiz_classification"();

-- Versioned quiz content is data-defined, but the database still guarantees
-- that its identity contract uses stable item and option IDs before publish.
CREATE FUNCTION "validate_versioned_quiz_contract"() RETURNS trigger AS $$
DECLARE
  question_record JSONB;
  option_record JSONB;
  item_id TEXT;
  option_id TEXT;
  correct_option_id TEXT;
  correct_option_seen BOOLEAN;
  seen_item_ids TEXT[] := ARRAY[]::TEXT[];
  seen_option_ids TEXT[];
BEGIN
  IF NEW."contractMode" <> 'versioned' OR NEW."publishedAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW."questions") <> 'array' OR jsonb_array_length(NEW."questions") = 0 THEN
    RAISE EXCEPTION 'versioned Quiz questions must be a non-empty array' USING ERRCODE = 'check_violation';
  END IF;
  FOR question_record IN SELECT value FROM jsonb_array_elements(NEW."questions") LOOP
    item_id := question_record->>'itemVersionId';
    IF item_id IS NULL OR item_id = '' OR item_id = ANY(seen_item_ids) THEN
      RAISE EXCEPTION 'versioned Quiz itemVersionId values must be present and unique' USING ERRCODE = 'check_violation';
    END IF;
    seen_item_ids := array_append(seen_item_ids, item_id);
    IF jsonb_typeof(question_record->'options') <> 'array' OR jsonb_array_length(question_record->'options') < 2 THEN
      RAISE EXCEPTION 'versioned Quiz items require at least two stable options' USING ERRCODE = 'check_violation';
    END IF;
    correct_option_id := question_record->>'correctOptionId';
    correct_option_seen := false;
    seen_option_ids := ARRAY[]::TEXT[];
    FOR option_record IN SELECT value FROM jsonb_array_elements(question_record->'options') LOOP
      option_id := option_record->>'optionId';
      IF option_id IS NULL OR option_id = '' OR option_id = ANY(seen_option_ids) THEN
        RAISE EXCEPTION 'versioned Quiz optionId values must be present and unique per item' USING ERRCODE = 'check_violation';
      END IF;
      seen_option_ids := array_append(seen_option_ids, option_id);
      IF option_id = correct_option_id THEN correct_option_seen := true; END IF;
    END LOOP;
    IF correct_option_id IS NULL OR NOT correct_option_seen THEN
      RAISE EXCEPTION 'versioned Quiz correctOptionId must name one declared option' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_versioned_Quiz_contract"
BEFORE INSERT OR UPDATE OF "questions", "contractMode", "answerMode", "publishedAt" ON "Quiz"
FOR EACH ROW EXECUTE FUNCTION "validate_versioned_quiz_contract"();

CREATE FUNCTION "validate_quiz_attempt_contract"() RETURNS trigger AS $$
DECLARE
  quiz_contract "Quiz"%ROWTYPE;
BEGIN
  SELECT * INTO quiz_contract FROM "Quiz" WHERE "id" = NEW."quizId";
  IF quiz_contract."contractMode" = 'versioned' AND quiz_contract."publishedAt" IS NULL THEN
    RAISE EXCEPTION 'versioned Quiz attempts require a published contract' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."quizContractVersion" <> quiz_contract."contractVersion" OR NEW."answerMode" <> quiz_contract."answerMode" THEN
    RAISE EXCEPTION 'QuizAttempt contract snapshot does not match Quiz' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_QuizAttempt_contract"
BEFORE INSERT OR UPDATE OF "quizId", "quizContractVersion", "answerMode" ON "QuizAttempt"
FOR EACH ROW EXECUTE FUNCTION "validate_quiz_attempt_contract"();

CREATE FUNCTION "reject_published_assessment_child_mutation"() RETURNS trigger AS $$
DECLARE
  old_parent_id TEXT := NULL;
  new_parent_id TEXT := NULL;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_parent_id := OLD."assessmentVersionId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_parent_id := NEW."assessmentVersionId"; END IF;
  -- Serialize child writes with publication. FOR SHARE conflicts with the
  -- parent's publishedAt UPDATE; deterministic id order also covers reparenting.
  PERFORM assessment."id"
  FROM "AssessmentVersion" assessment
  WHERE assessment."id" = old_parent_id OR assessment."id" = new_parent_id
  ORDER BY assessment."id"
  FOR SHARE OF assessment;
  IF old_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "AssessmentVersion"
    WHERE "id" = old_parent_id AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'published AssessmentVersion child is immutable: %', old_parent_id USING ERRCODE = 'check_violation';
  END IF;
  IF new_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "AssessmentVersion"
    WHERE "id" = new_parent_id AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'published AssessmentVersion child is immutable: %', new_parent_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_published_AssessmentEvaluatorConfig"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentEvaluatorConfig"
FOR EACH ROW EXECUTE FUNCTION "reject_published_assessment_child_mutation"();

CREATE FUNCTION "reject_published_dataset_file_mutation"() RETURNS trigger AS $$
DECLARE
  old_parent_id TEXT := NULL;
  new_parent_id TEXT := NULL;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_parent_id := OLD."datasetReleaseId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_parent_id := NEW."datasetReleaseId"; END IF;
  PERFORM dataset."id"
  FROM "DatasetRelease" dataset
  WHERE dataset."id" = old_parent_id OR dataset."id" = new_parent_id
  ORDER BY dataset."id"
  FOR SHARE OF dataset;
  IF old_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "DatasetRelease"
    WHERE "id" = old_parent_id AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'published DatasetRelease child is immutable: %', old_parent_id USING ERRCODE = 'check_violation';
  END IF;
  IF new_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "DatasetRelease"
    WHERE "id" = new_parent_id AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'published DatasetRelease child is immutable: %', new_parent_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_published_DatasetReleaseFile"
BEFORE INSERT OR UPDATE OR DELETE ON "DatasetReleaseFile"
FOR EACH ROW EXECUTE FUNCTION "reject_published_dataset_file_mutation"();

-- The mutable assignment pointer may only target its own published version.
CREATE FUNCTION "validate_active_assessment_version"() RETURNS trigger AS $$
BEGIN
  IF NEW."activeAssessmentVersionId" IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "AssessmentVersion"
    WHERE "id" = NEW."activeAssessmentVersionId"
      AND "assignmentId" = NEW."id"
      AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'active AssessmentVersion must be published and belong to the same Assignment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_Assignment_activeAssessmentVersion"
BEFORE INSERT OR UPDATE OF "activeAssessmentVersionId" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION "validate_active_assessment_version"();

-- Contract upgrades are forward-only. Any historical unbound row would be
-- reinterpreted against the new AssignmentType contract after an in-place
-- cutover, so operators must explicitly archive/remediate those rows first.
CREATE FUNCTION "validate_assignment_contract_cutover"() RETURNS trigger AS $$
BEGIN
  IF OLD."contractMode" = 'versioned' AND NEW."contractMode" = 'legacy' THEN
    RAISE EXCEPTION 'Assignment contractMode cannot be downgraded from versioned to legacy: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."contractMode" = 'legacy' AND NEW."contractMode" = 'versioned' AND EXISTS (
    SELECT 1 FROM "Submission"
    WHERE "assignmentId" = OLD."id" AND "assessmentVersionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Assignment cannot become versioned while unbound legacy submissions exist: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_Assignment_contract_cutover"
BEFORE UPDATE OF "contractMode" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION "validate_assignment_contract_cutover"();

-- A transaction-scoped, durable receipt id is the only escape hatch for the
-- narrow DPDP database-cleanup phase. The receipt is locked and must still be
-- incomplete, so SET LOCAL cannot be replayed after that same transaction
-- marks database verification complete.
CREATE FUNCTION "require_dpdp_database_cleanup_receipt"(target_user_id TEXT) RETURNS TEXT AS $$
DECLARE
  configured_receipt_id TEXT;
  authorized_receipt_id TEXT;
BEGIN
  configured_receipt_id := NULLIF(current_setting('praxel.dpdp_deletion_receipt_id', true), '');
  IF configured_receipt_id IS NULL THEN
    RAISE EXCEPTION 'authorized DPDP deletion receipt is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT receipt."id"
  INTO authorized_receipt_id
  FROM "DeletionReceipt" receipt
  WHERE receipt."id" = configured_receipt_id
    AND receipt."targetType" = 'dpdp-user'
    AND receipt."targetId" = target_user_id
    AND receipt."s3VerifiedAt" IS NOT NULL
    AND receipt."databaseVerifiedAt" IS NULL
    AND receipt."details"->>'phase' = 'database_cleanup'
  FOR UPDATE OF receipt;
  IF authorized_receipt_id IS NULL THEN
    RAISE EXCEPTION 'DPDP deletion receipt is missing, unrelated, or already complete' USING ERRCODE = 'check_violation';
  END IF;
  RETURN authorized_receipt_id;
END;
$$ LANGUAGE plpgsql;

-- A durable dpdp-user intent is a write fence, not merely an audit row.  The
-- target User lock makes this check serialize with prepare (which holds the
-- same row FOR UPDATE while inventorying).  Only the exact transaction-local
-- cleanup receipt may mutate fenced rows after every object version is proven
-- absent.
CREATE FUNCTION "reject_dpdp_user_write"(target_user_id TEXT) RETURNS VOID AS $$
DECLARE
  is_flagged BOOLEAN;
  pending_receipt_id TEXT;
  pending_phase TEXT;
  pending_s3_verified_at TIMESTAMP(3);
  configured_receipt_id TEXT;
BEGIN
  IF target_user_id IS NULL THEN RETURN; END IF;
  SELECT "flaggedForDeletion" INTO is_flagged
  FROM "User" WHERE "id" = target_user_id FOR SHARE;
  SELECT receipt."id", receipt."details"->>'phase', receipt."s3VerifiedAt"
  INTO pending_receipt_id, pending_phase, pending_s3_verified_at
  FROM "DeletionReceipt" receipt
  WHERE receipt."targetType" = 'dpdp-user'
    AND receipt."targetId" = target_user_id
    AND receipt."databaseVerifiedAt" IS NULL
    AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
  ORDER BY receipt."deletedAt" DESC, receipt."id" DESC
  LIMIT 1
  FOR SHARE OF receipt;
  IF pending_receipt_id IS NULL THEN
    IF is_flagged THEN
      RAISE EXCEPTION 'user is write-fenced without a durable DPDP receipt: %', target_user_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- Once cleanup commits, the User row is absent. Continue rejecting the old
    -- raw id so a late actor/JSON write cannot recreate personal attribution.
    -- A genuine roster re-import creates a live User row and is intentionally
    -- treated as a new principal.
    IF is_flagged IS NULL AND EXISTS (
      SELECT 1
      FROM "DeletionReceipt" receipt
      WHERE receipt."targetType" = 'dpdp-user'
        AND receipt."targetId" = target_user_id
        AND receipt."databaseVerifiedAt" IS NOT NULL
        AND receipt."details"->>'phase' = 'complete'
    ) THEN
      RAISE EXCEPTION 'raw actor id belongs to a completed DPDP erasure: %', target_user_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  END IF;

  configured_receipt_id := NULLIF(current_setting('praxel.dpdp_deletion_receipt_id', true), '');
  IF configured_receipt_id = pending_receipt_id
    AND pending_phase = 'database_cleanup'
    AND pending_s3_verified_at IS NOT NULL
  THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'user data is write-fenced by pending DPDP erasure: %', target_user_id
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

-- Every statement that can create, mutate, or remove learner-linked data
-- enters a shared transaction barrier before PostgreSQL takes row locks.  A
-- DPDP prepare/cleanup transaction takes the exclusive side before it locks
-- the User row.  This drains writes that began before durable intent and keeps
-- later writers from holding child rows while waiting on the User fence.
-- Erasures are deliberately serialized globally: they are rare, while a
-- per-user key cannot protect unstructured AuditLog payloads before the
-- durable receipt identifying that user exists.
CREATE FUNCTION "acquire_dpdp_write_barrier"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(731462985083870128::BIGINT);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "00_dpdp_write_barrier_User"
BEFORE INSERT OR UPDATE OR DELETE ON "User"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_Submission"
BEFORE INSERT OR UPDATE OR DELETE ON "Submission"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_SubmissionEvidence"
BEFORE INSERT OR UPDATE OR DELETE ON "SubmissionEvidence"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_UploadReservation"
BEFORE INSERT OR UPDATE OR DELETE ON "UploadReservation"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_GeneratedObjectReservation"
BEFORE INSERT OR UPDATE OR DELETE ON "GeneratedObjectReservation"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_Grade"
BEFORE INSERT OR UPDATE OR DELETE ON "Grade"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_AssessmentResult"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentResult"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_GradeHold"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeHold"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_GradeAppeal"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeAppeal"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_PublicationDecision"
BEFORE INSERT OR UPDATE OR DELETE ON "PublicationDecision"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_GalleryItem"
BEFORE INSERT OR UPDATE OR DELETE ON "GalleryItem"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_TeamWorkflowNomination"
BEFORE INSERT OR UPDATE OR DELETE ON "TeamWorkflowNomination"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_TeamWorkflowSelection"
BEFORE INSERT OR UPDATE OR DELETE ON "TeamWorkflowSelection"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_Interview"
BEFORE INSERT OR UPDATE OR DELETE ON "Interview"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_InterviewTurn"
BEFORE INSERT OR UPDATE OR DELETE ON "InterviewTurn"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_InterviewRetake"
BEFORE INSERT OR UPDATE OR DELETE ON "InterviewRetake"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_Vote"
BEFORE INSERT OR UPDATE OR DELETE ON "Vote"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_QuizAttempt"
BEFORE INSERT OR UPDATE OR DELETE ON "QuizAttempt"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_PeerReview"
BEFORE INSERT OR UPDATE OR DELETE ON "PeerReview"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_PortfolioEntry"
BEFORE INSERT OR UPDATE OR DELETE ON "PortfolioEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_Notification"
BEFORE INSERT OR UPDATE OR DELETE ON "Notification"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_GateException"
BEFORE INSERT OR UPDATE OR DELETE ON "GateException"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_ResubmissionGrant"
BEFORE INSERT OR UPDATE OR DELETE ON "ResubmissionGrant"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

CREATE TRIGGER "00_dpdp_write_barrier_AuditLog"
BEFORE INSERT OR UPDATE OR DELETE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();

-- Academic/team rows may outlive a deleted learner, but an ungoverned raw
-- actor id may not. Cleanup replaces only the exact receipt target with a
-- receipt-scoped pseudonym; ordinary application writes cannot invoke this
-- exception.
CREATE FUNCTION "require_dpdp_actor_pseudonymization"(
  old_actor_id TEXT,
  new_actor_id TEXT
) RETURNS VOID AS $$
DECLARE
  parent_receipt_id TEXT;
  expected_actor_pseudonym TEXT;
BEGIN
  parent_receipt_id := "require_dpdp_database_cleanup_receipt"(old_actor_id);
  SELECT receipt."details"->>'actorPseudonym'
  INTO expected_actor_pseudonym
  FROM "DeletionReceipt" receipt
  WHERE receipt."id" = parent_receipt_id;
  IF expected_actor_pseudonym IS NULL
    OR expected_actor_pseudonym !~ '^dpdp-erased-actor:v1:[0-9a-f]{64}$'
    OR new_actor_id IS DISTINCT FROM expected_actor_pseudonym
  THEN
    RAISE EXCEPTION 'DPDP actor pseudonym does not match the authorized receipt'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fence actor values directly rather than relying on the owning Submission:
-- a learner may act on a shared row whose Submission.userId is a teammate.
-- When cleanup changes an actor, only the exact pseudonym stored on that
-- learner's authorized receipt is accepted.
CREATE FUNCTION "fence_dpdp_actor_scalar_write"() RETURNS trigger AS $$
DECLARE
  actor_column TEXT;
  old_actor_id TEXT;
  new_actor_id TEXT;
BEGIN
  FOREACH actor_column IN ARRAY TG_ARGV LOOP
    old_actor_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD)->>actor_column END;
    new_actor_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW)->>actor_column END;

    IF TG_OP = 'INSERT' AND new_actor_id LIKE 'dpdp-erased-actor:v1:%' THEN
      RAISE EXCEPTION 'DPDP actor pseudonyms may only be created by authorized cleanup'
        USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
      AND old_actor_id LIKE 'dpdp-erased-actor:v1:%'
      AND old_actor_id IS DISTINCT FROM new_actor_id
    THEN
      RAISE EXCEPTION 'DPDP actor pseudonyms are immutable once written'
        USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
      AND old_actor_id IS NOT NULL
      AND old_actor_id IS DISTINCT FROM new_actor_id
      AND (
        new_actor_id IS NULL
        OR new_actor_id NOT LIKE 'dpdp-erased-actor:v1:%'
      )
    THEN
      RAISE EXCEPTION 'actor attribution is immutable once written'
        USING ERRCODE = 'check_violation';
    END IF;

    IF old_actor_id IS DISTINCT FROM new_actor_id
      AND (
        new_actor_id LIKE 'dpdp-erased-actor:v1:%'
        OR EXISTS (
          SELECT 1
          FROM "DeletionReceipt" receipt
          WHERE receipt."targetType" = 'dpdp-user'
            AND receipt."targetId" = old_actor_id
            AND receipt."databaseVerifiedAt" IS NULL
            AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
        )
      )
    THEN
      PERFORM "require_dpdp_actor_pseudonymization"(old_actor_id, new_actor_id);
    ELSE
      PERFORM "reject_dpdp_user_write"(old_actor_id);
    END IF;
    PERFORM "reject_dpdp_user_write"(new_actor_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_UploadReservation_actor_write"
BEFORE INSERT OR UPDATE OR DELETE ON "UploadReservation"
FOR EACH ROW EXECUTE FUNCTION "fence_dpdp_actor_scalar_write"('createdById');

CREATE TRIGGER "fence_GradeAppeal_actor_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeAppeal"
FOR EACH ROW EXECUTE FUNCTION "fence_dpdp_actor_scalar_write"('openedBy');

CREATE TRIGGER "fence_GradeHold_actor_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeHold"
FOR EACH ROW EXECUTE FUNCTION "fence_dpdp_actor_scalar_write"('createdBy');

CREATE TRIGGER "fence_PublicationDecision_actor_write"
BEFORE INSERT OR UPDATE OR DELETE ON "PublicationDecision"
FOR EACH ROW EXECUTE FUNCTION "fence_dpdp_actor_scalar_write"('ownerConsentBy');

CREATE TRIGGER "fence_TeamWorkflowNomination_actor_write"
BEFORE INSERT OR UPDATE OR DELETE ON "TeamWorkflowNomination"
FOR EACH ROW EXECUTE FUNCTION "fence_dpdp_actor_scalar_write"('nominatedBy');

-- Display names are not globally unique identifiers (a learner may literally
-- be named "Open"). Treat them as personal data only in explicit identity
-- slots; strong aliases remain fenced anywhere in the payload. This gives
-- AuditLog a structured identity contract without making ordinary status or
-- descriptive text unavailable after an erasure.
CREATE FUNCTION "audit_json_contains_tagged_name"(
  payload JSONB,
  candidate_name TEXT,
  parent_is_name_slot BOOLEAN DEFAULT FALSE
) RETURNS BOOLEAN AS $$
DECLARE
  payload_kind TEXT;
  item JSONB;
  field RECORD;
  normalized_key TEXT;
  child_is_name_slot BOOLEAN;
BEGIN
  IF payload IS NULL OR COALESCE(candidate_name, '') = '' THEN RETURN FALSE; END IF;
  payload_kind := jsonb_typeof(payload);
  IF payload_kind = 'string' THEN
    RETURN parent_is_name_slot AND POSITION(candidate_name IN (payload #>> '{}')) > 0;
  END IF;
  IF payload_kind = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
      IF "audit_json_contains_tagged_name"(item, candidate_name, parent_is_name_slot) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
    RETURN FALSE;
  END IF;
  IF payload_kind = 'object' THEN
    FOR field IN SELECT key, value FROM jsonb_each(payload) LOOP
      normalized_key := regexp_replace(lower(field.key), '[^a-z0-9]', '', 'g');
      child_is_name_slot := normalized_key = ANY (ARRAY[
        'name', 'fullname', 'displayname', 'username', 'studentname',
        'learnername', 'ownername', 'actorname', 'subjectname'
      ]);
      IF "audit_json_contains_tagged_name"(
        field.value,
        candidate_name,
        child_is_name_slot
      ) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The completed receipt retains only salted digests of the erased aliases.
-- New AuditLog payloads must place personal identity values in explicit slots,
-- allowing the fence to compare exact digests without retaining the raw name,
-- email, Clerk id, or avatar URL indefinitely.
CREATE FUNCTION "dpdp_identity_digest"(
  receipt_id TEXT,
  identity_value TEXT
) RETURNS TEXT AS $$
  SELECT encode(
    digest(
      convert_to(
        octet_length(convert_to(receipt_id, 'UTF8'))::TEXT || ':' || receipt_id ||
        octet_length(convert_to(identity_value, 'UTF8'))::TEXT || ':' || identity_value,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$ LANGUAGE SQL IMMUTABLE STRICT;

CREATE FUNCTION "audit_json_contains_identity_digest"(
  payload JSONB,
  receipt_id TEXT,
  identity_digests JSONB,
  parent_is_identity_slot BOOLEAN DEFAULT FALSE
) RETURNS BOOLEAN AS $$
DECLARE
  payload_kind TEXT;
  item JSONB;
  field RECORD;
  normalized_key TEXT;
  child_is_identity_slot BOOLEAN;
BEGIN
  IF payload IS NULL OR jsonb_typeof(identity_digests) <> 'array' THEN RETURN FALSE; END IF;
  payload_kind := jsonb_typeof(payload);
  IF payload_kind = 'string' THEN
    RETURN parent_is_identity_slot
      AND identity_digests ? "dpdp_identity_digest"(receipt_id, payload #>> '{}');
  END IF;
  IF payload_kind = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
      IF "audit_json_contains_identity_digest"(
        item, receipt_id, identity_digests, parent_is_identity_slot
      ) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
    RETURN FALSE;
  END IF;
  IF payload_kind = 'object' THEN
    FOR field IN SELECT key, value FROM jsonb_each(payload) LOOP
      normalized_key := regexp_replace(lower(field.key), '[^a-z0-9]', '', 'g');
      child_is_identity_slot := normalized_key = ANY (ARRAY[
        'user', 'userid', 'actor', 'actorid', 'target', 'targetid',
        'subject', 'subjectid', 'owner', 'ownerid', 'student', 'studentid',
        'learner', 'learnerid', 'email', 'clerkuserid', 'avatarurl',
        'name', 'fullname', 'displayname', 'username', 'studentname',
        'learnername', 'ownername', 'actorname', 'subjectname'
      ]);
      IF "audit_json_contains_identity_digest"(
        field.value,
        receipt_id,
        identity_digests,
        child_is_identity_slot
      ) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Audit JSON otherwise has no fixed schema. Match strong identities in scalar
-- columns, nested values, embedded text, and object keys. Pending receipts
-- fence concurrent writes; completed receipts keep fencing only while no
-- re-imported User with the same id exists.
CREATE FUNCTION "fence_audit_log_dpdp_identity_write"() RETURNS trigger AS $$
DECLARE
  receipt_identity RECORD;
  payload_text TEXT := COALESCE(NEW."before"::TEXT, '') || COALESCE(NEW."after"::TEXT, '');
BEGIN
  FOR receipt_identity IN
    SELECT
      receipt."targetId" AS user_id,
      receipt."details"->>'email' AS email,
      receipt."details"->>'clerkUserId' AS clerk_user_id,
      receipt."details"->>'name' AS user_name,
      receipt."details"->>'avatarUrl' AS avatar_url
    FROM "DeletionReceipt" receipt
    WHERE receipt."targetType" = 'dpdp-user'
      AND (
        (
          receipt."databaseVerifiedAt" IS NULL
          AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
          AND (
            NEW."actorId" IN (
              receipt."targetId",
              receipt."details"->>'email',
              receipt."details"->>'clerkUserId',
              receipt."details"->>'avatarUrl'
            )
            OR NEW."targetId" IN (
              receipt."targetId",
              receipt."details"->>'email',
              receipt."details"->>'clerkUserId',
              receipt."details"->>'avatarUrl'
            )
            OR POSITION(receipt."targetId" IN payload_text) > 0
            OR (
              COALESCE(receipt."details"->>'email', '') <> ''
              AND POSITION(receipt."details"->>'email' IN payload_text) > 0
            )
            OR (
              COALESCE(receipt."details"->>'clerkUserId', '') <> ''
              AND POSITION(receipt."details"->>'clerkUserId' IN payload_text) > 0
            )
            OR (
              COALESCE(receipt."details"->>'avatarUrl', '') <> ''
              AND POSITION(receipt."details"->>'avatarUrl' IN payload_text) > 0
            )
            OR (
              COALESCE(receipt."details"->>'name', '') <> ''
              AND (
                "audit_json_contains_tagged_name"(
                  NEW."before", receipt."details"->>'name'
                )
                OR "audit_json_contains_tagged_name"(
                  NEW."after", receipt."details"->>'name'
                )
              )
            )
          )
        )
        OR (
          receipt."databaseVerifiedAt" IS NOT NULL
          AND receipt."details"->>'phase' = 'complete'
          AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = receipt."targetId")
          AND (
            NEW."actorId" = receipt."targetId"
            OR NEW."targetId" = receipt."targetId"
            OR POSITION(receipt."targetId" IN payload_text) > 0
            OR COALESCE(receipt."details"->'identityDigests', '[]'::JSONB)
              ? "dpdp_identity_digest"(receipt."id", NEW."actorId")
            OR COALESCE(receipt."details"->'identityDigests', '[]'::JSONB)
              ? "dpdp_identity_digest"(receipt."id", NEW."targetId")
            OR "audit_json_contains_identity_digest"(
              NEW."before",
              receipt."id",
              COALESCE(receipt."details"->'identityDigests', '[]'::JSONB)
            )
            OR "audit_json_contains_identity_digest"(
              NEW."after",
              receipt."id",
              COALESCE(receipt."details"->'identityDigests', '[]'::JSONB)
            )
          )
        )
      )
  LOOP
    PERFORM "reject_dpdp_user_write"(receipt_identity.user_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_AuditLog_dpdp_identity_write"
BEFORE INSERT OR UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "fence_audit_log_dpdp_identity_write"();

CREATE FUNCTION "require_dpdp_row_deletion_receipt"(
  target_user_id TEXT,
  target_table TEXT,
  target_record_id TEXT,
  target_s3_key TEXT,
  target_s3_version_id TEXT
) RETURNS VOID AS $$
DECLARE
  parent_receipt_id TEXT;
BEGIN
  parent_receipt_id := "require_dpdp_database_cleanup_receipt"(target_user_id);
  IF NOT EXISTS (
    SELECT 1
    FROM "DeletionReceipt" receipt
    WHERE receipt."targetType" = CASE
        WHEN target_s3_version_id IS NULL THEN 'dpdp-database-row'
        ELSE 'dpdp-s3-object'
      END
      AND receipt."details"->>'parentReceiptId' = parent_receipt_id
      AND receipt."details"->>'phase' = 'database_cleanup'
      AND receipt."databaseVerifiedAt" IS NULL
      AND (
        (target_s3_version_id IS NULL AND receipt."s3VerifiedAt" IS NULL)
        OR (
          receipt."s3VerifiedAt" IS NOT NULL
          AND receipt."s3Key" = target_s3_key
          AND receipt."s3VersionId" = target_s3_version_id
        )
      )
      AND (
        (
          receipt."databaseTable" = target_table
          AND receipt."databaseRecordId" = target_record_id
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(receipt."details"->'associations') = 'array'
                THEN receipt."details"->'associations'
              ELSE '[]'::JSONB
            END
          ) association
          WHERE association->>'databaseTable' = target_table
            AND association->>'databaseRecordId' = target_record_id
        )
      )
      AND (target_table <> 'Submission' OR receipt."details"->>'action' = 'delete')
      AND (
        target_table <> 'UploadReservation'
        OR target_s3_version_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM "DeletionReceipt" proof
          WHERE proof."id" = receipt."details"->>'proofReceiptId'
            AND proof."targetType" = 'uncommitted-upload'
            AND proof."targetId" = target_record_id
            AND proof."s3Key" = target_s3_key
            AND proof."s3VersionId" IS NULL
            AND proof."s3VerifiedAt" IS NOT NULL
            AND proof."databaseVerifiedAt" IS NOT NULL
            AND proof."details"->>'phase' = 'complete'
            AND proof."details"->>'databaseAction' = 'mark-cancelled'
            AND proof."details"->>'objectVersionCount' = '0'
            AND proof."details"->>'submissionId' = receipt."details"->>'submissionId'
        )
      )
  ) THEN
    RAISE EXCEPTION 'exact DPDP row deletion receipt is required for %:%', target_table, target_record_id USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "require_dpdp_submission_reattribution_receipt"(
  target_user_id TEXT,
  submission_id TEXT,
  team_id TEXT,
  survivor_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  parent_receipt_id TEXT;
BEGIN
  parent_receipt_id := "require_dpdp_database_cleanup_receipt"(target_user_id);
  IF NOT EXISTS (
    SELECT 1
    FROM "DeletionReceipt" receipt
    WHERE receipt."targetType" = 'dpdp-database-row'
      AND receipt."databaseTable" = 'Submission'
      AND receipt."databaseRecordId" = submission_id
      AND receipt."details"->>'parentReceiptId' = parent_receipt_id
      AND receipt."details"->>'phase' = 'database_cleanup'
      AND receipt."details"->>'action' = 'reassign'
      AND receipt."details"->>'teamId' = team_id
      AND receipt."details"->>'survivorId' = survivor_id
      AND receipt."s3VerifiedAt" IS NULL
      AND receipt."databaseVerifiedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'exact planned DPDP Submission reattribution receipt is required: %', submission_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "require_dpdp_last_member_team_deletion_receipt"(
  target_user_id TEXT,
  submission_id TEXT,
  team_id TEXT
) RETURNS VOID AS $$
DECLARE
  parent_receipt_id TEXT;
BEGIN
  parent_receipt_id := "require_dpdp_database_cleanup_receipt"(target_user_id);
  PERFORM team."id"
  FROM "Team" team
  WHERE team."id" = team_id
  FOR UPDATE OF team;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team boundary is missing for Submission deletion: %', submission_id USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "teamId" = team_id AND "id" <> target_user_id
  ) THEN
    RAISE EXCEPTION 'team Submission must be reattributed while a same-team survivor exists: %', submission_id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "DeletionReceipt" receipt
    WHERE receipt."targetType" = 'dpdp-database-row'
      AND receipt."databaseTable" = 'Submission'
      AND receipt."databaseRecordId" = submission_id
      AND receipt."details"->>'parentReceiptId' = parent_receipt_id
      AND receipt."details"->>'phase' = 'database_cleanup'
      AND receipt."details"->>'action' = 'delete'
      AND receipt."details"->>'teamId' = team_id
      AND receipt."details"->>'lastTeamMember' = 'true'
      AND receipt."s3VerifiedAt" IS NULL
      AND receipt."databaseVerifiedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'exact last-member team Submission deletion receipt is required: %', submission_id USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Serialize the last-member predicate above with every membership insert,
-- move, or delete. The deterministic parent-row locks also prevent two team
-- moves from deadlocking when they cross teams.
CREATE FUNCTION "lock_user_team_membership"() RETURNS trigger AS $$
DECLARE
  old_team_id TEXT := NULL;
  new_team_id TEXT := NULL;
  affected_user_id TEXT;
  blocking_receipt_id TEXT;
  blocking_target_user_id TEXT;
  blocking_phase TEXT;
  blocking_s3_verified_at TIMESTAMP(3);
  configured_receipt_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_team_id := OLD."teamId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_team_id := NEW."teamId"; END IF;
  affected_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  PERFORM team."id"
  FROM "Team" team
  WHERE team."id" = old_team_id OR team."id" = new_team_id
  ORDER BY team."id"
  FOR SHARE OF team;

  -- Prepare and cleanup lock the same Team rows FOR UPDATE.  A membership
  -- write that began first therefore finishes before survivor selection;
  -- writes that begin after intent see the durable plan and fail closed.
  SELECT receipt."id", receipt."targetId", receipt."details"->>'phase', receipt."s3VerifiedAt"
  INTO blocking_receipt_id, blocking_target_user_id, blocking_phase, blocking_s3_verified_at
  FROM "DeletionReceipt" receipt
  WHERE receipt."targetType" = 'dpdp-user'
    AND receipt."databaseVerifiedAt" IS NULL
    AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
    AND (
      receipt."targetId" = affected_user_id
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(receipt."details"->'teamReassignments') = 'array'
              THEN receipt."details"->'teamReassignments'
            ELSE '[]'::JSONB
          END
        ) reassignment
        WHERE reassignment->>'survivorId' = affected_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(receipt."details"->'lastMemberTeamIds') = 'array'
              THEN receipt."details"->'lastMemberTeamIds'
            ELSE '[]'::JSONB
          END
        ) planned_team(value)
        WHERE planned_team.value = old_team_id OR planned_team.value = new_team_id
      )
    )
  ORDER BY receipt."deletedAt" DESC, receipt."id" DESC
  LIMIT 1
  FOR SHARE OF receipt;
  IF blocking_receipt_id IS NOT NULL THEN
    configured_receipt_id := NULLIF(current_setting('praxel.dpdp_deletion_receipt_id', true), '');
    IF NOT (
      configured_receipt_id = blocking_receipt_id
      AND blocking_target_user_id = affected_user_id
      AND blocking_phase = 'database_cleanup'
      AND blocking_s3_verified_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'team membership is write-fenced by pending DPDP erasure: %', affected_user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "lock_User_team_membership"
BEFORE INSERT OR UPDATE OF "teamId" OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION "lock_user_team_membership"();

CREATE FUNCTION "reject_user_dpdp_identity_write"() RETURNS trigger AS $$
BEGIN
  PERFORM "reject_dpdp_user_write"(OLD."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reject_User_dpdp_identity_write"
BEFORE UPDATE OF "id", "email", "clerkUserId" ON "User"
FOR EACH ROW EXECUTE FUNCTION "reject_user_dpdp_identity_write"();

-- Freeze canonical submission identity from the published version. The owner
-- id is derived from the authenticated user/team, never from client input.
CREATE FUNCTION "validate_submission_contract_identity"() RETURNS trigger AS $$
DECLARE
  version_assignment_id TEXT;
  version_owner_kind "OwnerKind";
  version_published_at TIMESTAMP(3);
  assignment_mode "ContractMode";
  grant_assignment_id TEXT;
  grant_assessment_version_id TEXT;
  grant_owner_kind "OwnerKind";
  grant_owner_id TEXT;
  grant_target_version INTEGER;
  grant_target_attempt INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."assignmentId" IS DISTINCT FROM NEW."assignmentId"
    OR OLD."assessmentVersionId" IS DISTINCT FROM NEW."assessmentVersionId"
    OR OLD."ownerKind" IS DISTINCT FROM NEW."ownerKind"
    OR OLD."ownerId" IS DISTINCT FROM NEW."ownerId"
    OR OLD."userId" IS DISTINCT FROM NEW."userId"
    OR OLD."teamId" IS DISTINCT FROM NEW."teamId"
    OR OLD."version" IS DISTINCT FROM NEW."version"
    OR OLD."attempt" IS DISTINCT FROM NEW."attempt"
    OR OLD."resubmissionGrantId" IS DISTINCT FROM NEW."resubmissionGrantId"
  ) THEN
    IF NOT (
      OLD."teamId" IS NOT NULL
      AND (
        OLD."ownerKind" = 'team'
        OR (OLD."ownerKind" IS NULL AND OLD."assessmentVersionId" IS NULL)
      )
      AND OLD."userId" IS DISTINCT FROM NEW."userId"
      AND OLD."id" IS NOT DISTINCT FROM NEW."id"
      AND OLD."createdAt" IS NOT DISTINCT FROM NEW."createdAt"
      AND OLD."assignmentId" IS NOT DISTINCT FROM NEW."assignmentId"
      AND OLD."assessmentVersionId" IS NOT DISTINCT FROM NEW."assessmentVersionId"
      AND OLD."ownerKind" IS NOT DISTINCT FROM NEW."ownerKind"
      AND OLD."ownerId" IS NOT DISTINCT FROM NEW."ownerId"
      AND OLD."teamId" IS NOT DISTINCT FROM NEW."teamId"
      AND OLD."version" IS NOT DISTINCT FROM NEW."version"
      AND OLD."attempt" IS NOT DISTINCT FROM NEW."attempt"
      AND OLD."resubmissionGrantId" IS NOT DISTINCT FROM NEW."resubmissionGrantId"
      AND OLD."status" IS NOT DISTINCT FROM NEW."status"
      AND OLD."submittedAt" IS NOT DISTINCT FROM NEW."submittedAt"
      AND OLD."fields" IS NOT DISTINCT FROM NEW."fields"
      AND OLD."files" IS NOT DISTINCT FROM NEW."files"
      AND OLD."contentHash" IS NOT DISTINCT FROM NEW."contentHash"
      AND OLD."embedding" IS NOT DISTINCT FROM NEW."embedding"
      AND EXISTS (
        SELECT 1 FROM "User"
        WHERE "id" = NEW."userId" AND "teamId" = OLD."teamId"
      )
      AND "require_dpdp_submission_reattribution_receipt"(
        OLD."userId", OLD."id", OLD."teamId", NEW."userId"
      )
    ) THEN
      RAISE EXCEPTION 'Submission contract identity is immutable after insert' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Serialize submission identity validation with Assignment cutovers. Without
  -- this parent-row lock, a legacy insert could validate the old mode while a
  -- concurrent transaction switches the Assignment to versioned, leaving an
  -- unbound Submission committed after the cutover.
  SELECT "contractMode"
  INTO assignment_mode
  FROM "Assignment"
  WHERE "id" = NEW."assignmentId"
  FOR SHARE;
  IF NEW."assessmentVersionId" IS NULL THEN
    IF assignment_mode = 'versioned' THEN
      RAISE EXCEPTION 'versioned Submission requires an AssessmentVersion binding' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "assignmentId", "ownerKind", "publishedAt"
  INTO version_assignment_id, version_owner_kind, version_published_at
  FROM "AssessmentVersion" WHERE "id" = NEW."assessmentVersionId";
  IF version_assignment_id IS NULL
    OR version_assignment_id <> NEW."assignmentId"
    OR version_published_at IS NULL
    OR assignment_mode <> 'versioned'
    OR NEW."ownerKind" IS DISTINCT FROM version_owner_kind
    OR NEW."ownerId" IS NULL
    OR NEW."ownerId" = ''
    OR NEW."version" <= 0
    OR NEW."attempt" <= 0
  THEN
    RAISE EXCEPTION 'Submission identity does not match its published AssessmentVersion' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."ownerKind" = 'individual' AND NEW."ownerId" <> NEW."userId" THEN
    RAISE EXCEPTION 'individual Submission ownerId must equal userId' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."ownerKind" = 'team' AND (NEW."teamId" IS NULL OR NEW."ownerId" <> NEW."teamId") THEN
    RAISE EXCEPTION 'team Submission ownerId must equal teamId' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."resubmissionGrantId" IS NULL THEN
    IF NEW."version" > 1 OR NEW."attempt" > 1 THEN
      RAISE EXCEPTION 'versioned revision Submission requires an exact resubmission grant binding' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT "assignmentId", "assessmentVersionId", "ownerKind", "ownerId", "targetVersion", "targetAttempt"
    INTO grant_assignment_id, grant_assessment_version_id, grant_owner_kind, grant_owner_id,
         grant_target_version, grant_target_attempt
    FROM "ResubmissionGrant"
    WHERE "id" = NEW."resubmissionGrantId";
    IF grant_assignment_id IS NULL
      OR grant_assignment_id IS DISTINCT FROM NEW."assignmentId"
      OR grant_assessment_version_id IS DISTINCT FROM NEW."assessmentVersionId"
      OR grant_owner_kind IS DISTINCT FROM NEW."ownerKind"
      OR grant_owner_id IS DISTINCT FROM NEW."ownerId"
      OR grant_target_version IS DISTINCT FROM NEW."version"
      OR grant_target_attempt IS DISTINCT FROM NEW."attempt"
    THEN
      RAISE EXCEPTION 'Submission resubmission grant does not match its immutable contract identity' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_Submission_contract_identity"
BEFORE INSERT OR UPDATE OF "id", "createdAt", "assignmentId", "assessmentVersionId", "ownerKind", "ownerId", "userId", "teamId", "version", "attempt", "resubmissionGrantId" ON "Submission"
FOR EACH ROW EXECUTE FUNCTION "validate_submission_contract_identity"();

-- Drafts are editable, but the exact submitted receipt is immutable. Status
-- may move through grading/regrade, while finalised is terminal and no
-- non-draft row may be reopened as a draft.
CREATE FUNCTION "protect_submission_receipt"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "reject_dpdp_user_write"(NEW."userId");
  ELSE
    PERFORM "reject_dpdp_user_write"(OLD."userId");
    IF TG_OP = 'UPDATE' AND OLD."userId" IS DISTINCT FROM NEW."userId" THEN
      PERFORM "reject_dpdp_user_write"(NEW."userId");
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'draft' AND NEW."submittedAt" IS NULL THEN
      RAISE EXCEPTION 'non-draft Submission requires submittedAt: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."status" <> 'draft'
      AND NEW."assessmentVersionId" IS NOT NULL
      AND COALESCE(NEW."contentHash", '') = ''
    THEN
      RAISE EXCEPTION 'versioned non-draft Submission requires contentHash: %', NEW."id" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Preserve ordinary lifecycle cleanup for pre-versioning individual rows.
    -- Once a DPDP cleanup GUC is present (and the user fence has admitted it),
    -- the exact child receipt remains mandatory. Legacy team rows never use
    -- this compatibility branch.
    IF OLD."assessmentVersionId" IS NULL AND OLD."teamId" IS NULL THEN
      IF NULLIF(current_setting('praxel.dpdp_deletion_receipt_id', true), '') IS NOT NULL THEN
        PERFORM "require_dpdp_row_deletion_receipt"(
          OLD."userId", 'Submission', OLD."id", NULL, NULL
        );
      END IF;
      RETURN OLD;
    END IF;
    IF OLD."teamId" IS NOT NULL THEN
      PERFORM "require_dpdp_last_member_team_deletion_receipt"(
        OLD."userId", OLD."id", OLD."teamId"
      );
      RETURN OLD;
    END IF;
    IF OLD."ownerKind" <> 'individual' OR OLD."ownerId" IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'versioned team Submission cannot be deleted; reattribute it through DPDP cleanup' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM "require_dpdp_row_deletion_receipt"(
      OLD."userId", 'Submission', OLD."id", NULL, NULL
    );
    RETURN OLD;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id" OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Submission primary identity and chronology are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'draft' AND (
    OLD."fields" IS DISTINCT FROM NEW."fields"
    OR OLD."files" IS DISTINCT FROM NEW."files"
    OR OLD."contentHash" IS DISTINCT FROM NEW."contentHash"
    OR OLD."submittedAt" IS DISTINCT FROM NEW."submittedAt"
  ) THEN
    RAISE EXCEPTION 'submitted Submission receipt content is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'draft' AND NEW."status" = 'draft' THEN
    RAISE EXCEPTION 'non-draft Submission cannot return to draft: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'finalised' AND NEW."status" <> 'finalised' THEN
    RAISE EXCEPTION 'finalised Submission status is terminal: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'draft' AND NEW."status" NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'draft Submission must transition through submitted: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" <> 'draft' AND NEW."submittedAt" IS NULL THEN
    RAISE EXCEPTION 'non-draft Submission requires submittedAt: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" <> 'draft'
    AND NEW."assessmentVersionId" IS NOT NULL
    AND COALESCE(NEW."contentHash", '') = ''
  THEN
    RAISE EXCEPTION 'versioned non-draft Submission requires contentHash: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_Submission_receipt"
BEFORE INSERT OR UPDATE OR DELETE ON "Submission"
FOR EACH ROW EXECUTE FUNCTION "protect_submission_receipt"();

-- Upload reservations are immutable capabilities bound to one exact draft.
-- Only the S3 version and the two one-way terminal timestamps may advance.
CREATE FUNCTION "validate_upload_reservation_lifecycle"() RETURNS trigger AS $$
DECLARE
  submission_record "Submission"%ROWTYPE;
  target_user_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "userId" INTO target_user_id
    FROM "Submission"
    WHERE "id" = OLD."submissionId"
    FOR SHARE;
    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'UploadReservation parent Submission is missing: %', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    PERFORM "reject_dpdp_user_write"(target_user_id);
    PERFORM "require_dpdp_row_deletion_receipt"(
      target_user_id,
      'UploadReservation',
      OLD."id",
      OLD."s3Key",
      OLD."s3VersionId"
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO submission_record
    FROM "Submission"
    WHERE "id" = NEW."submissionId"
    FOR SHARE;
    PERFORM "reject_dpdp_user_write"(submission_record."userId");
    IF submission_record."id" IS NULL
      OR submission_record."status" <> 'draft'
      OR NEW."assignmentId" IS DISTINCT FROM submission_record."assignmentId"
      OR NEW."assessmentVersionId" IS DISTINCT FROM submission_record."assessmentVersionId"
      OR NEW."ownerKind" IS DISTINCT FROM submission_record."ownerKind"
      OR NEW."ownerId" IS DISTINCT FROM submission_record."ownerId"
    THEN
      RAISE EXCEPTION 'UploadReservation must match one exact editable Submission draft' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."ownerKind" = 'individual' AND NEW."createdById" <> NEW."ownerId" THEN
      RAISE EXCEPTION 'individual UploadReservation creator must match its owner' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."ownerKind" = 'team' AND NOT EXISTS (
      SELECT 1 FROM "User"
      WHERE "id" = NEW."createdById" AND "teamId" = NEW."ownerId"
    ) THEN
      RAISE EXCEPTION 'team UploadReservation creator must belong to its owner team' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."s3VersionId" IS NOT NULL OR NEW."consumedAt" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL THEN
      RAISE EXCEPTION 'UploadReservation must begin unconsumed, uncancelled, and without an S3 version' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "userId" INTO target_user_id
  FROM "Submission"
  WHERE "id" = OLD."submissionId"
  FOR SHARE;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'UploadReservation parent Submission is missing: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  PERFORM "reject_dpdp_user_write"(target_user_id);

  IF OLD."createdById" IS DISTINCT FROM NEW."createdById" THEN
    PERFORM "require_dpdp_actor_pseudonymization"(
      OLD."createdById", NEW."createdById"
    );
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."assignmentId" IS DISTINCT FROM NEW."assignmentId"
    OR OLD."assessmentVersionId" IS DISTINCT FROM NEW."assessmentVersionId"
    OR OLD."ownerKind" IS DISTINCT FROM NEW."ownerKind"
    OR OLD."ownerId" IS DISTINCT FROM NEW."ownerId"
    OR OLD."fieldKey" IS DISTINCT FROM NEW."fieldKey"
    OR OLD."fileRole" IS DISTINCT FROM NEW."fileRole"
    OR OLD."filename" IS DISTINCT FROM NEW."filename"
    OR OLD."s3Key" IS DISTINCT FROM NEW."s3Key"
    OR OLD."declaredContentType" IS DISTINCT FROM NEW."declaredContentType"
    OR OLD."declaredBytes" IS DISTINCT FROM NEW."declaredBytes"
    OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'UploadReservation capability identity is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."s3VersionId" IS NOT NULL AND OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId" THEN
    RAISE EXCEPTION 'UploadReservation S3 version is immutable once persisted: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."s3VersionId" = '' THEN
    RAISE EXCEPTION 'UploadReservation S3 version cannot be empty' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."consumedAt" IS NOT NULL AND OLD."consumedAt" IS DISTINCT FROM NEW."consumedAt" THEN
    RAISE EXCEPTION 'UploadReservation consumedAt is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND OLD."cancelledAt" IS DISTINCT FROM NEW."cancelledAt" THEN
    RAISE EXCEPTION 'UploadReservation cancelledAt is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId" THEN
    RAISE EXCEPTION 'cancelled UploadReservation object coordinates are terminal: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."consumedAt" IS NOT NULL AND NEW."cancelledAt" IS NOT NULL THEN
    RAISE EXCEPTION 'UploadReservation cannot be both consumed and cancelled: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."consumedAt" IS NOT NULL AND NEW."s3VersionId" IS NULL THEN
    RAISE EXCEPTION 'consumed UploadReservation requires an exact S3 version: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_UploadReservation_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "UploadReservation"
FOR EACH ROW EXECUTE FUNCTION "validate_upload_reservation_lifecycle"();

-- Evidence is an immutable authorization receipt. Insert locks the draft and
-- consumed reservation so a concurrent finalisation cannot attach evidence
-- after the exact-version boundary. Updates are limited to a fail-closed scan
-- state machine; DPDP hard deletion requires an exact verified object receipt.
CREATE FUNCTION "validate_submission_evidence_receipt"() RETURNS trigger AS $$
DECLARE
  submission_record "Submission"%ROWTYPE;
  reservation_record "UploadReservation"%ROWTYPE;
  replaced_evidence_record "SubmissionEvidence"%ROWTYPE;
  target_user_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "userId" INTO target_user_id
    FROM "Submission"
    WHERE "id" = OLD."submissionId"
    FOR SHARE;
    IF target_user_id IS NULL THEN
      RAISE EXCEPTION 'SubmissionEvidence parent Submission is missing: %', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    PERFORM "reject_dpdp_user_write"(target_user_id);
    PERFORM "require_dpdp_row_deletion_receipt"(
      target_user_id,
      'SubmissionEvidence',
      OLD."id",
      OLD."s3Key",
      OLD."s3VersionId"
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO submission_record
    FROM "Submission"
    WHERE "id" = NEW."submissionId"
    FOR SHARE;
    PERFORM "reject_dpdp_user_write"(submission_record."userId");
    IF submission_record."id" IS NULL OR submission_record."status" <> 'draft' THEN
      RAISE EXCEPTION 'SubmissionEvidence may only attach to an editable Submission draft' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO reservation_record
    FROM "UploadReservation"
    WHERE "id" = NEW."reservationId"
    FOR SHARE;
    IF reservation_record."id" IS NULL
      OR reservation_record."submissionId" IS DISTINCT FROM NEW."submissionId"
      OR reservation_record."assignmentId" IS DISTINCT FROM submission_record."assignmentId"
      OR reservation_record."assessmentVersionId" IS DISTINCT FROM submission_record."assessmentVersionId"
      OR reservation_record."ownerKind" IS DISTINCT FROM submission_record."ownerKind"
      OR reservation_record."ownerId" IS DISTINCT FROM submission_record."ownerId"
      OR reservation_record."fieldKey" IS DISTINCT FROM NEW."fieldKey"
      OR reservation_record."fileRole" IS DISTINCT FROM NEW."fileRole"
      OR reservation_record."s3Key" IS DISTINCT FROM NEW."s3Key"
      OR reservation_record."s3VersionId" IS DISTINCT FROM NEW."s3VersionId"
      OR reservation_record."declaredContentType" IS DISTINCT FROM NEW."declaredContentType"
      OR reservation_record."declaredBytes" IS DISTINCT FROM NEW."byteCount"
      OR reservation_record."consumedAt" IS NULL
      OR reservation_record."cancelledAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'SubmissionEvidence does not match its exact consumed UploadReservation' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."replacesEvidenceId" IS NOT NULL THEN
      SELECT * INTO replaced_evidence_record
      FROM "SubmissionEvidence"
      WHERE "id" = NEW."replacesEvidenceId"
      FOR SHARE;
      IF replaced_evidence_record."id" IS NULL
        OR NEW."replacesEvidenceId" = NEW."id"
        OR replaced_evidence_record."scanState" <> 'quarantined'
        OR replaced_evidence_record."submissionId" IS DISTINCT FROM NEW."submissionId"
        OR replaced_evidence_record."fieldKey" IS DISTINCT FROM NEW."fieldKey"
        OR replaced_evidence_record."fileRole" IS DISTINCT FROM NEW."fileRole"
        OR replaced_evidence_record."reservationId" = NEW."reservationId"
      THEN
        RAISE EXCEPTION 'SubmissionEvidence replacement must target a distinct quarantined receipt for the same submission field and role' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW."scanState" = 'quarantined' AND COALESCE(NEW."quarantineReasonCode", '') = '' THEN
      RAISE EXCEPTION 'quarantined SubmissionEvidence requires a reason code' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."scanState" IN ('pending', 'clean') AND NEW."quarantineReasonCode" IS NOT NULL THEN
      RAISE EXCEPTION 'non-quarantined SubmissionEvidence cannot carry a quarantine reason' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "userId" INTO target_user_id
  FROM "Submission"
  WHERE "id" = OLD."submissionId"
  FOR SHARE;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'SubmissionEvidence parent Submission is missing: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  PERFORM "reject_dpdp_user_write"(target_user_id);

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."reservationId" IS DISTINCT FROM NEW."reservationId"
    OR OLD."fieldKey" IS DISTINCT FROM NEW."fieldKey"
    OR OLD."fileRole" IS DISTINCT FROM NEW."fileRole"
    OR OLD."s3Key" IS DISTINCT FROM NEW."s3Key"
    OR OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId"
    OR OLD."etag" IS DISTINCT FROM NEW."etag"
    OR OLD."sha256" IS DISTINCT FROM NEW."sha256"
    OR OLD."byteCount" IS DISTINCT FROM NEW."byteCount"
    OR OLD."declaredContentType" IS DISTINCT FROM NEW."declaredContentType"
    OR OLD."inspectedMimeType" IS DISTINCT FROM NEW."inspectedMimeType"
    OR OLD."roleParserResult" IS DISTINCT FROM NEW."roleParserResult"
    OR OLD."committedAt" IS DISTINCT FROM NEW."committedAt"
    OR OLD."replacesEvidenceId" IS DISTINCT FROM NEW."replacesEvidenceId"
  THEN
    RAISE EXCEPTION 'SubmissionEvidence receipt identity and content are immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."scanState" = 'clean'
    AND NEW."scanState" = 'quarantined'
    AND OLD."replacesEvidenceId" IS NOT NULL
  THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'retention-hold:submission-evidence-quarantined:' || OLD."replacesEvidenceId",
        0
      )
    );
    IF EXISTS (
      SELECT 1
      FROM "DeletionReceipt" receipt
      WHERE receipt."targetType" = 'submission-evidence-quarantined'
        AND receipt."targetId" = OLD."replacesEvidenceId"
        AND receipt."databaseVerifiedAt" IS NULL
        AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
    ) THEN
      RAISE EXCEPTION 'clean replacement is frozen by pending retention deletion intent: %', OLD."replacesEvidenceId"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD."scanState" = 'deleted' AND NEW."scanState" <> 'deleted' THEN
    RAISE EXCEPTION 'deleted SubmissionEvidence cannot be restored: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."scanState" = 'quarantined' AND NEW."scanState" NOT IN ('quarantined', 'deleted') THEN
    RAISE EXCEPTION 'quarantined SubmissionEvidence requires a new clean replacement: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."scanState" = 'clean' AND NEW."scanState" NOT IN ('clean', 'quarantined') THEN
    RAISE EXCEPTION 'clean SubmissionEvidence may only remain clean or become quarantined: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."scanState" = 'pending' AND NEW."scanState" NOT IN ('pending', 'clean', 'quarantined') THEN
    RAISE EXCEPTION 'pending SubmissionEvidence has an invalid scan transition: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."scanState" = 'quarantined' AND COALESCE(NEW."quarantineReasonCode", '') = '' THEN
    RAISE EXCEPTION 'quarantined SubmissionEvidence requires a reason code' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."scanState" IN ('pending', 'clean') AND NEW."quarantineReasonCode" IS NOT NULL THEN
    RAISE EXCEPTION 'non-quarantined SubmissionEvidence cannot carry a quarantine reason' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."scanState" IN ('quarantined', 'deleted')
    AND OLD."quarantineReasonCode" IS DISTINCT FROM NEW."quarantineReasonCode"
  THEN
    RAISE EXCEPTION 'SubmissionEvidence quarantine reason is immutable once quarantined: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_SubmissionEvidence_receipt"
BEFORE INSERT OR UPDATE OR DELETE ON "SubmissionEvidence"
FOR EACH ROW EXECUTE FUNCTION "validate_submission_evidence_receipt"();

CREATE FUNCTION "validate_generated_object_reservation_lifecycle"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF COALESCE(BTRIM(NEW."s3Key"), '') = '' THEN
    RAISE EXCEPTION 'GeneratedObjectReservation requires a non-empty S3 key' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."declaredContentType" IS NOT NULL
    AND BTRIM(NEW."declaredContentType") = ''
  THEN
    RAISE EXCEPTION 'GeneratedObjectReservation declared content type cannot be empty' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."s3VersionId" IS NOT NULL
      OR NEW."consumedAt" IS NOT NULL
      OR NEW."cancelledAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'GeneratedObjectReservation must begin before its PUT and without terminal state' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."purpose" IS DISTINCT FROM NEW."purpose"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."interviewId" IS DISTINCT FROM NEW."interviewId"
    OR OLD."s3Key" IS DISTINCT FROM NEW."s3Key"
    OR OLD."declaredContentType" IS DISTINCT FROM NEW."declaredContentType"
    OR OLD."declaredBytes" IS DISTINCT FROM NEW."declaredBytes"
    OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'GeneratedObjectReservation capability identity is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."targetId" IS NOT NULL AND OLD."targetId" IS DISTINCT FROM NEW."targetId" THEN
    RAISE EXCEPTION 'GeneratedObjectReservation target is immutable once assigned: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."s3VersionId" IS NOT NULL
    AND OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId"
  THEN
    RAISE EXCEPTION 'GeneratedObjectReservation S3 version is immutable once persisted: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."s3VersionId" IS NOT NULL AND BTRIM(NEW."s3VersionId") = '' THEN
    RAISE EXCEPTION 'GeneratedObjectReservation S3 version cannot be empty' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."consumedAt" IS NOT NULL AND OLD."consumedAt" IS DISTINCT FROM NEW."consumedAt" THEN
    RAISE EXCEPTION 'GeneratedObjectReservation consumedAt is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND OLD."cancelledAt" IS DISTINCT FROM NEW."cancelledAt" THEN
    RAISE EXCEPTION 'GeneratedObjectReservation cancelledAt is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."consumedAt" IS NOT NULL AND NEW."cancelledAt" IS NOT NULL THEN
    RAISE EXCEPTION 'GeneratedObjectReservation cannot be both consumed and cancelled: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."consumedAt" IS NOT NULL AND NEW."s3VersionId" IS NULL THEN
    RAISE EXCEPTION 'consumed GeneratedObjectReservation requires an exact S3 version: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND (
    OLD."targetId" IS DISTINCT FROM NEW."targetId"
    OR OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId"
    OR OLD."consumedAt" IS DISTINCT FROM NEW."consumedAt"
  ) THEN
    RAISE EXCEPTION 'cancelled GeneratedObjectReservation coordinates are terminal: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_GeneratedObjectReservation_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "GeneratedObjectReservation"
FOR EACH ROW EXECUTE FUNCTION "validate_generated_object_reservation_lifecycle"();

-- New learner-object references must always identify an immutable object
-- version backed by a consumed pre-PUT reservation. Existing key-only rows are
-- grandfathered only while their attachment coordinates remain unchanged.
CREATE FUNCTION "validate_generated_object_attachment"() RETURNS trigger AS $$
DECLARE
  object_key TEXT;
  object_version TEXT;
  attachment_changed BOOLEAN := TRUE;
  reservation_matches BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'GalleryItem' THEN
    object_key := NEW."screenshotS3Key";
    object_version := NEW."screenshotS3VersionId";
    IF TG_OP = 'UPDATE' THEN
      attachment_changed := OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
        OR OLD."screenshotS3Key" IS DISTINCT FROM NEW."screenshotS3Key"
        OR OLD."screenshotS3VersionId" IS DISTINCT FROM NEW."screenshotS3VersionId";
    END IF;
  ELSIF TG_TABLE_NAME = 'PublicationDecision' THEN
    object_key := NEW."previewS3Key";
    object_version := NEW."previewS3VersionId";
    IF TG_OP = 'UPDATE' THEN
      attachment_changed := OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
        OR OLD."previewS3Key" IS DISTINCT FROM NEW."previewS3Key"
        OR OLD."previewS3VersionId" IS DISTINCT FROM NEW."previewS3VersionId";
    END IF;
  ELSIF TG_TABLE_NAME = 'Interview' THEN
    object_key := NEW."audioS3Key";
    object_version := NEW."audioS3VersionId";
    IF TG_OP = 'UPDATE' THEN
      attachment_changed := OLD."id" IS DISTINCT FROM NEW."id"
        OR OLD."audioS3Key" IS DISTINCT FROM NEW."audioS3Key"
        OR OLD."audioS3VersionId" IS DISTINCT FROM NEW."audioS3VersionId";
    END IF;
  ELSIF TG_TABLE_NAME = 'InterviewTurn' THEN
    object_key := NEW."audioS3Key";
    object_version := NEW."audioS3VersionId";
    IF TG_OP = 'UPDATE' THEN
      attachment_changed := OLD."interviewId" IS DISTINCT FROM NEW."interviewId"
        OR OLD."id" IS DISTINCT FROM NEW."id"
        OR OLD."audioS3Key" IS DISTINCT FROM NEW."audioS3Key"
        OR OLD."audioS3VersionId" IS DISTINCT FROM NEW."audioS3VersionId";
    END IF;
  ELSE
    RAISE EXCEPTION 'validate_generated_object_attachment used on unsupported table %', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;

  IF object_key IS NULL THEN
    IF object_version IS NOT NULL THEN
      RAISE EXCEPTION 'generated-object VersionId cannot exist without its key' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('GalleryItem', 'PublicationDecision')
    AND (object_key = 'blocked' OR object_key LIKE 'external-fingerprint:sha256:%')
  THEN
    IF object_version IS NOT NULL THEN
      RAISE EXCEPTION 'generated-object marker must not carry a VersionId' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT attachment_changed THEN RETURN NEW; END IF;
  IF COALESCE(BTRIM(object_version), '') = '' THEN
    RAISE EXCEPTION 'real generated-object keys require an exact VersionId' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'GalleryItem' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "GeneratedObjectReservation" reservation
      WHERE reservation."submissionId" = NEW."submissionId"
        AND reservation."s3Key" = object_key
        AND reservation."s3VersionId" = object_version
        AND reservation."consumedAt" IS NOT NULL
        AND reservation."cancelledAt" IS NULL
        AND (
          (
            reservation."purpose" = 'gallery_screenshot'
            AND reservation."targetId" = NEW."id"
          )
          OR (
            reservation."purpose" = 'publication_preview'
            AND EXISTS (
              SELECT 1 FROM "PublicationDecision" decision
              WHERE decision."id" = reservation."targetId"
                AND decision."submissionId" = NEW."submissionId"
                AND decision."previewS3Key" = object_key
                AND decision."previewS3VersionId" = object_version
            )
          )
        )
    ) INTO reservation_matches;
  ELSIF TG_TABLE_NAME = 'PublicationDecision' THEN
    SELECT EXISTS (
      SELECT 1 FROM "GeneratedObjectReservation" reservation
      WHERE reservation."purpose" = 'publication_preview'
        AND reservation."submissionId" = NEW."submissionId"
        AND reservation."targetId" = NEW."id"
        AND reservation."s3Key" = object_key
        AND reservation."s3VersionId" = object_version
        AND reservation."consumedAt" IS NOT NULL
        AND reservation."cancelledAt" IS NULL
    ) INTO reservation_matches;
  ELSIF TG_TABLE_NAME = 'Interview' THEN
    SELECT EXISTS (
      SELECT 1 FROM "GeneratedObjectReservation" reservation
      WHERE reservation."purpose" = 'interview_recording'
        AND reservation."interviewId" = NEW."id"
        AND reservation."targetId" = NEW."id"
        AND reservation."s3Key" = object_key
        AND reservation."s3VersionId" = object_version
        AND reservation."consumedAt" IS NOT NULL
        AND reservation."cancelledAt" IS NULL
    ) INTO reservation_matches;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM "GeneratedObjectReservation" reservation
      WHERE reservation."purpose" = 'interview_turn_audio'
        AND reservation."interviewId" = NEW."interviewId"
        AND reservation."targetId" = NEW."id"
        AND reservation."s3Key" = object_key
        AND reservation."s3VersionId" = object_version
        AND reservation."consumedAt" IS NOT NULL
        AND reservation."cancelledAt" IS NULL
    ) INTO reservation_matches;
  END IF;

  IF NOT reservation_matches THEN
    RAISE EXCEPTION 'generated-object attachment lacks a matching consumed reservation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_GalleryItem_generated_object"
BEFORE INSERT OR UPDATE ON "GalleryItem"
FOR EACH ROW EXECUTE FUNCTION "validate_generated_object_attachment"();

CREATE TRIGGER "validate_PublicationDecision_generated_object"
BEFORE INSERT OR UPDATE ON "PublicationDecision"
FOR EACH ROW EXECUTE FUNCTION "validate_generated_object_attachment"();

CREATE TRIGGER "validate_Interview_generated_object"
BEFORE INSERT OR UPDATE ON "Interview"
FOR EACH ROW EXECUTE FUNCTION "validate_generated_object_attachment"();

CREATE TRIGGER "validate_InterviewTurn_generated_object"
BEFORE INSERT OR UPDATE ON "InterviewTurn"
FOR EACH ROW EXECUTE FUNCTION "validate_generated_object_attachment"();

CREATE FUNCTION "fence_generated_object_reservation_dpdp_write"() RETURNS trigger AS $$
DECLARE
  old_submission_id TEXT := NULL;
  new_submission_id TEXT := NULL;
  old_interview_id TEXT := NULL;
  new_interview_id TEXT := NULL;
  target_user_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_submission_id := OLD."submissionId";
    old_interview_id := OLD."interviewId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_submission_id := NEW."submissionId";
    new_interview_id := NEW."interviewId";
  END IF;
  FOR target_user_id IN
    SELECT submission."userId"
    FROM "Submission" submission
    WHERE submission."id" = old_submission_id OR submission."id" = new_submission_id
    ORDER BY submission."id"
    FOR SHARE OF submission
  LOOP
    PERFORM "reject_dpdp_user_write"(target_user_id);
  END LOOP;
  FOR target_user_id IN
    SELECT interview."userId"
    FROM "Interview" interview
    WHERE interview."id" = old_interview_id OR interview."id" = new_interview_id
    ORDER BY interview."id"
    FOR SHARE OF interview
  LOOP
    PERFORM "reject_dpdp_user_write"(target_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_GeneratedObjectReservation_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GeneratedObjectReservation"
FOR EACH ROW EXECUTE FUNCTION "fence_generated_object_reservation_dpdp_write"();

CREATE FUNCTION "fence_submission_child_dpdp_write"() RETURNS trigger AS $$
DECLARE
  old_submission_id TEXT := NULL;
  new_submission_id TEXT := NULL;
  target_user_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_submission_id := OLD."submissionId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_submission_id := NEW."submissionId"; END IF;
  FOR target_user_id IN
    SELECT submission."userId"
    FROM "Submission" submission
    WHERE submission."id" = old_submission_id OR submission."id" = new_submission_id
    ORDER BY submission."id"
    FOR SHARE OF submission
  LOOP
    PERFORM "reject_dpdp_user_write"(target_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_GalleryItem_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GalleryItem"
FOR EACH ROW EXECUTE FUNCTION "fence_submission_child_dpdp_write"();

CREATE TRIGGER "fence_PublicationDecision_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "PublicationDecision"
FOR EACH ROW EXECUTE FUNCTION "fence_submission_child_dpdp_write"();

CREATE TRIGGER "fence_GradeHold_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeHold"
FOR EACH ROW EXECUTE FUNCTION "fence_submission_child_dpdp_write"();

CREATE TRIGGER "fence_TeamWorkflowNomination_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "TeamWorkflowNomination"
FOR EACH ROW EXECUTE FUNCTION "fence_submission_child_dpdp_write"();

CREATE FUNCTION "fence_grade_appeal_dpdp_write"() RETURNS trigger AS $$
DECLARE
  old_grade_id TEXT := NULL;
  new_grade_id TEXT := NULL;
  target_user_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_grade_id := OLD."gradeId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_grade_id := NEW."gradeId"; END IF;
  FOR target_user_id IN
    SELECT submission."userId"
    FROM "Grade" grade
    JOIN "Submission" submission ON submission."id" = grade."submissionId"
    WHERE grade."id" = old_grade_id OR grade."id" = new_grade_id
    ORDER BY grade."id"
    FOR SHARE OF grade, submission
  LOOP
    PERFORM "reject_dpdp_user_write"(target_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_GradeAppeal_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "GradeAppeal"
FOR EACH ROW EXECUTE FUNCTION "fence_grade_appeal_dpdp_write"();

-- Independent foreign keys are not enough for evidentiary rows: without a
-- shared-parent check, a hold or appeal can point at another learner's grade,
-- result, or frozen cohort. Besides corrupting review state, that can strand a
-- cross-linked row when either learner exercises deletion rights.
CREATE FUNCTION "validate_grade_hold_contract"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."gradeId" IS DISTINCT FROM NEW."gradeId"
    OR OLD."assessmentResultId" IS DISTINCT FROM NEW."assessmentResultId"
    OR OLD."cohortFreezeId" IS DISTINCT FROM NEW."cohortFreezeId"
    OR OLD."kind" IS DISTINCT FROM NEW."kind"
    OR OLD."code" IS DISTINCT FROM NEW."code"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."evidence" IS DISTINCT FROM NEW."evidence"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'GradeHold evidentiary binding is immutable: %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."gradeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Grade" grade
    WHERE grade."id" = NEW."gradeId"
      AND grade."submissionId" = NEW."submissionId"
  ) THEN
    RAISE EXCEPTION 'GradeHold grade must belong to the same Submission'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."assessmentResultId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "AssessmentResult" result
    WHERE result."id" = NEW."assessmentResultId"
      AND result."submissionId" = NEW."submissionId"
  ) THEN
    RAISE EXCEPTION 'GradeHold assessment result must belong to the same Submission'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."cohortFreezeId" IS NOT NULL AND (
    NEW."gradeId" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "AssessmentCohortFreeze" cohort_freeze
      JOIN "Submission" submission
        ON submission."id" = NEW."submissionId"
       AND submission."assessmentVersionId" = cohort_freeze."assessmentVersionId"
      CROSS JOIN LATERAL jsonb_array_elements(cohort_freeze."membership") member
      WHERE cohort_freeze."id" = NEW."cohortFreezeId"
        AND member->>'submissionId' = NEW."submissionId"
        AND member->>'gradeId' = NEW."gradeId"
    )
  ) THEN
    RAISE EXCEPTION 'GradeHold cohort freeze must contain the same Submission and Grade'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_GradeHold_contract"
BEFORE INSERT OR UPDATE ON "GradeHold"
FOR EACH ROW EXECUTE FUNCTION "validate_grade_hold_contract"();

CREATE FUNCTION "validate_grade_appeal_contract"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."gradeId" IS DISTINCT FROM NEW."gradeId"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."holdId" IS DISTINCT FROM NEW."holdId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'GradeAppeal evidentiary binding is immutable: %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."holdId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "GradeHold" hold
    JOIN "Grade" grade ON grade."id" = NEW."gradeId"
    WHERE hold."id" = NEW."holdId"
      AND hold."kind" = 'appeal'
      AND hold."gradeId" = NEW."gradeId"
      AND hold."submissionId" = grade."submissionId"
  ) THEN
    RAISE EXCEPTION 'GradeAppeal hold must be an appeal hold for the same Grade and Submission'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_GradeAppeal_contract"
BEFORE INSERT OR UPDATE ON "GradeAppeal"
FOR EACH ROW EXECUTE FUNCTION "validate_grade_appeal_contract"();

CREATE FUNCTION "protect_grade_submission_binding"() RETURNS trigger AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'Grade submission binding is immutable: %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_Grade_submission_binding"
BEFORE UPDATE ON "Grade"
FOR EACH ROW EXECUTE FUNCTION "protect_grade_submission_binding"();

CREATE FUNCTION "fence_interview_dpdp_write"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "reject_dpdp_user_write"(NEW."userId");
  ELSE
    PERFORM "reject_dpdp_user_write"(OLD."userId");
    IF TG_OP = 'UPDATE' AND OLD."userId" IS DISTINCT FROM NEW."userId" THEN
      PERFORM "reject_dpdp_user_write"(NEW."userId");
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_Interview_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "Interview"
FOR EACH ROW EXECUTE FUNCTION "fence_interview_dpdp_write"();

CREATE FUNCTION "fence_interview_turn_dpdp_write"() RETURNS trigger AS $$
DECLARE
  old_interview_id TEXT := NULL;
  new_interview_id TEXT := NULL;
  target_user_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_interview_id := OLD."interviewId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_interview_id := NEW."interviewId"; END IF;
  FOR target_user_id IN
    SELECT interview."userId"
    FROM "Interview" interview
    WHERE interview."id" = old_interview_id OR interview."id" = new_interview_id
    ORDER BY interview."id"
    FOR SHARE OF interview
  LOOP
    PERFORM "reject_dpdp_user_write"(target_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fence_InterviewTurn_dpdp_write"
BEFORE INSERT OR UPDATE OR DELETE ON "InterviewTurn"
FOR EACH ROW EXECUTE FUNCTION "fence_interview_turn_dpdp_write"();

-- A team may nominate its own finalised work; only staff may create the
-- authoritative roll-up selection, and the selected submission must match the
-- same team and assignment.
CREATE FUNCTION "validate_team_workflow_nomination"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Submission"
    WHERE "id" = NEW."submissionId"
      AND "assignmentId" = NEW."assignmentId"
      AND "teamId" = NEW."teamId"
      AND "status" = 'finalised'
  ) THEN
    RAISE EXCEPTION 'team workflow nomination must target a finalised submission for the same team and assignment' USING ERRCODE = 'check_violation';
  END IF;
  -- Preserve the academic nomination, but replace an erased nominator with the
  -- exact receipt-scoped pseudonym. Later review-state changes do not depend on
  -- the historical principal remaining in User.
  IF TG_OP = 'UPDATE'
    AND OLD."nominatedBy" IS DISTINCT FROM NEW."nominatedBy"
    AND NEW."nominatedBy" LIKE 'dpdp-erased-actor:v1:%'
  THEN
    PERFORM "require_dpdp_actor_pseudonymization"(
      OLD."nominatedBy", NEW."nominatedBy"
    );
  ELSIF TG_OP = 'INSERT'
    OR OLD."teamId" IS DISTINCT FROM NEW."teamId"
    OR OLD."assignmentId" IS DISTINCT FROM NEW."assignmentId"
    OR OLD."submissionId" IS DISTINCT FROM NEW."submissionId"
    OR OLD."nominatedBy" IS DISTINCT FROM NEW."nominatedBy"
  THEN
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."nominatedBy" AND "teamId" = NEW."teamId") THEN
      RAISE EXCEPTION 'team workflow nomination actor must belong to the nominated team' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_TeamWorkflowNomination"
BEFORE INSERT OR UPDATE ON "TeamWorkflowNomination"
FOR EACH ROW EXECUTE FUNCTION "validate_team_workflow_nomination"();

CREATE FUNCTION "validate_team_workflow_selection"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Submission"
    WHERE "id" = NEW."submissionId"
      AND "assignmentId" = NEW."assignmentId"
      AND "teamId" = NEW."teamId"
      AND "status" = 'finalised'
  ) THEN
    RAISE EXCEPTION 'team workflow selection must target a finalised submission for the same team and assignment' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."selectedBy" AND "role" IN ('instructor', 'admin')) THEN
    RAISE EXCEPTION 'team workflow selection requires an instructor or admin actor' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."nominationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "TeamWorkflowNomination"
    WHERE "id" = NEW."nominationId"
      AND "teamId" = NEW."teamId"
      AND "assignmentId" = NEW."assignmentId"
      AND "submissionId" = NEW."submissionId"
  ) THEN
    RAISE EXCEPTION 'team workflow selection nomination does not match its target' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_TeamWorkflowSelection"
BEFORE INSERT OR UPDATE ON "TeamWorkflowSelection"
FOR EACH ROW EXECUTE FUNCTION "validate_team_workflow_selection"();

-- A cohort snapshot is an evidentiary boundary: membership may be created
-- once, but never rewritten to absorb later submissions or grades.
CREATE FUNCTION "reject_assessment_cohort_freeze_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AssessmentCohortFreeze is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_AssessmentCohortFreeze"
BEFORE UPDATE OR DELETE ON "AssessmentCohortFreeze"
FOR EACH ROW EXECUTE FUNCTION "reject_assessment_cohort_freeze_mutation"();

CREATE FUNCTION "pending_deletion_intent_overlaps"(
  candidate_target_type TEXT,
  candidate_target_id TEXT,
  excluded_idempotency_key TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM "DeletionReceipt" receipt
    WHERE (excluded_idempotency_key IS NULL OR receipt."idempotencyKey" <> excluded_idempotency_key)
      AND receipt."databaseVerifiedAt" IS NULL
      AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
      AND (
        (
          receipt."targetType" = candidate_target_type
          AND receipt."targetId" = candidate_target_id
        )
        OR (
          candidate_target_type IN (
            'submission-evidence-quarantined',
            'uncommitted-upload',
            'uncommitted-generated-object'
          )
          AND receipt."targetType" = 'dpdp-s3-object'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(receipt."details"->'associations') = 'array'
                  THEN receipt."details"->'associations'
                ELSE '[]'::JSONB
              END
            ) association
            WHERE association->>'databaseTable' = CASE candidate_target_type
                WHEN 'submission-evidence-quarantined' THEN 'SubmissionEvidence'
                WHEN 'uncommitted-upload' THEN 'UploadReservation'
                ELSE 'GeneratedObjectReservation'
              END
              AND association->>'databaseRecordId' = candidate_target_id
          )
        )
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Deletion receipts are durable audit evidence. Identity is frozen at intent;
-- verification may only advance from NULL, and details follow the explicit
-- intent -> database_cleanup -> complete state machine (retention may perform
-- intent -> complete atomically).
CREATE FUNCTION "protect_deletion_receipt"() RETURNS trigger AS $$
DECLARE
  old_phase TEXT;
  new_phase TEXT;
  lock_key TEXT;
  native_target_type TEXT;
  native_target_id TEXT;
  expected_identity_digests JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DeletionReceipt is immutable and cannot be deleted: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    FOR lock_key IN
      SELECT candidate.key
      FROM (
        SELECT 'retention-hold:' || NEW."targetType" || ':' || NEW."targetId" AS key
        UNION
        SELECT
          'retention-hold:' ||
          CASE (association->>'databaseTable')
            WHEN 'SubmissionEvidence' THEN 'submission-evidence-quarantined'
            WHEN 'UploadReservation' THEN 'uncommitted-upload'
            ELSE 'uncommitted-generated-object'
          END || ':' || (association->>'databaseRecordId') AS key
        FROM jsonb_array_elements(
          CASE
            WHEN NEW."targetType" = 'dpdp-s3-object'
              AND jsonb_typeof(NEW."details"->'associations') = 'array'
              THEN NEW."details"->'associations'
            ELSE '[]'::JSONB
          END
        ) association
        WHERE association->>'databaseTable' IN (
          'SubmissionEvidence',
          'UploadReservation',
          'GeneratedObjectReservation'
        )
      ) candidate
      ORDER BY candidate.key
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(lock_key, 0));
    END LOOP;

    IF "pending_deletion_intent_overlaps"(
      NEW."targetType", NEW."targetId", NEW."idempotencyKey"
    ) THEN
      RAISE EXCEPTION 'overlapping deletion intent already owns %:%', NEW."targetType", NEW."targetId"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."targetType" = 'dpdp-s3-object' THEN
      FOR native_target_type, native_target_id IN
        SELECT DISTINCT
          CASE (association->>'databaseTable')
            WHEN 'SubmissionEvidence' THEN 'submission-evidence-quarantined'
            WHEN 'UploadReservation' THEN 'uncommitted-upload'
            ELSE 'uncommitted-generated-object'
          END,
          association->>'databaseRecordId'
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(NEW."details"->'associations') = 'array'
              THEN NEW."details"->'associations'
            ELSE '[]'::JSONB
          END
        ) association
        WHERE association->>'databaseTable' IN (
          'SubmissionEvidence',
          'UploadReservation',
          'GeneratedObjectReservation'
        )
      LOOP
        IF "pending_deletion_intent_overlaps"(
          native_target_type, native_target_id, NEW."idempotencyKey"
        ) THEN
          RAISE EXCEPTION 'overlapping deletion intent already owns %:%', native_target_type, native_target_id
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    END IF;
    IF COALESCE(NEW."idempotencyKey", '') = ''
      OR COALESCE(NEW."targetType", '') = ''
      OR COALESCE(NEW."targetId", '') = ''
      OR COALESCE(jsonb_typeof(NEW."details"), '') <> 'object'
      OR COALESCE(NEW."details"->>'phase', '') <> 'intent'
      OR NEW."s3VerifiedAt" IS NOT NULL
      OR NEW."databaseVerifiedAt" IS NOT NULL
      OR (
        (NEW."s3Key" IS NULL) IS DISTINCT FROM (NEW."s3VersionId" IS NULL)
        AND NOT (
          NEW."targetType" IN ('uncommitted-upload', 'uncommitted-generated-object')
          AND NEW."s3Key" IS NOT NULL
          AND NEW."s3VersionId" IS NULL
          AND NEW."details"->>'objectVersionCount' = '0'
        )
      )
      OR (NEW."databaseTable" IS NULL) IS DISTINCT FROM (NEW."databaseRecordId" IS NULL)
    THEN
      RAISE EXCEPTION 'DeletionReceipt must begin as a complete immutable intent' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
    OR OLD."retentionPolicyId" IS DISTINCT FROM NEW."retentionPolicyId"
    OR OLD."targetType" IS DISTINCT FROM NEW."targetType"
    OR OLD."targetId" IS DISTINCT FROM NEW."targetId"
    OR OLD."s3Key" IS DISTINCT FROM NEW."s3Key"
    OR OLD."s3VersionId" IS DISTINCT FROM NEW."s3VersionId"
    OR OLD."databaseTable" IS DISTINCT FROM NEW."databaseTable"
    OR OLD."databaseRecordId" IS DISTINCT FROM NEW."databaseRecordId"
    OR OLD."requestedBy" IS DISTINCT FROM NEW."requestedBy"
    OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt"
  THEN
    RAISE EXCEPTION 'DeletionReceipt intent identity is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."s3VerifiedAt" IS NOT NULL AND OLD."s3VerifiedAt" IS DISTINCT FROM NEW."s3VerifiedAt" THEN
    RAISE EXCEPTION 'DeletionReceipt S3 verification is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."databaseVerifiedAt" IS NOT NULL AND OLD."databaseVerifiedAt" IS DISTINCT FROM NEW."databaseVerifiedAt" THEN
    RAISE EXCEPTION 'DeletionReceipt database verification is immutable once set: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."databaseVerifiedAt" IS NOT NULL
    AND NEW."s3VerifiedAt" IS NULL
    AND NEW."targetType" <> 'dpdp-database-row'
  THEN
    RAISE EXCEPTION 'DeletionReceipt database verification requires S3 verification: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;

  old_phase := OLD."details"->>'phase';
  new_phase := NEW."details"->>'phase';
  IF OLD."targetType" = 'dpdp-user'
    AND old_phase = 'database_cleanup'
    AND new_phase = 'complete'
  THEN
    SELECT COALESCE(
      jsonb_agg(candidate.identity_digest ORDER BY candidate.identity_digest),
      '[]'::JSONB
    )
    INTO expected_identity_digests
    FROM (
      SELECT DISTINCT "dpdp_identity_digest"(OLD."id", identity_value) AS identity_digest
      FROM unnest(ARRAY[
        OLD."targetId",
        OLD."details"->>'email',
        OLD."details"->>'clerkUserId',
        OLD."details"->>'name',
        OLD."details"->>'avatarUrl'
      ]) identity_value
      WHERE COALESCE(identity_value, '') <> ''
    ) candidate;
    IF OLD."details" ? 'deleted'
      OR COALESCE(jsonb_typeof(NEW."details"->'deleted'), '') <> 'object'
      OR NEW."details"->>'confirmedEmailHash' IS DISTINCT FROM
        "dpdp_identity_digest"(
          OLD."id", lower(btrim(OLD."details"->>'confirmedEmail'))
        )
      OR NEW."details"->>'actorPseudonym' IS DISTINCT FROM
        OLD."details"->>'actorPseudonym'
      OR NEW."details"->>'actorAttributionDisposition' IS DISTINCT FROM
        'pseudonymized-minimal-receipt'
      OR NEW."details"->'identityDigests' IS DISTINCT FROM expected_identity_digests
      OR (
        NEW."details"
        - 'phase'
        - 'confirmedEmailHash'
        - 'actorPseudonym'
        - 'actorAttributionDisposition'
        - 'identityDigests'
        - 'deleted'
      ) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'DeletionReceipt authorization scope is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (OLD."details" - 'phase' - 'providerReceipt') IS DISTINCT FROM
    (NEW."details" - 'phase' - 'providerReceipt')
  THEN
    RAISE EXCEPTION 'DeletionReceipt authorization scope is immutable: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."details" IS NOT DISTINCT FROM NEW."details"
    AND OLD."s3VerifiedAt" IS NOT DISTINCT FROM NEW."s3VerifiedAt"
    AND OLD."databaseVerifiedAt" IS NOT DISTINCT FROM NEW."databaseVerifiedAt"
  THEN
    RETURN NEW;
  END IF;
  IF old_phase = 'intent' AND new_phase = 'intent'
    AND OLD."s3VerifiedAt" IS NULL
    AND NEW."s3VerifiedAt" IS NOT NULL
    AND NEW."databaseVerifiedAt" IS NULL
    AND NEW."s3Key" IS NOT NULL
    AND NEW."s3VersionId" IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  IF old_phase = 'intent' AND new_phase = 'database_cleanup'
    AND NEW."databaseVerifiedAt" IS NULL
    AND (
      (NEW."targetType" = 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NULL)
      OR (NEW."targetType" <> 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  IF old_phase = 'intent' AND new_phase = 'complete'
    AND NEW."databaseVerifiedAt" IS NOT NULL
    AND (
      (NEW."targetType" = 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NULL)
      OR (NEW."targetType" <> 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  IF old_phase = 'database_cleanup' AND new_phase = 'complete'
    AND NEW."databaseVerifiedAt" IS NOT NULL
    AND (
      (NEW."targetType" = 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NULL)
      OR (NEW."targetType" <> 'dpdp-database-row' AND NEW."s3VerifiedAt" IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DeletionReceipt has an invalid verification transition: % -> %', old_phase, new_phase USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "protect_DeletionReceipt"
BEFORE INSERT OR UPDATE OR DELETE ON "DeletionReceipt"
FOR EACH ROW EXECUTE FUNCTION "protect_deletion_receipt"();

-- Legal holds and durable deletion intents serialize on the same exact target
-- key. Direct SQL inserts therefore cannot race past the retention service's
-- hold check after an irreversible object-version deletion has begun.
CREATE FUNCTION "serialize_retention_hold_with_deletion_intent"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RetentionHold is an immutable audit record and cannot be deleted: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."targetType" IS DISTINCT FROM NEW."targetType"
    OR OLD."targetId" IS DISTINCT FROM NEW."targetId"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."createdBy" IS DISTINCT FROM NEW."createdBy"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'RetentionHold target identity is immutable: %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."releasedAt" IS NULL) IS DISTINCT FROM (NEW."releasedBy" IS NULL) THEN
    RAISE EXCEPTION 'RetentionHold release timestamp and actor must be set together: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."releasedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'RetentionHold must be created active before release: %', NEW."id" USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."releasedAt" IS NOT NULL AND (
    OLD."releasedAt" IS DISTINCT FROM NEW."releasedAt"
    OR OLD."releasedBy" IS DISTINCT FROM NEW."releasedBy"
  ) THEN
    RAISE EXCEPTION 'released RetentionHold cannot be changed or reactivated: %', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."releasedAt" IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('retention-hold:' || NEW."targetType" || ':' || NEW."targetId", 0)
  );
  IF EXISTS (
    SELECT 1
    FROM "DeletionReceipt" receipt
    WHERE receipt."databaseVerifiedAt" IS NULL
      AND receipt."details"->>'phase' IN ('intent', 'database_cleanup')
      AND (
        (receipt."targetType" = NEW."targetType" AND receipt."targetId" = NEW."targetId")
        OR (
          NEW."targetType" = 'submission'
          AND receipt."details"->>'submissionId' = NEW."targetId"
        )
        OR (
          NEW."targetType" = 'interview'
          AND receipt."details"->>'interviewId' = NEW."targetId"
        )
        OR (
          NEW."targetType" IN (
            'dpdp-s3-object',
            'submission-evidence-quarantined',
            'uncommitted-upload',
            'uncommitted-generated-object'
          )
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(receipt."details"->'associations') = 'array'
                  THEN receipt."details"->'associations'
                ELSE '[]'::JSONB
              END
            ) association
            WHERE (
              NEW."targetType" = 'dpdp-s3-object'
              AND (association->>'databaseTable') || ':' || (association->>'databaseRecordId') = NEW."targetId"
            ) OR (
              NEW."targetType" = 'submission-evidence-quarantined'
              AND association->>'databaseTable' = 'SubmissionEvidence'
              AND association->>'databaseRecordId' = NEW."targetId"
            ) OR (
              NEW."targetType" = 'uncommitted-upload'
              AND association->>'databaseTable' = 'UploadReservation'
              AND association->>'databaseRecordId' = NEW."targetId"
            ) OR (
              NEW."targetType" = 'uncommitted-generated-object'
              AND association->>'databaseTable' = 'GeneratedObjectReservation'
              AND association->>'databaseRecordId' = NEW."targetId"
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'cannot create RetentionHold after deletion intent has begun for %:%', NEW."targetType", NEW."targetId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "serialize_RetentionHold_with_deletion_intent"
BEFORE INSERT OR UPDATE OR DELETE ON "RetentionHold"
FOR EACH ROW EXECUTE FUNCTION "serialize_retention_hold_with_deletion_intent"();

COMMIT;
