-- The abandonment sweep and the ~30-room concurrency count both filter
-- Interview on (status, lastSeenAt). The concurrency count runs on every
-- /api/interview/token poll from every queued student, so at cohort scale this
-- is the hottest read in the interview path.
--
-- Plain CREATE INDEX, not CONCURRENTLY: Prisma runs a migration inside a
-- transaction and CONCURRENTLY cannot. The table holds a few hundred rows at
-- most, so the brief lock is not worth the special handling.
CREATE INDEX IF NOT EXISTS "Interview_status_lastSeenAt_idx"
  ON "Interview" ("status", "lastSeenAt");
