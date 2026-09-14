# BUILD PROMPT · COURSE 2 PORTAL AND AI REVIEWER ("the Shipyard")

*v1.1 · The opening prompt for this build, kept verbatim as the source of truth. Where this is specific, follow it. Where it is ambiguous, make a sensible call and log it in docs/DECISIONS.md. How it is fitted into the Forge codebase is in docs/shipyard/ARCHITECTURE.md.*

*What changed from v1.0: the tracker (Shipped.money) is now built, so its integration section reflects reality; scoring weights are decided; the reviewer must handle images and render live products with a headless browser; all model calls go through OpenRouter with a tiered routing table, an Anthropic BYOK key, and a deliberate fallback to GLM 5.3 Flash; a resubmit cooldown and higher review concurrency; and a fixture-agreement test that gates go-live.*

*Sibling: Shipped.money (the tracker) exists and owns the read API this portal calls. This portal never talks to Dodo, GitHub, or n8n directly. It asks Shipped.money for a student's checkpoint signals and gates on the answer.*

---

## 0 · CONTEXT: WHO AND WHY

You are building the submission, review, and gating portal for **Course 2** of the "AI for Business" programme that **Praxel** (praxel.in) teaches at **Masters' Union**. Same cohort as Course 1: **8 sections of ~60, 480 students total.** Roster (name, email, section) is provided as a CSV, same shape as Course 1.

The course has one deliverable: each student ships one real product, live on the internet, that at least one stranger pays for. The course runs fifteen sessions. The work moves through **six checkpoints in a fixed order**. A student cannot start the next checkpoint until the current one is cleared. Every submission is checked by an **AI reviewer** against a published bar, quickly, and returned with specific reasons until it meets the bar. Some checkpoints are judged from what the student submits (an idea, hand-drawn screens, a working link). The money-and-usage checkpoints are judged from **real live numbers**, which this portal reads from **Shipped.money**, never from anything the student types.

Working name: **the Shipyard**. Praxel brand: Parchment (#FBF8F3), Pine (#1E3A35) authority and primary actions, Ochre (#C4581A) accents, Beacon (#F0D478) sparingly, 0px radius, no gradients, no shadows for hierarchy, 1px Sand dividers. Display Sentient, body and UI Geist, numbers and labels Geist Mono. Never pure white. Read docs/BRAND.md before any screen.

---

## 0.5 · REUSE DECISION (read before choosing an architecture)

Praxel already built the **Course 1 LMS ("the Forge")**: same stack, same roster-gated Clerk auth, same S3 uploads, the same AI-grading-through-a-queue pattern, an instructor console, and a gate system. The Forge's non-goals note already says its tables were designed so a `courseId` can be added later.

**Strongly prefer extending the Forge over rebuilding.** The Shipyard is the Forge with three real differences, and everything else (auth, roster, uploads, instructor matrix, audit log, brand) is already solved there:

1. **Gating is sequential and per-student**, not per-section instructor toggles. Here, Checkpoint 3 opens for a student the instant that student clears Checkpoint 2. The teacher does not flip it.
2. **The reviewer returns work until it passes**, and some gates are cleared by live metrics read from Shipped.money, not by grading a file.
3. **The unit is one student's product across the whole course**, not a stream of separate artifacts, and there are no teams and no voice interview in v1.

This document is written so it can be built standalone if you must, but if the Forge repo is available, build the Shipyard as a `courseId`-scoped mode of it and implement sections 3 to 8 below as the delta. Log which path you took in DECISIONS.md.

---

## 1 · COMPOUND ENGINEERING RULES (same as the Forge)

1. **`CLAUDE.md`** at root: stack, commands, invariants, the DECISIONS.md rule.
2. **`docs/DECISIONS.md`** append-only.
3. **`docs/LEARNINGS.md`**: append every fixed bug and corrected assumption.
4. **Tests before integrations.** The gate-resolution logic, the scoring formula, and the model router are pure functions that decide who advances, what grade they get, and what each call costs. Unit-test them first. The reviewer's pass-or-return parsing gets tests against recorded model outputs from both models in the routing table.
5. **Seed everything.** `pnpm seed` creates 8 sections, 480 fake students, one product each, and submissions across all six checkpoints in every state (passed, returned, in-review, blocked-on-metrics). Include a fake Shipped.money responder so metric gates can be demonstrated with no live tracker, and a fake OpenRouter responder so the pipeline runs with no API key.
6. **Ship in vertical slices.** Each milestone ends clickable on Railway.
7. **Migrations forward-only.**
8. **The fixture-agreement test is a release gate.** No model or prompt change reaches students until `pnpm eval:reviewer` runs and its agreement numbers are recorded in DECISIONS.md (section 6.5).

---

## 2 · STACK (fixed, identical to the Forge, except the AI gateway)

- **Hosting: Railway.** Next.js app, a pg-boss worker, one Postgres.
- **Framework: Next.js** (App Router, TypeScript).
- **ORM: Prisma** on Railway Postgres.
- **Jobs: pg-boss.** Every AI review runs through the queue, never inline in a request.
- **Files: AWS S3**, private bucket, pre-signed URLs. Accept images, PDF, MP4 up to 200MB, and text.
- **Auth: Clerk**, Google OAuth, roster-gated in our middleware exactly as the Forge does it: an off-roster email never reaches a page; an admin can add a roster row for late joiners.
- **AI gateway: OpenRouter, and only OpenRouter.** Every model call in the codebase goes through one module, `lib/ai/`, which speaks the OpenRouter API. No direct provider SDKs anywhere else. The routing table, fallback chain, and cost accounting live in that module (section 6.5). Structured JSON outputs validated with Zod, temperature ≤ 0.2.
- **Headless browser: Playwright**, in the worker, for rendering a student's live product (section 6). Chromium only.
- **Shipped.money client** behind `lib/tracker/`: one module that calls the tracker's read API with a signed service token and returns typed checkpoint signals. This is the only place the portal learns a student's real numbers.
- Env via `.env` with a checked-in `.env.example` naming every variable, including `OPENROUTER_API_KEY` and the routing profile.

---

## 3 · DATA MODEL (Prisma; core tables)

- **User:** id, email (unique), name, role (`student` | `instructor` | `admin`), sectionId, createdAt. Roster import, no self-registration.
- **Section:** id, code (A to H), name.
- **Product:** id, userId, name, oneLiner, liveUrl?, waitlistUrl?, trackerProductId? (the id this student's product has in Shipped.money, set when they connect), createdAt. One per student.
- **Checkpoint (definition, seeded, editable by admin):** id, key (`idea` | `design` | `working` | `money` | `workflow` | `launch`), order (1 to 6), title, barMarkdown (the published bar the student sees), rubric (JSON, internal, not shown), gateType (`review` | `metric` | `both`), acceptsImages (bool), metricSignals (JSON: which Shipped.money signals must be true), deadlineAt?, resubmitWindowHours, resubmitCooldownMinutes (default 15). **New checkpoints or changed bars are a row edit, not a code change.**
- **Submission:** id, productId, checkpointId, status (`draft` | `submitted` | `in_review` | `returned` | `passed`), fields (JSON per checkpoint), files (S3 keys, images included), version (increments on resubmit, history kept), submittedAt, nextAllowedResubmitAt.
- **Review:** id, submissionId, verdict (`pass` | `return`), reasons (JSON, per criterion, student-facing), rubricScores (JSON, internal), confidence (0 to 1), metricSignalsSeen (JSON, the exact signals read from the tracker at review time), renderArtifacts (JSON: screenshot S3 key and extracted DOM text for checkpoint 3), **modelUsed, providerUsed, tokensIn, tokensOut, costUsd** (for every call, so spend is auditable per review), reviewedBy (`ai` | `human`), overriddenBy?, overrideReason?, createdAt.
- **CheckpointState (per student, the gate):** id, productId, checkpointId, state (`locked` | `open` | `passed`), openedAt?, passedAt?.
- **Grade:** id, productId, components (JSON, the four weighted components in section 7 with raw scores), allCheckpointsCleared (bool, the graduation condition), weightsVersion, total, provisional (bool), finalisedBy?, createdAt.
- **RouterState:** a single-row table: anthropicExhausted (bool), exhaustedAt?, consecutiveByokFailures (int), activeProfile. The kill-switch in section 6.5 reads and writes this.
- **AuditLog:** every review, override, gate change, grade finalisation, and router state flip: who, what, when, before and after.

---

## 4 · WHAT STUDENTS AND FACULTY SEE

**Student, one screen that is the spine of the course:** a vertical of the six checkpoints. The current one is open with its bar shown in full, a submit form rendered from the checkpoint's field schema (links live-checked, files and photos to S3 by pre-signed URL), and after submitting, the reviewer's verdict: either `passed` (the next checkpoint unlocks in front of them) or `returned` with a specific list of what to fix, the resubmit window, and when they may resubmit next. While a review is queued, the screen shows their position in the queue and the honest expectation: "usually under two minutes, longer on deadline nights." Passed checkpoints show green and locked with their date. Future checkpoints show locked, title and bar visible so they can read ahead, but no submit. For the metric checkpoints (money, workflow, launch), the screen shows the live signals read from Shipped.money ("payments live: yes", "workflow runs: 7 of 10", "paying customers: 0"), so a student always knows exactly what the tracker sees. A student's own grade line, every component broken out, always labelled provisional until finalised.

**Instructor, per section:** a matrix, 60 students by six checkpoints, each cell coloured by state. A **review queue** of every low-confidence or flagged review, sorted, with one-click override and a required reason (audit-logged). A student drill-down: their product, their submission history, their live tracker signals, their grade line, and the rendered screenshot the reviewer saw for checkpoint 3. The reviewer's bar and rubric per checkpoint are editable here (admin), and a manual "open this checkpoint for this student" escape hatch exists for genuine edge cases, audit-logged.

**Admin:** checkpoint editor (bars, rubrics, deadlines, cooldowns, which metric signals gate which checkpoint), roster import, weights editor for the grade formula, the model routing profile and the kill-switch state with a manual override, a live cost meter (spend by model and by checkpoint), DPDP export and delete per student.

---

## 5 · THE TWO KINDS OF GATE (the heart; build the resolution as one pure function)

Every checkpoint is `review`, `metric`, or `both`. One function, `resolveGate(product, checkpoint)`, returns `locked | open | passed`, and it is the only place gate logic lives.

**Sequential unlock:** Checkpoint N is `open` for a student iff Checkpoint N-1 is `passed`. Checkpoint 1 is open on enrolment. The instant a review passes N-1, N flips to open on the student's screen within seconds (SSE or short poll).

**Clearing a `review` gate (checkpoints 1, 2, 3):** the AI reviewer (section 6) judges the submission against the bar and returns `pass` or `return`. `pass` sets the checkpoint `passed`.

- **Checkpoint 1 (idea, with demand)** requires a live waitlist page with real signups from a small traffic test. Shipped.money does not track waitlist signups, so this evidence is student-submitted for v1: the waitlist URL (liveness-checked by the worker), a screenshot of the signup count, and the ad or post numbers. The reviewer judges it, and low-confidence or outlier cases go to the human queue. Log in DECISIONS.md that this is the one gate with self-reported evidence; if gaming appears, add a waitlist-signups source to Shipped.money in a later version.
- **Checkpoint 2 (design)** accepts photos of hand-drawn screens and flows. The reviewer must read images (section 6.5).
- **Checkpoint 3 (working product)** is judged from a headless render of the live URL, not a plain fetch (section 6).

**Clearing a `metric` gate (parts of 4, 5, and Launch):** the portal calls Shipped.money `checkpoint-signals` for this product and checks the checkpoint's required signals:
- **Money (checkpoint 4):** `paymentsLive` and `trackerConnected` both true.
- **Workflow (checkpoint 5):** `workflowTenRuns` true.
- **Launch (final):** `hasPayingCustomer` true and `blockingFlags` empty.

A metric gate is never cleared by anything the student types. Only signals derived from the tracker's **Verified** data count; its Derived and Declared tiers never clear a gate. If the tracker says the signal is not met, the checkpoint stays open and the screen shows the live number. If Shipped.money reports a blocking anti-gaming flag, the signal is false regardless of the raw number, so a gamed payment cannot pass Launch.

**Clearing a `both` gate:** the money and launch checkpoints pair a short student write-up (reviewed) with the metric signal (read). Both must clear. Store which cleared when.

Resolution is recomputed on every submit, on every tracker refresh callback, and on a low-frequency safety cron, so a student who lands their tenth workflow run at midnight sees the gate open without resubmitting anything.

---

## 6 · THE AI REVIEWER PIPELINE (return until it meets the bar)

**Flow:** a submission hits `submitted` → check the cooldown (a resubmit inside `resubmitCooldownMinutes` of the last one is rejected at the form with the time remaining) → enqueue `review.submission` (pg-boss) → the worker runs **pre-flight** on the cheap tier: link liveness on every URL, blank or spam or near-duplicate detection, text extraction from PDFs and documents → for checkpoint 3, **render the live product with Playwright**: load the URL in headless Chromium, wait for the app to hydrate, capture a full-page screenshot and the visible DOM text, and attempt the core path named in the student's job story (a plain HTTP fetch of a Next.js app returns an empty shell, which is why this step exists) → for `metric` and `both` checkpoints, fetch the tracker signals → assemble the verdict context: the checkpoint's bar and rubric (the fixed, cached prefix), the student's fields and write-up, extracted text, **and the images** (checkpoint 2 sketch photos, the checkpoint 3 screenshot) → one call on the **verdict tier** with structured output → validate with Zod (retry once) → persist a `Review` with model, tokens, and cost → if `pass`, set the checkpoint `passed` and unlock the next; if `return`, keep it open and show the reasons → notify the student in-app.

**Rules that make it trustworthy:**
- The reviewer returns **specific, actionable reasons**, tied to the bar clause by clause, never a vague "not good enough." The copy is warm and concrete, because a student reads it many times.
- The reviewer **never sees the student's name or section**; the worker strips them.
- `confidence < 0.7`, a contradiction between the write-up and the rendered product, or a top or bottom outlier → auto-queued for human review before the pass counts. A `return` a student disputes is escalated the same way. The escalation second opinion runs on the verdict tier with the human-review prompt.
- Temperature ≤ 0.2. Store the full prompt and response for every review, for audit and for the fixture set.
- **`pnpm eval:reviewer`:** about 10 sample submissions per checkpoint (60 total) with expected verdicts. It runs against every model in the routing table and prints, per model, agreement with the expected verdicts and agreement with each other model. It runs after any bar, rubric, prompt, or routing change, and it is a release gate (section 1, rule 8).
- **Throughput:** reviewer concurrency **15** (not 5). 480 near-simultaneous submissions on a deadline night then drain in roughly 25 minutes rather than over an hour. Exponential backoff on provider errors, a dead-letter list surfaced to admins, and the queue position shown to the student.

---

## 6.5 · MODEL ROUTING AND COST (all through OpenRouter)

Everything goes through OpenRouter. Two models, two tiers, one deliberate fallback. All of this is config in `lib/ai/router.ts`, not scattered code, and every call records model, provider, tokens, and cost.

**The keys.**
- Praxel's **Anthropic API key is registered in OpenRouter as a BYOK key**, so Haiku calls draw on the existing Anthropic credit (about $180 at time of writing). OpenRouter charges no fee on BYOK usage up to $25,000 a month on pay-as-you-go, so the credit goes entirely to tokens.
- **OpenRouter's own credits** pay for GLM 5.3 Flash.

**The routing table (default profile, `flash-verdicts`):**

| Task | Primary | Fallback |
| --- | --- | --- |
| Pre-flight: liveness classification, blank / spam / duplicate detection, text extraction | `anthropic/claude-haiku-4.5` via BYOK (confirm the exact slug in OpenRouter's model list) | `z-ai/glm-5.3-flash` |
| Verdict, every checkpoint, text and images | `z-ai/glm-5.3-flash` | `anthropic/claude-haiku-4.5` via BYOK |
| Escalation second opinion (human queue) | `anthropic/claude-haiku-4.5` via BYOK | `z-ai/glm-5.3-flash` |
| Fixture evals | both, always | |

Both models accept images, which checkpoints 2 and 3 require. GLM 5.3 Flash is natively multimodal; do not substitute full GLM 5.3, which is text-only.

**The fallback to "GLM 5.3 Flash everywhere," configured on purpose.** OpenRouter's default when a BYOK key fails is to keep serving the same model on OpenRouter's shared credits. That is not what we want. So:
1. In OpenRouter's key settings, set the Anthropic BYOK key to **"Never use shared capacity for models this key applies to."** A Haiku call then fails cleanly when the credit is gone instead of silently billing OpenRouter at Haiku rates.
2. Every request sends OpenRouter's `models` fallback array (`[primary, fallback]`), so a failed Haiku call is retried on GLM 5.3 Flash inside the same request.
3. The router keeps `RouterState.consecutiveByokFailures`. After **5 consecutive** BYOK failures with a credit or auth error, it sets `anthropicExhausted = true`, flips the active profile to **`flash-everywhere`** (every task, primary and fallback, on GLM 5.3 Flash), writes an AuditLog row, and shows a banner in the admin cost meter. No further Haiku attempts are made until an admin resets the switch. This avoids paying a failed-call latency on every review once the credit is gone.
4. An admin can flip profiles manually at any time.

**Provider hygiene on OpenRouter.** Set the request's provider preferences so the model is served only by providers that **do not train on or retain inputs**, because a checkpoint 3 screenshot can carry a student's real customers' details. Set a provider-level fallback so one provider's outage on a deadline night does not stall the queue.

**Prompt caching.** Send the fixed prefix (system prompt, bar, rubric) with `cache_control` so it is cached where the provider supports it. Verify it applies under BYOK in the first week and log the result. Do not depend on it for budget; the budget below assumes no caching.

**Cost, for 500 students, so nobody has to guess.** Assumptions: five LLM-reviewed checkpoints (1, 2, 3, and the write-up halves of 4 and Launch; checkpoint 5 is metric-only), 2.5 attempts each, plus 10 percent re-reviews, about 7,000 verdicts. A verdict is about 11K tokens in (bar, rubric, submission, extracted text, images) and 1.2K out. Pre-flight is about 2K in, 200 out.

| Item | Model | Per call | Volume | Total | Paid from |
| --- | --- | --- | --- | --- | --- |
| Pre-flight | Haiku 4.5 ($1 / $5 per M) | ~$0.003 | 7,000 | ~$21 | Anthropic credit |
| Verdicts | GLM 5.3 Flash ($0.15 / $0.50 per M base) | ~$0.002 | 7,000 | ~$16 | OpenRouter credits |
| Escalation second opinions | Haiku 4.5 | ~$0.017 | ~700 | ~$12 | Anthropic credit |
| Fixture evals, both models, ~20 runs | both | | 2,400 | ~$10 | mixed |
| **Total** | | | | **~$60** | ~$35 credit, ~$25 OpenRouter |

Worst case, double it. If the credit runs out and everything moves to GLM 5.3 Flash, the whole course costs about **$25** on OpenRouter. GLM's current 50 percent promotional price would halve that; budget at the base rate.

**One note for the founders, logged here so the router can be flipped in a line.** The Anthropic credit is large enough to run **verdicts on Haiku too**, not only pre-flight (about $120 for all 7,000 at Haiku rates, inside the $180). If the fixture-agreement test shows Haiku judging more consistently than GLM 5.3 Flash on these submissions, set the verdict tier's primary to Haiku and its fallback to Flash. That is a config change, and the eval decides it, not opinion.

---

## 7 · SCORING (decided; unit-test the formula)

The grade has **four weighted components** and **one graduation condition**. Weights live in a `weightsVersion` so they change by config, not code.

| Component | What it measures | Source | Weight |
| --- | --- | --- | --- |
| **Product quality** | How good the shipped product actually is | reviewer score on checkpoint 3 plus launch | 30 |
| **Real numbers** | Traffic, usage, and total payments | Shipped.money, Verified only | 30 |
| **Workflow** | The automation, live, ten or more real runs | Shipped.money | 20 |
| **Distribution and launch** | Getting real users, done well and honestly; spam scores zero | reviewer plus Shipped.money | 20 |

**Graduation condition, not a weight:** `allCheckpointsCleared` must be true for a student to pass the course. It is a gate on the grade, not a zero-weight score. Render it on the grade line as a single line, cleared or not, above the four components. The final checkpoint cannot be cleared without at least one real paying customer, and total payments are read live and count.

Every component's raw score and weighted contribution render in the student's own grade line. Grades stay inside the portal, visible only to the student and faculty. Anything that later syncs to Praxy sends artifacts and validation, never numbers; build that as a stubbed `POST /api/praxy/export` returning the payload it would send.

---

## 8 · SECURITY, PRIVACY, SCALE, INTEGRITY

Roster-only auth, reject unknown emails at the OAuth callback. Every route checks role and ownership. S3 pre-signed and short-lived. The Shipped.money service token and the OpenRouter key live in Railway secrets, never in the browser. India DPDP hygiene: collect the minimum, a stated retention window, admin export-and-delete per student, and the OpenRouter no-train, no-retain provider setting from section 6.5. **Playwright runs in the worker only**, against student URLs, with a timeout, no credentials, and network limited to the target origin, so a malicious page cannot reach internal services. Integrity is split: this portal trusts the tracker's anti-gaming flags rather than re-implementing them, so a blocking flag from Shipped.money fails the relevant metric gate here automatically. Load: design for 100 concurrent platform-wide as the baseline, with deadline-night submission spikes as the known burst; the cooldown bounds spam, concurrency 15 drains the queue, gate reads and the matrix serve from indexed reads, targets p95 under 500ms on the student spine and the instructor matrix. A k6 script for the baseline and a deadline-night burst runs before first classroom use.

---

## 8.5 · THE TRACKER, AS IT ACTUALLY EXISTS

Shipped.money is built (Next.js 16, Drizzle, Auth.js, Railway via Nixpacks) with a provenance model: every number is **Verified** (from a live provider API), **Derived** (computed by a published formula), or **Declared** (typed by the builder, never mixed into verified totals). Its sources are Dodo Payments and RevenueCat (revenue), Google Search Console and **Vercel Analytics** (traffic), and GitHub (code). It has cohorts, a leaderboard, an admin CSV export, and a read-only JSON API.

Three things this portal needs that the tracker does not have yet. Coordinate them with the Shipped.money owner before M3:

1. **A `checkpoint-signals` endpoint**, service-to-service behind a signed token, returning `{ paymentsLive, trackerConnected, workflowTenRuns, hasPayingCustomer, payingCustomers, grossTotal, netTotal, currency, blockingFlags }`, computed from Verified data only.
2. **A workflow-runs source.** Shipped has no n8n source, and checkpoint 5 needs a count of real runs. **Default: add an n8n source to Shipped** (read the hosted n8n instance's executions API per workflow, or accept a signed webhook per run), so every gate signal stays in one place. **If Shipped cannot ship it in time,** build a thin `lib/n8n/` adapter in this portal that reads the executions API directly and feeds `workflowTenRuns`, and log the split in DECISIONS.md.
3. **Confirm self-payment detection.** The tracker's anomaly flags must include a builder paying themselves (matching email, card fingerprint, or device), reported as a blocking flag, or the Launch gate is trivially gameable.

Until those exist, M3 runs against the fake tracker responder in seed.

---

## 9 · MILESTONES (build in this order; each ends deployed on Railway)

- **M0 · Skeleton:** repo, CLAUDE.md, Prisma schema, Railway deploy, seed (8 sections, 480 students, six seeded checkpoints, fake tracker and fake OpenRouter responders), Google-gated login, the student checkpoint spine in brand styling with everything locked past checkpoint 1.
- **M1 · Submissions and sequential gates:** submit flow with S3 uploads including photos, the cooldown, the `resolveGate` function, sequential unlock, instructor matrix. No AI yet: a stub reviewer that passes on command so the flow is walkable.
- **M2 · The AI reviewer:** `lib/ai/` on OpenRouter with the routing table, BYOK, fallback array, and kill-switch; the pipeline end to end on the three `review` checkpoints, including Playwright rendering for checkpoint 3 and images for checkpoint 2; return-until-pass; reasons shown; human review queue and override; per-review cost recorded; the admin cost meter.
- **M2.5 · Fixture-agreement gate:** the 60-fixture set, `pnpm eval:reviewer` against both models, agreement numbers logged in DECISIONS.md, and the verdict tier's primary confirmed or flipped on that evidence. Nothing reaches students before this passes.
- **M3 · Metric gates:** the Shipped.money client, live signals on the student spine, the money, workflow, and launch gates cleared by real Verified signals, blocking flags failing gates. Fake tracker until the three items in section 8.5 land, then the real one.
- **M4 · Scoring and faculty tools:** the four-component grade line plus the graduation condition, config-driven weights, provisional grades, finalisation, checkpoint and bar editor, routing profile and kill-switch controls, CSV export, Praxy export stub.
- **M5 · Hardening:** deadline-night load test at concurrency 15, DPDP tools, Playwright sandboxing review, audit-log review, copy polish on the return reasons.

**Definition of done for v1:** on seed data, a fake student logs in, reads all six bars, submits an idea and gets a specific `return` under the cooldown, fixes it and passes, watches checkpoint 2 unlock, submits photos of hand-drawn screens and passes, submits a live URL that the worker renders and passes on the screenshot, then reaches the money checkpoint where the spine shows "payments live: no" until the fake tracker flips it, clears it, later clears workflow at the tenth run and launch at the first genuine paying customer, and sees a blocked gate when the tracker reports a self-payment flag; the admin cost meter shows every review's model and cost; forcing five BYOK failures flips the router to flash-everywhere and logs it; while an instructor overrides one review, opens one gate manually, and exports the section CSV. All on Railway.

---

## 10 · NON-GOALS FOR V1 (log them, don't build them)

Teams and peer scoring (Course 2 is individual). The voice interview. Re-implementing anti-gaming (the tracker owns it). A waitlist-signups tracker source (v1.1 if gaming appears). Direct provider SDKs (OpenRouter only). Public galleries. Mobile apps. Email digests. Multi-course UI beyond the `courseId` scoping. Building the tracker itself.

Begin with M0. If the Forge repo is available, build this as its `courseId` mode and implement sections 3 to 8 as the delta. Keep the tracker client thin, keep the router in one file, keep DECISIONS.md honest, and when reality contradicts this document, prefer reality and write down why.
