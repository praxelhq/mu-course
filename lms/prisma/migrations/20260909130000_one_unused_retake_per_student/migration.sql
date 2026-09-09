-- One unused retake per student, enforced by the database.
--
-- Both writers are check-then-act: the instructor route reads for an unused
-- grant and then creates one, and the sweep's auto-grant does the same. Two
-- concurrent sweep runs (or two instructors, or a sweep racing an instructor)
-- can both read "none" and both insert, handing a student two extra attempts
-- at a graded assessment.
--
-- Partial unique, so USED grants — the historical record of every retake ever
-- issued — are untouched and can accumulate freely. Prisma cannot express a
-- partial index in schema.prisma, so this is raw and stays raw; `migrate
-- deploy` applies the file as written.
--
-- Deliberately NOT concurrent: Prisma runs a migration inside a transaction.
-- The table holds single digits of rows.
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewRetake_one_unused_per_user"
  ON "InterviewRetake" ("userId")
  WHERE "usedByInterviewId" IS NULL;
