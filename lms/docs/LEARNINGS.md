# LEARNINGS.md

Whenever a bug is fixed or a wrong assumption corrected, append what was learned so future sessions don't repeat it.

## 2026-09-14 · Shipyard M0-A (foundation)

- **`prisma migrate dev` cannot be used in this repo.** It replays every
  migration into a shadow database and the July roster migration
  (`20260730143000_section_f_email_aliases_and_fg_rosters`) is data-dependent,
  so it fails there every time. Author a migration by hand instead:
  `git show HEAD:./prisma/schema.prisma > /tmp/schema-before.prisma`, edit the
  schema, then
  `pnpm prisma migrate diff --from-schema-datamodel /tmp/schema-before.prisma
  --to-schema-datamodel prisma/schema.prisma --script >
  prisma/migrations/<stamp>_<name>/migration.sql`, read the SQL, and apply with
  `pnpm prisma migrate deploy`. Note `HEAD:./prisma/...` — `git show` resolves
  paths from the repository root, which is the parent of `lms/`.
- **`DEMO_SEED_TABLES` was missing `InterviewPrerequisite`,** so `pnpm seed`
  had been failing outright with "cannot truncate a table referenced in a
  foreign key constraint", and every live-DB assertion in `tests/seed.test.ts`
  was being skipped after its `beforeAll` threw. The table list is asserted
  against `Prisma.dmmf` by that same test, so any new model must be added to it
  — including every `Shipyard*` table.
- **Two Forge submission generators had drifted from their own schemas,** which
  only became visible once the seed could run again: the `app` type requires
  `idea`, `audience` and `userFlows`, and the `workflow` type requires
  `recordingUrl`. Both are now produced by `prisma/seed.ts`.
- **TypeScript needs an explicit `boolean` on a loop-carried flag.** In
  `resolveGates`, `let previousPassed = true` plus
  `const reachable = previousPassed || manualOpen` and a later
  `previousPassed = reachable && …` is a circular inference (TS7022) even
  though the type is obvious. Annotate both.
- **The fake OpenRouter responder must be deterministic,** because the seed
  writes its token counts and costs into `ShipyardReview` rows and the seed's
  idempotency test compares two runs. A content-hashed pseudo-token count does
  this without a PRNG threaded through every call site.
