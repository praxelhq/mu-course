# Session 05 · Revenue systems with Make

**Course:** AI for Business: The Operating Stack  
**Duration:** 120 minutes  
**Lifecycle:** Authored — not yet validated, piloted, loaded, deployed, or rehearsed  
**Version:** 0.1.0 · 30 July 2026  
**Primary grade component:** Workflow relevance and usefulness (15%)  
**Also supplies evidence to:** Artifact quality (15%) and the Praxy-bound portfolio (25%)

**Projection master:** use the exported PDF in class. The editable PPTX is an instructor editing source and does not embed the course fonts.

## Session promise

By the end of the session, a student can turn a revenue or operating problem into a testable Make scenario, prove how it behaves on five failure classes, and package it so another person can understand and safely copy it.

The default bridge from Session 4 is a **Liinks-style link-in-bio micro-SaaS**. The instructor demonstrates a lead-intake and routing system for that product. If the final Session 4 product changes, replace the product nouns; keep the workflow contracts, fixtures, safety rules, and evidence gates.

## Non-negotiable learning sequence

1. Frame the business result and draw the first flowchart.
2. Submit the first flowchart for rubric-bound AI feedback.
3. Revise before opening Make.
4. Build and run the scenario.
5. test normal, duplicate, malformed, timeout, and approval-required cases.
6. Export a point-in-time blueprint, scrub the evidence, and package the gallery card.

Students do not receive credit for a visually impressive scenario that cannot explain what happens on a retry, duplicate, malformed input, or risky external action.

## Package map

| Asset | Audience | Purpose |
|---|---|---|
| `lesson-plan.md` | Instructor | Outcomes, evidence map, 120-minute run of show, gates, recovery |
| `deck-script.md` | Instructor / deck producer | Slide-by-slide copy, timing, speaker notes, visual direction |
| `instructor-guide.md` | Instructor | Setup, exact demo sequence, reveal boundaries, section calibration |
| `student-build-brief.md` | Student | Build challenge, constraints, success tests, submission instructions |
| `workflow-packs/01-gtm-lead-routing.md` | Both | Instant GTM workflow with validation, dedupe, scoring, and approval |
| `workflow-packs/02-operations-exception-handling.md` | Both | Stateful incident triage, retry, ownership, ageing, and escalation |
| `workflow-packs/03-revenue-reconciliation.md` | Both | Scheduled batch join, mismatch classification, and finance approval |
| `workflow-packs/preferred-instructor-build.md` | Instructor | One-hour, module-by-module classroom build |
| `templates/initial-flowchart-template.md` | Student | Problem-first design before Make |
| `templates/revised-flowchart-template.md` | Student | Repair plan after formative feedback |
| `assessment/ai-flowchart-feedback-rubric.md` | Evaluator / LMS | Formative AI rubric, response contract, safety fixtures |
| `assessment/final-grading-rubric-anchors.md` | Evaluator / instructor | Artifact and workflow scoring anchors |
| `assessment/surprise-quiz-student.md` | Student | Optional counted eight-item surprise quiz |
| `assessment/surprise-quiz-key.md` | Evaluator only | Key, rationales, distractor diagnoses, T-7 flags |
| `make-blueprint-and-sharing-checklist.md` | Both | Export/import/share distinctions and evidence checks |
| `fixtures/` | Both | Deterministic test inputs and expected results |
| `samples/` | Both | Redacted run log and sample-output evidence |
| `gallery-contract.md` | Product / LMS | PNG thumbnail, Clone and View output behavior |
| `safety-checklist.md` | Both | Secrets, PII, consent, unsafe actions, prompt injection |
| `accessibility-outage-fallback.md` | Instructor | Equivalent routes and an offline execution replay |
| `lms-manifest.yaml` | Product / engineering | Gates, fields, grading, feedback, resubmission, gallery behavior |
| `source-ledger.md` | Instructor / release reviewer | Current official Make claims and recheck dates |

## Release dependencies

- Recheck every vendor claim marked `T-7` within seven days of teaching.
- Load-test one section burst (up to 60 first-flowchart submissions); target feedback or an audited bypass within seven minutes, with no provider call in a request handler.
- Run all five fixtures through the actual instructor scenario and retain redacted evidence.
- Calibrate formative and final grader prompts on at least 12 examples, including prompt injection and low-confidence cases.
- Confirm the LMS supports staged flowchart feedback, a revised artifact, distinct blueprint/log/PNG fields, and the two gallery actions.
- Confirm the public scenario page and blueprint contain no company data, personal data, embedded credentials, private webhook URLs, or secret-bearing query strings.
- Rehearse both the live Make path and the outage replay with every section instructor.

## Authority

This package follows `lms/docs/build/SOURCE_OF_TRUTH.md`, `10_sessions_3_5_redesign_brief.md`, COT v3, the scoring methodology, current Forge constraints, and the delivered Praxel teaching references. It deliberately does not revive the superseded root Session 5 package.
