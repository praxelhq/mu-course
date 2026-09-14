# Shipyard load scripts

Two k6 scripts for the Course 2 portal, per `docs/shipyard/SPEC.md` §8 ("Load:
design for 100 concurrent platform-wide as the baseline, with deadline-night
submission spikes as the known burst ... targets p95 under 500ms on the
student spine and the instructor matrix. A k6 script for the baseline and a
deadline-night burst runs before first classroom use."):

- `k6-shipyard-baseline.js` — 100 seeded students cycling the student spine
  at its own 4s poll cadence, plus 10 instructor tabs polling the section
  matrix every 8s. Steady-state, read-only.
- `k6-shipyard-deadline-burst.js` — 480 distinct seeded students each submit
  one `working` (checkpoint 3) submission in a burst, then poll their own
  spine for a verdict. Read + write, deliberately abusive in the way a real
  deadline night is.

Both mirror the structure of the Forge's existing `scripts/load/k6-baseline.js`
and `scripts/load/k6-quiz-burst.js`: cookie-based auth via the
`forge_test_user` test-login backdoor (`lib/auth/test-login.ts`), custom
counters for "expected" non-2xx outcomes instead of failing the run on them,
and tag-scoped `http_req_duration` thresholds.

## Running against the demo stack

The demo stack (`docs/shipyard/ARCHITECTURE.md` §2) is the disposable
`shipyard-demo` / `shipyard-demo-worker` / `shipyard-demo-db` trio on the
`shipyard/build` branch: `DEMO_MODE=1`, `ENABLE_TEST_LOGIN=1`, no Clerk, own
Postgres, seeded.

```sh
# Baseline (steady state)
BASE_URL=https://shipyard-demo-production.up.railway.app \
  pnpm load:shipyard-baseline

# Deadline-night burst
BASE_URL=https://shipyard-demo-production.up.railway.app \
  pnpm load:shipyard-burst

# Burst, only submitting where checkpoint 3 is actually open right now
BASE_URL=https://shipyard-demo-production.up.railway.app \
  k6 run -e ONLY_OPEN=1 scripts/load/k6-shipyard-deadline-burst.js
```

`BASE_URL` defaults to `http://localhost:3000` if unset, for a local
`pnpm dev` run with `ENABLE_TEST_LOGIN=1` in `.env`.

**NEVER run either script against production.** Auth rides the
`forge_test_user` test-login cookie, which a real production build refuses to
honour and refuses to boot with (`lib/auth/test-login.ts`,
`assertTestLoginNotInProduction`) — only a build explicitly flagged
`DEMO_MODE=1` is allowed to run with the backdoor open. The burst script also
writes real submissions and enqueues real reviewer jobs; running it anywhere
students' real data lives would corrupt that data.

## What the numbers mean

### Baseline

- `http_req_duration{name:spine}` / `{name:spine_cached}` — the full spine
  read and the cheap `ifVersion=` re-check. Both are held to the SPEC's
  literal p95 < 500ms.
- `http_req_duration{name:matrix}` — the instructor matrix read, same p95 <
  500ms bar.
- `http_req_failed` — network-level failures only (k6 does not count 4xx/5xx
  application responses here by default); should be effectively zero in a
  read-only run against a healthy stack.

### Deadline burst

- `shipyard_submit_201` / `_409` / `_429` — outcomes of the one submit each
  VU makes. **409 is the expected majority outcome**: most seeded students
  (`prisma/seed-shipyard.ts` `BUCKET_PLAN`) sit well before checkpoint 3, so
  their `working` checkpoint is `locked` and the route correctly refuses with
  409 "That checkpoint is not open." A 409 is also what a resubmit into an
  already-`submitted`/`in_review`/`passed` state looks like. None of this is
  a bug; it's the same shape 480 real students hitting one deadline would
  produce, since only students who have already cleared checkpoints 1–2 can
  submit checkpoint 3 at all.
- `shipyard_submit_5xx_errors` (Rate) — the only submit outcome this script
  treats as an actual failure. Threshold: < 1%.
- `shipyard_submit_duration` (Trend) — latency of the submit call itself,
  across all outcomes.
- `shipyard_only_open_skipped` — only non-zero with `--env ONLY_OPEN=1`: how
  many VUs found checkpoint 3 not `open` on their pre-check and skipped the
  submit entirely, rather than submitting and drawing an expected 409.
- `shipyard_verdicts_landed` / `shipyard_time_to_verdict` — of the students
  who *did* get queued (201), how many saw their `working` submission leave
  `submitted`/`in_review` within this script's own 6-minute-per-VU polling
  window, and how long that took. **This script's own window will not drain
  the whole queue.** SPEC §6 estimates ~25 minutes to drain 480 queued
  reviews at reviewer concurrency 15 with a stub or fast model; the burst
  scenario itself only runs for 60s ramp + 2m hold (3 minutes), and even with
  the per-VU 6-minute polling grace period, most 201s will still be
  `submitted`/`in_review` when their VU's window closes. A low
  `shipyard_verdicts_landed` count next to a healthy `shipyard_submit_201`
  count is expected, not a failure — it means the queue is doing exactly what
  SPEC §6 says it will do. To watch the queue actually drain, run the burst,
  let it finish, then separately poll `/api/shipyard/instructor/matrix` (or
  the admin cost meter) for the next ~25 minutes.
- `http_req_duration{name:spine}` here is held to **p95 < 800ms**, looser
  than the baseline's 500ms — see the comment in
  `k6-shipyard-deadline-burst.js` for why: 480 VUs are concurrently writing
  (creating submissions, enqueuing jobs, and — as verdicts land — flipping
  gate/grade rows) while also polling reads, so read latency legitimately
  degrades versus the read-only baseline. The baseline script is what
  enforces the strict SPEC figure.

## Resetting the demo DB afterwards

The burst script leaves real `ShipyardSubmission` / `ShipyardReview` rows (and
whatever the worker actually queued) in the demo database. Re-seed to put the
demo stack back to its clean, described-in-the-demo-persona-cast state:

```sh
ALLOW_DEMO_SEED_RESET=true \
  DATABASE_URL=<demo Postgres public URL> \
  pnpm seed
```

`pnpm seed` (`prisma/seed.ts`) refuses to reset a non-loopback database unless
`ALLOW_DEMO_SEED_RESET=true` is set — this is the guard that stops the flag
being set by habit against something that isn't actually the demo. Get the
demo Postgres public URL from the Railway dashboard for the
`shipyard-demo-db` service (Variables → `DATABASE_PUBLIC_URL`), the same way
described in the Forge prod DB access notes, but pointed at the demo project,
never the production one.
