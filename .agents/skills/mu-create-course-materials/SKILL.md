---
name: mu-create-course-materials
description: Produce classroom-ready instructor and student materials for an approved Masters' Union Applied AI lesson, including decks, facilitator guides, worksheets, prompts, datasets, schema/sample packs, Colab assets, build briefs, solution notes, LMS copy, grader fixtures, and portfolio instructions.
---

# MU Course Materials

Turn an approved lesson plan into a complete, versioned classroom package without changing its learning or assessment contract.

## Resolve current authority

Read `lms/docs/build/SOURCE_OF_TRUTH.md`, the active session brief and lesson plan, COT v3, scoring methodology, Praxel brand reference, current LMS constraints, and relevant delivered teaching deck. For Sessions 3-5, ignore the superseded root packages except for a deliberately retained mechanic.

Use current official vendor documentation for volatile product limits and label the verification date. Follow the project-specific TrustMRR authorization recorded in the source-of-truth file; keep row-level and derivative data inside the roster-gated course environment.

## Build only useful assets

Create the subset the session needs:

- student-facing deck plus speaker notes/source ledger;
- facilitator guide with intent, timing, setup, exact demo steps, likely failures, recovery and debrief;
- student lab/build brief with inputs, constraints, success criteria and submission instructions;
- datasets with provenance, snapshot date, data dictionary, checksums, row/token-size proof, representative sample, schema card, generation script and private answer key;
- formula/script/Colab starters and tested solutions where required;
- quiz bank, answer key, feedback copy and AI-grader calibration fixtures;
- LMS session/assignment/material/quiz manifest, gate timing, field copy and notification copy;
- portfolio/gallery instructions and a privacy/publication checklist.

For Session 3, separate the learner dataset, the over-context derivative, the schema/sample path, the solution notebook/script, and the evaluator-only key. For Session 4, include product/feature contract, first-prompt scaffold, acceptance tests, V1/V2 submission copy and credit-aware recovery. For Session 5, include flowchart template, failure checklist, Make blueprint/run-log instructions, secret scrubbing, PNG thumbnail rules and scenario-share/clone guidance.

## Standards

- Write for capable management students with uneven technical confidence.
- Make operational instructions unambiguous and business ambiguity authentic.
- Use Praxel's Parchment/Pine/Ochre, zero-radius, no-gradient visual system.
- Match the energy and low-density pacing of the supplied Industry Maps and workshop decks without copying obsolete storylines.
- Explain unfamiliar terms exactly when used.
- Keep demonstration inputs distinct from graded variants.
- Never place evaluator keys, hidden reveals, grades, prompt logs, credentials, or private company data on student/public surfaces.
- Do not require a paid plan unless provisioned. Document free-tier constraints and fallback artifacts.
- Cite sources inside the artifact and keep instructor-only solutions outside roster-wide materials.
- Name assets by course, session, audience, purpose and version; include expected time, outcome IDs, grade component and lifecycle state.

Produce source formats plus classroom-safe exports. Render and visually inspect every final deck/document/page, test every script/formula, and verify dataset checksums before release.

Send quizzes to `$mu-create-quizzes`, LMS copy/schema to `$mu-design-lms`, and the completed package to `$mu-validate-learning-assets`.
