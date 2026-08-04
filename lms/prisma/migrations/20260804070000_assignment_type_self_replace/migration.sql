-- Additive, forward-only. Learners may replace their own submission while the
-- assignment gate is open for types that opt in; the default preserves the
-- existing one-submission-per-student course rule.
ALTER TABLE "AssignmentType"
  ADD COLUMN "allowSelfReplace" BOOLEAN NOT NULL DEFAULT false;
