# Session 05 lesson plan · Revenue systems with Make

**Version:** 0.1.0 · 30 July 2026  
**Lifecycle:** Authored  
**Expected time:** 120 minutes  
**Outcome IDs:** S5-O1 to S5-O5  
**Primary component:** Workflow relevance and usefulness (15%)

## Session promise

Turn one real startup problem into a safe, testable automation that another person can inspect, copy, and run with their own connections.

## Prerequisites

Students arrive with:

- their Session 4 product, target user, and Version 1 URL;
- a free Make account already opened and email verified;
- access to the roster-gated Session 5 materials;
- no live customer, company, payment, or personal data in the classroom scenario.

The instructor has:

- the preferred lead-routing scenario in a clean demo team;
- demo-only Google Sheet and Gmail/Slack substitute connections;
- all five fixtures loaded locally and in the LMS;
- one deliberately flawed flowchart and one corrected reveal;
- a saved blueprint exported after testing;
- a redacted run log and gallery-ready PNG;
- the offline replay printed or cached.

## Observable outcomes and evidence

| Outcome | Student can… | Exact evidence | Evaluation |
|---|---|---|---|
| S5-O1 · Frame | state the revenue/operating result, trigger, owner, and non-goal | `problemFrame` plus initial flowchart | Formative completeness check |
| S5-O2 · Design | represent states, validation, dedupe, branches, retries, approval, and terminal outcomes | `initialFlowchartFile`, AI feedback receipt, `revisedFlowchartFile` | Rubric-bound formative AI; no grade |
| S5-O3 · Build | produce an importable Make blueprint whose mappings match the declared contract | `blueprintFile` and optional `scenarioShareUrl` | Provisional AI extraction plus instructor finalisation |
| S5-O4 · Verify | show deterministic behavior for normal, duplicate, malformed, timeout, and approval-required cases | `runLogFile`, `sampleOutputFile`, `verificationNote` | Deterministic fixture comparison plus rubric |
| S5-O5 · Publish safely | package a readable PNG and copy/view actions without secrets, PII, grades, or prompt logs | `workflowPngFile`, privacy attestation, gallery preview | Privacy gate plus instructor feature control |

## Operator’s Loop

Students use the Operator’s Loop explicitly:

1. **Frame:** what measurable result should change?
2. **Break apart:** trigger, validate, decide, act, recover, observe.
3. **Match capability:** deterministic rules before optional AI enrichment.
4. **Pick the tool:** explain why Make is suitable for this cross-app, repeatable job.
5. **Execute and iterate:** build the smallest complete path, then add failure behavior.
6. **Verify:** replay five fixtures and inspect outputs, not just module bubbles.

## 120-minute run of show

| Time | Mode | Instructor move | Student work / evidence |
|---:|---|---|---|
| 00–05 | Arrival retrieval | Display five event cards in scrambled order: lead received, validated, duplicate found, approval requested, follow-up drafted. Ask: “Which event must never be allowed to happen twice?” | Order the events and write one irreversible action. No tools. |
| 05–12 | Consequential hook | Run the flawed scenario twice with the same lead. Reveal two outbound drafts and two CRM rows. Ask what failed: Make, the modules, or the design? | Predict the business consequence and name the missing control. |
| 12–20 | Concept + live proof | Teach the six-box workflow contract: trigger, contract, state, decision, action, evidence. Demonstrate an idempotency key and an approval state. | Mark the corresponding boxes on the template. |
| 20–35 | Build 1 · initial flowchart | Release the common GTM pack. Operations/revenue are preapproved follow-up extensions, not timed alternatives. Circulate; do not solve missing branches aloud. | Create the one-page Gate 1 core: start, contract, success, duplicate, invalid, approval, trace and owner. Advanced recovery/observability moves into revision. |
| 35–42 | Gate 1 · formative feedback | Students submit. Show the AI response shape: “blocking risks, missing states, smallest repair, questions.” Explain that the diagnostic score is not a grade. | Submit `problemFrame` + `initialFlowchartFile`; read feedback and flag any incorrect advice. |
| 42–52 | Repair | Confer with teams whose designs contain an unsafe action or unbounded loop. | Revise the flowchart; add a one-line change log for each accepted/rejected AI suggestion. |
| 52–62 | Instructor live build | Build the preferred lead-routing spine: webhook → normalize/validate → dedupe → router → queue/draft → audit row. Run the normal fixture only. | Map each module to a flowchart node; note any divergence. |
| 62–87 | Build 2 · guided scenario | Keep a visible checkpoint clock at 70, 78, and 87. Every learner clones the prewired starter or builds an own copy; pair coaching does not create a shared submission. | In an individually owned scenario, import/build, create own connections, change at least one contract/control mapping, turn scheduling **off**, and pass the normal fixture. |
| 87–101 | Failure gauntlet | Release the version-bound GTM duplicate/malformed/timeout/approval fixtures one at a time. Do not reveal expected results until teams commit predictions. | Predict, run/replay, record actual result, repair once. Every risky action remains draft/queued. |
| 101–111 | Evidence packaging | Demonstrate blueprint export, run-history redaction, and the distinction between public scenario link and blueprint. | Export JSON, create redacted run log/sample output, capture 16:9 or wide PNG, write limitation/change note. |
| 111–117 | Gate 2 · final submission | Run the privacy scanner/checklist before upload. Preview gallery card; explain instructor feature control. | Submit revised flowchart, blueprint, log, output, PNG, optional share URL, usefulness and ownership notes. |
| 117–120 | Reflection + bridge | Ask: “What would make you refuse to switch this on for a real company?” Bridge to later company sign-off and the AI interview. | Write one refusal condition and one next test. |

**Protected student work:** approximately 87 minutes. If time is lost, compress the hook, concept exposition, and instructor narration. Do not remove initial design, revision, failure testing, or evidence packaging.

### Counted surprise-quiz alternate

The default plan does not include the optional quiz bank. If the instructor activates `S5-SQ-v1`, run it unannounced at 00–07, omit the 00–05 retrieval, and run the duplicate hook in a compressed 07–12 block. Resume at the 12-minute concept block; every assessed build minute remains unchanged. Do not insert the quiz elsewhere or quietly shorten the flowchart, revision, failure gauntlet, or packaging time.

Show only `assessment/surprise-quiz-student.md`; keep the evaluator key off learner materials, previews, search and exports. Close attempts at 07:00 and show an attempt receipt only. Release scores, correct options, rationales and distractor feedback after the configured delivery window closes. When multiple sections share `S5-SQ-v1`, wait until the final participating section has closed.

## Instructor demo debrief

Ask in this order:

1. What event starts this system, and can it arrive twice?
2. Which fields are required before any external action?
3. What is the idempotency key, and when is it written?
4. Which branch is terminal? Which branch waits?
5. What gets retried, what gets quarantined, and what requires a human?
6. What would the owner look at tomorrow morning to know the system is healthy?
7. Which artifact proves behavior: diagram, blueprint, log, output, or all four?

## Checkpoints and likely misconceptions

| Checkpoint | Look for | Misconception | Recovery prompt |
|---|---|---|---|
| Initial chart | terminal states and owner labels | “The router is the error handling.” | “Where does a bundle go if no filter matches?” |
| AI feedback | student judgment, not blind acceptance | “The model approved it, so it is correct.” | “Show the exact node or contract field supporting that advice.” |
| Normal run | stable trace and idempotency key | “Run once passed, so it works.” | “What happens when the trigger delivers the same event again?” |
| Timeout | retry only for transient faults | “Retry every error forever.” | “Would another attempt change malformed input?” |
| Approval | no irreversible action before decision | “A Slack alert counts as approval.” | “Where is the state transition from pending to approved recorded?” |
| Gallery | safe, useful copy/view evidence | “No connections means no sensitive data.” | “Inspect static values, notes, mapped samples, URLs, and filenames.” |

## Differentiation

### Supported route

- Start from the preferred instructor blueprint or a provided module map.
- Use Google Sheets as the audit/dedupe store and “create draft” rather than “send”.
- Test with supplied fixtures only.
- Pair roles: navigator reads contract and test, driver maps modules; swap after normal run.

### Extension route

- Add a dead-letter queue, metrics row, or age-based escalation.
- Add a second safe notification channel.
- Demonstrate sequential processing only when the use case actually needs ordering.
- Extension cannot compensate for missing normal/duplicate/malformed/timeout/approval evidence and does not raise the core grade ceiling.

## Recovery paths

- **No Make access:** use the offline execution replay and submit the revised flowchart plus completed trace table. Finish blueprint within the published recovery window.
- **No external connections:** use webhook + Make built-in tools + local/mock outputs; record “connection unavailable” as a limitation.
- **Model unavailable:** instructor/peer uses the same formative rubric; student still records accepted/rejected advice.
- **Late or absent learner:** complete the 35-minute replay first, then the 45-minute starter build; same five tests, no reduced evidence bar.
- **Screen-reader / low-vision:** use the text-node flowchart form, data tables, and narrated execution trace; PNG has an equivalent text description.

## Instructor-only reveal boundary

Do not release before Gate 1:

- the corrected instructor flowchart;
- the expected-results manifest;
- the duplicate key expression;
- the exact timeout recovery;
- final quiz answers (keep these closed through the configured delivery window, even after Gate 1).

Students may see the normal fixture and its contract before Gate 1. The other four expected outcomes appear only after prediction.

## LMS gates and resubmission

- **Gate S5.1 — Design:** initial flowchart submission opens at session start and closes at minute 42. It is formative and versioned.
- **Gate S5.2 — Feedback:** revised-flowchart form opens after a feedback record exists or the instructor applies an outage bypass.
- **Gate S5.3 — Build evidence:** final workflow form opens after a revised flowchart is submitted. One repair resubmission is allowed within 24 hours after provisional feedback; history remains visible to the student and instructor.
- **Gate S5.4 — Gallery:** only the latest finalised, privacy-cleared version with active learner consent and instructor curation is eligible. Publishing requires the PNG and redacted sample-output file. An official Make public-scenario URL may add a clone action; if it is missing or unsafe, withhold only that action. Raw blueprint JSON remains private evidence and is never a gallery fallback.
- **Later company gate:** real-company sign-off is collected/finalised later. Absence at Session 5 is not fabricated; it remains `pending`.

Exact fields and implementation deltas are in `lms-manifest.yaml`.

## After class

Within 24 hours, students repair one grader-identified weakness, rerun the affected fixture, and submit a change note. Before the company demo, they replace classroom fixtures with minimum necessary authorised data, obtain company approval for any irreversible action, and run a privacy review. The portfolio card may show the workflow, sample output, and validation—not grades, model confidence, prompt logs, credentials, or private company data.

## Multi-section calibration

Before the first section, graders score the same four anchor packages. After every two sections, instructors compare:

- whether “timeout” evidence actually demonstrates retry/incomplete execution;
- whether duplicate prevention happens before the irreversible step;
- whether an alert is being mistaken for an approval;
- whether gallery links expose mapped samples or notes;
- any score spread greater than 10 points on the same anchor.

Record changes once in the shared facilitator changelog; do not silently change expectations between sections.
