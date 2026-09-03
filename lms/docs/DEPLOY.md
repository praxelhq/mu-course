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
- `GEMINI_API_KEY` (dialog; the agent maps it to `GOOGLE_API_KEY` for the
  livekit google plugin — set only `GEMINI_API_KEY`)
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
