# Session 7 Lesson Plan — Earn Evidence from Task Attempts

**Duration:** 120 minutes live  
**Course position:** Operating Prototype Studio; follows prototype v1 in Session 6  
**Primary capabilities:** C6, C8; supporting C1, C5  
**Canonical outcome IDs:** L07-O1–L07-O5  
**Assessment contribution:** AI operating prototype and structured participation/peer attack  
**Shared mechanism:** **Observe → classify → prioritize → change → rerun**  
**Protected student-work time:** approximately 92 minutes  
**Inherited Session 6 state:** Each learner has a reachable or replayable prototype v1/v1.1, committed success/safe-failure/observability tests, one fresh assigned attempt, inspectable event/log evidence, a release note, and three role-card input packs ready for the full exchange.

## Session promise

> Friendly feedback tells you whether someone liked the idea. A qualified task attempt shows where the system actually helps, confuses, fails, or needs a human. By the end of class, you will use observed evidence to ship one defensible release—and explain one tempting change you deliberately rejected.

The session is not a popularity test, a five-user growth contest, or a UI critique. Every stream uses the same evidence standard even when the prototype is a workflow, model, assistant, dashboard, data pipeline, or application.

## Observable lesson outcome

Given three to five LMS-assigned role-card attempts on a role-authentic prototype, the student will classify observed failures, prioritize one release using business value and risk, implement or specify the change, rerun the affected task, and defend the change and non-change with traceable evidence.

## Outcome and evidence map

| Outcome | Observable evidence | Capability | Assessed where |
| --- | --- | --- | --- |
| Distinguish stated preference from observed task behavior | attempt record with task result, friction, evidence pointer, and tester role | C6 | Prototype evidence |
| Diagnose a failure by layer rather than reprompt blindly | issue trail classifying problem, evidence/data, method, model, workflow, interface, policy, or user fit | C8 | Prototype reliability |
| Make an evidence-led release decision | priority note naming one change, one non-change, expected effect, guardrail, and uncertainty | C6 | User evidence and iteration |
| Repair and verify the prototype | v2 checkpoint plus rerun on the failed or equivalent case | C5, C8 | Artifact success |
| Test a peer in good faith | structured peer attack with observable evidence, no popularity score | C8 | Participation |

## Complete output contract

The Session 7 submission is one frozen **Task-Evidence and Release Pack** containing:

1. **Attempt set:** three to five qualified attempts in total across the between-session exchange and live class. It must include:
   - at least one expected/happy-path task;
   - at least one messy or edge input;
   - at least one assigned failure or boundary prompt;
   - tester role-card ID and consent acknowledgement;
   - task completion state, not merely a satisfaction score; and
   - privacy-safe evidence: event/log ID, annotated observation, or supplied paper log.
2. **Issue trail:** every material observation has an issue ID, evidence pointer, failure layer, severity, frequency within this small sample, affected user/decision, and confidence. Students must explicitly say that three to five attempts are formative evidence, not market validation.
3. **Release decision:** one change selected and one plausible change rejected or deferred. Each states expected business effect, risk/guardrail, implementation cost band, and what evidence would reverse the decision.
4. **Prototype v2:** live/replayable link or implementation checkpoint; if the safe change cannot be completed in class, a precise change specification and testable patch is accepted only through the fallback lane.
5. **Rerun:** the failed case or an equivalent case is replayed after the change. The result records pass, partial, fail, or safe escalation.
6. **Failure-and-fix entry:** 120–180 words or an equivalent two-minute accessible recording explaining what the student predicted, what happened, the diagnosed layer, the change, the rerun, and remaining limitation.
7. **Provenance:** immutable repository/checkpoint ID, prototype version, task-attempt IDs, supplied assets, AI assistance declaration, and no secrets/PII.

**Minimum pass:** three qualified attempts, one evidence-linked diagnosis, one justified release, and one rerun. A beautiful interface with no qualified task evidence does not pass. A prototype that safely escalates an out-of-scope case may pass when escalation is the correct contract.

## Prerequisites and pre-class work

### Student prerequisites

- Session 6 prototype v1 is deployed or replayable.
- Core task, target role/user, acceptance test, and human boundary are written.
- Required instrumentation/log schema or paper-event sheet is active.
- No confidential, personal, credential, or proprietary data is present.
- The fresh assigned attempt completed during Session 6 counts as the first pre-Session-7 tester task and the first received attempt.
- Student completes exactly one additional assigned tester task asynchronously before Session 7, normally 10–15 minutes, bringing the pre-class total to two.
- Student has received the Session 6 attempt plus one additional qualified attempt on their prototype; the LMS fills a missing route with a calibrated, visibly labelled incident-equivalent pack.

### LMS pre-class actions

- Match within or across sections by compatible role card, not friendship or company prestige.
- Avoid reciprocal pairs where possible; pseudonymize tester identity until feedback closes.
- Issue supplied inputs and one calibrated boundary/failure prompt.
- Require consent and prohibit copying prototype content into public channels.
- Verify prototype route/replay and generate a fallback evidence pack for broken endpoints.
- Flag students with fewer than two received attempts 12 hours before class.

## Materials and systems

### Student-facing

- Task-attempt mission page and assigned role card
- Prototype v1 and acceptance-test card
- Observation sheet: behavior, quote only with consent, event/log ID, result
- Failure-layer chooser and issue-priority matrix
- Release-decision template
- Rerun form and failure-and-fix template
- Stream card from the table below
- Downloadable/offline attempt packet

### Facilitator-facing

- Demonstration prototype with one misleading satisfaction score and contradictory behavior log
- Stream-calibrated task cards and failure prompts
- Attempt-matching dashboard, unmatched queue, and incident overlay
- Anchor submissions for pass, partial, unsafe, and “changed the wrong thing”
- Section fallback pack and paper routing cards
- Primary-scoring queue, moderation sheet, and double-score assignment sheet

## Minute-by-minute run of show

| Time | Mode | Activity | Student evidence / outcome |
| ---: | --- | --- | --- |
| 0–5 | Individual retrieval | Entry check: identify which of four observations is behavior, opinion, failure evidence, or noise | two-item response; misconception tag |
| 5–11 | Hook/demo | Instructor shows a prototype rated “easy” by users while logs reveal abandonment at approval and one unsafe completion | students predict which change the team should make |
| 11–18 | Concise model | Teach qualified attempt, failure layers, severity × decision impact, and why tiny samples guide iteration but do not validate demand | annotated Observe → classify → prioritize → change → rerun card |
| 18–23 | Individual commitment | Student records the release they expect to make and confidence before opening received evidence | immutable prediction |
| 23–29 | Exchange briefing | Review role cards, consent, observable evidence, attack boundaries, no popularity scoring, and incident rules | readiness gate |
| 29–43 | Student test round | Each student performs the third and final graded assigned task on a peer prototype using only the role card and supplied input | qualified attempt and evidence pointer |
| 43–52 | Adversarial extension | As phase two of the same third assignment—not a fourth attempt—the LMS reveals the boundary/failure prompt; tester records whether the system completes, refuses, escalates, or fails unsafely | peer attack result linked to the same assignment/attempt |
| 52–65 | Evidence triage | Author opens all three to five attempts, groups observations, and separates behavior from unsupported opinion | issue list and attempt coverage check |
| 65–76 | Diagnose | Author classifies top failures by layer and identifies the decision/user consequence | evidence-linked diagnosis |
| 76–84 | Prioritize | Select one change and one deliberate non-change using value, risk, frequency, and effort; state uncertainty | release decision v1 |
| 84–101 | Build/repair | Implement the smallest safe change or complete the testable patch in the supported shell | prototype v2 checkpoint |
| 101–109 | Rerun | Replay the failed/equivalent task; record pass, partial, fail, or safe escalation | before/after execution evidence |
| 109–114 | Pair challenge | Partner asks: “What evidence made this the highest-value change?” and “What did you refuse to infer?” | revised release rationale |
| 114–118 | Ship | Freeze Task-Evidence and Release Pack and run mechanical validator | submission and validation results |
| 118–120 | Exit bridge | One sentence: behavior that changed my mind; one remaining risk; next stakeholder communication | exit ticket to Session 8 |

Student work includes retrieval, testing, prediction, triage, diagnosis, prioritization, repair, rerun, review, and evidence capture. It exceeds the required 60 minutes.

## Instructor demo script: “The five-star failure”

**Demo length:** six minutes. Use a neutral support/approval prototype so every stream can see the mechanism.

1. Show three post-task ratings: 5/5, 4/5, 5/5. Ask for a predicted release decision.
2. Open the task contract: “route a high-risk exception to the accountable approver and preserve the evidence.”
3. Reveal the logs:
   - Attempt A completed but skipped the approval branch.
   - Attempt B abandoned because the input label was misunderstood.
   - Attempt C produced a confident unsupported recommendation.
4. Ask students to classify each failure. Do not accept “the AI was bad” as a layer.
5. Apply the matrix: decision impact, safety, recurrence, and repair effort. Select the approval defect even though it was not mentioned in ratings.
6. Change one branch, rerun Attempt A, and show safe escalation.
7. Explicitly decline a cosmetic redesign: there is not enough evidence that it blocks the core decision.
8. End with: “The task attempt did not prove market demand. It produced enough evidence for one safer release.”

## Student task brief

You are the accountable owner of prototype v1. Today, classmates are not giving you product ideas. They are acting as qualified operators, stakeholders, clients, investors, employees, buyers, or analysts who must complete a defined job with supplied inputs.

Your responsibilities are to:

1. honor the acceptance test written before the exchange;
2. observe what happened without coaching the tester through the system;
3. distinguish the failed layer from its visible symptom;
4. make one release decision from limited evidence;
5. protect the human approval or safe-stop boundary;
6. rerun the relevant task; and
7. preserve the evidence without publishing personal or confidential data.

Do not claim “users loved it,” “validated,” or “market fit.” Use precise language: “Across four assigned task attempts, two completed; one exposed X; one safely escalated. I changed Y because…”.

## Stream and Finance variants

The testing protocol and time are identical. The role card, core task, failure prompt, business consequence, and 30% judgment anchor change.

| Pathway | Tester role and core task | Assigned pressure / failure | Role-authentic release evidence |
| --- | --- | --- | --- |
| Consulting | skeptical client operations lead uses a diagnostic to evaluate a transformation option | a supplied source invalidates a claimed saving or frontline constraint is missing | recommendation/workflow changes, quantified trade-off, implementation risk |
| FOCOS | functional head uses a weekly review system to secure a decision and owner | two priorities compete for one budget; unresolved dependency disappears in summary | priority/owner/escalation change and explicit non-priority |
| Product Management | target user completes the narrow core job while a trust/safety reviewer tests fallback | user takes an unexpected path; unsafe or ambiguous model response | acceptance-test/fallback change tied to observed behavior |
| Finance — Investment Banking | deal-team associate traces a comparable or buyer-screening output | stale period, invented comparable, or broken source link | corrected model/workflow and impact on transaction framing |
| Finance — Venture Capital | IC associate tests a diligence/screening assistant | missing cohort evidence or unsupported market assumption | diligence gate, red flag, and advance/hold decision change |
| Finance — Corporate Finance | FP&A manager reviews forecast/capex exception | late actual, currency change, or formula inconsistency | traceable variance/model correction and approval path |
| Human Resources | manager uses a policy/workforce aid while employee representative probes harm | proxy bias, sensitive-data request, or missing appeal route | safe refusal, subgroup/control fix, human review and appeal evidence |
| Supply Chain and Operations | planner handles a stockout, delay, or service exception | duplicate event, malformed record, supplier timeout, or competing service/cost target | idempotency/fallback/override change and rerun log |
| Sales | seller uses account research or next-action workflow; buyer persona tests claim | stale CRM signal, opt-out, unsupported claim, or risky auto-send | verification/approval change and qualified next action or disqualification |
| Marketing | brand/growth reviewer uses campaign or claim-QA system | preferred variant violates locked brand or evidence constraint | repaired brief/claim gate and experiment decision, not likes |
| Data | business owner uses analytical surface; data steward tests lineage | leakage, missingness, schema drift, or metric-definition conflict | pipeline/test/metric-contract change and revised decision |

## Checkpoints and gates

| Gate | Timing | Pass condition | If missed |
| --- | ---: | --- | --- |
| Readiness | before minute 23 | prototype/replay opens; acceptance test and role card exist; at least two attempts received or fallback pack assigned | move to cached replay/paper pack; do not punish outage |
| Qualified attempt | minute 52 | role card, supplied input, consent, task state, and evidence pointer complete | tester repairs record before author sees it |
| Diagnosis | minute 76 | issue cites attempt evidence and names a plausible failure layer and consequence | show layer hint; no release gate yet |
| Release | minute 84 | one change and one non-change have evidence, guardrail, and uncertainty | use priority scaffold; facilitator reviews unsafe boundary |
| Rerun | minute 109 | relevant test reruns with recorded result or safe escalation | submit partial plus explicit blocker; async repair required |
| Evidence freeze | minute 118 | required pack, version/checkpoint, declarations, no secrets/PII | quarantine submission and open repair task |

## Common misconceptions and facilitator responses

| Misconception | Response |
| --- | --- |
| “Five testers prove demand.” | Five task attempts expose usability/reliability evidence. They do not estimate market demand or adoption. |
| “The most common complaint must be fixed first.” | Prioritize by decision consequence and risk as well as frequency and effort. |
| “A failure means the model needs a better prompt.” | Require layer classification before any change: evidence, method, model, deterministic logic, workflow, interface, policy, or fit. |
| “A tester asked for a feature, so it belongs in the release.” | Treat the request as a hypothesis; connect it to the declared task and evidence. |
| “Safe refusal is a failed completion.” | If the input is outside authority or evidence, safe refusal/escalation may satisfy the contract. |
| “More telemetry means stronger proof.” | Capture the minimum events needed; never grade raw prompt volume, keystrokes, or time online. |

## Differentiation

### Supported path

- Use LMS-provided attempt cards, issue categories, priority matrix, and patch template.
- Work from cached execution replays if deployment is unstable.
- Change one configuration, branch, prompt boundary, formula, or UI instruction.

### Advanced lane

- Compare two release candidates with pre-registered success/guardrail metrics.
- Add automated regression coverage for the observed failure.
- Estimate cost/latency or operational effect without receiving extra points for technical complexity.

Advanced work is scored against the same evidence and judgment ceiling.

## Accessibility and inclusion

- Tester instructions and role cards are screen-reader readable and downloadable.
- Task evidence can be text, structured events, annotated screenshots with alt text, or captioned recording.
- No grade depends on speaking speed, visual polish, mouse-only interaction, or public posting.
- Approved timing accommodations are preserved by pre-assignment or asynchronous equivalent attempts.
- Testers receive the prototype's accessible path; accessibility failure is recorded as product evidence, not blamed on the tester.
- Quotes are optional; observable task evidence is sufficient and avoids recording pressure.
- Color is never the only severity signal; issue categories include labels and icons with text.

## LMS events and evidence capture

| Event | Required properties | Purpose |
| --- | --- | --- |
| `peer_attack_assigned` | assignment ID, role-card ID, stream, case variant | prove calibrated routing |
| `task_attempt_started` | attempt ID, prototype version, supplied-input ID, consent status | bind attempt to frozen contract |
| `peer_test_completed` | task state, evidence pointer, friction category, safety state | capture observable result |
| `qualified_attempt_received` | author ID, attempt ID, qualification checks, evidence class | count only valid attempts; never imply market validation |
| `prediction_committed` | predicted change, confidence, timestamp | ownership and calibration |
| `issue_classified` | issue ID, attempt IDs, failure layer, severity, consequence | diagnosis evidence |
| `release_decision_saved` | selected change, non-change, guardrail, evidence IDs | decision trace |
| `checkpoint_saved` | prototype version, repo/asset ID | freeze v2 |
| `run_started` / `run_succeeded` / `run_failed` | test ID, version, branch, error class | before/after reliability |
| `revision_submitted` | release-pack ID, prior version, declarations | final evidence |
| `incident_override_applied` | incident ID, affected gate, facilitator reason | separate platform failure from learning |

Raw prompts and sensitive payloads are not default telemetry.

## Session rubric: 70% common + 30% stream judgment

This session supplies evidence to the 30% AI operating prototype component and the 10% participation/peer-attack component. Peer reviewers do not assign the author's grade.

Canonical references: [course common rubric](../../course/course-1-architecture-v2.md#common-rubric-dimensions) and [stream judgment anchors](../../course/stream-coverage-matrix.md#detailed-stream-cards).

| Common criterion | Points | Demonstrated evidence |
| --- | ---: | --- |
| Qualified attempt integrity | 15 | three to five valid, role-card attempts with observable task states and privacy-safe evidence |
| Observation and failure diagnosis | 15 | separates behavior/opinion and identifies the failing layer with evidence |
| Release prioritization | 15 | selects one change and one non-change using value, risk, effort, and uncertainty |
| Repair and rerun | 15 | v2 addresses the diagnosed mechanism and produces a traceable rerun or correct safe escalation |
| Provenance and honest limits | 10 | versions, attempt IDs, assistance, limitations, and no validation theatre |
| Stream judgment overlay | 30 | role-specific quality from the variant table: appropriate decision, guardrail, and stakeholder consequence |
| **Total** | **100** |  |

Essential caps:

- fabricated attempt or evidence: integrity review; no automatic guilt, but score is withheld;
- missing human boundary for a consequential action: maximum Developing until repaired;
- secret, PII, unsafe outbound action, or deceptive claim: publication quarantine;
- fewer than three attempts due to documented platform/matching incident: incomplete, not failed; fallback attempts must be issued.

## Feasible scoring model for 480 students

1. **100% mechanical validation:** attempt qualification, required fields, version IDs, link/replay health, event presence, secret/PII scan.
2. **100% structured peer attack:** quality is graded for the reviewer through completeness and evidence specificity, never through popularity or the score they give.
3. **Rubric-bound coaching:** AI may classify likely failure layers and cite evidence; it cannot finalize strategic judgment.
4. **Human primary score:** a trained scorer reviews 100% of frozen bounded prototype packets using the 70/30 rubric and cites criterion evidence.
5. **Moderation:** all safety/integrity flags, rubric borderlines, disputes and appeals receive additional human review.
6. **Cross-section reliability:** blind-double-score at least 10% of all frozen prototype packets, stratified across stream, section, starting band and score band.

Planning load is held in the course gradebook/assessment operations model. The prototype packet is bounded to approximately ten minutes of first-pass human scoring per learner; moderators receive flags/appeals and a 10% reliability sample. This happens asynchronously after class and is not a universal live viva.

## Failure recovery and fallback

| Failure | Immediate path | Evidence preserved |
| --- | --- | --- |
| Prototype endpoint down | use cached replay or paper/clickable prototype supplied from Session 6 checkpoint | tester task state, observation, author diagnosis |
| Task matching incomplete | LMS issues calibrated role-card attempt from fallback bank | equivalent attempt count and pressure |
| Network/model outage | switch section to downloadable inputs and precomputed logs within five minutes | classification, release choice, patch specification, rerun-on-log |
| Validator false negative | facilitator override with reason; frozen submission retained for rerun | no student penalty |
| Unsafe content or data | stop attempt, quarantine evidence, issue sanitized variant | safety decision and remediation |
| Student build irreparable in class | patch the supplied golden shell while documenting difference from own build | capability evidence remains; own artifact repair becomes async |

## Facilitator preparation and calibration

Before class, the facilitator must:

- run the exchange as student and author on every stream card represented in the section;
- confirm each student has a valid v1 or cached replay and at least two received attempts/fallback assignments;
- rehearse the five-star-failure demo and its branch fix;
- review pass, partial, unsafe, and misleadingly polished anchors;
- verify that failure prompts are equivalent in diagnosis and repair demand;
- test the section fallback switch, printed packets, and incident logging;
- identify accessibility alternatives without exposing accommodation data;
- agree on what constitutes safe escalation for HR, Finance, Sales, and Operations; and
- assign every frozen prototype packet to a calibrated primary scorer and reserve moderation plus the 10% blind double-score sample.

## After-class follow-up

### Required, normally 30–45 minutes within 48 hours

- Complete any remaining exchange attempt needed to reach three to five.
- Repair a failed rerun or explain why a safe non-release is correct.
- Freeze prototype v2 and Task-Evidence and Release Pack.
- Complete a three-item delayed retrieval check on qualified use, failure-layer diagnosis, and tiny-sample claims.
- Carry the chosen release evidence and remaining limitation into the Session 8 communication brief.

### Optional extension

- Recruit one genuine target user or practitioner with consent. Label this as enrichment; it does not add grade points.
- Add a regression test or cost/latency measure for the fixed failure.

## Session 8 bridge

Session 8 begins from the release evidence, not from a blank creative prompt. Students will choose the stakeholder who needs to understand or act on the result, then translate the same truthful evidence into the most role-authentic format. Video is one valid Marketing-led format, not the universal deliverable.
