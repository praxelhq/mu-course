-- Interview v2: composite video recording, platform-observed flags, and the
-- three per-student prerequisite artifacts (resume, blueprint, sector map).
-- Forward-only; no existing migration is edited.

ALTER TYPE "GeneratedObjectPurpose" ADD VALUE 'interview_video';
ALTER TYPE "GeneratedObjectPurpose" ADD VALUE 'interview_prerequisite';

-- Video coordinates sit beside the existing audio pair. systemFlags carries
-- flags the PLATFORM observes (the camera track ending mid-call), as opposed to
-- the ones the grading model infers into rubricScores: the grader cannot see a
-- track end, and must never be able to emit or clear one.
ALTER TABLE "Interview"
  ADD COLUMN "videoS3Key" TEXT,
  ADD COLUMN "videoS3VersionId" TEXT,
  ADD COLUMN "systemFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Deliberately not a Submission: Submission carries assignment, grade, gallery
-- and version semantics none of these three should acquire, and a resume must
-- never become a graded artifact or reach a gallery.
CREATE TABLE "InterviewPrerequisite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "kind" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "s3VersionId" TEXT,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "extractedText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewPrerequisite_kind_check"
    CHECK ("kind" IN ('resume', 'blueprint', 'sector_map'))
);

-- One row per kind per student: a re-upload replaces in place rather than
-- accumulating copies of a resume.
CREATE UNIQUE INDEX "InterviewPrerequisite_userId_kind_key"
  ON "InterviewPrerequisite"("userId", "kind");
CREATE INDEX "InterviewPrerequisite_userId_idx" ON "InterviewPrerequisite"("userId");
