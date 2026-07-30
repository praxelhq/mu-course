import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(root, "prisma/migrations/20260730160000_sessions_3_5_contracts/migration.sql"),
  "utf8",
);

describe("immutable assessment contracts", () => {
  it("keeps legacy mode explicit while versioned assignments bind an active contract", () => {
    expect(schema).toMatch(/enum ContractMode\s*{[\s\S]*legacy[\s\S]*versioned[\s\S]*}/);
    expect(schema).toMatch(/contractMode\s+ContractMode\s+@default\(legacy\)/);
    expect(schema).toMatch(/activeAssessmentVersionId\s+String\?/);
    expect(schema).toMatch(/model AssessmentVersion\s*{[\s\S]*ownerKind\s+OwnerKind/);
    expect(schema).toMatch(/model DatasetRelease\s*{/);
    expect(schema).toMatch(/model AssessmentEvaluatorConfig\s*{/);
  });

  it("defines the downstream durable seams and canonical version identity", () => {
    for (const model of [
      "AssessmentResult",
      "UploadReservation",
      "SubmissionEvidence",
      "ResubmissionGrant",
      "GradeAppeal",
      "GradeHold",
      "AssessmentCohortFreeze",
      "PublicationDecision",
      "TeamWorkflowNomination",
      "TeamWorkflowSelection",
      "RetentionPolicy",
      "RetentionHold",
      "DeletionReceipt",
      "ServiceHeartbeat",
    ]) {
      expect(schema, model).toContain(`model ${model} {`);
    }
    expect(schema).toMatch(
      /@@unique\(\[assignmentId, assessmentVersionId, ownerKind, ownerId, version, attempt\]/,
    );
    expect(schema).toMatch(/evaluationKey\s+String\s+@unique/);
    expect(schema).toMatch(/model DeletionReceipt\s*{[\s\S]*idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/model UploadReservation\s*{[\s\S]*s3VersionId\s+String\?/);
    expect(schema).toMatch(/model AssessmentCohortFreeze\s*{[\s\S]*membership\s+Json/);
    expect(schema).toMatch(/model PublicationDecision\s*{[\s\S]*previewS3Key\s+String\?/);
  });

  it("uses a forward-only preflight and database triggers for published contracts", () => {
    expect(migration).toContain(
      "sessions_3_5_contracts preflight: duplicate owner/version/attempt submissions exist",
    );
    expect(migration).toMatch(/CREATE TRIGGER .*AssessmentVersion[\s\S]*BEFORE UPDATE OR DELETE/);
    expect(migration).toMatch(/CREATE TRIGGER .*DatasetRelease[\s\S]*BEFORE UPDATE OR DELETE/);
    expect(migration).toContain("published AssessmentVersion is immutable");
    expect(migration).toContain("published DatasetRelease is immutable");
    expect(migration).toContain(
      "active AssessmentVersion must be published and belong to the same Assignment",
    );
    expect(migration).toContain(
      "Submission identity does not match its published AssessmentVersion",
    );
    expect(migration).toContain("Submission contract identity is immutable after insert");
    for (const field of [
      "assignmentId",
      "assessmentVersionId",
      "ownerKind",
      "ownerId",
      "userId",
      "teamId",
      "version",
      "attempt",
    ]) {
      expect(migration).toContain(`OLD."${field}" IS DISTINCT FROM NEW."${field}"`);
    }
    expect(migration).toMatch(
      /FROM "Assignment"[\s\S]*WHERE "id" = NEW\."assignmentId"[\s\S]*FOR SHARE/,
    );
    expect(migration).toContain(
      "team workflow selection requires an instructor or admin actor",
    );
    expect(migration).toContain("AssessmentCohortFreeze is immutable");
    expect(migration).toContain("memberCount\" = jsonb_array_length");
    expect(migration).toContain("serialize_retention_hold_with_deletion_intent");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /serialize_RetentionHold_with_deletion_intent"\s+BEFORE INSERT OR UPDATE OR DELETE/,
    );
    expect(migration).toContain("RetentionHold target identity is immutable");
    expect(migration).toContain("RetentionHold is an immutable audit record and cannot be deleted");
    expect(migration).toContain("DeletionReceipt intent identity is immutable");
    expect(migration).toContain("DeletionReceipt has an invalid verification transition");
    expect(migration).toContain("praxel.dpdp_deletion_receipt_id");
    expect(migration).toContain("exact DPDP row deletion receipt is required");
    expect(migration).toContain("Assignment contractMode cannot be downgraded");
    expect(migration).toContain(
      "Assignment cannot become versioned while unbound legacy submissions exist",
    );
    expect(migration).toContain("submitted Submission receipt content is immutable");
    expect(migration).toContain("finalised Submission status is terminal");
    expect(migration).toContain("UploadReservation capability identity is immutable");
    expect(migration).toContain("UploadReservation S3 version is immutable once persisted");
    expect(migration).toContain(
      "SubmissionEvidence does not match its exact consumed UploadReservation",
    );
    expect(migration).toContain("SubmissionEvidence receipt identity and content are immutable");
    expect(migration).toContain("quarantined SubmissionEvidence requires a new clean replacement");
    expect(migration).toMatch(
      /FROM "Submission"[\s\S]*WHERE "id" = NEW\."submissionId"[\s\S]*FOR SHARE/,
    );
    expect(migration).toContain("AssessmentVersion must be created as a draft before publish");
    expect(migration).toContain("AssessmentVersion requires an evaluator config before publish");
    expect(migration).toContain("DatasetRelease must be created as a draft before publish");
    expect(migration).toContain("DatasetRelease requires at least one declared file before publish");
    expect(migration.trimStart().startsWith("-- Sessions 3–5 contract foundation")).toBe(true);
    expect(migration).toMatch(/\nBEGIN;[\s\S]*COMMIT;\s*$/);
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE|DROP COLUMN/);
  });

  it("enforces erasure, retention, replacement, and terminal-result lifecycle invariants", () => {
    expect(migration).toContain("reject_dpdp_user_write");
    expect(migration).toContain("user data is write-fenced by pending DPDP erasure");
    expect(migration).toContain("team membership is write-fenced by pending DPDP erasure");
    expect(migration).toContain("teamReassignments");
    expect(migration).toContain("lastMemberTeamIds");
    expect(migration).toContain("reject_User_dpdp_identity_write");
    expect(migration).toContain("fence_Interview_dpdp_write");
    expect(migration).toContain("fence_InterviewTurn_dpdp_write");
    expect(migration).toContain("overlapping deletion intent already owns");

    expect(migration).toContain(
      "SubmissionEvidence replacement must target a distinct quarantined receipt for the same submission field and role",
    );
    expect(migration).toContain(
      "clean replacement is frozen by pending retention deletion intent",
    );
    expect(migration).toMatch(
      /IF TG_OP = 'INSERT'[\s\S]*OLD\."nominatedBy" IS DISTINCT FROM NEW\."nominatedBy"[\s\S]*team workflow nomination actor must belong/,
    );

    expect(migration).toContain('CREATE TRIGGER "protect_AssessmentResult_lifecycle"');
    expect(migration).toContain("AssessmentResult binding identity is immutable");
    expect(migration).toContain("terminal AssessmentResult evidence is immutable");
    expect(migration).toContain("AssessmentResult has an invalid status transition");
    expect(migration).toContain("terminal AssessmentResult requires completedAt");
    expect(migration).toContain(
      'CREATE TRIGGER "protect_RetentionPolicy_immutable"',
    );
    expect(migration).toContain(
      "RetentionPolicy is immutable; create a versioned policy row instead",
    );
  });

  it("adds a backward-compatible stable-ID quiz contract and fail-closed publication checks", () => {
    expect(schema).toMatch(/enum QuizClassification\s*{[\s\S]*diagnostic[\s\S]*formative[\s\S]*summative/);
    expect(schema).toMatch(/model Quiz\s*{[\s\S]*contractMode\s+ContractMode\s+@default\(legacy\)/);
    expect(schema).toMatch(/classificationFinalizedAt\s+DateTime\?/);
    expect(schema).toMatch(/answerMode\s+QuizAnswerMode\s+@default\(legacy_index\)/);
    expect(schema).toMatch(/quizContractVersion\s+Int\s+@default\(1\)/);
    expect(migration).toContain("Quiz_diagnostic_compatibility_check");
    expect(migration).toContain("versioned Quiz itemVersionId values must be present and unique");
    expect(migration).toContain("published Quiz contract is immutable");
    expect(migration).toMatch(
      /old_parent_id := OLD\."assessmentVersionId"[\s\S]*new_parent_id := NEW\."assessmentVersionId"[\s\S]*FROM "AssessmentVersion"[\s\S]*FOR SHARE/,
    );
    expect(migration).toMatch(
      /old_parent_id := OLD\."datasetReleaseId"[\s\S]*new_parent_id := NEW\."datasetReleaseId"[\s\S]*FROM "DatasetRelease"[\s\S]*FOR SHARE/,
    );
  });

  it("backfills legacy diagnostic quizzes before validating new compatibility checks", () => {
    const backfill = migration.indexOf('UPDATE "Quiz"');
    const constraint = migration.indexOf('ADD CONSTRAINT "Quiz_diagnostic_compatibility_check"');
    const validation = migration.indexOf('VALIDATE CONSTRAINT "Quiz_diagnostic_compatibility_check"');
    expect(backfill).toBeGreaterThan(-1);
    expect(constraint).toBeGreaterThan(backfill);
    expect(validation).toBeGreaterThan(constraint);
  });
});
