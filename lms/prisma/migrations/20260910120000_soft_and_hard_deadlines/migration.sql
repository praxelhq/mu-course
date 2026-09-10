-- A deadline that is shown, next to a deadline that is enforced.
--
-- Two places carry a date a learner reads and a rule depends on:
--   Assignment.dueAt              grade finalisation and the cohort freeze
--   InterviewWindow.closesAt      whether a student may start an interview
--
-- Both keep their meaning untouched. The new columns are presentation only —
-- the earlier date the course publishes so work lands before the real cutoff.
--
-- Nullable with no backfill: every existing row keeps showing its own hard
-- date (lib/deadlines falls back), so this changes nothing until a soft date
-- is deliberately set.
ALTER TABLE "Assignment" ADD COLUMN "displayDueAt" TIMESTAMP(3);
ALTER TABLE "InterviewWindow" ADD COLUMN "displayClosesAt" TIMESTAMP(3);

-- The invariant, enforced where it cannot drift: a shown date later than the
-- one actually enforced would advertise a window the rules do not honour.
-- NOT VALID is unnecessary — both columns are empty.
ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_displayDueAt_not_after_dueAt"
  CHECK ("displayDueAt" IS NULL OR ("dueAt" IS NOT NULL AND "displayDueAt" <= "dueAt"));

ALTER TABLE "InterviewWindow"
  ADD CONSTRAINT "InterviewWindow_displayClosesAt_not_after_closesAt"
  CHECK ("displayClosesAt" IS NULL OR "displayClosesAt" <= "closesAt");
