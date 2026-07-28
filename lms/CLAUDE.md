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

## Architectural invariants

- Migrations are forward-only. Never edit or roll back an applied migration.
- Artifact kinds are `AssignmentType` rows, not code. Adding an artifact type must not require a deploy.
- All AI provider calls live behind `lib/ai/`. No SDK imports elsewhere.
- All fetches of user-supplied URLs go through `lib/net/safe-fetch` (SSRF guard). No raw `fetch` of user input.
- Diagnostic quiz data must never reach student-facing responses. All quiz reads go through the single repository module `lib/quizzes`.
- Grades and PCI never leave the LMS. The Praxy export carries artifacts + badges only.
- Gate resolution happens only via `lib/gates` `resolveGate`. No ad-hoc gate queries in routes.
- The app tier never proxies file bytes. Uploads and downloads use S3 presigned URLs only.
- Tables are single-course today but designed so a `courseId` column can be added later — no schema decisions that assume exactly one course forever.
- Every non-obvious choice gets a line in `docs/DECISIONS.md`.
