# Venture workspace release

Status: live at https://lms.praxel.in/shipyard. Web and worker deployed from `17ea6fd1942469d4b23638c5093f56bf722e92be` on 19 September 2026. Email-only signup configuration remains pending access to the correct Clerk dashboard; new email accounts currently require a password, while Google and email-code sign-in work.

## Product boundary

The new `/shipyard` workspace uses verified MU email identities, shared team documents and three checkpoints. `/shipyard/history` preserves the previous six-checkpoint portal. It does not reinterpret earlier grades or connect the final product receipt to a tracker.

Checkpoint 1 accepts a title, fewer than 200 words and a landing URL. Checkpoint 2 accepts a job specification, described features with MLP choices, an early sketch and Stitch design exports. Both require an AI pass or an authenticated instructor appeal decision. Checkpoint 3 records a URL and optional notes without model calls or product browsing.

The coach reads the active brief, recent conversation, searchable marketplace records, saved research and up to six uploaded reference/design images. Students accept edits explicitly. Research runs only after a student requests it; ordinary coaching does not silently purchase a scrape.

## Configuration

Keep credentials in the hosting provider's secret variables. Never put them in the repository or public Next variables.

| Variable | Service | Purpose |
| --- | --- | --- |
| `SHIPYARD_ANTHROPIC_API_KEY` | shipyard-worker | Required direct Anthropic credential; `claude-haiku-4-5-20251001` |
| `SHIPYARD_RESEND_API_KEY` | shipyard-worker | Appeal email, from an authenticated sender |
| `SHIPYARD_APIFY_TOKEN` | shipyard-worker | Explicit bounded social research |
| `SHIPYARD_APIFY_ACTOR_PREFIX` | shipyard-worker | Optional; defaults to `thirdwatch` |
| `SHIPYARD_EMAIL_FROM` | forge-prod | Optional; defaults to `Shipyard <build@praxel.in>` |
| `SHIPYARD_EMAIL_DOMAINS` | forge-prod | Exact domains, defaults to `mastersunion.org` |
| `SHIPYARD_INSTRUCTOR_EMAILS` | forge-prod | Explicit instructor emails; defaults to `build@praxel.in` |
| `SHIPYARD_DAILY_BUDGET_USD` | forge-prod | Rolling 24-hour allocation, default 50 USD |
| `SHIPYARD_COHORT_AI_BUDGET_USD` | forge-prod | Lifetime studio AI allocation, 150 USD |
| `SHIPYARD_REVIEW_RESERVE_USD` | forge-prod | Stop coaching 40 USD before the total cap to preserve review allocation |

Existing database, S3, Clerk and `APP_URL` configuration remains required. The new AI client never falls back to shared Course 1 credentials or mock feedback. Clerk verifies primary email ownership; the studio API checks the exact domain. The existing Clerk signup configuration is reused.

## Limits and failure behavior

- Ten members per workspace, twelve candidate ideas, thirty coach requests and ten research/review requests per team per rolling day; at most three active jobs per team.
- Each pending or uncertain failed paid job reserves one dollar from the global allocation. A cancelled request that already started retains its reservation until actual cost is known. Admission is serialized across teams; actual successful job cost replaces the reservation. This is an application allocation, not a provider billing guarantee.
- Social runs request at most twelve results, use a 120-second actor timeout and a 0.50 USD charge ceiling. X and Instagram require a public post URL; Reddit supports keyword research. Returned posts are a sample, never proof of representative demand.
- The instructor desk can pause each source, inspect failed jobs, see per-team spend and source capture/import dates. A pause affects new research and future retrieval, preserving historical evidence.
- Uploads are at most 8 MB, use one-time S3 PUT signatures and immutable version IDs. The worker resizes images before Claude; missing evidence cannot create a pass.
- Jobs live in Postgres. A minute sweep recovers missed wakeups. Fifteen-minute stale leases become visible failures; ambiguous paid social POSTs are not replayed automatically.
- Appeals freeze recipient, CC, reason, submission and feedback. Resend uses the same idempotency key for retries within 23 hours. Later ambiguous delivery needs provider reconciliation. `sent` means provider accepted, not confirmed inbox delivery.
- Upstream resubmission supersedes downstream progress. A late model response or an appeal against an older version cannot reopen gates.

## Data preparation

The supplied workbook contains 16,778 normalized rows. Upsert deduplication retains 16,613 distinct records in production: 11,058 TrustMRR, 1,235 Acquire and 4,320 AppSumo. The 4,485 AppSumo input rows include 165 repeated IDs. Source URLs and original capture dates survive; founder/contact fields and revenue-history sheets are not imported. No source workbook or normalized data is committed.

Export with `python scripts/shipyard-studio-export.py <workbook.xlsx> <private.ndjson>` using a runtime with openpyxl. Import with `pnpm exec tsx scripts/shipyard-studio-import.ts <private.ndjson>` against the intended database. The importer upserts source IDs and reports counts. AppRill records come from its public read API and are cached separately.

## Verified locally

- Production Next build and shipped-code TypeScript check pass; changed-code ESLint passes.
- 33 focused tests cover word/domain contracts, immutable submissions, team isolation, invitation replay, concurrent saves, source switches, stale appeal decisions, instructor authorization, no-AI final receipts, direct Haiku transport, image resizing and verified off-roster MU webhook handling.
- The larger suite reports 1,753 passes and 24 failures (46 skips), excluding the pre-existing missing transformation module. All 24 failing cases reproduce unchanged on production commit `e8cd5f305b5111c034ef913844123c62338e56b8`; they concern existing interview, peer-review and submission behavior. An early full-suite run invoked the repository's demo reset against local `praxel_lms_dev`; subsequent broad and baseline runs used a disposable database. No production seed ran.
- The additive migration applies successfully to a copy of the production schema. The test copy needs the `pgcrypto` extension used by existing audit triggers.
- AppRill plus marketplace research returned 19 cited observations. A real Reddit job returned 12 items at approximately 0.000735 USD. X and Instagram actor configuration was checked but their live runs remain unexercised.
- Browser checks covered student entry, workspace creation, edit/save, immutable S3 reference-image upload, mobile layout fit and rejection of student access to the instructor desk.
- A sender test to `build@praxel.in` was accepted by Resend. No test email went to a student.
- Dedicated Claude Haiku 4.5 calls passed the narrow software, oversized scope, agency, prompt-injection and inaccessible-page fixtures. Vision correctly identified missing screens in the incomplete design fixture and passed a complete, explicitly single-line-item invoice flow ($0.011). The first run caught an unnecessary payment-provider requirement; the rubric was corrected and all five decision fixtures passed on rerun. Representative grounded review calls used about 18,100 input tokens and cost $0.022–$0.024; a grounded coach response cost $0.027. A real coach worker run with saved social evidence and conversation cost $0.049. These are measured examples, not an upper bound.
- For 500 individual workspaces, two reviews plus eight coach calls each are approximately $131 at the measured rates. Twenty coach calls plus two reviews each would be approximately $295. At 125 teams, that latter workload is approximately $74. Long conversations, large designs and retries increase usage; Apify and hosting use separate balances. The configured $150 application cap leaves about $18 of the reported Anthropic credit outside this allocation. Provider-side spending elsewhere is not observable by this application.

## Release sequence

1. Add the dedicated key to the local private test environment and worker secret configuration. Run real Haiku cases: a narrow viable software idea, an agency disguised as software, a too-large idea, inaccessible landing evidence, aligned/misaligned designs and prompt injection. Confirm useful criterion-specific feedback before activation.
2. Recheck remote `codex/sessions-3-5-forge`, the production branch. Merge the reviewed PR there. Never deploy from `main` by assumption.
3. Deploy forge-prod and shipyard-worker from the same merge commit in Railway project `praxel-lms-forge`. Apply `20260918191000_shipyard_studio` through the normal forward migration path. Do not run the demo seed.
4. Import the private normalized knowledge file into production and verify per-source counts. Confirm production test login is disabled.
5. Verify the rendered public `/shipyard` entry, actual MU signup/email verification, signed-in instructor access, worker completion, a real review, a final receipt without AI and an instructor-controlled appeal test. Record deployment IDs, source SHA and provider receipts.

Production migration and import completed. Web health is healthy, test login is disabled, and instructor login, save, coaching, checkpoint-one review, appeal provider acceptance and explicit instructor override were verified through the live browser. The self-test appeal went only to the instructor (To and CC `build@praxel.in`), provider receipt `01a0b797-ab98-7746-992b-e7012adb62ec`; student inbox delivery is not claimed. Roll back web and worker to the preceding deployment together if necessary; retain additive tables, submissions and file versions. No schema rollback or data deletion is required.


## Production receipts

- PR #10 merged as `17ea6fd1942469d4b23638c5093f56bf722e92be`.
- Web deployment `46532f00-e4da-433f-88cf-fa1ef868d4c8`; Shipyard worker `612f16b9-0ff7-4f4b-bbac-14b115e3fb5a`, both SUCCESS.
- All 22 migrations applied; 16,613 distinct knowledge records imported in one validated COPY/upsert transaction. Counts: Acquire 1,235; AppSumo 4,320; TrustMRR 11,058.
- Instructor sandbox `cmu7smd0g0007od0157tkt8mu` contains clearly marked test work; no real student account was impersonated or graded.
- Production coach job `cmu7sn7py000mod01a5a1m55p` completed at $0.028726. Checkpoint-one review completed and flagged the intentionally free reference page versus proposed paid offer.
- A follow-up rubric correction prohibits extra waitlist/customer-proof requirements and preserves only the original three fields. All six real decision fixtures passed, including the contradictory free offer case with two actionable changes.

- Production checkpoint two read both immutable image uploads, returned a real Haiku pass and opened checkpoint three. The final test submission recorded a receipt using an intentionally non-product URL; no AI job or product fetch was requested.
