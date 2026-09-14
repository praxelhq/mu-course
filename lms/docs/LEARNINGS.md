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
- **`boss.work` loses its literal option inference the moment you pass a type
  argument.** pg-boss types the handler as
  `WorkHandlerFor<O, ReqData>` with `const O extends WorkOptions`, and the
  `includeMetadata: true` branch only fires when `O` is inferred from the
  options literal. Writing `boss.work<ShipyardReviewJobData>(name, opts, fn)`
  pins `O` to the default `WorkOptions`, so the handler is typed `Job[]` and
  `job.retryCount` does not exist. Drop the explicit type argument and annotate
  the handler parameter instead: `async (jobs: JobWithMetadata<T>[]) => …`.
- **A content hash for a short poll has to exclude everything that is
  regenerated per request.** `spineVersion` covers gate states, submission
  status and verdicts, and skips `now` and the freshly-signed S3 URLs on every
  file — either of which would change on every call and turn a 4s poll into a
  4s full page refresh for every student with an attachment.
- **The Shipyard's stored review `reasons` have two shapes in the same
  column**: the seed writes `{criterionId, clause, what, fix}` and
  `completeReview` writes the view-model's `{criterion, met, note}`.
  `reasonViews` in `lib/shipyard/spine.ts` accepts both, so the seeded demo
  cohort and freshly reviewed submissions render identically.
- **`/api/shipyard/*` needs no entry in `proxy.ts`.** The matcher already runs
  for every `/api` path and `isPublicRoute` is an allowlist, so a new API
  subtree is authenticated and roster-gated by default — the same treatment
  `/api/submissions` gets.
- **Zod v4's `z.enum` inside an array rejects the WHOLE reply when a model
  invents one extra value.** The reviewer's `flags` is therefore `string[]` on
  the wire and narrowed to `ReviewFlag[]` in `parseVerdict`: a model adding a
  sixth flag is not a reason to discard the five real ones and pay for a retry.
  The same applies to `verdict`, which is lower-cased and trimmed before the
  enum sees it, because "PASS" is the same answer as "pass".
- **A criterion the reviewer never addressed must have its score zeroed, not
  kept.** Models skip a criterion in `reasons` while still scoring it in
  `rubricScores`, and leaving the 80 beside "the reviewer did not address this
  clause; a human will look" puts a contradiction in front of the instructor
  reading the queue.
- **`sharp` is not installed in this repo** (it appears in the lockfile only as
  a transitive of some Next builds and does not resolve). Anything that wants
  it must probe for it at runtime through a VARIABLE import specifier —
  `const specifier = "sharp"; await import(specifier)` — or `tsc` fails with
  TS2307 on a module that is not a declared dependency.
- **`extractSubmissionFiles` (Course 1's extractor) takes a `rangedRead` seam,
  which is the whole reason the Shipyard can reuse it.** The reviewer passes a
  closure over its injected `fetchFile`, so there is one PDF parser in this repo
  and `lib/shipyard/reviewer/` still constructs no S3 client.
- **Course 1's `extractJsonObject` lives in `lib/ai/client.ts`, which imports
  the Anthropic SDK**, so the Shipyard's verdict parser has its own tolerant
  reader rather than importing it. Sharing it would pull the provider SDK into
  the Shipyard's module graph, which is precisely what
  `tests/shipyard-ai-boundary.test.ts` exists to prevent.
- **The four fixture PNGs were rendered with the repo's own Playwright
  chromium** from a small HTML page (a cursive font over a paper-coloured
  background makes a convincing "photo of hand-drawn screens", and a CSS
  brightness filter makes the deliberately unreadable one). No image library
  and no checked-in binary generator were needed.

## 2026-09-15 · Shipyard M3/M4 (grades, weights, checkpoint editor, tracker refresh)

- **An unreachable tracker used to un-pass a gate.** `recomputeGates` resolves
  from whatever signals it is handed, and `resolveGates` reads `null` signals
  as "every metric signal is false". The stamped dates (`passedAt`,
  `metricClearedAt`) are write-once, so they survived — but `state` is written
  on every recompute, so a product whose money gate had cleared would flip back
  to `open` on any tracker blip. `refreshTrackerForProduct` now returns the
  stored states untouched when the read is null, and never calls
  `recomputeGates` with nothing. The 15-minute gate sweep has the same shape
  (it hands `recomputeGates` a tracker rather than signals, and the client
  returns null on failure), so this is worth a second look there.
- **`ShipyardGrade` rows do not exist until something computes them.** The seed
  writes checkpoints, weights, products, submissions, reviews and tracker
  overrides, but no grades — so every grade-reading surface has to cope with
  "no row yet". `gradeLineView(null, weights)` returns the empty LINE (four
  labelled components, their weights, no numbers) rather than null, which is
  also the right thing to render in week one.
- **The reviewer's `rubricScores` are not one shape.** The seed and the M1 stub
  write `{ overall: 78 }`; the M2 reviewer writes one entry per rubric criterion
  id. `overallRubricScore` therefore prefers an explicit `overall` and otherwise
  takes the rubric-weighted mean of the criteria that WERE scored — skipping a
  criterion the reviewer did not answer, rather than counting it as zero and
  quietly halving a student's product-quality score.
- **Prisma `groupBy` needs every `orderBy` field in `by`.** A "find a product
  with six passed states" query written as a `groupBy` + `having` fails at
  runtime with "Every field used for orderBy must be included in the
  by-arguments". The relational filter
  `checkpointStates: { some: {}, none: { state: { not: "passed" } } }` says the
  same thing in one indexed read and needs no ordering at all.
- **Adding a key to `DpdpErasureCounts` breaks two test fixtures.**
  `tests/dpdp-erasure.test.ts` and `tests/dpdp-delete-route.test.ts` both build
  a complete counts object by hand, so every new table counted in an erasure is
  three edits, not one. That is the point of the type — it is the list that
  makes a forgotten table a compile error.
- **A reasoning model's thinking comes out of `max_tokens`, and running out
  looks exactly like a broken reply.** GLM 5.3 Flash spent all 8,192 tokens
  reasoning about a checkpoint bar and returned `content: ""` with
  `finish_reason: "length"` and `reasoning_tokens: 8191`. Downstream that is
  "no JSON object found in the reply", which sends you off rewriting the
  prompt. `reasoning: { max_tokens: 2000 }` fixes it; `reasoning: { enabled:
  false }` does not, because GLM's endpoints answer 400 "Reasoning is mandatory
  for this endpoint and cannot be disabled." An empty `content` now raises an
  error that names the finish reason and the reasoning-token count.
- **OpenRouter reports `cost: 0` for a BYOK call.** It charged nothing; the
  spend went to the upstream provider's credit and is in
  `usage.cost_details.upstream_inference_cost` (with `usage.is_byok: true`).
  Trusting `usage.cost` made the admin meter show every Haiku review as free
  while $0.04 of the Anthropic credit went out of the door per call. The
  operator's key turned out to have an Anthropic BYOK attached after all, which
  is how this was found.
- **A deterministic fake must answer the REAL contract, not a plausible one.**
  `openrouter-fake.ts` had been emitting `{criterionId, clause, what, fix}` and
  `summary` while the reviewer's schema wants `{criterion, met, note}` and
  `summaryForStudent`. Nothing caught it, because the only tests that exercised
  the fake used a loose local schema. Every keyless review would have come back
  with each criterion repaired to "the reviewer did not address this clause",
  a `needs_human` flag, and therefore a held pass — a demo showing a full review
  queue instead of a walkthrough. The fake now reads the criterion ids out of
  the system prompt's "The criterion ids, exactly: …" line and answers one
  reason and one score per criterion.
- **A fixture is only as good as the evidence stapled to it.** Two eval cases
  had write-ups that contradicted their own attached PNGs — a signup screenshot
  dated 3 September against prose claiming a test that ran to the 10th, and a
  seven-screen route-planner flow described beside a photograph of a
  six-screen bill-to-UPI flow. BOTH models returned both cases, correctly, and
  the fixtures were wrong. Worth remembering when an eval disagrees: read the
  image before you blame the model.
- **The `shipyard.review` handler had to stay swappable.** M2 made
  `handleReviewSubmission` a wrapper over `runReviewPipeline`, which silently
  broke M1's live tests — they were walking the stub. The stub is kept behind
  `SHIPYARD_STUB_REVIEWER=1` (and a `stub: true` dep) because the no-key demo
  still needs a reviewer that passes on command, and the M1 suite now asks for
  it explicitly.
- **The reviewer is asked about link liveness and never told the answer.**
  `runReviewPipeline` assembles the prompt before it runs pre-flight, so
  `linkStatuses` exist only in `promptLog`. The `waitlist-live` criterion's
  threshold literally says "the pre-flight liveness check reached it", and the
  live eval caught a model returning a good submission because it had no way to
  see that it had. Probe first, then assemble — and remember that changing the
  prompt means re-running the release gate.
- **Two models disagreeing with a fixture is evidence about the FIXTURE first.**
  Of the five live disagreements, two were fixtures whose attached image
  contradicted their own prose, one was a deliberately borderline case both
  models read generously (kept, because the expectation is an editorial
  judgement about where the bar sits), and only two were a single model being
  wrong. Read the disagreement list before reading the agreement number.
- **A reasoning model's price is its output tokens.** On identical work Haiku
  4.5 spent 136,941 completion tokens against GLM 5.3 Flash's 32,979 — four
  times the thinking — which is most of why it costs 35.7× more for two extra
  points of agreement. Worth knowing before "the better model" wins an argument
  about a bulk tier.
