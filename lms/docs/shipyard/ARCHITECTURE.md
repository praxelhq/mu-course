# The Shipyard · architecture notes (Course 2 portal inside the Forge)

*Read this together with `docs/shipyard/SPEC.md` (the build prompt, verbatim) and
`docs/BRAND.md`. This file records HOW the Shipyard is fitted into the Forge
codebase. Anything non-obvious also gets a dated line in `docs/DECISIONS.md`.*

## 1 · Path taken: a `courseId`-scoped mode of the Forge

The Shipyard is built inside this repo, sharing the Forge's auth (Clerk +
roster gate in `proxy.ts`), `User`/`Section` tables, S3 presign layer
(`lib/s3`), SSRF guard (`lib/net/safe-fetch`), pg-boss plumbing (`lib/queue`),
`AuditLog`, `Notification`, and `CostLog`. Everything Shipyard-specific is new
and namespaced.

- **Prisma models** are prefixed `Shipyard*` because the Forge already owns
  `Submission`, `Grade`, `Review`-shaped tables: `ShipyardProduct`,
  `ShipyardCheckpoint`, `ShipyardSubmission`, `ShipyardReview`,
  `ShipyardCheckpointState`, `ShipyardGrade`, `ShipyardRouterState`,
  `ShipyardWeights`, `ShipyardTrackerOverride` (fake tracker only). Every
  Shipyard table carries `courseId String @default("course-2")` and is
  indexed on it. There is no `Course` table yet; `SHIPYARD_COURSE_ID` is a
  constant in `lib/shipyard/constants.ts`.
- **Routes** live under `app/shipyard/**` (student spine at `/shipyard`,
  instructor at `/shipyard/instructor`, admin at `/shipyard/admin`) with their
  own layout and visual system in `components/shipyard/**`. The Forge `Shell`
  is not reused: the Shipyard has a deliberately quieter, denser, less
  verbose UI. Brand tokens (Parchment/Pine/Ochre/Sand, 0px radius, Fraunces +
  Geist + Geist Mono) are the same; the composition is new.
- **APIs** live under `app/api/shipyard/**` and use the Forge's `withAuth`.
- **Pure logic** lives in `lib/shipyard/**` (gates, cooldown, scoring,
  checkpoint field schemas, verdict parsing). All of it is unit-tested with no
  DB.
- **AI gateway**: `lib/ai/openrouter.ts` (the only module that speaks HTTP to
  OpenRouter) and `lib/ai/router.ts` (routing table, fallback array,
  kill-switch, per-call cost). The Forge's Anthropic SDK client in
  `lib/ai/client.ts` stays for Course 1 grading and is NOT used by the
  Shipyard.
- **Tracker client**: `lib/tracker/` — `TrackerClient` interface, a real HTTP
  client (`SHIPPED_MONEY_BASE_URL` + `SHIPPED_MONEY_SERVICE_TOKEN`), and a
  fake responder backed by `ShipyardTrackerOverride` rows. `TRACKER_MODE=fake`
  selects the fake; `real` selects HTTP.
- **Worker**: a separate entrypoint `worker/shipyard.ts` registers the
  Shipyard queues (`shipyard.review`, `shipyard.review.dead`,
  `shipyard.tracker-refresh`, `shipyard.gate-sweep`) with
  `SHIPYARD_REVIEW_CONCURRENCY` (default 15). It is deployed as its own
  Railway service from the same `Dockerfile.worker` image via
  `railway.shipyard-worker.json` (start command override), so review load
  never competes with Course 1 grading. Playwright runs here only.

## 2 · Deployment shape

Clerk's production instance is bound to `lms.praxel.in`, so "same logins"
means the Shipyard is served **from the same web service** at
`https://lms.praxel.in/shipyard`. A dedicated domain (e.g. shipyard.praxel.in)
is a later step needing DNS and a Clerk satellite domain.

| Service | Branch | Config | Purpose |
| --- | --- | --- | --- |
| `forge-prod` (existing) | `codex/sessions-3-5-forge` | `railway.json` | Serves Course 1 and `/shipyard` |
| `forge-worker` (existing) | same | `railway.worker.json` | Course 1 jobs only |
| `shipyard-worker` (new) | same | `railway.shipyard-worker.json` | Shipyard reviews, tracker refresh, gate sweep |
| `shipyard-demo` (new) | `shipyard/build` | `railway.shipyard-demo.json` | Disposable demo: `DEMO_MODE=1`, `ENABLE_TEST_LOGIN=1`, no Clerk, own Postgres, seeded |
| `shipyard-demo-worker` (new) | `shipyard/build` | `railway.shipyard-worker.json` | Worker for the demo stack |
| `shipyard-demo-db` (new) | — | Postgres plugin | Demo database (wiped by seed) |

Development happens on `shipyard/build`. Each milestone is verified on the
demo stack, then merged into the production branch.

## 3 · Environment variables (new)

See `.env.example`. Summary: `OPENROUTER_API_KEY`, `OPENROUTER_ROUTING_PROFILE`
(`flash-verdicts` | `flash-everywhere`), `SHIPYARD_REVIEW_CONCURRENCY`,
`TRACKER_MODE` (`fake` | `real`), `SHIPPED_MONEY_BASE_URL`,
`SHIPPED_MONEY_SERVICE_TOKEN`, `SHIPYARD_RENDER_TIMEOUT_MS`.

## 4 · Invariants specific to the Shipyard

- `resolveGate` in `lib/shipyard/gates.ts` is the only place gate state is
  decided. Routes and pages read `ShipyardCheckpointState`, which is only
  written by `recomputeGates(productId)`.
- A metric gate is cleared by tracker signals alone. No student-typed field
  ever feeds a metric signal. The fake tracker's override table is admin-only
  and refuses writes when `TRACKER_MODE=real`.
- The reviewer never sees a student's name, email, or section.
- Every model call writes model, provider, tokens and USD to the `ShipyardReview`
  row (verdicts) or `CostLog` (pre-flight, escalation, evals).
- Nothing reaches students before `pnpm eval:reviewer` numbers are logged in
  `docs/DECISIONS.md`.
