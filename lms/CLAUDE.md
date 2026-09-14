@AGENTS.md

# Praxel LMS — "The Forge"

## Stack

- Next.js App Router + TypeScript (no `src/` dir; `app/` at repo root), pnpm.
- Prisma ORM (v6) + Postgres. Schema in `prisma/schema.prisma`.
- pg-boss for background jobs (grading queue, crawls), worker in `worker/`.
- Clerk for auth (webhook-synced into `User`).
- S3 with presigned URLs for all file storage.
- Anthropic for grading — called from the queue worker only, never in a request handler.
- Voice interviews: LiveKit (transport), Deepgram (STT), Gemini (dialog), ElevenLabs (TTS).
- Brand: docs/BRAND.md. Parchment background, Pine primary, Ochre single accent, Sand 1px borders, 0px border radius everywhere, Fraunces/Geist/Geist Mono via next/font.

## Commands

- `pnpm dev` — dev server
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm test` — vitest
- `pnpm typecheck` — tsc --noEmit
- `pnpm lint` — eslint
- `pnpm seed` — prisma/seed.ts
- `pnpm worker:dev` — run the pg-boss worker
- `pnpm prisma migrate dev` — create/apply migrations (needs DATABASE_URL)
- `pnpm eval:grading` — offline grading-eval harness (scripts/eval-grading.ts)
- `pnpm interview:simulate` — scripted interview loop (scripts/interview-simulate.ts)
- `pnpm e2e` — Playwright smoke suite (first: `pnpm exec playwright install chromium`; needs a seeded DB; the config boots `pnpm dev -p 3210` with ENABLE_TEST_LOGIN=1)
- `pnpm load:baseline` / `pnpm load:quiz-burst` — k6 load scripts (require the `k6` binary; dev/staging with ENABLE_TEST_LOGIN=1 only, NEVER production)

## Architectural invariants

- Migrations are forward-only. Never edit or roll back an applied migration.
- Artifact kinds are `AssignmentType` rows, not code. Adding an artifact type must not require a deploy.
- All AI provider calls live behind `lib/ai/`. No SDK imports elsewhere.
- All fetches of user-supplied URLs go through `lib/net/safe-fetch` (SSRF guard). No raw `fetch` of user input.
- Diagnostic quiz data must never reach student-facing responses. All quiz reads go through the single repository module `lib/quizzes`.
- Grades and PCI never leave the LMS. The Praxy export carries artifacts + badges only.
- Gate resolution happens only via `lib/gates` `resolveGate`. No ad-hoc gate queries in routes.
- An assignment has a hard deadline (`dueAt`, the only one backend rules read) and an optional soft one shown to learners (`displayDueAt`). Both resolve through `lib/deadlines`; `dueAt` never reaches a student-facing payload.
- The app tier never proxies file bytes. Uploads and downloads use S3 presigned URLs only.
- Tables are single-course today but designed so a `courseId` column can be added later — no schema decisions that assume exactly one course forever.
- Every non-obvious choice gets a line in `docs/DECISIONS.md`.

## Shipyard (Course 2) — "the Forge in Course 2 mode"

The Shipyard is the Course 2 product-shipping portal, built inside this repo as
a `courseId`-scoped mode of the Forge. Source of truth: `docs/shipyard/SPEC.md`
(the build prompt) and `docs/shipyard/ARCHITECTURE.md` (how it is fitted in).

### Module map

- `lib/shipyard/constants.ts` — `SHIPYARD_COURSE_ID`, checkpoint order, route
  paths, queue names, reviewer concurrency.
- `lib/shipyard/checkpoints.ts` — the six checkpoints as data (bar, rubric,
  gate type, metric signals, field schema). Seeded once; edited as rows after.
- `lib/shipyard/fields.ts` — the `FieldSpec` contract and
  `validateSubmissionFields`. The only interpreter of a checkpoint's form.
- `lib/shipyard/gates.ts` — `resolveGates`, pure. The gate rule lives here.
- `lib/shipyard/gate-state.ts` — `recomputeGates(productId, deps)`, the only
  writer of `ShipyardCheckpointState`.
- `lib/shipyard/cooldown.ts` — the resubmit cooldown, pure.
- `lib/shipyard/scoring.ts` — the four weighted components, `computeGrade` and
  `deriveComponents`, pure.
- `lib/tracker/` — Shipped.money. `types.ts` (signals + Zod), `client.ts`
  (`createTrackerClient`, `TRACKER_MODE`), `real.ts` (HTTP), `fake.ts`
  (ShipyardTrackerOverride, demos only).
- `lib/ai/router.ts` — the routing table, prices, `computeCostUsd`, the BYOK
  kill-switch. The only place a model slug appears.
- `lib/ai/openrouter.ts` — the only module speaking HTTP to OpenRouter.
- `lib/ai/openrouter-fake.ts` — the deterministic responder used with no key.
- `worker/shipyard.ts` — the Shipyard queues, its own Railway service.
- `prisma/seed-shipyard.ts` — `seedShipyard(tx, ctx)`, called from `seed.ts`.
- Prisma models are all `Shipyard*` and carry `courseId` (default `course-2`).

### Invariants (in addition to the Forge's)

- `resolveGates` in `lib/shipyard/gates.ts` is the only place gate state is
  decided. Routes and pages read `ShipyardCheckpointState`, which is written
  only by `recomputeGates(productId)`.
- A metric gate is cleared by tracker signals alone. No student-typed field
  ever feeds a metric signal. A blocking flag from the tracker makes every
  metric signal false. The fake tracker's override table is admin-only and
  refuses writes when `TRACKER_MODE=real`.
- The reviewer never sees a student's name, email, or section.
- Every model call writes model, provider, tokens and USD to the
  `ShipyardReview` row (verdicts) or `CostLog` (pre-flight, escalation, evals).
- The Shipyard does NOT use `lib/ai/client.ts` (Course 1's Anthropic SDK).
  Every Shipyard model call goes through OpenRouter; the boundary is enforced
  by `tests/shipyard-ai-boundary.test.ts`.
- Nothing reaches students before `pnpm eval:reviewer` numbers are logged in
  `docs/DECISIONS.md`.

### Commands

- `pnpm worker:shipyard` — run the Shipyard pg-boss worker
- `pnpm eval:reviewer` — the fixture-agreement release gate (M2.5)
- `pnpm vitest run tests/shipyard-*.test.ts` — the Shipyard unit suite
