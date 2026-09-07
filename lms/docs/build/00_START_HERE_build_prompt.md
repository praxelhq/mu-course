# BUILD PROMPT · PRAXEL LMS ("The Forge")

*v1.0 · Paste this whole document into Claude Code as the opening prompt of the repo. It is self-contained: business context, architecture, data model, grading pipeline, voice interview, milestones, and working rules. Build incrementally; the milestones at the end are the order of work. Where I've been specific, follow exactly. Where something is ambiguous, make a sensible call and log it in docs/DECISIONS.md rather than stopping to ask.*

---

## 0 · CONTEXT: WHO AND WHY

You are building the assignment, evaluation, and tracking portal for a course **Praxel** (praxel.in) teaches at **Masters' Union**, a business school in India. The course is "AI for Business," 10 sessions, running across **8 sections (A–H) of ~60 students each, 480 students total**. We already hold the roster: every student's name, email, and section (CSV import, provided).

What happens on this portal: from Session 2 onward, students submit artifacts they build in class and at home: an AI skill they made, a data-analysis memo with charts, a Make.com workflow, a Lovable app, media pieces, and their team's industry value chain map. **Every submission is graded by AI, instantly.** Students also take an **AI-conducted voice interview** about their own submissions and their industry. Grades roll up through a fixed scoring formula into a course grade. Selected work appears in login-gated galleries every student can browse. Later, artifacts flow onward to **Praxy** (praxy.me), Praxel's careers platform, where they form the student's public proof-of-work profile; that integration is a stub in v1.

Working name for the product: **the Forge**. Praxel's brand: Parchment background (#FBF8F3), Pine (#1E3A35) for authority and primary actions, Ochre (#C4581A) accents, 0px border radius, no gradients, no shadows for hierarchy. Display font Fraunces, body Geist, mono Geist Mono. Clean, minimal, premium; a brand reference file will be added to the repo as `docs/BRAND.md`. Never pure white backgrounds.

---

## 1 · COMPOUND ENGINEERING RULES (set these up before writing feature code)

1. **Create `CLAUDE.md` at repo root** with: the stack, the commands (dev, test, migrate, seed, deploy), the architectural invariants from this document, and the rule "every non-obvious choice gets a line in docs/DECISIONS.md."
2. **Create `docs/DECISIONS.md`** (append-only log: date, decision, why, alternative rejected).
3. **Create `docs/LEARNINGS.md`**: whenever a bug is fixed or a wrong assumption corrected, append what was learned so future sessions don't repeat it.
4. **Tests before integrations.** The grading pipeline, scoring formula, and PCI math get unit tests FIRST (they are pure functions and they decide people's grades). UI gets Playwright smoke tests per milestone.
5. **Seed everything.** `pnpm seed` must create: 8 sections, 480 fake students from a CSV shaped like the real roster, 64 teams, 3 assignment types, ~40 fake submissions in varied states, 2 fake graded interviews. Every feature must be demonstrable on seed data alone.
6. **Ship in vertical slices.** Each milestone below ends with something a student or instructor can actually click through on Railway, not a layer cake of unfinished horizontals.
7. **Migrations are forward-only** (Prisma Migrate); never edit an applied migration.

---

## 2 · STACK (fixed, do not substitute)

- **Hosting: Railway.** Three services from one repo: the Next.js app, a background-jobs worker (pg-boss), and the **LiveKit agent worker** (the voice interviewer). Plus one Railway **PostgreSQL**.
- **Framework: Next.js** (App Router, TypeScript) serving both the UI and API routes.
- **ORM: Prisma** against Railway Postgres.
- **Jobs/queue: pg-boss** (Postgres-backed queue; no Redis, fewer moving parts on Railway). All AI grading runs through the queue, never inline in a request.
- **Files: AWS S3** (private bucket, server-generated pre-signed URLs for upload and download; nothing public). Accept: images, PDF, MP4 up to 200MB, JSON (Make.com blueprints), ZIP, audio.
- **Auth: Clerk**, Google OAuth as the primary (and effectively only) sign-in method. Use Clerk's prebuilt components for sign-in and user profile; roles (`student`, `instructor`, `admin`) live in Clerk publicMetadata AND mirror into our users table. **The roster gate is enforced in OUR middleware, not delegated to Clerk config:** on every authenticated request (and via the `user.created` webhook), the Clerk email must match a roster row or the session is rejected and the Clerk user flagged for deletion. Defense in depth: even if Clerk-side restrictions are misconfigured, an off-roster Google account never reaches a page. Keep one escape hatch: an admin can add a roster row manually (late joiners, section transfers).
- **AI, two providers, isolated behind one module (`lib/ai/`):**
  - **Grading and interview follow-ups: Anthropic API** (Claude Sonnet class model), always with structured JSON outputs validated by Zod, temperature low.
  - **Realtime voice: LiveKit.** Use **LiveKit Cloud** for transport (WebRTC rooms, recording) and the **LiveKit Agents framework** for the interviewer: a dedicated agent worker service on Railway joins each interview room and runs the pipeline **Deepgram (STT) → Gemini Flash (conversation LLM) → ElevenLabs (TTS)**. These three are PINNED, not suggestions: Praxel already runs all three in production elsewhere, so reuse patterns and keys. Keep them behind LiveKit's plugin interfaces so a swap stays possible, but do not substitute providers on your own. Note the split deliberately: **Gemini Flash runs the live conversation** (fast, cheap per turn); **the Anthropic grader still scores the transcript afterwards** (consistent with how every other artifact is graded). Server mints LiveKit room tokens; no provider API key ever reaches the browser. Use LiveKit Egress for server-side audio recording to S3. Self-hosting LiveKit on Railway is possible later; start on LiveKit Cloud and log the decision.
- Env config via `.env` with a checked-in `.env.example` naming every variable.

---

## 3 · DATA MODEL (Prisma; core tables, extend as needed)

- **User**: id, email (unique), name, role, sectionId, teamId?, avatarUrl?, createdAt. Imported from roster CSV; no self-registration.
- **Section**: id, code (A–H), name.
- **Team**: id, sectionId, name, sectorName (their claimed industry), memberIds via relation.
- **AssignmentType**: id, slug (`skill`, `data-memo`, `workflow`, `app`, `media`, `value-chain-map`, `article`, ...), title, description, submissionSchema (JSON: which fields this type wants, e.g. link+file+writeup), rubric (JSON, see §5), galleryEligible (bool), teamBased (bool). **New artifact kinds must be addable by inserting a row, not by writing code.** This is the "keeps evolving" requirement.
- **Assignment**: id, assignmentTypeId, title, brief (markdown), sectionIds[], dueAt (soft display deadline), weightBucket (see §7). Whether submissions are actually accepted is governed by its Gate (below): instructors open and close submission windows manually, per section; `closed` after being `open` means late submissions are rejected with a clear message and an instructor can reopen for individuals.
- **Submission**: id, assignmentId, userId, teamId?, status (`draft`→`submitted`→`grading`→`graded`→`finalised`), submittedAt, fields (JSON per schema: links, text), files (S3 keys), version (resubmission increments, history kept).
- **Grade**: id, submissionId, rubricScores (JSON: per-dimension 0–10 + rationale each), total, confidence (0–1), feedbackMd (student-facing), flags[] (`low-confidence`, `link-dead`, `possible-plagiarism`, `off-brief`), gradedBy (`ai`|`human`), provisional (bool), overriddenBy?, overrideReason?, createdAt.
- **Interview**: id, userId, scheduledWindow, status (`pending`→`live`→`completed`→`graded`→`escalated`), transport (`realtime`|`turnbased-fallback`), audioS3Key, transcript (JSON turns), rubricScores, confidence, escalationReason?.
- **Quiz / QuizAttempt**: quizzes with questions JSON, section-scoped, `isDiagnostic` bool; attempts auto-graded. **CRITICAL: a quiz flagged `isDiagnostic` (there will be one on data-privacy law in Session 1) must NEVER appear in any student-facing history, tally, or best-of calculation, in any view or API response. It is instructor-visible only. Do not leak it in a count, a list length, or an "attempts" number.**
- **PeerReview**: checkpoint (1|2), reviewerId, revieweeId, pointsAllocated, ratings JSON (reliability, communication, helpfulness 1–5).
- **GalleryItem**: submissionId, featured (bool), caption; only `galleryEligible` types.
- **Material**: id, sessionNo, title, kind (`dataset`, `workbook`, `lab-sheet`, `deck`, `schema-pack`, `link`, `template`), s3Key?, externalUrl?, sectionIds[] (empty = all), version, sizeBytes.
- **SessionPage**: sessionNo, title, summaryMd, orderedMaterialIds[], linkedAssignmentIds[], linkedQuizIds[]; one hub page per course session.
- **Unlock (the gating system, one uniform mechanism):** every gateable thing — a whole SessionPage, an individual Material, an Assignment's submission window, a Quiz — carries per-section gate state resolved through one table: `Gate { id, targetType (session|material|assignment|quiz), targetId, sectionId, state (locked|open|closed), openedAt?, closedAt?, changedBy }`. Resolution rule, uniform everywhere: a thing is available to a student iff its own gate is `open` AND its parent session's gate is `open` for that student's section. Optional scheduled opens (`opensAt`) exist as a convenience, but **the manual instructor toggle always wins** and is the primary mechanism. Every gate change is audit-logged and propagates to student screens within seconds (SSE or short-poll on hub pages).
- **AuditLog**: every grade change, override, deletion: who, what, when, before/after.

---

## 4 · WHAT STUDENTS SEE

1. **Login** (Google, roster-gated) → **Dashboard**: open assignments with due dates, my submissions with status chips, my provisional grades with per-dimension feedback, my interview slot, my team and sector.
2. **Submit flow**: pick assignment → form renders from the type's submissionSchema (link fields validate and are live-checked; files go direct to S3 via pre-signed URL with progress) → confirm → status `submitted` → grade appears usually under two minutes, marked **PROVISIONAL** with per-dimension rationale. Resubmission allowed until dueAt; history preserved.
3. **Galleries** (login-gated, all sections visible to all students): **App wall** (screenshot cards, link out to live Lovable apps; server captures an og-image/screenshot on submission), **Workflow wall** (Make.com blueprint JSON download + a short screen-recording the student uploads), **Map wall** (value chain maps as image/PDF pages), filter by section/sector, "featured" ribbon for instructor picks. No likes/comments in v1.
4. **Voice interview room**: see §6.
5. **Session hubs, the "run everything from here" requirement.** One page per session (1–10) that is the single place a student needs open in class: the session's materials (datasets, workbooks, lab sheets, schema packs) as one-click downloads from S3, external launchers (the Heist simulator, the sector tracker sheet, a Lovable/Make.com deep link, "open in Google Sheets" copy links for workbooks), the session's assignments with live submit buttons, and the session's quiz slot (inert until armed). Everything on a hub respects the gate system: a locked session shows as a visible-but-locked card (title only, lock mark, no contents); a locked material or assignment inside an open session shows greyed with "not yet released"; the moment an instructor flips a gate, it appears live on every student screen in that section within seconds (poll or SSE), which is exactly how mid-class challenge files get dropped. In-browser preview for CSVs (first 100 rows), PDFs, and images so students can peek before downloading. Everything section-scoped where it should be.
6. **My grade line**: every component of §7 broken out line by line, always current, always labelled provisional until finalised.

## WHAT INSTRUCTORS SEE

Section dashboard (submission/grade matrix: 60 rows × assignments, colour by status), **review queue** (all `low-confidence` and flagged grades, sorted), one-click grade override with reason (audit-logged), interview transcripts + audio player with escalations on top, and the **Unlock Console: one screen, the instructor's session remote control.** Rows are sessions 1–10 with their materials, assignments, and quizzes nested; columns are that instructor's sections; every cell is a three-state toggle (locked / open / closed). Open Session 3 for Section B with one tap as class starts; drop the sealed challenge file mid-class with another; close submissions at the deadline with a third. Bulk actions ("open Session 3 + all its materials for Section B") included. This console is used live, mid-teaching, on a laptop the instructor is also presenting from: it must be fast, obvious, and impossible to fat-finger (confirm on close-with-submissions-pending only, everything else instant), gallery feature/unfeature, CSV export of everything, roster/team editor. Admin additionally: assignment-type editor (create new artifact kinds + rubrics from the UI), roster import, DPDP data-deletion tool per student.

---

## 5 · THE AI GRADING PIPELINE (the heart; build it well)

**Flow:** submission hits `submitted` → enqueue `grade.submission` (pg-boss) → worker assembles context: assignment brief, rubric, the student's fields/writeup, extracted text of files (PDF text, image OCR-lite via the model's vision, blueprint JSON), and **link liveness checks** (HEAD/GET each URL; a dead app link is auto-flagged, capped score on the functionality dimension) → one Claude call with structured output → validate with Zod (retry once on schema failure) → persist Grade → notify student (in-app; email later).

**Rubric shape (default, per artifact; stored per AssignmentType so admins can vary it):** four dimensions, 0–10 each: **Functionality** (does it work / does the analysis hold), **Craft** (quality of execution), **Relevance** (is it built for their claimed sector/company, not generic), **Verification evidence** (did they show they checked their own work). Grader must return: per-dimension score + 2-sentence rationale, total, a 120-word student-facing feedback note (specific, warm, no filler), confidence 0–1, and flags.

**Rules that make it trustworthy:**
- Grader NEVER sees the student's name or section (bias hygiene); worker strips them.
- `confidence < 0.7`, any flag, or a total in the top/bottom 5% of that assignment → auto-queued for human review. Everything is provisional until an instructor finalises in batch.
- Same-input determinism target: temperature ≤0.2; persist only allowlisted audit metadata (input/context hashes, model, token usage, citations, and validation flags). Never store prompts, learner evidence, evaluator context, or raw provider responses.
- Build `pnpm eval:grading`: a fixture set of ~10 sample submissions per type with expected score bands; run after any rubric/prompt change and print drift. Add fixtures as real submissions accumulate.
- Rate-limit and batch: 480 near-simultaneous submissions on a due-date night must drain calmly (queue concurrency ~5, exponential backoff, dead-letter list surfaced to admin).

---

## 6 · THE VOICE INTERVIEW (realtime, with a designed fallback)

**Primary transport: OpenAI Realtime API over WebRTC.** Server endpoint mints an ephemeral token; browser connects directly; ~10 minutes; the agent's system prompt is assembled server-side from: the student's own submissions (titles + graded summaries), their team's sector and map summary, and the interview script config (question categories: industry command, defence of own submissions, tool-choice reasoning, one transfer scenario; adaptive follow-ups; friendly but probing tone; never reveals scores).

**Non-negotiable engineering around it:**
- **Record everything server-side**: full audio to S3 and running transcript to Postgres as the conversation happens, not after. A dropped connection must never lose completed turns.
- **Automatic degradation:** on LiveKit connection failure or sustained packet loss, the session switches in-place to **turn-based mode** (plain HTTPS, no realtime transport): the same agent asks the next question as text + TTS audio, the student records an answer clip (MediaRecorder), it's transcribed, and the loop continues. Same session, same transcript, flagged `turnbased-fallback`. The student clicks nothing to "switch"; it just keeps working. Build this mode FIRST (it is also the load-shedding path and works on any network), then layer realtime on top.
- **Grading is decoupled from the conversation:** after `completed`, a `grade.interview` job sends the transcript (plus per-turn timing) to Claude with the interview rubric (four categories, 0–25 each, same band logic as artifacts). Confidence <0.7, contradictions with their submitted work, or suspected coaching/reading → `escalated` for human listen-through.
- **Ops controls:** interviews open per-section in windows (config). **Interview concurrency target: ~30 simultaneous rooms** (half a section at once), waiting room beyond that; interviews are scheduled across windows, so this is comfortable. Each concurrent room costs one agent pipeline (STT + LLM + TTS), so (a) size the Railway agent worker for 30 pipelines and autoscale-or-queue past it, (b) confirm LiveKit Cloud plan and STT/TTS provider rate limits cover 30 streams BEFORE the first window, (c) load-test with the simulation script at 30, and (d) surface a live rooms + spend meter to admins during windows. Per-student one attempt + instructor-granted retakes, cost log per interview.
- A `pnpm interview:simulate` script that runs a scripted fake candidate through both transports end-to-end for CI.

---

## 7 · SCORING ENGINE (fixed formula; unit-test every branch)

Weight buckets (each 0–100 before weighting): **valueChainMap 15%** (team score × individual PCI) · **artifactQuality 15%** (mean of the student's individually graded artifacts) · **workflowUsefulness 15%** (team score × PCI; includes a company sign-off evidence upload worth 40 of its 100 points) · **aiInterview 15%** · **peerContribution 10%** (standalone 1–5 ratings, averaged, scaled) · **quizzes 5%** (**best 3** scores of all non-diagnostic attempts) · **portfolio 25%** (completeness of linked artifacts, narrative field, an automated **link-liveness crawl** worth 15 of its 100, external validation entries; rubric in config).

**PCI (Peer Contribution Index):** from each checkpoint's 100-point allocations: `PCI = (points received ÷ (100 × (teamSize−1))) × teamSize`, checkpoint average weighted 40/60 toward checkpoint 2, **clipped to [0.70, 1.20]**. Flag any team whose members rate near-identically for instructor review; never auto-resolve.

Grades and PCI values are internal: they render only to the student themselves and staff. Anything that later syncs to Praxy sends artifacts and validation badges, never numbers. Build the Praxy sync as a stubbed `POST /api/praxy/export` returning the payload it WOULD send.

---

## 8 · SECURITY, PRIVACY, SCALE

Roster-only auth (reject unknown emails at OAuth callback). All S3 access pre-signed and short-lived; bucket fully private. Every API route checks role + ownership (students read only their own grades; galleries expose no grades ever). Rate limits on submission and interview endpoints. India DPDP hygiene, and note the irony that we teach this law in Session 1: collect the minimum (name, email, section, coursework), a stated retention window, an admin "export all my data" and "delete student" action, and audio consent copy on the interview room's entry screen. Load reality: **design for 100 concurrent active users platform-wide as the sustained baseline** (dashboards, session hubs, uploads), with two known burst shapes above it: a quiz being armed puts a whole section (60 students) on the same endpoint within one minute, and due-date nights stack uploads and grading jobs. Targets: p95 <500ms on dashboard/hub reads (indexes on the obvious FKs), uploads go direct to S3 so the app tier never proxies file bytes, quiz submission endpoint handles 60 writes/sec bursts, and the grading queue absorbs everything else asynchronously. Add a k6 (or autocannon) load script for the 100-concurrent baseline and the quiz burst; run it before first classroom use.

---

## 9 · MILESTONES (build in this order; each ends deployed on Railway)

- **M0 · Skeleton (day 1):** repo, CLAUDE.md, Prisma schema, Railway deploy, seed script, Google-gated login with roster import, empty dashboard shell in brand styling.
- **M1 · Submissions + session hubs + gates:** assignment types + assignments, submit flow with S3 uploads, status chips, instructor matrix view; session hub pages with materials upload/download and CSV/PDF preview; the full Gate system with the Unlock Console and live propagation. No AI yet. (This milestone alone already replaces the shared-drive chaos and is worth deploying to students on day one.)
- **M2 · AI grading:** pg-boss worker, grading pipeline end-to-end on `skill` + `data-memo` + `app` types, provisional grades visible, review queue + override + audit log, grading eval script.
- **M3 · Galleries:** app wall with screenshot capture, workflow wall, map wall, featuring.
- **M4 · Interview, fallback-first:** turn-based voice interview complete (record → transcribe → adapt → grade → escalate), then realtime WebRTC layered on with in-place degradation. Simulation script green on both.
- **M5 · Scoring + quizzes + peers:** live quiz launcher with best-of-3 (diagnostic quiz isolation verified by a test), peer checkpoints + PCI, the full grade line, CSV exports.
- **M6 · Polish + Praxy stub:** portfolio page + link crawl, DPDP admin tools, cost dashboard (AI spend per feature), Praxy export stub, Playwright suite green.

**Definition of done for the whole v1:** a seeded demo where a fake student logs in, opens a session hub, sees Session 4 locked, downloads an open workbook, watches a sealed file appear the moment the instructor flips its gate, submits an app link, sees an AI grade with rationale in under two minutes, appears in the gallery, completes a voice interview that survives a simulated connection drop, and sees their full provisional grade line; while an instructor overrides one grade, launches a quiz, and exports the section CSV. All on Railway.

## 10 · NON-GOALS FOR V1 (log them, don't build them)

Mobile apps; public galleries; likes/comments; plagiarism detection beyond flagging near-duplicate submissions (do hash + embedding similarity flags, nothing heavier); payments; multi-course support (design tables so course_id can be added later, don't build the UI); Praxy live sync; email digests.

Begin with M0. Keep every milestone shippable, keep DECISIONS.md honest, and when reality contradicts this document, prefer reality and write down why. Pick necessary env variables from existing railway projects.
