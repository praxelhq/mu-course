# Session 06 Lesson Plan — Ship the Right Prototype

**Studio:** Operating Prototype Studio, prototype v1  
**Duration:** 120 minutes live + 45–60 minutes asynchronous hardening  
**Primary capabilities:** C6, C8; integrates C1–C5 and the Evidence Rail  
**Canonical outcome IDs:** L06-O1–L06-O6  
**Common simulator shell:** Role-Authentic Prototype and Task-Attempt Lab  
**Portfolio contribution:** Deployed or replayable AI operating prototype v1  
**Status:** Build-ready lesson-plan contract; exact shell/tool selection and hosting remain delivery configuration

## Session promise

> Choose and ship the smallest prototype form that authentically represents the target role, lets a fresh assigned tester complete one core task, produces inspectable evidence, and fails safely.

An app is not automatically more valuable than a workflow, assistant, dashboard/model, or data surface. Students are judged on fitness for the work, a narrow acceptance contract, role-authentic task evidence, observability, and control—not on visual polish or code volume.

## Shared mechanism

**Form Follows Work:**

`Role job → User/decision owner → Core task → Acceptance tests → Smallest surface → Instrumented/replayable run → Safe failure`

Use the form-selection rule:

| Work need | Prefer this surface |
| --- | --- |
| A person must enter information, inspect a result, or choose an action | narrow app/form/interface |
| An event should move work between systems and people | workflow/control flow |
| A person asks evidence-grounded questions or drafts within boundaries | grounded assistant |
| A decision owner needs to compare metrics/scenarios and act | dashboard/model |
| The main value is reliable transformation, quality, or alerting | data surface/pipeline |
| Several are necessary | supported combination, but only one core task is assessed |

## Assumptions and boundaries

- Session 4's method layer and Session 5's execution layer form the prototype's operating core. Students may simplify or replay the execution if their chosen role surface is not an event-driven UI.
- Supported shells include a narrow app, workflow interface, grounded assistant, dashboard/model, and data surface. Exact vendors are replaceable.
- “Deployed” means reachable in a course sandbox or public-safe environment; “replayable” means a fresh tester can run the supplied input through a deterministic, notebook, workbook, workflow, or recorded execution package and inspect the result.
- One fresh assigned task attempt occurs in class. Session 7 supplies the full three-to-five-attempt exchange.
- External users, production company access, public hosting, and paid tools are not required and confer no grading advantage.
- No sensitive data, high-impact autonomous decision, real financial advice, unauthorized likeness, production credential, or external auto-send is permitted.
- Exact staffing remains open. The plan relies on deterministic gates and paired testing; extra facilitators focus on safety, incidents, and accessibility support.

## Prerequisites

### Student pre-work, maximum 30 minutes

1. Bring the frozen Session 4 method version and Session 5 execution/replay package.
2. Complete the form-selection worksheet.
3. Draft three acceptance tests:
   - **core success:** a fresh role-card tester completes one task;
   - **safe failure:** invalid/unsafe input stops or escalates;
   - **observability:** the attempt leaves a required event/log/result.
4. Prepare one normal and one invalid input without confidential or personal data.
5. Complete the retrieval check on form choice, task telemetry, replayability, and human boundary.

### Readiness gate

The builder unlocks when the learner can state:

> “A **[role/user]** uses this **[surface]** to **[complete one core task]** so that **[decision/outcome]** improves. Success is **[observable event/result]**; the system must stop when **[condition]**.”

Students who cannot pass the gate use a curated stream shell with their existing method/execution layer or the course's equivalent fallback package.

## Materials

### Student-facing

- form-selection worksheet and six prototype shell cards;
- app/form, workflow, assistant, dashboard/model, and data-surface starters;
- connector/adaptor for the Session 4 method and Session 5 execution layer;
- acceptance-test template;
- synthetic/course input pack and invalid-input fixture;
- event/log schema and telemetry/replay viewer;
- assigned tester role card and observation sheet;
- deployment/replay checklist, accessibility checklist, disclosure, and proof-capture template;
- local/offline shell packages.

### Instructor-facing

- same work job rendered in five surfaces for the hook;
- one live thin-prototype build with a normal and unsafe test;
- golden examples for all nine streams and Finance subvariants;
- shell health/status dashboard and fallback screenshots;
- deterministic validators for route/replay, core task, failure state, events/logs, secrets/PII, and accessibility basics;
- cross-stream tester assignment rules;
- printed paper/clickable equivalents and facilitator event log.

## Measurable outcomes

By minute 120, each learner will:

| ID | Observable outcome | Required evidence |
| --- | --- | --- |
| S6-O1 | Select and justify the smallest role-authentic prototype form | form-selection decision linked to role job, user, and non-goals |
| S6-O2 | Write observable acceptance tests before building | committed success, safe-failure, and observability tests |
| S6-O3 | Integrate or replay the Session 4 method and Session 5 execution layer through the selected surface | deployed URL or replay package with version links |
| S6-O4 | Allow a fresh assigned tester to complete the core task without author operation | independent task-attempt trace and observation |
| S6-O5 | Demonstrate a safe response to invalid, unsafe, or out-of-scope input | failure-state trace with no prohibited action |
| S6-O6 | Instrument/log the core attempt and identify one evidence-led change | required event/log plus v1 release note |

## Success and ownership evidence

### Artifact success

The prototype:

- represents a plausible unit of work in the selected role;
- exposes one core task that completes in under three minutes;
- uses or explicitly replays the versioned method/execution layers;
- passes the committed normal acceptance test;
- leaves an observable result/event/log;
- shows a clear human owner and next action;
- handles the invalid/unsafe test without a prohibited action;
- is reachable or replayable by a fresh tester;
- uses public/synthetic inputs and carries the educational-project disclosure where visible.

### Student ownership

The learner must:

- commit acceptance tests and predicted tester path before building;
- justify surface choice against at least one rejected form;
- let a fresh assigned peer operate the core task without author clicks or whispered instructions;
- locate the tester's failure in interface, input, method, orchestration, permission, or evidence;
- make one small revision or record a justified hold decision;
- explain the human boundary and point to the log/test proving it.

## Minute-by-minute run of show

**Protected student build/test time: 81 minutes (27–108).**

| Time | Mode | Activity | Outcome / LMS evidence |
| --- | --- | --- | --- |
| 0–5 | Retrieval | Match five work jobs to prototype forms; reject one seductive but wrong app | entry responses; S6-O1 |
| 5–10 | Hook | See the same exception-priority job as app, workflow, assistant, dashboard, and data surface | prediction vote |
| 10–17 | Demo | Instructor turns acceptance tests into one thin, instrumented/replayable prototype and runs safe failure | observation |
| 17–22 | Open mechanism | Form Follows Work; explain replayability, task evidence, and no-polish rule | S6-O1/S6-O2 |
| 22–27 | Commit | Submit selected/rejected form, core task, three acceptance tests, predicted tester path, confidence | immutable gate |
| 27–39 | Guided build 1 | Start selected shell; connect method version and execution/replay input/output | checkpoint A; S6-O3 |
| 39–52 | Guided build 2 | Implement the narrow core path and human decision/next action | checkpoint B; S6-O3 |
| 52–62 | Instrument/replay | Add required start/result/failure/approval event or structured run log | checkpoint C; S6-O6 |
| 62–70 | Self-test | Run normal input; repair until required properties pass | author trace; S6-O3 |
| 70–78 | Safe-failure test | Run invalid/unsafe input; verify stop/escalate/fallback and no prohibited action | failure trace; S6-O5 |
| 78–83 | Freeze for test | Publish sandbox version or freeze replay package; no further author explanation | test version ID |
| 83–94 | Fresh assigned attempt | LMS gives the tester the section-salted H01 card, hidden from the author; this counts as task-exchange assignment 1 of 3; tester completes task and submits observation | independent held-out trace; S6-O4 |
| 94–98 | Diagnose | Author sees completed observation, classifies the issue and chooses repair or evidence-based hold | issue/release decision; S6-O6 |
| 98–108 | Revision/retest | Make the smallest bounded change and rerun the affected/equivalent test; if safe repair is larger, freeze an exact patch/test specification and hold release | before/after v1 diff/test or held release receipt |
| 108–114 | Proof capture | Freeze URL/replay, screenshots only as secondary evidence, logs, tests, disclosure, and release note | prototype v1 submission |
| 114–118 | Defence sample | All answer; sample explains chosen form, rejected form, and safe boundary | S6-O1/S6-O5 / audit queue |
| 118–120 | Session 7 bridge | LMS schedules full task-attempt exchange and assigns input-pack deadline | tester readiness |

## Instructor demo script — “A website is not the default answer”

**Duration:** 7 minutes. Use the synthetic Operations job: prioritize a delayed-shipment exception while protecting service, cost, and safety guardrails.

### Demo assets

- one shipment-event fixture and one malformed/duplicate event;
- Session 4 `Exception Priority Assessor` method;
- Session 5 controlled execution/replay;
- five prebuilt surface thumbnails;
- one minimal operator form/control-tower card with event logging.

### Script

1. **Show five forms (60 sec):** app form, background workflow, grounded assistant, dashboard/model, and data-alert surface. Ask: “Who must do what next?”
2. **Reject two forms (45 sec):** A chat assistant is weak when the operator needs a constrained approve/edit/escalate decision; a full dashboard is excessive for one exception.
3. **State acceptance tests first (60 sec):** normal shipment returns priority/reason/owner; safety flag forces planner escalation; every attempt logs start/result/approval.
4. **Open the thin shell (60 sec):** Show only input, evidence/result, and human action. Point to the method/execution version rather than reimplementing it.
5. **Run the normal task (75 sec):** Enter fixture, inspect result, approve planner task, and open the structured event trace.
6. **Run invalid/duplicate task (60 sec):** System stops with an actionable reason and does not create a duplicate task.
7. **Change one requirement (45 sec):** Accessibility constraint requires the status not to rely on color; add text/state label and rerun the acceptance check.
8. **Close (30 sec):** “Ship the smallest surface that makes work and evidence usable. Session 7 will attack it with more people.”

If the live shell fails, use the clickable fallback and facilitator-run event ledger. Do not spend the build window debugging hosting.

## Student task brief

### Role

You are shipping an independent educational prototype representing work in your target role. A fresh assigned tester receives a role card and input pack. They must be able to complete one core task and know what decision or next action follows.

### Build

Create **AI Operating Prototype v1** as one of:

- narrow app/form/interface;
- workflow/control surface;
- grounded assistant;
- dashboard/model;
- data surface/pipeline;
- supported combination with one assessed core task.

Include:

1. target role/user, core task, decision owner, and non-goals;
2. committed acceptance tests;
3. version link to Session 4 method and Session 5 execution/replay layer;
4. normal input path;
5. invalid/unsafe input state;
6. human action, approval, or escalation;
7. observable event/log/result;
8. public/synthetic data label and educational-project disclosure;
9. accessible labels/instructions/error recovery;
10. release note with known limitation and next test.

### Definition of done

- A fresh assigned tester completes the task in under three minutes without the author operating it.
- The normal test and safe-failure test pass.
- The attempt leaves the committed evidence.
- The author can explain why the selected form is better than one plausible alternative.
- The release note cites observed evidence rather than preference.

## Prototype-form guardrails

| Form | Minimum evidence | Common trap |
| --- | --- | --- |
| App/form | usable core path, error state, event/log, decision/next action | polished landing page with no operating job |
| Workflow | trigger/replay, branch, approval, action/log, operator status | invisible background run no fresh tester can interpret |
| Grounded assistant | approved corpus, citations/abstention, bounded task, transcript/test | generic chatbot that relies on model prior |
| Dashboard/model | metric/assumption contract, scenario/input control, decision cue, reproducible result | attractive chart with no decision or uncertain logic |
| Data surface/pipeline | versioned input, transformation/tests, output/alert, lineage, replay | copied notebook or unobservable manual edit |
| Combination | one clear entry point and one core acceptance path | scope explosion across half-built components |

## Nine stream variants

| Stream | Recommended role-authentic forms | Core task and acceptance evidence | Safe failure / assigned tester | 30% stream judgment anchor |
| --- | --- | --- | --- | --- |
| Consulting | workflow + decision cockpit, grounded evidence assistant, replayable process model | consultant processes a client exception into an evidence-linked pilot recommendation and owner plan | skeptical client-ops tester supplies contradictory constraint; system preserves source/assumption and routes partner approval | quantified change logic, implementation sequence, adoption/risk, client boundary |
| FOCOS | decision cockpit, workflow, grounded briefing assistant | CoS turns a weekly packet into two priorities, owners, deprioritized item, and unresolved-risk log | CEO-role tester changes priority/budget; no auto-commitment, decision trail updates | cross-functional trade-off, follow-through, explicit non-priority |
| Product Management | narrow user-facing app, support assistant, experiment/triage workflow | user completes one bounded job and event taxonomy records completion/fallback | user-role tester hits unsafe/unclear response; fallback and release hold work | user outcome, instrumentation, release judgment, scope control |
| Finance | see three subvariants below | analyst runs a source-linked scenario/diligence/review task and produces an auditable decision input | deal/IC/CFO-role tester changes one material assumption/source | diligence, traceability, scenario/downside, accountable approval |
| HR | grounded policy/onboarding assistant, manager decision-support interface, safeguarded workflow | employee/manager obtains bounded support with source, human review, and appeal path | employee-role tester introduces sensitive/proxy field or challenges result | fairness/privacy, dignity, prohibited use, appeal and human authority |
| Supply Chain & Operations | control-tower interface, exception workflow, scenario dashboard/model | planner prioritizes one exception while preserving service/cost/safety guardrails; run is logged | planner-role tester supplies duplicate/malformed event or capacity shock | competing KPI trade-off, idempotency, operator override and recovery |
| Sales | account-plan assistant, buyer-simulation surface, approval-gated CRM workflow | seller moves one account to justified next action with evidence and approval | buyer-role tester reveals security/opt-out/contradictory signal; no auto-send | discovery/qualification, accurate claims, relationship and approval boundary |
| Marketing | experiment landing surface, campaign QA workflow, insight/brief assistant | marketer turns evidence into a locked proposition/variant test and logs qualified response | audience/brand-role tester exposes unsupported claim or constraint violation | insight-to-brief chain, brand truth, hypothesis and valid metric |
| Data | decision dashboard/model, data-quality surface/pipeline, metric assistant | analyst reproduces a metric/scenario, runs tests, and gives valid/invalid decision cue | business/data-owner tester changes metric definition or exposes leakage | lineage, baseline, uncertainty, validity test and plain decision implication |

### Finance subvariants

| Finance path | Best-fit surfaces | Core task / evidence | Safe boundary and fresh-tester change |
| --- | --- | --- | --- |
| Investment Banking | replayable model/data surface + deal-team exception workflow/assistant | normalize a filing/data-room input, trace a material number, update a scenario, and create an unresolved diligence/model-review note | senior deal-team tester changes a covenant/working-capital term; no client material updates without approval and no invented transaction data |
| Venture Capital | diligence dashboard/model + grounded evidence assistant/workflow | review one target against evidence, expose disconfirming question, and produce advance/hold/pass decision input with assumptions | IC-role tester invalidates a retention/market claim; system revises confidence and open questions, not a public investment recommendation |
| Corporate Finance | scenario dashboard/model + capital-request workflow | change demand/cost-of-capital assumptions, compare range/downside, and route approve/revise/defer input | CFO-role tester changes a guardrail; allocation remains human-owned and every material number is traceable |

## Checkpoints and feedback

| Checkpoint | Deterministic checks | Rubric-bound coaching | Human review |
| --- | --- | --- | --- |
| A — form/acceptance | role, user, one task, selected/rejected form, three tests | authenticity and scope | unsafe/high-impact job |
| B — integrated shell | method/execution version, normal path, human next action | fitness of form and system design | sensitive data/credentials |
| C — observability | required event/log fields or replay evidence | whether telemetry answers the task question | infrastructure disagreement |
| D — safe failure | invalid input state, no prohibited action, actionable recovery | boundary clarity | Finance/HR/Sales safety cases |
| E — fresh attempt | independent tester, task event/result, observation, issue classification | usability/operability diagnosis | flags, borderline, stratified audit |
| F — release | URL/replay health, disclosure, provenance, known limitation | release judgment | publication/privacy exception |

## Rubric link and lesson scoring

Use the [common rubric dimensions](../../course/course-1-architecture-v2.md#common-rubric-dimensions) and [stream anchors](../../course/stream-coverage-matrix.md#detailed-stream-cards).

### Common 70%

- 15% role job, user/owner, value, and form fit;
- 10% evidence/input integrity and method/execution linkage;
- 15% acceptance-driven prototype/system design;
- 15% task success, safe failure, observability, and human boundary;
- 10% fresh tester evidence and evidence-led revision;
- 5% provenance, disclosure, accessibility, and ownership.

### Stream 30%

Apply the professional judgment anchor in the stream table. Finance uses IB, VC, or Corporate Finance. Do not grade one form as inherently more advanced; do not award aesthetic, tool-cost, public-hosting, or code-volume bonuses.

## Common misconceptions and facilitator moves

| Misconception | Symptom | Facilitator move |
| --- | --- | --- |
| “Prototype means web app” | student starts landing page before task contract | ask who uses it, what action they take, and whether a simpler surface fits |
| “More features prove ambition” | several incomplete paths | lock one task under three minutes and move everything else to non-goals |
| “A screenshot is deployment evidence” | no fresh run or logs | require URL/replay and independent task event |
| “A tester liking it means success” | preference quote without task completion | return to observable acceptance event/result |
| “Telemetry comes later” | no way to observe first attempt | add one start, result, failure/approval event before testing |
| “The AI generated it, so it works” | student cannot locate method/execution layer | trace input → method → branch → action/result → log |
| “Safe failure hurts the demo” | invalid input is hidden | make the failure test part of the public failure-and-fix story |
| “Replayable is second class” | analytical prototype forced into UI | grade inspectability and task authenticity, not hosting style |

## LMS and simulator interactions

### State sequence

1. `form_selection_opened`
2. `acceptance_tests_committed`
3. `prototype_shell_selected`
4. `method_execution_versions_linked`
5. `prototype_checkpoint_saved`
6. `telemetry_or_log_check_passed`
7. `author_normal_test_run`
8. `author_safe_failure_run`
9. `test_version_frozen`
10. `fresh_tester_assigned`
11. `qualified_task_attempt_started`
12. `qualified_task_attempt_completed_or_failed`
13. `issue_classified`
14. `release_revision_submitted`
15. `prototype_v1_frozen`

### Unlock rules

- shell unlocks after selected/rejected form and acceptance tests are committed;
- fresh tester assignment requires a reachable/replayable task, one passing author normal test, safe-failure state, and event/log check;
- release freeze requires independent task evidence or an incident-tagged fallback attempt;
- a model quality label never determines unlock;
- external/public publication remains off until later provenance/privacy gates.

### Facilitator heat map

Show readiness, wrong-form rationale, scope explosion, missing version links, failed core paths, missing logs, unsafe failure, tester stuck state, accessibility blockers, and infrastructure incidents. Do not rank visual polish, code volume, or deployment provider.

## Starter assets specification

1. `form-selection.md` with work-job decision tree and rejected-form rationale.
2. `acceptance-tests.md` with success, safe failure, observability.
3. Five shell families:
   - app/form starter;
   - workflow/operator status starter;
   - grounded assistant starter;
   - dashboard/model starter;
   - data surface/replay starter.
4. method/execution version adapter contract.
5. normal and invalid input fixtures by stream and Finance subvariant.
6. minimal event/log schema and viewer.
7. tester role cards and observation sheet.
8. deployment/replay checklist.
9. accessibility, disclosure, secret/PII, and provenance checklist.
10. `release-note-v1.md` with evidence, issue, decision, limitation, next test.
11. golden examples that deliberately use different forms for equal-quality work.
12. offline clickable/paper prototype packs.

Starter shells include navigation, basic components, logging hooks, and safe sandbox adapters. They do not include the stream decision logic or acceptance answer.

## Failure and no-network recovery

| Failure | Recovery that preserves the outcome |
| --- | --- |
| Builder or hosting unavailable | use locally runnable/replayable shell or clickable prototype; facilitator/LMS records task events |
| Model unavailable | use cached outputs behind the same method contract; test form, boundary, and decision behavior |
| Workflow/connector unavailable | use Session 5 replay package and mock action/log adapter |
| LMS unavailable | use printed role cards, paper/clickable task, acceptance sheet, and facilitator-run event log; upload after incident |
| Deployment URL fails during test | switch to immutable preview/local replay; no penalty if task evidence is preserved |
| Tester device/access issue | use paired device or accessible text/replay path; tester identity and independent operation remain recorded |
| Student project not ready | load curated stream prototype core and assess integration, acceptance, failure, and ownership—not setup recovery |
| Secret/PII detected | quarantine publication, rotate/remove secret, replace input with synthetic fixture, rerun safety check |
| Generated code error | roll back to last checkpoint or supported shell; diagnose only if fix can occur inside bounded build window |

The offline version is a paper/clickable prototype operated by an assigned tester. The tester submits structured input; the student/facilitator uses the frozen method/execution cards; a visible log records state and result. It still tests form fit, task completion, safe failure, and ownership.

## Accessibility and differentiation

### Accessibility

- every shell is keyboard navigable and has semantic labels/instructions;
- no drag-only, hover-only, color-only, voice-only, or animation-dependent core path;
- voice/video features have text alternatives and are never required here;
- dashboards/charts include table or textual summaries;
- errors identify cause and recovery; focus moves to the error summary;
- screen-reader and 200% zoom checks are part of starter validation;
- tester cards use plain English and do not grade accent, speed, or performative confidence;
- timing extensions and alternate written defence preserve the same evidence bar;
- public hosting is not required for learners with safety/privacy constraints.

### Novice support

- curated stream shell and prewired method/execution adapter;
- one-screen scope limit and a “remove before add” checklist;
- acceptance-test sentence stems;
- fixed event/log components;
- support lane for setup while core class continues.

### Advanced lane

- implement a second surface behind the same contract and compare task evidence;
- add richer observability, cost/latency bands, or test automation;
- make the prototype portable across two supported runtimes;
- add an adversarial input generator or property-based test.

Advanced work cannot replace the fresh assigned task attempt or safe-failure proof and does not raise the common grade ceiling.

## Facilitator preparation and calibration

### 48–72 hours before class

1. Freeze supported shells, local fallbacks, sandbox hosting, quotas, and status page.
2. Run normal/invalid tests for all nine stream exemplars and three Finance subvariants.
3. Confirm method/execution adapter versions from Sessions 4–5.
4. Verify tester assignment, cross-stream compatibility rules, and role-card clarity.
5. Test route/replay, telemetry/log, safe-failure, secret/PII, disclosure, keyboard, and zoom validators.
6. Cache the hook/demo and prepare clickable/paper alternatives.
7. Load equal-quality golden examples across app, workflow, assistant, dashboard/model, and data surface to prevent UI bias.

### Calibration huddle

- independently score one app and one replayable model that meet the same evidence bar;
- resolve any form/prettiness bias;
- rehearse incident relief for builder, model, hosting, and LMS outage;
- agree that a safe stop can satisfy the failure test;
- distinguish qualified task attempt from page view or friendly preference;
- confirm Finance, HR, and Sales high-consequence boundaries.

### Facilitator questions

- “Who uses this, and what do they do next?”
- “Why is this surface better than the plausible alternative?”
- “Which acceptance test existed before the build?”
- “Where is the Session 4 method and Session 5 control visible?”
- “What event/log proves task completion?”
- “What happens on invalid input?”
- “What did the fresh tester do without your help?”

## Async follow-up

**Due before Session 7; expected time: 45–60 minutes.**

1. Resolve the in-class issue or document a reasoned no-change decision.
2. Add one additional normal variant and one additional safe-failure case.
3. Rerun affected acceptance tests and freeze Prototype v1.1.
4. Complete the deployment/replay, accessibility, disclosure, provenance, and secret/PII checklist.
5. Prepare a 90-second operator walkthrough: role job, input, result, human boundary, log, known limitation.
6. Submit three role-card input packs for the Session 7 task-attempt exchange; the LMS may select or mutate them.
7. Do not recruit external users for grade. Optional external evidence must be consented, labeled, and separated from assigned attempts.
8. Commit/export a local replay copy and a maximum 150-word release note.

The delayed retrieval check asks learners to choose an authentic form, distinguish a qualified task attempt from a page view, identify missing observability, and select the correct safe-failure behavior. Equivalent items are used for retry.

## Exit criteria and bridge to Session 7

Session 6 is complete when the student has one reachable or replayable role-authentic prototype v1, a passing core task, a passing safe-failure test, an independent assigned attempt, inspectable event/log evidence, and a release decision. Session 7 supplies three to five assigned attempts, peer attacks, failure classification, and an evidence-led Prototype v2; it does not reward external social access or restart the build.
