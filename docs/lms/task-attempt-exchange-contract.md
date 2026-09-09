# Task-Attempt Exchange Contract

**Version:** 0.1  
**Applies to:** Sessions 6–7; 480 learners; eight sections  
**Status:** internally frozen product contract; implementation, privacy sign-off and load/equivalence tests pending

## Assessment claim and non-claim

Given three to five LMS-assigned role/input attempts on a frozen role-authentic prototype, a learner can diagnose observed failure, make one justified change and one justified non-change, rerun the relevant task, and preserve inspectable evidence of the decision and human boundary.

The exchange does **not** establish demand, adoption, market fit, population preference or company endorsement. Satisfaction, compliments, clicks, traffic and public popularity receive no credit.

At the minimum three attempts per author, the system routes at least 1,440 received attempts course-wide and about 180 per section before replacements or incident-equivalent cases.

## Minimum evidence

### Author

An author's frozen Task-Evidence and Release Pack contains:

1. approved acceptance contract and prediction committed before reveal;
2. immutable prototype v1 hash/checkpoint;
3. three unique qualified attempts: expected task, messy/edge input, and assigned boundary/failure condition;
4. role card, input/case version, task state, safety state and privacy-safe evidence for every attempt;
5. issue trail linking every accepted, rejected and deferred issue to evidence;
6. one selected change and one deliberate non-change with consequence, guardrail and uncertainty;
7. immutable v2 checkpoint and diff;
8. rerun linked to the source issue and an equivalent-input group;
9. failure-and-fix entry, provenance and incident relief where applicable;
10. exact disclaimer: “These assigned attempts test task behavior and boundaries in a small course sample; they do not establish demand or market validation.”

Optional fourth/fifth attempts are either system-issued incident replacements or evaluator-issued enrichment. Author social reach cannot unlock them or improve the grade.

### Tester

A tester receives exactly three graded assignments across the flow: the Session 6 fresh attempt is assignment 1; one additional asynchronous task before Session 7 is assignment 2; the live Session 7 task plus its adversarial phase is one assignment 3, not two attempts. An incident-equivalent route may replace any assignment. Participation evidence is separate from author artifact evidence and requires:

- consent/route acknowledgement;
- uncoached attempt on the supplied role/input;
- observable state and evidence pointer;
- task result: success, partial, safe failure or unsafe failure;
- one specific friction/boundary observation;
- privacy/safety report or safe decline where needed.

The tester never scores the author.

## Actors and permissions

| Actor | May | May not |
| --- | --- | --- |
| Author | freeze v1/contract; inspect released qualified attempts; classify; change/non-change; freeze v2; rerun; contest | select testers; view hidden pressure early; coach live; delete adverse evidence; grade tester |
| Tester | accept/decline; consent; execute supplied task; capture allowed evidence; report unsafe behavior | view hidden answer; change acceptance contract; publish content; infer/assign grade |
| Matcher | route equivalent work; balance load; replace failures; preserve compatible access | use popularity, prestige, friendship, social graph or prior score as advantage |
| Deterministic validator | check identity/version/cardinality/sequence/privacy fields and rerun links | judge strategic quality or diagnose intent |
| Model coach | cite evidence, suggest likely layer/missing field with confidence | qualify disputed evidence, prioritize strategically, resolve safety, assign grade |
| Human scorer | score bounded author packet and participation exception using anchors | silently edit evidence or score without a criterion note |
| Moderator | resolve safety/privacy/equivalence/dispute/appeal; grant incident relief; double-score | erase history or expose accommodation details |
| Administrator | manage windows, versions, incidents, retention/export and queues | receive raw private prompts/payloads by default |

## Entities and cardinality

| Entity | Essential fields and relations |
| --- | --- |
| ExchangeWindow | ID/version, section scope, open/close/reveal times, matcher version/seed, variant embargo, incident state |
| Assignment | one author, one different tester, one role-card version, one input/case version, one route/evidence class, status/history, expiry, replacement parent/child |
| RoleCardVersion | role, permitted knowledge/action, task, success/safe-failure observations, prohibited disclosure |
| InputVariantVersion | equivalence group, condition class (`expected`, `edge`, `boundary`), payload schema, hidden pressure, section exposure state |
| AcceptanceContract | approved core task, success, safe failure, observability and authority boundary; immutable during exchange |
| PrototypeVersion | author, form adapter, checkpoint/hash, reachability/replay state, external processor declaration, v1/v2 relation |
| ConsentRecord | policy version, route, processor/data disclosure, accepted/declined/withdrawn time, evidence/retention choices |
| Attempt | assignment, v1 and contract hashes, start/end, task/safety states, coaching/contact flag, evidence refs, incident |
| Observation | structured result, friction, boundary, privacy class, redaction state, evidence ref; no population estimate |
| QualificationResult | deterministic checks, validator version, result, reason, reviewer/dispute relation |
| PredictionCommit | author, question, expected result/failure, confidence, timestamp before reveal |
| Issue | attempt/evidence refs, layer, consequence, severity within supplied case, frequency count in tiny sample, confidence |
| ReleaseDecision | selected change, deliberate non-change, evidence refs, expected effect, guardrail, reversal evidence |
| Rerun | source issue/attempt, equivalent-input group, v2 hash, result, regression/safety state |
| AuthorReleasePack | immutable references to all required evidence, V06 result, human score/moderation state |
| TesterParticipationRecord | assignments, structured observations, specificity checks, incident relief, V06P result |

Invariants:

- author and tester differ;
- one tester supplies at most one of an author's three minimum attempts;
- author cannot remove a qualified adverse attempt;
- every attempt binds to frozen v1, acceptance contract, role card, input and case versions;
- minimum set contains all three condition classes;
- evidence remains hidden until prediction commit and reveal time;
- rejection/dispute retains reason, reviewer, audit trail and replacement relation;
- rerun binds source issue, equivalent-input group and v2;
- artifact, participation and incident-relief evidence remain distinct.

## State machines

### Author/exchange

```text
DRAFT
→ READINESS_CHECKED
→ V1_AND_CONTRACT_FROZEN
→ EXCHANGE_OPEN
→ MINIMUM_EVIDENCE_PENDING
→ PREDICTION_COMMITTED
→ EVIDENCE_REVEALED
→ ISSUES_CLASSIFIED
→ RELEASE_DECIDED
→ V2_FROZEN
→ RERUN_RECORDED
→ PACK_SUBMITTED
→ MECHANICALLY_VALIDATED
→ HUMAN_SCORE_PENDING
→ COMPLETE
```

Permitted side states: `BLOCKED_BY_PLATFORM`, `FALLBACK_ACTIVE`, `DISPUTED`, `QUARANTINED_UNSAFE`, `REPAIR_REQUIRED`, `INCIDENT_RELIEF_GRANTED`. A retry creates a new version/attempt and never overwrites history.

### Assignment/attempt

```text
PROPOSED
→ ACCEPTED | DECLINED | EXPIRED | REASSIGNMENT_REQUIRED
→ CONSENTED
→ STARTED
→ EVIDENCE_SUBMITTED
→ QUALIFIED | REPAIR_REQUESTED | REJECTED | DISPUTED | QUARANTINED
→ RELEASED_TO_AUTHOR
→ CLOSED
```

Every transition records actor, timestamp, reason and idempotency key. `QUALIFIED` means authentic/complete observation, not necessarily task success.

### Freeze/reveal enforcement

- assignments cannot start before acceptance contract and v1 freeze;
- any post-freeze prototype change creates v1.1 and invalidates/reassigns not-yet-started assignments; started attempts retain original hash;
- author cannot query attempt content or aggregate outcomes before `PREDICTION_COMMITTED` and window reveal;
- acceptance criteria change only inside the explicit Release Decision and applies to v2, never retroactively;
- hidden condition text remains tester/evaluator-visible only until reveal policy allows it.

## Matching and fairness

The versioned deterministic matcher:

1. counts the Session 6 fresh attempt plus one asynchronous pre-Session-7 assignment and one live two-phase Session 7 assignment, for exactly three graded outbound assignments per learner;
2. guarantees each author expected, edge and boundary condition coverage;
3. prohibits self-pairs and duplicate minimum-credit tester/author pairs;
4. avoids reciprocal pairs where roster constraints permit;
5. routes by task/role-card comprehension, modality, timing and prototype adapter compatibility;
6. never routes by company prestige, prototype polish, prior grade, popularity, friendship or social graph;
7. preserves stream/Finance authenticity without requiring same-stream testers;
8. uses capability flags (`keyboard`, `screen_reader`, `text_only`, `asynchronous`, `extended_window`) without exposing accommodation/diagnosis;
9. rotates equivalent variants by section, tracks exposure and applies embargo rules;
10. detects decline, expiry, broken endpoint, absence, unsafe content and invalid evidence before the replacement SLA;
11. stores matcher version, seed, tie-break and reason codes;
12. maintains a named unmatched/imbalance/incident queue.

### Replacement SLA

- pre-class assignment declined/expired before T-2 hours: replace within 12 hours and no later than T-2 hours;
- decline/expiry at or after T-2 hours: issue an immediate live-compatible reassignment or calibrated incident-equivalent pack; author and tester receive relief until the replacement route is available;
- live assignment: automated replacement within 90 seconds; section incident desk intervenes by 3 minutes;
- broken/unsafe endpoint: quarantine immediately, preserve author/tester incident relief, issue compatible route;
- if live peer coverage cannot be restored, issue a calibrated equivalent pack and label its evidence class.

### Evidence classes and claims

| Class | Supports author diagnosis/release | Supports tester participation | May be called “peer/user evidence” publicly |
| --- | --- | --- | --- |
| `live_peer` | yes | yes | “assigned peer task attempt,” never market validation |
| `cached_peer_replay` | yes, with incident label | replacement credit if tester originally completed it | only as replayed course attempt |
| `calibrated_simulation` | yes | incident-equivalent task credit | no |
| `facilitator_case` | yes | incident-equivalent task credit | no |

## Transition authority matrix

| From | Action / actor | Guard | To | Event | Retry/terminal rule |
| --- | --- | --- | --- | --- | --- |
| PROPOSED | accept / assigned tester | unexpired; compatibility route visible | ACCEPTED | `assignment_accepted` | idempotent; may then consent |
| PROPOSED | decline / tester | reason privately recorded | DECLINED | `assignment_declined` | terminal for this assignment; matcher creates replacement |
| PROPOSED | expire / system | deadline passed | EXPIRED | `assignment_expired` | terminal; matcher creates replacement |
| PROPOSED/ACCEPTED | reassign / matcher or moderator | incompatibility, endpoint or incident | REASSIGNMENT_REQUIRED | `assignment_reassigned` | old record terminal; new assignment relation required |
| ACCEPTED | consent / tester | policy/processor/data version shown | CONSENTED | `consent_acknowledged` | withdrawal allowed; cannot start without consent |
| ACCEPTED | decline consent / tester | any reason | DECLINED | `assignment_declined` | no penalty; replacement required |
| CONSENTED | start / tester | v1/contract/card/input hashes frozen; route healthy | STARTED | `task_attempt_started` | retry creates new attempt ID |
| STARTED | submit / tester | structured state and evidence present | EVIDENCE_SUBMITTED | `attempt_evidence_submitted` | idempotent on submission key |
| EVIDENCE_SUBMITTED | qualify / validator | completeness/version/privacy checks pass | QUALIFIED | `attempt_qualification_passed` | qualification can be disputed, not overwritten |
| EVIDENCE_SUBMITTED | request repair / validator/reviewer | repairable missing evidence | REPAIR_REQUESTED | `attempt_qualification_failed` | returns to EVIDENCE_SUBMITTED with new version |
| EVIDENCE_SUBMITTED | reject / reviewer | inauthentic, wrong-version or unusable evidence | REJECTED | `attempt_qualification_failed` | terminal; replacement relation required |
| any active attempt | quarantine / system or moderator | unsafe/privacy/identity/secret signal | QUARANTINED | `attempt_quarantined` | cannot progress; moderator releases sanitized evidence or closes/replaces |
| QUALIFIED | dispute / author or tester | criterion/evidence reason | DISPUTED | `attempt_disputed` | author reveal paused for disputed content until moderator decision |
| QUALIFIED | reveal / system | author prediction committed and reveal window open | RELEASED_TO_AUTHOR | `evidence_reveal_opened` | immutable adverse evidence retained |
| RELEASED_TO_AUTHOR | close / system | author pack references attempt or reasoned disposition | CLOSED | `peer_test_completed` | terminal |

`DECLINED`, `EXPIRED`, `REASSIGNMENT_REQUIRED`, `REJECTED`, and unresolved `QUARANTINED` records never proceed to consent/start/reveal. They require a new linked assignment or moderator resolution. Only the tester accepts/consents/starts/submits; only the versioned matcher proposes/reassigns; only validators qualify mechanical evidence; only a named human resolves quarantine/dispute/incident equivalence.

## Privacy, consent and safe access

- Use supplied synthetic inputs and pseudonymous identities; tester never enters personal/third-party data.
- No personal email/social sign-in, payment, browser extension, broad connector, contact import or unsanctioned cookie/tracking permission.
- Supported external prototypes declare processor, data sent, region where known, retention/deletion, cookies/analytics and author-visible fields before consent.
- Prefer a controlled proxy/replay adapter. Author logs receive a pseudonymous attempt ID and cannot expose tester identity/IP/user-agent beyond coarse technical diagnostics held by the platform operator.
- Tester can decline without grade penalty for privacy, content, identity, harassment or accessibility boundaries; reason stays private to moderator.
- Consent withdrawal quarantines unreleased evidence immediately. Required academic evidence is redacted/minimized under the approved retention policy; public/optional media is deleted/unpublished.
- Recording/quote is optional. Equivalent evidence: text, structured event, accessible annotated image or captioned recording.
- A core route must pass keyboard/screen-reader preflight. Inaccessible endpoints receive compatible replay rather than using a learner's disability as a test.
- Secrets/PII, harmful content and unauthorized identity/voice trigger quarantine and moderator review.

Adapter threat tests cover app, workflow, grounded assistant, dashboard/model and data-pipeline forms: sign-in request, tracking identifier, prompt/log PII, secret leakage, connector scope, unsafe content, withdrawal and deletion.

## Validation and scoring boundary

### V06 — author pack

Deterministic checks cover IDs/versions, unique testers, 3–5 count, expected/edge/boundary mix, frozen v1/contract, all qualified adverse evidence retained, issue/evidence links, selected change, deliberate non-change, v2 relation, equivalent rerun, provenance, disclaimer and incident class.

Model coaching may suggest missing evidence or likely failure layer with citations/confidence. It does not qualify disputed attempts, judge business consequence/priority or score the 30% stream overlay.

A trained human scores 100% of the bounded final prototype packet. Moderator handles disputes, safety, borderlines and appeals; ≥10% is blind-double-scored under the Gradebook Map.

### V06P — tester participation

Deterministic checks cover accepted/incident-equivalent assignments, consent, uncoached completion, observable task/safety state, evidence pointer, specific friction/boundary observation, duplicate/copied/empty response and safe-decline route. Model coaching may flag vague evidence; a human adjudicates abuse, authenticity disputes and conduct deductions.

## Event dictionary

All events include actor pseudonym, section, exchange/assignment/attempt IDs, schema version, privacy class, timestamp and idempotency key as applicable.

| Family | Events | Additional properties |
| --- | --- | --- |
| matching | `exchange_window_opened`, `assignment_proposed`, `assignment_accepted`, `assignment_declined`, `assignment_expired`, `assignment_reassigned` | matcher/seed, route flags, reason, replacement relation |
| freeze/reveal | `acceptance_contract_frozen`, `prototype_version_frozen`, `prediction_committed`, `evidence_reveal_opened` | hashes, reveal rule, incident state |
| consent/privacy | `consent_acknowledged`, `consent_withdrawn`, `evidence_redacted`, `attempt_quarantined` | consent version, evidence/retention class, reason |
| attempt | `task_attempt_started`, `attempt_evidence_submitted`, `peer_test_completed` | role/input/case versions, prototype hash, task/safety state, evidence refs |
| qualification | `attempt_qualification_passed`, `attempt_qualification_failed`, `attempt_disputed`, `attempt_replacement_issued` | validator, reason, reviewer, replacement |
| decision | `issue_classified`, `release_decision_saved` | evidence refs, layer, consequence, confidence, change/non-change/guardrail |
| rerun | `rerun_started`, `rerun_linked`, `rerun_completed` | source issue, equivalence group, v1/v2 hashes, result, incident |
| scoring | `author_pack_submitted`, `tester_participation_submitted`, `primary_score_completed`, `moderation_completed`, `score_released` | pack/rubric/anchor versions, scorer, sample stratum, contest state |

Do not collect raw private payloads, inferred friendships, accommodation diagnoses, keystrokes or general time-on-page surveillance.

## Session 07 measurement map

| Learning/quality question | Numerator / denominator | Required events/evidence | Exclusions and fairness cuts | Decision threshold and owner | Retention class |
| --- | --- | --- | --- | --- | --- |
| Can learners distinguish behavior from opinion/noise? | correct classifications / valid classification prompts | `issue_classified`, observation class, quiz family | exclude broken prompt; cut by section/path/mode/readiness/access route | <80% after repair triggers content review; assessment lead | academic evidence |
| Does evidence change the pre-reveal prediction? | release packs with acknowledged prediction change or evidence-based confirmation / valid packs | `prediction_committed`, `evidence_reveal_opened`, `release_decision_saved` | incident-equivalent reported separately; same fairness cuts | monitor, no target direction; unsupported/no-reference >10% triggers coaching review; lesson owner | academic evidence |
| Is failure-layer diagnosis plausible and cited? | human-scored demonstrated+ / scored packs | issue/evidence refs, primary score criterion | exclude platform-only incidents; cut by path/section/scorer | <75% or >10-point path gap triggers pack/scorer review; assessment lead | grade evidence |
| Does v2 improve intended task without breaking guardrail? | qualified improved-or-correct-safe-stop reruns / valid reruns | `rerun_linked`, `rerun_completed`, regression state | incident-adjusted; cut by adapter/path/section | <80% triggers fixture/instruction review; technical + lesson owner | academic evidence |
| Are safe failures recognized? | correctly classified safe stops / safe-stop fixtures | task/safety state, qualification, issue class | track by variant exposure and path | <80% triggers repair; assessment lead | academic evidence |
| Is model coaching aligned with humans? | agreement within approved category/tolerance / moderated sample | model suggestion/confidence, human score/moderation | report by criterion/path/section; no automated adverse action | threshold frozen after pilot; below threshold disables affected suggestion; assessment lead | QA evidence |
| Is exchange access fair? | qualified/incident-equivalent minimum completed / assigned learners | matching, replacement, qualification, incident events | cut by section/path/mode/readiness/access route; suppress small cells | target 100%; any unexplained gap blocks release; LMS product lead | operations/QA |

All rates are incident-adjusted and version-specific. Small task samples never become population or market metrics.

## Operations at 480 learners

| Queue | Owner | Target |
| --- | --- | --- |
| unmatched/expired/broken assignment | central exchange desk | automated 90 seconds live; human 3 minutes |
| unsafe/privacy quarantine | privacy/safety moderator | immediate containment; acknowledge within 5 minutes live |
| invalid/noise tester evidence | section reviewer | repair/replacement within live window or 12 hours async |
| accessibility route | access coordinator/automation | preflight before assignment; no public reason |
| scoring | trained section scorer | per gradebook SLA |
| moderation/appeal | cross-section moderator | before score release |

One unaided instructor is not the operating assumption. Phase 0 must measure the incident rate and staff the central desk plus section support lane accordingly.

## Required synthetic load/equivalence test

Before launch, run the versioned matcher against a 480-person synthetic roster with uneven streams/Finance paths, staggered sections, absences, declines, extended windows, text-only/screen-reader routes, broken endpoints, unsafe content, duplicate submissions and leaked variants.

Pass only when:

- every learner receives three qualified attempts or explicit incident-equivalent evidence;
- every minimum author set covers expected/edge/boundary;
- no self-pair or duplicate minimum-credit tester appears;
- every learner has exactly three credited outbound assignments after incident relief; for actual started attempts, `P95 − P5 ≤ 1` and no learner starts more than four required/replacement attempts unless they explicitly opt into ungraded enrichment;
- no route exposes accommodation status;
- replacement SLAs and idempotency hold;
- later-section variants remain unexposed or are replaced;
- completion, qualification, dispute, fallback and incident rates are reviewed by section, path, mode, prior readiness band and accessible route;
- live facilitator workload remains within the staffed queue model.

## Release fixtures

The implementation ships pass, partial, fail, unsafe, unavailable, duplicate-tester, wrong-version, early-reveal, missing-boundary, cherry-picked-adverse, invalid-rerun, dispute, replacement, consent-withdrawal, accessibility, section-leakage and platform-incident fixtures for both V06 and V06P.

Any missing state, unmatched learner, privacy failure, inaccessible core route, invalid grade relation or unrecoverable incident is a release blocker.
