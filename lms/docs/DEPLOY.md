# Deploying Praxel LMS to Railway

One repo, one Railway project, four services:

| Service | What | Root directory | Dockerfile | Config file |
| --- | --- | --- | --- | --- |
| `web` | Next.js app (standalone) | `lms` | `lms/Dockerfile.web` | `lms/railway.json` (auto-detected) |
| `worker` | pg-boss jobs (grading, crawls, screenshots) | `lms` | `lms/Dockerfile.worker` | `lms/railway.worker.json` (set path manually) |
| `agent` | Python LiveKit interview agent | `lms/agent` | `lms/agent/Dockerfile` | `lms/agent/railway.json` (auto-detected) |
| Postgres | Railway Postgres plugin | — | — | — |

Railway config-as-code is **per service** (there is no multi-service
`railway.json` schema), so each service gets its own file. `web` and `agent`
pick theirs up automatically because a `railway.json` sits at their root
directory; `worker` shares the `lms` root with `web`, so its config file path
must be set in the dashboard.


> **2026-09-15 — no root `railway.json` any more.** Railway auto-applies a root
> `railway.json` to EVERY service whose root directory is `lms`, and on this
> workspace config-as-code is deprecated so it can no longer be pointed at a
> per-service file. The web config it carried (Dockerfile.web, `/api/health`,
> 300s) now lives on the `forge-prod` and `shipyard-demo` service instances
> (Settings → Build/Deploy, or `serviceInstanceUpdate`). `forge-worker` still
> reads `lms/railway.worker.json` through its pre-deprecation config-file
> setting; new worker services set `dockerfilePath` + `startCommand` on the
> instance instead. Without this, a new worker service builds the web image
> and its start command fails silently.

## 1. Create the project and Postgres

1. Railway dashboard -> **New Project** -> **Deploy PostgreSQL**.
2. Note: the plugin exposes `DATABASE_URL` via variable references
   (`${{Postgres.DATABASE_URL}}`).

## 2. Create the three services

For each: **New** -> **GitHub Repo** -> select this repo, then in
**Settings**:

### web
- **Root Directory**: `lms`
- Config-as-code: `railway.json` at that root is auto-detected — it sets
  `builder: DOCKERFILE`, `dockerfilePath: Dockerfile.web`, healthcheck
  `/api/health`, restart `ON_FAILURE`.
- **Networking**: Generate a domain (this becomes `APP_URL`).

### worker
- **Root Directory**: `lms`
- **Config-as-code / Config File Path**: `railway.worker.json`
  (Settings -> Config-as-code). This selects `Dockerfile.worker`.
- No healthcheck (it is not an HTTP service); process liveness + `ON_FAILURE`
  restart policy cover it.
- No public domain needed.

### agent
- **Root Directory**: `lms/agent`
- `agent/railway.json` is auto-detected (builds `agent/Dockerfile`).
- No healthcheck, no public domain.

## 3. Environment variables

Set per service (Settings -> Variables). Consider a
[shared variable group](https://docs.railway.com/guides/variables) for the
values used by more than one service (`DATABASE_URL` reference, AWS keys,
`GEMINI_API_KEY`, `APP_URL`, `AGENT_INTERNAL_TOKEN`). Names and meanings are
documented in `lms/.env.example`.

> **Reuse note:** Deepgram, Gemini, and ElevenLabs keys are already live in
> the existing Praxel Railway projects — copy `DEEPGRAM_API_KEY`,
> `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` from there instead of minting new
> ones.

### web
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `CLERK_WEBHOOK_SECRET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (issues room tokens)
- `AGENT_INTERNAL_TOKEN` (verifies agent callbacks)
- `APP_URL` = `https://<web-domain>`
- Do **not** set `ENABLE_TEST_LOGIN` (dev-only backdoor; the server refuses to
  boot in production with it set).

### worker
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
- `ANTHROPIC_API_KEY`, `GRADING_CONCURRENCY` (e.g. `5`)
- `GEMINI_API_KEY`

### agent
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (required — the
  worker exits with a clear message without them)
- **No LLM key.** Dialog runs on LiveKit Inference, which is included in
  LiveKit Cloud and authenticates with the `LIVEKIT_*` credentials above. It is
  zero-data-retention by default, which matters because the interview prompt
  carries the student's own resume.
- **Voice: exactly one complete pair is required.** Set `SARVAM_API_KEY` for
  the primary pipeline (Sarvam STT + TTS). `DEEPGRAM_API_KEY` +
  `ELEVENLABS_API_KEY` remain the fallback pair and are used only when
  `SARVAM_API_KEY` is absent. The worker refuses to start with neither, and
  logs which pair it selected at startup — if you see
  `voice provider: deepgram+elevenlabs FALLBACK`, `SARVAM_API_KEY` did not
  reach the service.
- `AGENT_INTERNAL_TOKEN`, `APP_URL` = `https://<web-domain>`
- Optional Sarvam tuning: `SARVAM_STT_LANGUAGE` (default `auto` — adaptive
  language identification, so code-mixed English/Hindi still transcribes),
  `SARVAM_TTS_MODEL` (default `bulbul:v3`), `SARVAM_TTS_SPEAKER` (default
  `shubh`), `SARVAM_TTS_LANGUAGE` (default `en-IN`),
  `INTERVIEW_EGRESS_LAYOUT` (default `speaker`)
- Room recording is now **video** (MP4). The same `AWS_*` + `S3_BUCKET` vars
  enable it; without them the interview runs unrecorded.

### Opening the interview

Interview v2 deploys **closed**. Students see a "not open yet" notice and no
start control until an instructor opens it — deploying is never what starts a
cohort's assessment. Open it from the instructor interviews page, or by
setting the `ConfigKV` row `interview_v2` to `{"open": true}`. Any other value,
and an absent row, mean closed.

## 4. Clerk webhook

In the Clerk dashboard -> **Webhooks** -> add endpoint:

```
https://<web-domain>/api/webhooks/clerk
```

Subscribe to user events (user.created etc.), copy the signing secret into
the web service's `CLERK_WEBHOOK_SECRET`, and redeploy web.

## 5. Migrations (migrate-on-deploy)

The web image's entrypoint (`docker-entrypoint.web.sh`) runs
`prisma migrate deploy` **before** starting the server, on every container
start. Forward-only migrations make this idempotent and safe; a failed
migration fails the deploy (the healthcheck never passes), leaving the
previous deploy serving. `railway.json` sets `healthcheckTimeout: 300` so
migrations have room to run. The worker and agent do not run migrations.

## 6. Verify

- `https://<web-domain>/api/health` returns `{"ok":true,"service":"web"}`
  (unauthenticated).
- worker logs: `Worker started.` (it exits with a clear message if
  `DATABASE_URL` is unreachable).
- agent logs: `env OK — starting LiveKit agent worker (skeleton)` and a
  registered-worker line from livekit-agents.

## Local dev

```sh
pnpm dev:all        # next dev + pg-boss worker together (concurrently)
# or separately: pnpm dev / pnpm worker:dev
# agent: see agent/README.md
```

Local image builds (optional):

```sh
cd lms
docker build -f Dockerfile.web -t praxel-web .
docker build -f Dockerfile.worker -t praxel-worker .
docker build -t praxel-agent agent
```

## Shipyard (Course 2)

See `docs/shipyard/SPEC.md` (the build prompt) and `docs/shipyard/ARCHITECTURE.md`
(how it is fitted into this repo) for the full picture. This section is only
the deploy delta.

### Services

| Service | Branch | Purpose |
| --- | --- | --- |
| `forge-prod` (existing `web`) | `codex/sessions-3-5-forge` | Serves Course 1 **and** `/shipyard` — same web service, same Clerk login |
| `forge-worker` (existing `worker`) | same | Course 1 jobs only |
| `shipyard-worker` (new) | same | Shipyard reviews, tracker refresh, gate sweep — `worker/shipyard.ts`, its own Railway service so Course 2's deadline-night burst never competes with Course 1's interview grading |
| `shipyard-demo` (new) | `shipyard/build` | Disposable demo: `DEMO_MODE=1`, `ENABLE_TEST_LOGIN=1`, no Clerk, own Postgres, seeded |
| `shipyard-demo-worker` (new) | `shipyard/build` | Worker for the demo stack |
| `shipyard-demo-db` (new) | — | Postgres plugin for the demo stack (wiped by `pnpm seed`) |

Development happens on `shipyard/build`; each milestone is verified on the
demo trio, then merged into the production branch.

### Config-as-code is deprecated on this workspace

The `railway.shipyard-worker.json` / `railway.shipyard-demo.json` files in the
repo root are kept for reference, but this Railway workspace no longer picks
up per-service config-file paths automatically. **Set each service's
`dockerfilePath`, `startCommand`, and `rootDirectory` directly on the service
instance** (Settings → Build / Deploy in the Railway dashboard) rather than
relying on a checked-in config file being detected:

- `shipyard-worker`: Root Directory `lms`, Dockerfile `Dockerfile.worker`,
  Start Command `pnpm exec tsx worker/shipyard.ts`.
- `shipyard-demo`: Root Directory `lms`, Dockerfile `Dockerfile.web`.
- `shipyard-demo-worker`: Root Directory `lms`, Dockerfile `Dockerfile.worker`,
  Start Command `pnpm exec tsx worker/shipyard.ts`.

**`shipyard-worker` (and `shipyard-demo-worker`) still needs a healthcheck
that passes**, even though it is not an HTTP-serving process in the usual
sense: a worker service on this workspace inherits the root `railway.json`'s
`/api/health` healthcheck path rather than getting "no healthcheck" the way
`worker`/`forge-worker` does under its own `railway.worker.json`. In practice
this has not been an issue because `worker/shipyard.ts` shares the same
Next.js `instrumentation`/`api/health` surface as the web process at the
image level, but if a future image split drops that route from the worker
image, the deploy will hang on healthcheck rather than go live — set
`healthcheckPath` explicitly (or remove it) on the service instance if that
happens rather than assuming it inherits sanely.

### Environment variables

Per `.env.example`, set on the relevant service(s) (copy the same value where
a variable is marked shared):

| Variable | Where | What it does |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `web` (reviews are read on the student spine), `shipyard-worker` | OpenRouter is the only AI gateway the Shipyard uses (`lib/ai/openrouter.ts`). Unset, every call falls back to the deterministic fake responder — `pnpm seed`, tests, and the demo stack all run with no key and no spend. |
| `OPENROUTER_ROUTING_PROFILE` | `shipyard-worker` | Routing profile at boot: `flash-verdicts` (default) or `flash-everywhere`. Once the BYOK kill-switch (SPEC §6.5) has fired once, `ShipyardRouterState` in the DB wins over this env var. |
| `SHIPYARD_REVIEW_CONCURRENCY` | `shipyard-worker` | Reviewer concurrency. Default `15` — drains 480 deadline-night submissions in roughly 25 minutes per SPEC §6. |
| `TRACKER_MODE` | `web`, `shipyard-worker` (shared) | `fake` reads the `ShipyardTrackerOverride` table so metric gates can be demonstrated with no live tracker; `real` speaks HTTP to Shipped.money. Unset means `real` only when `SHIPPED_MONEY_BASE_URL` is set. |
| `SHIPPED_MONEY_BASE_URL` | `web`, `shipyard-worker` (shared) | Live tracker base URL. Left empty until Shipped.money's `checkpoint-signals` endpoint ships (SPEC §8.5). |
| `SHIPPED_MONEY_SERVICE_TOKEN` | `web`, `shipyard-worker` (shared) | The bearer AND the HMAC-SHA256 key for `X-Shipyard-Signature`. Authenticates both directions: this portal's reads of the tracker, and the tracker's `POST /api/shipyard/tracker/refresh` callback into this portal. **Same value as `SHIPYARD_SERVICE_TOKEN` on the tracker side** — see below. |
| `SHIPYARD_RENDER_TIMEOUT_MS` | `shipyard-worker` | Headless-render budget for a checkpoint 3 live URL, milliseconds (default `20000`). Playwright runs in the worker only. |
| `N8N_BASE_URL` | `shipyard-worker` | Fallback workflow-run source (SPEC §8.5 item 2). Shipped.money has no n8n source yet; with this and `N8N_API_KEY` set, the portal counts successful executions itself via `lib/n8n`. The tracker's own count always wins once it reports one, so leaving these empty is correct the day Shipped ships its own source. |
| `N8N_API_KEY` | `shipyard-worker` | Paired with `N8N_BASE_URL` above. |

### The tracker side (Shipped.money)

The Shipyard reads a student's real numbers from Shipped.money and never from
anything a student types (SPEC §5). To wire that up:

1. Merge [`praxelhq/shipped-money#4`](https://github.com/praxelhq/shipped-money/pull/4)
   (the `checkpoint-signals` endpoint this portal calls).
2. On the Shipped.money side, set `SHIPYARD_SERVICE_TOKEN` to the **same
   value** as this repo's `SHIPPED_MONEY_SERVICE_TOKEN` — one shared secret,
   two env var names, because each app names it from its own point of view.

Until both are done, `TRACKER_MODE=fake` (the demo default) is what stands
in, driven by the `ShipyardTrackerOverride` table.

### OpenRouter checklist (SPEC §6.5, before real model spend)

Do this once, in OpenRouter's dashboard, before flipping `TRACKER_MODE`/model
calls off the fake responders in a real deploy:

1. Register Praxel's existing Anthropic API key as a **BYOK key** in
   OpenRouter, so Haiku calls draw on the existing Anthropic credit instead of
   OpenRouter's own.
2. On that BYOK key's settings, set **"Never use shared capacity for models
   this key applies to."** Without this, a failed BYOK call silently falls
   back to serving the same model on OpenRouter's shared credits at full
   price instead of failing cleanly — the router's kill-switch
   (`RouterState.consecutiveByokFailures` → `flash-everywhere` after 5
   consecutive failures) depends on seeing real failures, not a silent
   shared-capacity fallback masking them.
3. Confirm the exact model slugs in OpenRouter's current model list —
   `anthropic/claude-haiku-4.5` and `z-ai/glm-5.3-flash` — before wiring them
   into `lib/ai/router.ts`'s routing table; OpenRouter slugs are not
   guaranteed stable across their own catalogue changes.
4. Set provider preferences so each model is served only by providers that do
   **not train on or retain inputs** (a checkpoint 3 screenshot can carry a
   student's real customers' details), with a provider-level fallback so one
   provider's outage on a deadline night does not stall the queue.

### Seeding the demo stack

```sh
ALLOW_DEMO_SEED_RESET=true \
  DATABASE_URL=<shipyard-demo-db public URL> \
  pnpm seed
```

`pnpm seed` refuses to reset a non-loopback database unless
`ALLOW_DEMO_SEED_RESET=true` is set (it also seeds Course 1's demo world in
the same run). See `scripts/load/README-shipyard.md` for using this to reset
the demo stack after a load-test run.
