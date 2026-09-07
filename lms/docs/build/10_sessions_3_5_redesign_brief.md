# Sessions 3-5 redesign brief

**Status:** user-directed; replaces prior Session 3-5 content  
**Directed:** 30 July 2026  
**Course:** AI for Business: The Operating Stack  
**Delivery:** 120 minutes per session, eight sections, 480 students

## Non-negotiable arc

### Session 3 - Work with data using AI

Students receive an authorised dataset and answer a mixed set of objective and judgment questions. Tool choice is open. They submit answers in the LMS. Objective answers use deterministic validation; subjective answers receive rubric-bound provisional AI scoring with evidence citations, confidence, and human review/finalisation.

The session then reveals a version that cannot fit in a one-million-token context. Students learn why whole-file chat upload is not a universal strategy and choose among:

- asking AI for the right spreadsheet formula and running it in the sheet;
- providing a schema plus a representative sample;
- having AI generate a Python script and running it in Google Colab;
- checking totals, assumptions, filters, joins, missingness, and edge cases outside the chat.

The final block teaches visual judgment. Students compare chart choices, diagnose misleading encodings, and answer a scenario quiz that asks both which visual is suitable and why.

Primary context: the user's TrustMRR Sheet. The user supplied project-specific authorization on 30 July 2026 for private classroom distribution, derivative teaching data, AI processing/grading, and Session 4 selection. Keep all row-level and derivative data inside the roster-gated course environment; use aggregates or independently public evidence on public-facing artifacts.

### Session 4 - Recreate a proven product with Lovable

The instructor and students select a narrowly scoped product with credible revenue evidence and rebuild the complete agreed feature contract in Lovable. The live build target is one hour; the rest of the session covers product selection, first-prompt quality, Plan mode, implementation choices, verification, Lovable AI, and publishing.

Students submit:

1. selected product and independently verifiable source links;
2. product/feature contract and first prompt;
3. live Version 1 URL;
4. short verification evidence;
5. Version 2 URL/change note in the follow-up window.

The core path must work on Lovable Free. As verified on 30 July 2026, the Free plan grants five daily build credits capped at 30 per month; daily grants expire and do not roll over. Plan mode consumes one credit per message, while Build-mode cost varies by task complexity. Version 2 therefore needs a credit-budgeted change plan and an LMS-supported resubmission/milestone path; ten calendar days does not imply fifty usable credits. Recheck at T-7: https://lovable.dev/pricing and https://docs.lovable.dev/features/plan-mode.

Use TrustMRR to shortlist the product under the project-specific user authorization, then verify revenue and the complete feature contract against independent public sources before teaching or grading. Do not publish TrustMRR row data on the student's app or portfolio.

### Session 5 - Build a revenue-supporting Make.com system

Students design a workflow that supports GTM, operations, or revenue for the product/startup context. They submit the flowchart before implementation. Rubric-bound AI feedback identifies missing triggers, states, data contracts, error handling, retries, idempotency, loops, approval gates, observability, and unsafe external actions; the advice is formative and revision-oriented.

Students then submit:

1. revised flowchart;
2. Make blueprint JSON;
3. sample run output/log with sensitive values removed;
4. final workflow PNG for the gallery;
5. public scenario-sharing link when available;
6. sample-output artifact and a short limitation/change note.

The gallery thumbnail is the PNG. The clone/view mechanism uses Make's scenario-sharing link or a blueprint download. As verified on 30 July 2026, blueprint JSON must stay below 2 MB and imported/shared scenarios omit account connections; users reconnect credentials themselves. Public scenario links show the latest saved version and allow a signed-in viewer to copy it. Recheck at T-7: https://help.make.com/blueprints and https://help.make.com/scenario-sharing. Gallery payloads contain no grades, confidence, prompt logs, credentials, or private company data.

## LMS implementation contract

- Extend the existing data-defined `AssignmentType` and generic submission-form system before adding custom forms.
- Preserve versioned submissions and restore a controlled resubmission path for Session 4 Version 2.
- Add mixed deterministic/model-assisted assessment support for Session 3 rather than forcing all questions into the current MCQ-only quiz engine.
- Keep all AI calls behind `lib/ai/` and in pg-boss workers, never request handlers.
- Keep every AI score provisional until instructor finalisation; route low-confidence, flagged, outlier, or appealed work to the review queue.
- Run all user-controlled URLs through `lib/net/safe-fetch` and all files through direct, private S3 presigned flows.
- Resolve section/session availability only through `lib/gates`.
- Build idempotent Session 3-5 setup/loading scripts that cannot be undone by the current Session 2 setup script.
- Implement with `compound-engineering:ce-work`, preserve forward-only migrations, add Vitest and Playwright evidence, and deploy web/worker/agent services to Railway only after local and release gates pass.

## Assessment continuity

These sessions feed the frozen course components rather than creating new top-level weights:

- Session 3 data work and Session 4 app contribute to Artifact quality (15%).
- Session 5 contributes to Workflow relevance and usefulness (15%).
- All three contribute evidence to the Praxy-bound portfolio (25%).
- Quizzes contribute to Continuous evaluation (best three, 5%).

Current component weights remain controlled by `01_scoring_methodology.md`.

## Superseded material

For Sessions 3-5, do not use the old root packages `session-03-make-ai-know`, `session-04-package-judgment`, or `session-05-make-the-system-act` as the lesson contract. The tracked Moxie/stocks Session 3 files are also replaced as the primary classroom context, though their schema-plus-sample and verification-move patterns may be reused with licensed/synthetic data.
