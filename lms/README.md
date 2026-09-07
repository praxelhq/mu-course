# Praxel LMS Forge

This Next.js application delivers the Masters' Union Applied AI course. The
current Sessions 3–5 release teaches data work with the TrustMRR class dataset,
an evidence-led Lovable product build, and Make.com revenue workflows.

## Sessions 3–5

- Authored course packages: [`course/session-03`](course/session-03),
  [`course/session-04`](course/session-04), and
  [`course/session-05`](course/session-05)
- Generated decks, manual, quizzes, notebook, and workbook: [`output`](output)
- Controlling brief and provenance: [`docs/build/SOURCE_OF_TRUTH.md`](docs/build/SOURCE_OF_TRUTH.md)
- Railway release procedure: [`docs/operations/sessions-03-05-railway-release.md`](docs/operations/sessions-03-05-railway-release.md)

The private TrustMRR release is generated under `private/course-data/`, which is
git-ignored. Do not move row-level data, fact packs, evaluator adapters, or
answer keys into public assets.

## Local development

Use Node 22 and pnpm. Point `DATABASE_URL` only at a disposable/local Postgres
database before running migrations, loaders, seeds, or database-backed tests.

```sh
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm dev:all
```

Run the Sessions 3–5 contract check without mutating the database:

```sh
pnpm setup:sessions3-5:dry-run
```

Load the verified release into an explicitly selected environment, with all
new gates locked:

```sh
DATABASE_URL='postgresql://…/disposable_database' pnpm setup:sessions3-5 -- --report-json
```

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

Database-backed tests may seed or delete fixtures. Never allow them to inherit
an unknown `.env` target; override `DATABASE_URL` with an isolated database.

## Deployment

Web, worker, and agent deploy to Railway from the same reviewed commit. The web
service is the sole migration owner. Course loading is a separate, explicit
one-off operation and never opens gates. Follow the release runbook; deployment
health is not classroom-readiness approval.
