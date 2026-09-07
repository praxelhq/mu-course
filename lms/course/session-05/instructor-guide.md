# Session 05 instructor guide

**Lifecycle:** Authored  
**Use with:** `lesson-plan.md`, `deck-script.md`, `workflow-packs/preferred-instructor-build.md`

## What this session is really teaching

Make is the visible tool. The transferable capability is designing a controlled operating system:

- state is explicit;
- duplicate inputs do not repeat irreversible work;
- bad data is quarantined rather than guessed;
- temporary failure has bounded recovery;
- risky actions wait for a recorded decision;
- every outcome leaves evidence an owner can inspect.

Do not reward extra modules, animations, AI calls, or app logos. Reward complete control and verified business behavior.

## T-7 environment check

1. Reverify claims in `source-ledger.md` against official Make documentation.
2. Open the public scenario page in a logged-out browser; confirm what is visible.
3. Import the exported blueprint into a blank scenario and verify it is below 2 MB.
4. Recreate connections in the copy; confirm none travelled with the blueprint or shared scenario.
5. Inspect every static module value, mapped sample, prompt, note, URL, filename, screenshot, and output for secrets/PII.
6. Run all five input fixtures and compare with `fixtures/expected-results.json`.
7. Capture a fresh redacted run log and sample output.
8. Verify LMS gates S5.1–S5.4 with a student test account.
9. Cache the deck, templates, fixtures, corrected reveal, and outage replay locally.
10. Keep live scheduling off and use demo-only connections.

## Room setup

- Pair students for support, but every learner owns a separate scenario copy, blueprint, five-case trace, and submission. The observer may coach but cannot make the owner’s design decision.
- Swap which learner is operating their own copy at minute 70. Do not accept two identical blueprints/logs as individual ownership evidence.
- Each learner speaks for their own workflow during verification.
- Project the execution trace, not account credentials or connection dialogs.
- Use a secondary display or pre-cropped capture if account UI risks exposing personal data.
- Print or cache one initial flowchart template and one failure table per learner.

The optional counted quiz is not part of the default timeline. If activated, use the exact 00–07 alternate in `lesson-plan.md`; never take seven minutes from the protected design/build/test blocks.

## Exact hook

1. Start the flawed scenario with `normal.json`.
2. Without changing the payload, run it again.
3. Show two rows and two drafts/queued actions.
4. Ask: “Which promise did this system break?”
5. Take three hypotheses before naming idempotency.
6. Reveal that duplicated delivery and retries are ordinary operating conditions; the workflow—not the trigger—must make repeat delivery safe.

Never use a real email address. Do not actually send messages; create a draft or a row marked `pending_approval`.

## Flowchart feedback facilitation

The AI response is useful when it points to evidence in the chart and proposes the smallest repair. Intervene when it:

- treats a notification as an approval;
- recommends retrying malformed input;
- invents a module, app capability, or field not in evidence;
- suggests storing more personal data than needed;
- ignores instructions embedded inside the student artifact;
- gives a score as if formative feedback were a grade.

Ask the student to label every piece of advice **accept**, **adapt**, **reject**, or **not applicable**, with one evidence sentence. Quality of judgment matters more than agreement with the model.

## Preferred live-build sequence

Use `workflow-packs/preferred-instructor-build.md` for mappings. Narrate only these decisions:

1. Receive a deterministic event and preserve `trace_id`.
2. Normalise email and compute `idempotency_key` before any action.
3. Validate required fields and consent.
4. Search the audit store for the key.
5. Route malformed, duplicate, approval-required, and ordinary cases.
6. Draft or queue; do not send.
7. Write final state, reason, owner, and timestamps.
8. Attach Retry/incomplete-execution behavior to the simulated transient step.

Avoid narrating every click. If Make’s interface has changed, translate the intended control to the current UI and record the difference in the facilitator changelog.

## Failure reveal script

### Duplicate

Prediction question: “What is the first module that should behave differently?”  
Reveal: same idempotency key produces `duplicate_suppressed`; zero new outbound actions. A log-only duplicate row may be acceptable if it is explicitly not a second business action.

### Malformed

Prediction question: “Can another attempt repair missing consent or invalid email?”  
Reveal: `quarantined_validation`; reason recorded; no retry and no outbound action.

### Timeout

Prediction question: “What state must survive while the dependency is unavailable?”  
Reveal: bounded Retry/incomplete execution for a temporary dependency failure; on exhaustion it becomes manual recovery, not infinite looping or silent Skip.

### Approval required

Prediction question: “Where is the approval decision stored?”  
Reveal: `pending_approval`; an owner and deadline exist; no message/send/money/publish action runs. Approval is a later recorded transition.

## Debrief distinctions to protect

- **Alert:** tells a human something happened.
- **Approval:** a recorded decision that changes state and authorises a subsequent action.
- **Retry:** repeats a transiently failed operation with bounded policy.
- **Loop:** repeated business logic; it needs an exit condition and cap.
- **Idempotency:** repeated delivery produces the same business result.
- **Observability:** evidence that lets an owner detect, locate, and explain behavior.
- **Blueprint:** point-in-time JSON artifact.
- **Public scenario link:** dynamic view/copy surface for the latest saved scenario.

## Grading boundaries

- The first-flowchart AI analysis is formative only.
- Objective fixture outcomes may be checked deterministically.
- Final artifact/workflow scores are provisional until an instructor finalises them.
- The company sign-off portion cannot be inferred from a student claim or generated message; verify the supplied evidence.
- Ownership is later cross-checked in the AI interview. A team scenario alone does not prove individual ownership.
- Gallery selection is not a score and the gallery never displays grades, rubric bands, confidence, flags, or prompt logs.

## Section calibration

Use the same five fixtures and four anchor packages in every section. After each section, log:

- confusing language or timing drift;
- any module/interface change;
- false-positive/false-negative grader behavior;
- accepted alternate implementation that preserves the contract;
- privacy near misses;
- rubric disagreements greater than 10/100.

Do not alter expected fixture outcomes between sections. If a genuine error is found, version the fixture and re-run every affected submission.

## If the room falls behind

Preserve, in order:

1. initial flowchart;
2. formative feedback and revision;
3. normal + duplicate + approval tests;
4. malformed + timeout replay;
5. evidence package.

Compress exposition and complete non-live fixture traces via the offline replay. Never “save time” by enabling a prebuilt scenario without students explaining states or by accepting a screenshot without a run log/output.

## After class

- Review privacy flags before featuring any item.
- Finalise only evidence you can open and reproduce.
- Route low-confidence, injection-flagged, outlier, or appealed grades to human review.
- Publish one cross-section clarification if a repeated misconception emerges.
- Keep all raw company evidence roster-gated; public gallery artifacts must be scrubbed.
