# The Shipyard · status and handoff (2026-09-15, overnight build)

*Written for the morning after the build. What exists, where it runs, what is
verified, what is not, and the short list of things only the founders can do.*

## Where it runs

| | URL / service | Login | Data |
| --- | --- | --- | --- |
| Production | https://lms.praxel.in/shipyard (served by `forge-prod`), worker `shipyard-worker` | Clerk, same roster as Course 1 | Production Postgres; Shipyard tables empty until students act |
| Demo | https://shipyard-demo-production.up.railway.app/shipyard/demo | One-click personas (no Clerk) | Own Postgres, seeded 480 products |
| Tracker | https://web-production-f46c6.up.railway.app | — | PR https://github.com/praxelhq/shipped-money/pull/4 (not merged) |

Development branch `shipyard/build` was fast-forwarded into the production
branch `codex/sessions-3-5-forge` at commit `7f846ba8`. That merge also carried
two interview re-mark fixes (`bdd1ccc6`, `956b8c45`) that had been committed
locally on the production branch but never pushed.

## What is built (SPEC §9 milestones)

- **M0** schema (9 `Shipyard*` models, `courseId` on each), migrations
  `20260914180000_shipyard_core` and `20260915030000_shipyard_security`,
  seed (8 sections, 480 products, every state), fake tracker, fake OpenRouter.
- **M1** submissions with presigned S3 uploads (images, PDF, MP4, text),
  URL liveness through `safe-fetch`, cooldown, `resolveGates` (sequential,
  `review`/`metric`/`both`, sticky passes, manual opens, blocking flags),
  instructor matrix, drill-down, section CSV, manual gate open with audit.
- **M2** reviewer pipeline on OpenRouter: heuristics-first pre-flight,
  Playwright render behind an in-worker egress proxy, anonymised context,
  images for checkpoints 2 and 3, structured verdicts, held passes for
  low-confidence or outlier passes, human queue with resolve / second
  opinion / student dispute, per-call cost on every review and in `CostLog`,
  routing table and BYOK kill-switch (served-model aware, atomic counter),
  admin cost meter with a 14-day chart.
- **M2.5** 55 fixtures, `pnpm eval:reviewer`. Two live runs recorded in
  `docs/DECISIONS.md` and `fixtures/shipyard-reviewer/last-run.md`. Flash
  stays the verdict primary.
- **M3** tracker client (real + fake), signed `checkpoint-signals` contract,
  signal strip with refresh, ownership binding (`?ownerEmail=`), tracker
  callback route, 10-minute refresh and 15-minute gate sweep, n8n fallback
  adapter (workflow must carry the tag `shipyard:<productId>`).
- **M4** four-component grade with the graduation line, weights as
  versions, checkpoint editor, finalise / recompute, Praxy export (badges
  only), DPDP export and delete covering Shipyard tables.
- **M5** k6 baseline and deadline-burst scripts (`pnpm load:shipyard-*`),
  security review (7 findings fixed), correctness review (12 findings fixed),
  `docs/DEPLOY.md` Shipyard section.

## Verified

- Local: 27 Shipyard test files, 624 tests green; typecheck clean apart from
  3 pre-existing errors in `tests/transformation-policy.test.ts`; lint 0
  errors; production build passes.
- Demo stack, end to end: presign → S3 PUT → submission → worker → real GLM
  5.3 Flash verdict with specific reasons (a blank sketch set was returned at
  confidence 0.95 in about a minute); checkpoint 2 unlocked after a pass;
  instructor matrix, drill-down, manual open, CSV; admin routing flip,
  five-failure kill-switch, checkpoint edit, weights v2, grade recompute.
- Brand: Shipped.money visual language (white / #f7f9f8 / #175b44 / lime
  accent, Instrument Sans + Serif, IBM Plex Mono), scoped to `.sy-root`; the
  Forge measured pixel-identical (every element still 0px radius).

## Not verified / known gaps

- Production has not been walked with a real Clerk login (no staff session
  available to the build). `/shipyard` on lms.praxel.in redirects to sign-in
  as expected; the first real student creates the first product.
- Tracker runs in **real** mode in production and the endpoint does not
  exist there until PR #4 is merged and `SHIPYARD_SERVICE_TOKEN` is set, so
  every metric gate reads `tracker-unreachable` until then. Nothing breaks;
  the signal strip says so.
- Pre-flight's link-liveness result does not yet reach the verdict prompt
  (idea-04 in the eval). Next prompt version.
- Escalation second opinions run in-request from the instructor action, not
  through the queue (a staff action, seconds long). Logged in DECISIONS.
- The k6 scripts were syntax-checked only; k6 is not installed here.
- In-memory rate limits are per process; the DB cooldown is the real fence.

## Only the founders can do these

1. **Merge the tracker PR** https://github.com/praxelhq/shipped-money/pull/4
   and set `SHIPYARD_SERVICE_TOKEN` on the shipped-money web service to the
   value already set as `SHIPPED_MONEY_SERVICE_TOKEN` on `forge-prod` and
   `shipyard-worker` (read it with
   `railway variables --service shipyard-worker --kv | grep SHIPPED_MONEY_SERVICE_TOKEN`).
2. **OpenRouter**: the key in use is the one from `praxy_tts`; it already has
   the Anthropic BYOK attached. Confirm "never use shared capacity" is set on
   that BYOK key (SPEC §6.5 step 1) and, if you prefer a Praxel-owned key,
   swap `OPENROUTER_API_KEY` on `forge-prod`, `shipyard-worker`,
   `shipyard-demo`, `shipyard-demo-worker`.
3. **Checkpoint deadlines** are unset. Set them in the admin bench
   (Checkpoints tab) before session one.
4. **Optional dedicated domain** `shipyard.praxel.in`: one CNAME plus a
   Clerk satellite domain; the app needs no change.
5. Delete the demo stack when done with it (`shipyard-demo`,
   `shipyard-demo-worker`, `shipyard-demo-db`) — it costs a Postgres and two
   containers.

## Money spent tonight

Roughly $2.50 on OpenRouter/Anthropic across two eval runs, a few demo
verdicts and one escalation. Course-scale estimates are unchanged from SPEC
§6.5 (about $60, or $25 if everything falls to Flash).
