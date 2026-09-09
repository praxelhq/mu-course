# Session 04 Lesson Plan — Package Judgment

**Studio:** Systems Studio, method layer  
**Duration:** 120 minutes live + 30–45 minutes asynchronous hardening  
**Primary capabilities:** C4, C8; reinforces C1–C3 and the Evidence Rail  
**Canonical outcome IDs:** L04-O1–L04-O6  
**Common simulator shell:** Prototype Method Layer  
**Portfolio contribution:** Method layer of the student's one AI operating prototype  
**Status:** Build-ready lesson-plan contract; exact vendor path and staffing remain delivery configuration

## Session promise

> Turn one piece of role-authentic judgment into a reusable, bounded method that succeeds in a clean session without its author.

The session is not “write a better prompt.” Students package a recurring method so another person or agent can know when to use it, what evidence it needs, how to make the relevant judgment, what to return, what to verify, and when to stop or escalate.

## Shared mechanism

**The Method Contract:** `Trigger → Inputs → Judgment steps → Output contract → Checks → Stop/escalate`.

A method is reusable only when it passes four tests:

1. **Trigger:** it activates for the intended job.
2. **Non-trigger:** it declines work outside its authority.
3. **Messy input:** it requests or safely handles missing, contradictory, or malformed evidence.
4. **Unseen change:** it adapts when one constraint or schema changes without the author coaching it.

## Assumptions and boundaries

- Students arrive with an approved Work Sample Brief, evidence pack/claim ledger from Session 2, and grounded-context experience from Session 3.
- Exact skill packaging may be a `SKILL.md`-style folder, an LMS method card, or an equivalent supported agent format. The contract and tests are invariant.
- The supported path provides a starter package, clean-session runner, and peer assignment. Advanced students may use a code/agent package but earn no tool bonus.
- The architecture assumes roughly 60 learners per section. Staffing is not yet frozen; the runbook assumes one lead instructor plus a support lane. If fewer facilitators are available, the LMS exception queue replaces roaming review.
- No confidential company records, personal data, credentials, regulated advice, or unauthorized identity material may enter the method package.

## Prerequisites

### Student pre-work, maximum 25 minutes

1. Complete the four-item retrieval check on grounding, evidence, abstention, and human authority.
2. Bring one recurring task from the approved role context that:
   - occurs more than once;
   - has a recognizable input and output;
   - contains a judgment that can be explained;
   - can complete in under three minutes on a supplied case;
   - does not make a prohibited high-impact decision.
3. Bring two representative inputs: one normal and one imperfect.
4. Export or link the Session 2 evidence needed by the method.

### Readiness gate

The LMS admits the task when the student can complete this sentence:

> “When **[event/request]** occurs, a **[role]** uses **[evidence]** to produce **[decision-support output]** for **[owner]**, but must stop when **[boundary]**.”

Students who fail the gate receive their stream's curated method card rather than spending the build window searching for an idea.

## Materials

### Student-facing

- approved Work Sample Brief and evidence ledger;
- Method Contract canvas;
- starter method package with `README`, method instructions, input schema, output schema, resources, and tests;
- one normal input, one messy input, and one non-trigger input per stream;
- clean-session runner or isolated LMS sandbox;
- peer red-team role card;
- failure log and decision-log template;
- accessibility-equivalent text versions of all audio/video examples.

### Instructor-facing

- “mega-prompt versus bounded method” demo package;
- golden, developing, and unsafe anchor examples;
- stream fallback packs, including IB, VC, and Corporate Finance;
- hidden-change assignment bank;
- deterministic validator specification;
- coaching rubric and facilitator exception dashboard;
- printed Method Contract cards and sealed hidden-change envelopes for no-network delivery.

## Measurable outcomes

By minute 120, each learner will:

| ID | Observable outcome | Required evidence |
| --- | --- | --- |
| S4-O1 | Define a narrow, role-authentic recurring job and its authority boundary | committed Method Contract with trigger, owner, evidence, output, and stop condition |
| S4-O2 | Package the job as a portable method with structured inputs, judgment steps, output, and checks | versioned method package linked to an immutable repository/LMS checkpoint |
| S4-O3 | Demonstrate success in a clean session without author coaching | peer execution trace and output against a known case |
| S4-O4 | Reject an out-of-scope request and handle a messy input safely | non-trigger and messy-input results |
| S4-O5 | Diagnose and repair behavior after an unseen requirement change | before/after test result and one-sentence failure classification |
| S4-O6 | Explain which judgment remains human-owned | 60-second written or recorded defence |

## Success and ownership evidence

### Artifact success

The method layer:

- has a narrow name and trigger;
- declares inputs, evidence sources, output schema, checks, and non-goals;
- produces the required output on the normal case;
- does not fabricate missing evidence;
- stops, asks, or escalates at the declared boundary;
- remains usable in a clean session.

### Student ownership

The learner must:

- commit a predicted behavior before running;
- pass a non-trigger test;
- classify one messy-input failure by layer rather than “the AI was bad”;
- modify the package for a hidden change;
- explain why the task should be a reusable method rather than a one-off prompt, a deterministic rule, or a fully automated decision.

## Minute-by-minute run of show

**Protected student build/test time: 80 minutes (28–108).**

| Time | Mode | Activity | Outcome / LMS evidence |
| --- | --- | --- | --- |
| 0–5 | Individual retrieval | Diagnose three examples: one-off prompt, deterministic rule, or reusable method | entry responses; S4-O1 |
| 5–9 | Pair check | Compare one disputed classification and state the boundary | misconception tag |
| 9–16 | Hook/demo | Run the same task with a mega-prompt and the bounded method in fresh sessions | observation only |
| 16–22 | Open the mechanism | Instructor reveals the six-part Method Contract and the four-test bar | S4-O1 |
| 22–28 | Commit | Students submit trigger, non-trigger, expected output, confidence, and human stop | immutable prediction gate |
| 28–40 | Guided build 1 | Complete trigger, input schema, authority, and non-goals using the starter | checkpoint A; S4-O1/S4-O2 |
| 40–52 | Guided build 2 | Encode judgment steps, output schema, verification checks, and sources | checkpoint B; S4-O2 |
| 52–64 | Independent run | Run the normal case; compare output with acceptance checks; revise once | execution 1; S4-O2/S4-O3 |
| 64–72 | Boundary tests | Run the non-trigger and messy input; record stop/ask/escalate behavior | executions 2–3; S4-O4 |
| 72–84 | Clean-session peer test | LMS assigns a peer who runs the package literally without author explanation | peer trace; S4-O3 |
| 84–90 | Peer attack | Tester submits one evidence-specific defect and one useful behavior | structured peer review |
| 90–98 | Hidden change | LMS reveals a stream-specific changed requirement/schema/policy | hidden variant; S4-O5 |
| 98–108 | Repair and rerun | Author changes the smallest relevant layer and reruns affected tests | revision diff + execution 4; S4-O5 |
| 108–114 | Proof capture | Freeze package, test report, failure classification, provenance, and human boundary | method-layer submission |
| 114–118 | Defence sample | All write; LMS samples several 60-second verbal explanations | S4-O6 / audit queue |
| 118–120 | Exit bridge | Identify the real event that could trigger this method in Session 5 | execution-bridge ticket |

## Instructor demo script — “A prompt that works for me is not a method”

**Duration:** 7 minutes. Use the neutral FOCOS weekly-decision example so every stream can see the mechanism.

### Demo assets

- a synthetic weekly operating pack with six requests;
- one vague request: “Summarize this and tell the CEO what to do”;
- a bounded `Weekly Decision Triage` method;
- a normal packet, a missing-owner packet, and an unrelated writing request;
- clean session A and clean session B.

### Script

1. **Set the prediction (30 sec):** Ask students which of three outcomes the mega-prompt will produce: reliable decision support, polished summary, or safe refusal. Record the room vote.
2. **Run the mega-prompt (60 sec):** It produces a polished list, invents urgency, and assigns a recommendation despite a missing owner and metric.
3. **Name the failure (45 sec):** The issue is not tone; the request lacks a trigger, evidence contract, decision rule, and boundary.
4. **Open the method package (90 sec):** Show its trigger, required fields, priority logic, output schema, evidence citations, missing-data behavior, and CEO-only approval boundary.
5. **Run clean session A (60 sec):** The method returns two priorities, explicitly defers one item, and identifies missing evidence.
6. **Run clean session B with an unrelated request (45 sec):** The method declines to draft a marketing slogan and explains its scope.
7. **Change the schema (60 sec):** Rename `business_impact` to `impact_range`; the first run fails. Edit the input adapter/contract, not the entire instruction, and rerun.
8. **Close (45 sec):** State: “Today you are graded on portable control: correct trigger, bounded judgment, inspectable output, and recovery—not prompt length.”

Do not improvise additional tool features. The demo exists only to make portability, boundaries, and test-driven revision visible.

## Student task brief

### Role

You are packaging a recurring method used in the target role you selected. A colleague—or an agent in a clean session—must be able to apply it without private context from your chat history.

### Build

Create **Prototype Method Layer v1** containing:

1. task name and one-sentence business job;
2. trigger and at least two non-trigger examples;
3. named user/decision owner and authority boundary;
4. required and optional input schema;
5. evidence/resource references;
6. ordered judgment steps, including where deterministic calculation is preferable;
7. output schema and acceptance checks;
8. missing/contradictory evidence behavior;
9. stop/escalation conditions;
10. three known tests: normal, messy, and non-trigger.

### Definition of done

- A peer can invoke and run it in a clean session without asking the author what it means.
- The normal case meets the output schema.
- The non-trigger does not activate substantive work.
- The messy case never silently invents the missing evidence.
- The hidden-change repair is small, explained, and rerun.

## Nine stream variants

The common task, time, tests, and 70% rubric remain identical. The 30% stream anchor changes the professional judgment encoded.

| Stream | Curated method layer | Required inputs → output | Non-trigger / messy test | Hidden change and 30% judgment anchor |
| --- | --- | --- | --- | --- |
| Consulting | `Transformation Intervention Framer` | client objective, baseline, constraints, evidence → issue tree, options, pilot recommendation, risks | request for generic “AI roadmap”; baseline missing | CFO invalidates benefit assumption; method must revise value logic and sequence |
| FOCOS | `Weekly Decision Triage` | operating pack, goals, owners, dependencies → priority/owner/escalation decision note | request to summarize an article; conflicting owner and deadline | CEO protects a previously deprioritized initiative; preserve trade-off and unresolved-risk log |
| Product Management | `Release Evidence Reviewer` | user job, acceptance tests, session evidence, risk → ship/hold/cut-scope note | request to write a launch slogan; no task telemetry | trust/safety constraint becomes mandatory; revise acceptance and fallback |
| Finance | see three subvariants below | source-linked facts, assumptions, scenarios → auditable review output | unsupported market tip; wrong period or missing source | late disclosure changes one material assumption; trace effect without regulated advice |
| HR | `Workforce Decision Safeguard` | business need, minimal fields, policy, subgroup results → decision-support note, review and appeal path | request to rank real candidates; proxy field present | employee challenges recommendation; add review/appeal and prohibited-use rule |
| Supply Chain & Operations | `Exception Priority Assessor` | event, SLA, capacity, cost/safety constraints → priority, reason, owner, escalation | normal on-time shipment; duplicate/malformed event | capacity falls and service guardrail changes; do not optimize cost alone |
| Sales | `Evidence-Grounded Next Action` | account facts, buyer signals, product sources, stage → qualify/re-stage/disqualify and approved action | cold-contact spam request; contradictory budget/timing | security constraint arrives; correct unsupported product claim and decide not to send |
| Marketing | `Insight-to-Brief and Claim Check` | audience evidence, proposition, brand rules, claims sources → locked creative brief and claim status | request for generic viral content; claim lacks support | brand/legal locks a new constraint; preserve insight while rejecting unsafe execution |
| Data | `Analysis Validity Review` | question, metric contract, lineage, tests, model/analysis results → valid/invalid decision note and next test | request to decorate dashboard; target leakage or definition mismatch | metric definition changes; update checks and prevent causal overclaim |

### Finance subvariants

| Finance path | Curated method | Role-authentic output | Mandatory boundary / hidden change |
| --- | --- | --- | --- |
| Investment Banking | `Transaction Data-Room Review` | source-linked exception list, normalized key figures, unresolved diligence questions, deal-team note | no invented transaction terms or client advice; late filing changes working-capital/covenant input |
| Venture Capital | `First-Pass Investment Screen` | evidence-backed market/team/product/economics screen, disconfirming question, advance/hold/pass rationale | no investment solicitation or fabricated founder evidence; one cohort/retention claim loses support |
| Corporate Finance | `Capital Request Challenge` | scenario range, assumptions, guardrails, downside, approve/revise/defer recommendation | accountable CFO approval remains human; cost-of-capital or demand scenario changes |

## Checkpoints and feedback

| Checkpoint | Deterministic checks | Rubric-bound coaching | Human attention |
| --- | --- | --- | --- |
| A — contract | named trigger, non-trigger, owner, boundary, input fields | scope and role authenticity | unsafe/high-impact proposed job |
| B — package | required files/fields, output schema, sources linked | judgment-step clarity and tool restraint | ambiguous professional boundary |
| C — known tests | normal output properties, non-trigger, no fabricated required field | likely failure layer | repeated validator/model disagreement |
| D — peer clean run | independent runner, no author intervention, peer defect cites evidence | portability feedback | accessibility or assignment exception |
| E — hidden repair | changed file/field, affected test rerun, before/after trace | quality of diagnosis | flags, borderlines, stratified audit |

Feedback is formative in-session. The frozen method layer contributes to the AI operating prototype and is judged later using the course rubric.

## Rubric link and lesson scoring

Use the [common rubric dimensions](../../course/course-1-architecture-v2.md#common-rubric-dimensions) and the [stream anchors](../../course/stream-coverage-matrix.md#detailed-stream-cards).

### Common 70%

- 15% role-authentic problem and bounded value;
- 15% evidence/input integrity;
- 20% method/system design;
- 10% verification and failure diagnosis;
- 10% provenance, safety, and ownership.

### Stream 30%

Apply the row-specific judgment anchor above. Finance uses the selected IB, VC, or Corporate Finance anchor. Visual polish and tool sophistication receive no credit.

## Common misconceptions and facilitator moves

| Misconception | Observable symptom | Facilitator move |
| --- | --- | --- |
| “A skill is a long prompt” | instructions contain style adjectives but no trigger/tests | ask for the recurring job, non-trigger, and observable output schema |
| “More scope means more value” | one package claims research, analysis, deck, email, and execution | force one core task and list non-goals |
| “The model should decide everything” | deterministic thresholds/arithmetic embedded as prose | move stable rules to checks or formulas; keep model for ambiguous interpretation |
| “Missing data can be estimated silently” | output fills gaps confidently | require an `unknown`, request, or escalation state |
| “It worked in my chat” | package depends on earlier conversation | run in a clean session with a peer immediately |
| “Refusal is failure” | student removes boundaries to pass a request | explain that correct non-trigger/stop behavior is a success condition |
| “Formatting proves quality” | schema is perfect but judgment is generic | inspect the decision rule and counterexample |

## LMS and simulator interactions

### State sequence

1. `brief_opened`
2. `prediction_committed` — trigger, non-trigger, expected output, confidence
3. `method_contract_submitted`
4. `method_checkpoint_saved`
5. `known_test_run` × 3
6. `peer_clean_run_assigned`
7. `peer_test_completed`
8. `hidden_change_revealed`
9. `revision_submitted`
10. `affected_test_rerun`
11. `method_layer_frozen`
12. `human_boundary_defended`

### Unlock rules

- build unlocks only after the prediction and boundary are committed;
- peer test unlocks after required package structure and three known tests exist, not after an AI “quality” label;
- hidden change unlocks after a peer clean run;
- evidence freeze requires the changed test rerun and a provenance link;
- facilitator can override false negatives with a logged reason.

### Telemetry for teaching

Show the facilitator: missing readiness, over-broad triggers, failed non-triggers, fabricated-required-field warnings, clean-run failures, hidden-change bottlenecks, and platform incidents. Do not rank prompt count, token use, or speed.

## Starter assets specification

1. `method-contract.md` — role, job, trigger, non-trigger, inputs, outputs, authority.
2. `method-instructions.md` — numbered judgment steps and tool allocation.
3. `input-schema.json` or equivalent field table.
4. `output-schema.json` or equivalent acceptance table.
5. `resources/` — approved evidence/index, not a copied answer.
6. `tests/normal.*`, `tests/messy.*`, `tests/non-trigger.*`.
7. `test-report.md` — prediction, observed behavior, pass/fail, failure layer, revision.
8. `decision-log.md` — timestamped material choices.
9. stream cards and Finance subvariant cards.
10. golden, developing, unsafe, and over-broad anchor examples.

Starter assets remove syntax/setup work but must not include the role-specific judgment answer.

## Failure and no-network recovery

| Failure | Recovery that preserves the outcome |
| --- | --- |
| Supported model unavailable | use the cached deterministic runner with pre-generated candidate outputs; students select, test, and revise the method contract |
| LMS unavailable | use printed Method Contract, stream inputs, peer execution sheet, and sealed hidden-change card; upload timestamped scan later |
| Repository unavailable | save package locally with version label `S04-A/B/C`; LMS accepts deferred commit linked to incident |
| Peer absent or inaccessible pairing | LMS/facilitator supplies a clean synthetic runner or alternate tester |
| AI output varies between runs | score required properties and boundaries, retain run seed/version where possible, rerun once; do not grade prose identity |
| Student setup incomplete | move to LMS method-card path; no grade penalty for missing advanced tool |
| Unsafe data discovered | quarantine the input, switch to synthetic pack, preserve incident evidence, and restart without exposing it |

The fully offline version uses instruction cards handed to a peer who executes them literally against paper input packs. The hidden change is a sealed envelope. This still tests portability, boundary, diagnosis, and revision.

## Accessibility and differentiation

### Accessibility

- all demos have live captions/transcript and static before/after screenshots;
- method package and tests are keyboard- and screen-reader-operable;
- errors identify field, cause, and recovery in text, not color alone;
- peer testing may be written rather than spoken;
- extra-time accommodations receive equivalent hidden variants and pause/resume;
- no voice, public posting, or rapid typing is required;
- examples avoid culture-specific idiom and define “trigger,” “schema,” “clean session,” and “escalation.”

### Novice support

- curated stream method card;
- partially completed schema and sentence stems;
- worked non-graded example;
- “one decision, one owner, one output” scope clinic;
- LMS hints released one at a time after an attempt.

### Advanced lane

- add typed schema validation or a deterministic preprocessor;
- create property-based/adversarial tests;
- package the method for a second supported runtime;
- measure behavior across model versions.

Advanced work does not raise the common grade ceiling. It provides harder evidence for the same capability.

## Facilitator preparation and calibration

### 48–72 hours before class

1. Run every stream's normal, messy, non-trigger, and hidden-change case on the frozen tool version.
2. Verify that no pack contains confidential/personal data or prescriptive financial/HR decisions.
3. Confirm clean-session isolation, peer allocation, and deterministic validator behavior.
4. Print fallback packs and hidden-change envelopes.
5. Load one golden, one developing, one over-broad, and one unsafe anchor.
6. Calibrate on the difference between method success and student ownership.
7. Test screen reader/keyboard flow and the text alternative to every demo.

### Ten-minute calibration huddle

- independently score the same anchor using the 70/30 rubric;
- discuss any common-criterion disagreement greater than one level;
- rehearse the response to: copied template, correct refusal, model variance, missing peer, and unsafe task;
- agree which issues are coachable, which block the gate, which enter moderation, and how the final prototype packet reaches its primary scorer.

### During class

Facilitators ask diagnostic questions rather than editing prompts for students:

- “What event should invoke this?”
- “What request should it decline?”
- “Which evidence is required rather than nice to have?”
- “Which judgment can be a rule, and which requires interpretation?”
- “Who owns the consequential decision?”
- “Which test proves your last change?”

## Async follow-up

**Due before Session 5; expected time: 30–45 minutes.**

1. Incorporate the peer defect or explain with evidence why it is not accepted.
2. Add one second normal case and one second non-trigger.
3. Run the package in a fresh session and attach the trace.
4. Write a maximum 150-word method card: job, user, input, output, boundary, and failure learned.
5. Identify the real event that should trigger the method in Session 5 and draft a sample event payload.
6. Export a local fallback copy and commit the frozen method layer.

The delayed retrieval check asks students to diagnose an over-broad trigger, choose between a rule and model judgment, identify missing evidence behavior, and select the best ownership test. A parallel retry follows feedback.

## Exit criteria and bridge to Session 5

Session 4 is complete when the learner has a portable method with a clean-session trace, three known tests, one hidden-change repair, and an explicit human boundary. Session 5 does not create a new project. It turns this exact method into a controlled execution layer with a real/simulated trigger, state, action, approval, log, and recovery.
