---
name: mu-validate-learning-assets
description: Audit or release-gate Masters' Union Course 1 plans, decks, manuals, datasets, quizzes, rubrics, graders, LMS flows, simulations, galleries, and portfolio artifacts for current-source alignment, authenticity, fairness, feasibility, consistency, accessibility, security, technical correctness, and job-market signal.
---

# MU Learning Asset Validator

Validate against the current Forge/COT v3 contract; do not reward polish that lacks learning value or production truth.

## Establish the baseline

Read `lms/docs/build/SOURCE_OF_TRUTH.md`, the active session brief, COT v3, scoring methodology, brand reference, LMS decisions/code/tests and the artifact's stated lifecycle. Compare revised Sessions 3-5 against the current brief, not the superseded root packages.

## Run the gates

1. **Authority:** current source order followed; no stale contract revived.
2. **Alignment:** every activity/item maps to an outcome and observable evidence.
3. **Authenticity:** students do a credible business task with meaningful choices.
4. **Demonstrability:** evidence opens, runs, can be traced, and can be explained.
5. **Feasibility:** 120 minutes, eight sections, staffing, network, free-tier credits and follow-up windows are realistic.
6. **Fairness:** prior coding skill, paid access, polish or subjective taste does not dominate.
7. **Assessment integrity:** deterministic keys are reproducible; AI grades are rubric-bound, provisional, evidence-citing, calibrated and reviewable.
8. **Consistency:** deck, brief, key, rubric, LMS fields, seed/setup and grader agree.
9. **Reliability:** model/network/queue/storage/vendor failures have an equivalent recovery path.
10. **Accessibility:** language, formats, color, keyboard/screen-reader use, captions and timing support the cohort.
11. **Privacy/security:** roster/section boundaries, secret/PII scrubbing, prompt-injection defense, safe URL/file handling and public/private evidence are correct.
12. **Data reproducibility:** provenance, snapshot, license/authorization, schema, checksum, size/token proof, generator and answer query agree.
13. **App evidence:** product scope is lawful/authorised, acceptance tests are observable, links and source-product claims are independently verified, and V1/V2 ownership is distinguishable.
14. **Workflow evidence:** diagram, blueprint (<current vendor limit), reconnection note, retries/idempotency/error paths, redacted run log, sample output, PNG and scenario-share/clone action agree.
15. **Career signal:** course-wide evidence covers all nine later streams without cosmetic variants or false affiliation.
16. **Maintainability:** volatile tools/limits are dated, isolated and scheduled for T-7 recheck.
17. **Production state:** Authored, Validated, Piloted, Loaded, Deployed and Rehearsed claims are supported separately.

## Test evidence

Require proportionate checks:

- dataset answer scripts/formulas and checksum reconciliation;
- grader fixture bands, same-input variance, injection attempts, low-confidence/escalation cases and human calibration;
- LMS unit/integration tests and browser journeys for every new state;
- visual render review of every final slide/document/page;
- gallery privacy and file/action behavior;
- idempotent setup/loading and Railway health/live-path verification before a deployment claim.

Classify findings as Blocker, Major or Minor. Cite the exact artifact/file/location, explain learner or delivery impact, and propose the smallest correction. End with PASS, PASS WITH CHANGES or FAIL plus a release checklist. Do not silently certify missing pilot, permission, deployment or rehearsal evidence.
