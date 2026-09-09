# Session 05 Lesson Plan — Make the System Act

**Studio:** Systems Studio, execution layer  
**Duration:** 120 minutes live + 30–45 minutes asynchronous hardening  
**Primary capabilities:** C5, C8; reinforces C4 and the Evidence Rail  
**Canonical outcome IDs:** L05-O1–L05-O6  
**Common simulator shell:** Prototype Execution Layer / Workflow Control Room  
**Portfolio contribution:** Controlled execution layer attached to the Session 4 method layer  
**Status:** Build-ready lesson-plan contract; vendor, credentials, and staffing remain delivery configuration

## Session promise

> Turn the method you packaged in Session 4 into a controlled execution layer that responds to an event, performs bounded work, asks for approval when consequences matter, records what happened, and recovers from an exception.

The session is not a tour of automation canvases. Students learn that a reliable operating system includes boring but essential control: validation, state, permissions, deterministic branches, human approval, idempotency, logs, and recovery.

## Shared mechanism

**The Controlled Execution Contract:**

`Trigger → Validate → Enrich/decide → Human gate → Act → Log → Recover`

At every step, students label ownership as:

- **D:** deterministic rule or calculation;
- **M:** model judgment;
- **H:** accountable human decision;
- **X:** external system action.

The design is successful when the happy path completes and the unsafe/invalid path stops predictably.

## Assumptions and boundaries

- Students bring a Session 4 method layer that passed normal, messy, non-trigger, and hidden-change tests.
- The golden path is an LMS-native or centrally managed workflow sandbox with pre-authorized simulated services. A vendor workflow builder is optional delivery configuration.
- No student may connect personal email, production CRM, employer systems, payment instruments, or unrestricted social publishing in class.
- External actions target a sandbox inbox, synthetic CRM, mock approval queue, or course webhook.
- The workflow is a prototype execution layer, not production automation. Consequential communication or decisions require an explicit human gate.
- Exact class staffing is unresolved. The runbook works with one lead plus dashboard-driven exception handling; additional facilitators improve floor support but do not change the assessment.

## Prerequisites

### Student pre-work, maximum 25 minutes

1. Freeze the Session 4 method package and add its repository/LMS version ID.
2. Draft one sample event payload that should trigger it.
3. Identify:
   - the system or person that creates the event;
   - the decision owner;
   - the first reversible action;
   - one action that must never happen without approval;
   - one likely failure.
4. Complete the retrieval check on trigger versus schedule, deterministic versus model work, and human authority.

### Readiness gate

The execution builder unlocks when the student submits:

> “When **[event]** arrives, validate **[fields]**, apply method **[version]**, ask **[human role]** before **[consequential action]**, log **[evidence]**, and recover by **[fallback]**.”

If the student's method layer is incomplete, they use the same curated stream method from Session 4. No one starts a new unrelated workflow.

## Materials

### Student-facing

- frozen Session 4 method package and test report;
- Controlled Execution canvas and D/M/H/X allocation cards;
- starter workflow/state-machine shell;
- versioned event schema and sample payload;
- sandbox destination and human approval queue;
- run-log viewer;
- normal, malformed, duplicate, low-confidence/policy-exception, and service-timeout events;
- owner runbook and failure-log templates;
- printed flow cards and event envelopes for no-network mode.

### Instructor-facing

- live demo workflow with safe sandbox action;
- state diagram and run traces for success, duplicate event, and policy exception;
- stream case packs and Finance subvariants;
- injection console or sealed event deck;
- validator anchors and facilitator incident dashboard;
- cached screenshots/video plus precomputed logs;
- golden, brittle, unsafe, and over-engineered examples.

## Measurable outcomes

By minute 120, each learner will:

| ID | Observable outcome | Required evidence |
| --- | --- | --- |
| S5-O1 | Map a role-authentic event into states, actions, owners, and boundaries | versioned D/M/H/X execution map |
| S5-O2 | Connect the Session 4 method to a triggered or replayable execution layer | workflow/state-machine export linked to method version |
| S5-O3 | Complete one normal run with structured input, output, approval, action, and log | immutable happy-path run trace |
| S5-O4 | Stop or safely route one invalid/unsafe event | failure-injection trace and approval/escalation evidence |
| S5-O5 | Recover from a duplicate, timeout, or changed policy without duplicating a consequential action | repair, replay, and before/after logs |
| S5-O6 | Explain why each important step is D, M, H, or X | 60-second boundary defence or written equivalent |

## Success and ownership evidence

### Artifact success

The execution layer:

- accepts the defined event and validates required fields;
- invokes the correct Session 4 method version;
- uses deterministic logic for stable rules/calculations;
- requests approval before the defined consequential action;
- completes a safe sandbox action on approval;
- records inputs, state transitions, decision/output, approver, action status, and error class;
- stops, retries, or escalates on the injected failure;
- prevents duplicate consequential action when the same event repeats.

### Student ownership

The learner must:

- predict the path before execution;
- label and defend D/M/H/X allocation;
- locate a failure in input, method, orchestration, permission, external service, or human gate;
- change the smallest relevant layer;
- replay the event and point to log evidence;
- state where accountable human judgment remains.

## Minute-by-minute run of show

**Protected student build/test time: 79 minutes (29–108).**

| Time | Mode | Activity | Outcome / LMS evidence |
| --- | --- | --- | --- |
| 0–5 | Retrieval | Classify six steps as D, M, H, or X | entry item data; S5-O1 |
| 5–9 | Pair correction | Resolve one disputed classification | misconception tag |
| 9–17 | Hook/demo | A trigger completes useful work, then a duplicate/policy exception safely stops | observation and prediction |
| 17–23 | Open mechanism | Reveal the Controlled Execution Contract, state, idempotency, and human gate | S5-O1 |
| 23–29 | Commit | Submit expected happy path, stop condition, failure, confidence, and prohibited action | immutable prediction gate |
| 29–41 | Guided map | Map event fields, states, D/M/H/X owners, and completion condition | checkpoint A; S5-O1 |
| 41–54 | Guided build | Connect trigger → validation → Session 4 method → approval → sandbox action → log | checkpoint B; S5-O2 |
| 54–64 | Normal run | Run known event; inspect every state and correct one issue | happy-path trace; S5-O3 |
| 64–73 | Boundary run | Reject a malformed or out-of-policy event; verify no action occurred | stop trace; S5-O4 |
| 73–83 | Human-gate test | Exchange approval role with a peer; approve, edit, or reject using evidence | approval log; S5-O3/S5-O6 |
| 83–91 | Failure injection | LMS assigns duplicate, timeout, low confidence, or policy-change event | injected trace; S5-O4/S5-O5 |
| 91–101 | Diagnose and repair | Classify layer, change validation/branch/retry/gate, and document why | revision diff; S5-O5 |
| 101–108 | Replay | Rerun the same event; compare logs and prove no duplicate/unsafe action | recovery trace; S5-O5 |
| 108–114 | Proof capture | Freeze map/export, method version, three runs, human boundary, and runbook | execution-layer submission |
| 114–118 | Defence sample | All answer; sampled learners explain one D/M/H/X allocation | S5-O6 / audit queue |
| 118–120 | Exit bridge | Name the best surface for a fresh user/operator in Session 6 | form-selection hypothesis |

## Instructor demo script — “Autonomy is not the same as control”

**Duration:** 8 minutes. Use a synthetic Sales account-follow-up event because the risk of an unsupported auto-send is obvious across streams.

### Demo assets

- a synthetic CRM event containing verified account facts, a buyer objection, and an unsupported AI-suggested product claim;
- Session 4 `Evidence-Grounded Next Action` method;
- sandbox approval inbox and mock CRM;
- duplicate event and product-policy exception;
- visible run-log panel.

### Script

1. **Predict the path (45 sec):** Show the event and ask which step can be deterministic, which needs model judgment, and who must approve the external message.
2. **Run the happy path (75 sec):** Trigger arrives, required fields validate, method proposes “re-stage and ask security question,” seller approves an edited task, mock CRM records it, log closes.
3. **Open the state trace (60 sec):** Point to event ID, method version, model output, approval change, external action ID, and completion state.
4. **Replay duplicate (60 sec):** The same event arrives. Idempotency check returns `already_processed`; no second task/message is created.
5. **Inject policy exception (75 sec):** A product claim cannot be supported by approved sources. The system routes to `needs_product_review`; it does not ask the model to make the claim sound safer.
6. **Show the brittle alternative (60 sec):** A one-node “AI agent handles lead” workflow auto-sends. Ask students to name the absent controls.
7. **Repair one layer (60 sec):** Add/adjust the policy-validation branch and rerun; do not rewrite the Session 4 method.
8. **Close (60 sec):** State: “A good execution layer makes responsibility visible. It can act quickly on reversible work and stop reliably at the boundary.”

If the live system is slow, play the cached state transitions while opening the precomputed logs. The lesson objective is control and diagnosis, not latency spectacle.

## Student task brief

### Role

You own the operating process around the method packaged in Session 4. Your system must respond to a defined event and move one bounded unit of work to a safe, observable conclusion.

### Build

Create **Prototype Execution Layer v1** with:

1. event source and versioned event schema;
2. required-field and policy validation;
3. explicit state map and terminal states;
4. D/M/H/X allocation for every step;
5. call to the frozen Session 4 method layer;
6. branch for low confidence, missing evidence, or policy exception;
7. human approval before a consequential external action;
8. safe sandbox action;
9. event/run log with method version and result;
10. duplicate-event control;
11. retry, fallback, or escalation for one service failure;
12. one-page owner runbook.

### Definition of done

- A normal event reaches a completed state and leaves a trace.
- An invalid or unsafe event reaches a stopped/escalated state and performs no prohibited action.
- Replaying a duplicate does not repeat the consequential action.
- A peer can locate the approval and understand what they own.
- The student repairs and replays an injected failure with evidence.

## Nine stream variants

| Stream | Event and execution job | D/M/H/X design | Mandatory stop/failure | 30% stream judgment anchor |
| --- | --- | --- | --- | --- |
| Consulting | new client process incident → apply intervention-framer → create pilot-review task | D validate baseline; M classify issue/options; H partner/client approval; X mock project tracker | invalid source or CFO rejects benefit assumption | implementation sequence, measurable pilot, and client authority remain credible |
| FOCOS | new weekly operating pack → prioritize items → owner/escalation tasks | D deadline/dependency checks; M synthesize conflicts; H CEO/CoS priority; X mock owner board | protected initiative or missing owner; never auto-commit budget | explicit deprioritization, owner, cadence, and unresolved-risk trail |
| Product Management | new user-session incident → release evidence review → issue/fallback decision | D event/threshold checks; M classify failure; H PM/trust owner release; X mock backlog/status | unsafe response or missing task telemetry | user outcome and release trade-off, not feature output |
| Finance | see three subvariants below | D calculations/source checks; M narrative exception; H deal/IC/CFO decision; X mock review queue | unsupported material number, wrong period, or changed disclosure | traceability, scenario impact, and accountable approval |
| HR | new workforce/policy request → safeguard method → manager/HR review queue | D data minimization/prohibited fields; M interpret policy or pattern; H HR decision/appeal; X case queue | PII/proxy bias/high-impact ranking | dignity, fairness evidence, human review, and appeal |
| Supply Chain & Operations | delayed/stockout event → priority method → planner task | D SLA/capacity/duplicate; M summarize exception; H planner override; X mock control tower | duplicate event plus supplier timeout | service/cost/safety trade-off and operator recovery |
| Sales | CRM/buyer signal → next-action method → approved CRM task/message draft | D stage/source/opt-out; M interpret signals; H seller approval; X mock CRM/inbox | unsupported claim, stale CRM, or auto-send | discovery evidence, qualification discipline, and relationship boundary |
| Marketing | approved brief/asset event → claim-check method → review/test queue | D locked brand/claim fields; M assess strategic fit; H brand/legal approval; X mock experiment board | unsupported claim or brand violation | insight-to-execution trace and valid experiment hypothesis |
| Data | new data/metric anomaly → validity method → decision-owner alert | D schema/tests/thresholds; M explain likely drivers; H data owner release; X dashboard/incident queue | leakage, metric definition change, or failed data test | lineage, validity, uncertainty, and decision safety |

### Finance subvariants

| Finance path | Trigger and controlled action | Failure injection | Human boundary and stream proof |
| --- | --- | --- | --- |
| Investment Banking | new data-room filing → extract/reconcile → create deal-team exception and model-review task | duplicated filing plus changed working-capital/covenant term | senior deal team approves any model or client-material change; trace filing → normalized field → task |
| Venture Capital | new diligence evidence → rescore open questions → create IC review note/task | unsupported retention claim or conflicting founder/third-party data | investor decides advance/hold/pass; system surfaces disconfirming evidence, never solicits investment |
| Corporate Finance | new forecast/actual or capital request → scenario review → route approval/revision task | cost-of-capital/demand assumption changes or source is stale | CFO/budget owner authorizes allocation; system logs scenario and downside, not one magic answer |

## Checkpoints and feedback

| Checkpoint | Deterministic checks | Rubric-bound coaching | Human review |
| --- | --- | --- | --- |
| A — execution map | event/schema, states, terminal states, D/M/H/X labels | realism and tool restraint | prohibited high-impact action |
| B — connected build | method version, validation, approval, sandbox action, log fields | business boundary and missing branches | credentials/PII concern |
| C — normal run | states reached, approval recorded, one action, completion log | output usefulness | model/validator dispute |
| D — failure/replay | no prohibited/duplicate action, error classified, retry/stop/escalate | quality of repair | flags, borderlines, stratified audit |
| E — owner runbook | trigger, owner, approval, recovery, shutdown | operator clarity | accessibility exception |

## Rubric link and lesson scoring

Use the [common rubric dimensions](../../course/course-1-architecture-v2.md#common-rubric-dimensions) and [stream anchors](../../course/stream-coverage-matrix.md#detailed-stream-cards).

### Common 70%

- 10% event/problem and value boundary;
- 10% valid inputs and evidence linkage;
- 20% D/M/H/X system design and method connection;
- 20% execution reliability, approval, logs, and recovery;
- 10% provenance, safety, and ownership.

### Stream 30%

Apply the professional judgment anchor in the variant table. Finance uses the selected IB, VC, or Corporate Finance row. A complex workflow receives no bonus over a simple controlled one.

## Common misconceptions and facilitator moves

| Misconception | Symptom | Facilitator move |
| --- | --- | --- |
| “Workflow means many nodes” | complexity without a bounded outcome | ask for one event, one unit of work, and one terminal state |
| “AI should do deterministic work” | model calculates stable thresholds/IDs | move arithmetic, schema, and exact rules to D steps |
| “Human in the loop means a label” | approval node has no owner or information | require named role, approve/edit/reject choices, and logged rationale |
| “Retry fixes everything” | repeated unsafe/invalid calls | distinguish retryable timeout from invalid input/policy stop |
| “Happy path proves deployment” | only one prepared run exists | inject duplicate and policy/service failure |
| “Logs are debugging clutter” | no evidence of state/action | make run trace part of Definition of Done |
| “More autonomy is more advanced” | external message/action has no gate | score controllability and authority, not autonomy |

## LMS and simulator interactions

### State sequence

1. `execution_brief_opened`
2. `path_prediction_committed`
3. `allocation_map_submitted`
4. `execution_checkpoint_saved`
5. `normal_event_run`
6. `approval_requested`
7. `approval_decided`
8. `sandbox_action_completed`
9. `failure_event_injected`
10. `failure_classified`
11. `recovery_revision_submitted`
12. `event_replayed`
13. `execution_layer_frozen`
14. `human_boundary_defended`

### Unlock rules

- builder unlocks after prediction and D/M/H/X map;
- normal run unlocks after event validation, terminal states, and a human gate exist;
- injection unlocks after one complete trace;
- evidence freeze requires normal, stopped, and recovered/replayed traces;
- no AI holistic score controls progression;
- platform incident flags pause attempts and permit facilitator relief.

### Facilitator heat map

Surface missing event fields, model-used-for-rule warnings, absent approvers, actions without approvals, duplicate actions, unclassified errors, retry storms, missing logs, and infrastructure incidents. Do not compare students on node count or run speed.

## Starter assets specification

1. `execution-map.md` — event, states, D/M/H/X allocation, terminals.
2. `event-schema.json` and five event fixtures.
3. workflow/state-machine starter with empty method connector.
4. sandbox webhook/inbox/CRM/project-board adapter.
5. approval card with approve/edit/reject and rationale.
6. `run-log-schema.json` and log viewer.
7. idempotency/duplicate-event component.
8. retry/fallback/escalation templates.
9. `owner-runbook.md` — start, monitor, approve, recover, stop.
10. stream and Finance subvariant packs.
11. precomputed success/failure logs for fallback.
12. golden, brittle, unsafe, and over-engineered anchors.

## Failure and no-network recovery

| Failure | Recovery that preserves the outcome |
| --- | --- |
| Workflow/model service unavailable | run against the LMS state-machine emulator and cached method outputs |
| Connector unavailable | substitute the mock webhook/inbox/CRM; grade state/action evidence, not vendor connection |
| LMS unavailable | route printed event cards through student role stations for D, M, H, and X; use paper run log and sealed failure event |
| Credentials invalid | move to centrally managed sandbox; never troubleshoot personal production credentials in the build window |
| Model variance | validate required properties and boundaries; retain one frozen output for branch testing |
| Duplicate caused by platform defect | mark incident, reset execution ID, and exclude affected attempt from learning score |
| Student method layer broken | use last frozen passing version or curated stream method; record dependency defect for async repair |
| Approval peer absent | facilitator/LMS approval persona uses a structured approve/edit/reject card |

The low-tech workflow is a physical state machine: event envelope → validator → method output card → human approver → mock external action → written log. Duplicate and outage cards still test idempotency, boundaries, and recovery.

## Accessibility and differentiation

### Accessibility

- every canvas node/state has a list/table alternative that preserves reading order;
- workflow can be built and run by keyboard;
- state and error use text/icon in addition to color;
- logs have screen-reader-friendly table and downloadable text;
- approval can be written rather than spoken;
- timers support pause/extension accommodations;
- no phone, voice, public message, or drag-only action is required;
- motion/animation can be disabled.

### Novice support

- a five-state starter: received, validated, awaiting approval, completed, stopped;
- sample schema and one prewired mock action;
- branch sentence stems: “If…, then…, because…, owner…”;
- visual D/M/H/X cards and a one-at-a-time hint ladder;
- curated event pack when the student's open project is not ready.

### Advanced lane

- add typed payload validation, idempotency key, or dead-letter queue;
- implement observable cost/latency bands;
- add least-privilege permission scopes;
- test two model versions behind the same method contract.

Advanced complexity is only credited when it improves a common criterion and passes the same failure evidence bar.

## Facilitator preparation and calibration

### 48–72 hours before class

1. Freeze and test workflow sandbox, mock services, rate limits, credentials, and fallback emulator.
2. Run every stream's normal and injected event, including all Finance variants.
3. Confirm actions cannot reach real external recipients or production systems.
4. Verify duplicate-event, approval, log, timeout, and stop validators.
5. Print state cards, event fixtures, run logs, and failure envelopes.
6. Prepare golden, brittle, unsafe, and over-engineered anchors.
7. Test keyboard/list alternative and captions/transcript.

### Calibration huddle

- score the same map/run using the 70/30 rubric;
- agree that a correct stop can outperform an autonomous unsafe completion;
- rehearse model outage, connector outage, invalid credential, duplicate platform defect, and prohibited action;
- distinguish learner error from infrastructure incident before gates or grades;
- agree escalation threshold for HR/Finance/Sales/Operations safety boundaries.

### Instructor/facilitator questions

- “What exactly is the event?”
- “Which fields can be validated without a model?”
- “What can be safely reversed?”
- “What information does the approver need?”
- “What prevents a duplicate action?”
- “Where will the operator see the failure?”
- “Which log entry proves your repair?”

## Async follow-up

**Due before Session 6; expected time: 30–45 minutes.**

1. Repair any unresolved Session 4 dependency.
2. Add one second failure case appropriate to the stream.
3. Rerun normal, duplicate, and failure cases; attach traces.
4. Finish the one-page owner runbook.
5. Draft three acceptance tests for the full prototype:
   - core task success;
   - safe failure/stop;
   - observable evidence/log.
6. Use the form-selection worksheet to nominate an app, workflow, grounded assistant, dashboard/model, or data surface for Session 6.
7. Export a local replay package and commit the execution layer.

The delayed retrieval check presents a branch diagram, a retry-versus-stop decision, an unlabeled approval, and an incomplete log. Students diagnose each using the Controlled Execution Contract.

## Exit criteria and bridge to Session 6

Session 5 is complete when the same Session 4 method is reachable through a controlled event path, a normal run completes, an unsafe/invalid run stops, a failure is repaired and replayed, and the human authority is inspectable. Session 6 does not add an arbitrary website. Students choose the smallest role-authentic surface that lets a fresh tester use or inspect this operating prototype and produces evidence of task success and safe failure.
