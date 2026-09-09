# LMS Skill Forward Test — Session 07 Task-Attempt Exchange

**Test date:** 17 July 2026  
**Skill under test:** `mu-design-lms`  
**Lesson input:** `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md`  
**Compared with:** `docs/lms/course-1-lms-concept.md` and `docs/lms/validator-contracts.md`  
**Scale assumption:** 480 learners, eight sections of approximately 60 learners  
**Release verdict:** **FAIL** — the learning design is strong, but the current LMS and validator contracts do not yet specify an implementable, reproducible, and fair exchange at this scale.

## Test method

This is a clean forward test, not a summary of the current LMS concept. I first derived the minimum system that Session 07's outcome and evidence contract require. I then compared that derived specification with the current concept and validator contracts.

The test asks whether the product can support the claim:

> Given three to five LMS-assigned role-card attempts on a frozen role-authentic prototype, a learner can diagnose observed failure, choose and make one justified release, rerun the relevant task, and preserve inspectable evidence of both the change and the deliberate non-change.

It does **not** treat satisfaction, clicks, compliments, visual polish, public traffic, or three to five attempts as evidence of demand or market validation.

## Forward-derived mission specification

### Mission identity

| Field | Required contract |
| --- | --- |
| Mission | Earn Evidence from Task Attempts |
| Primary capability | Observe behavior, diagnose a failing layer, make an evidence-led release decision, repair, and rerun |
| Student modes | Author/builder and assigned tester; each learner performs both roles |
| Starting state | Approved acceptance contract plus frozen, reachable or replayable prototype v1 |
| Minimum author evidence | Three qualified attempts: at least one expected task, one messy/edge input, and one assigned boundary/failure condition |
| Minimum tester evidence | Two pre-class assigned tests plus one live assigned test, unless an incident-equivalent route is invoked |
| Ending state | Frozen Task-Evidence and Release Pack linked to v1, v2, attempts, issue trail, selected change, non-change, rerun, provenance, and incident relief if any |
| Assessment claim | Artifact reliability and ownership; reviewer participation is a separate claim |
| Explicit non-claim | The attempt set does not validate demand, adoption, or market fit |

At the three-attempt minimum, the exchange must produce at least **1,440 received attempt records coursewide** and approximately **180 per section**, before replacements, disputes, accessibility alternatives, or optional fourth and fifth attempts. This is a routing and reliability system, not an informal peer-feedback feature.

### Required actors and authority

| Actor | Permitted actions | Prohibited or bounded actions |
| --- | --- | --- |
| Author | Freeze contract and v1; inspect released attempt evidence; classify issues; choose change/non-change; freeze v2; rerun; contest invalid evidence | Cannot select friendly testers, see hidden pressure before the attempt, coach a tester during a run, delete an adverse attempt, or grade the tester |
| Tester | Accept/decline assignment; consent; use supplied role/input; execute without coaching; record observable state and privacy-safe evidence; report unsafe behavior | Cannot see the hidden answer, alter the acceptance contract, infer a grade, or publish prototype content |
| Matcher | Assign equivalent work, balance load, issue replacements, and preserve accommodations without disclosure | Cannot use popularity, employer prestige, friendship, or prior score as advantage |
| Deterministic validator | Verify versions, relationships, fields, cardinality, event sequence, privacy flags, and rerun linkage | Cannot judge strategic business quality |
| Model coach | Suggest evidence spans, a likely failure layer, or a missing field with rubric citation and confidence | Cannot qualify an attempt finally, decide strategic priority, resolve safety disputes, or assign the high-stakes score |
| Facilitator/reviewer | Resolve safety, privacy, equivalence, dispute, and borderline judgment; grant reasoned incident relief | Cannot silently edit evidence or override without an audit note |
| Program administrator | Manage windows, section routing, incident scope, retention, export, and moderation queues | Does not receive raw prompts or restricted evidence by default |

### Minimum entity and relationship model

The generic `Peer Review` record is insufficient. Session 07 requires the following versioned graph:

```text
ExchangeWindow
  ├── Assignment (author, tester, route, algorithm version, status)
  │     ├── RoleCardVersion
  │     ├── InputVariantVersion / equivalence group
  │     ├── ConsentRecord
  │     └── Attempt
  │           ├── frozen AcceptanceContract
  │           ├── frozen PrototypeVersion v1
  │           ├── Observation / EvidenceRef[]
  │           ├── QualificationResult
  │           └── dispute / quarantine / incident link
  └── AuthorReleasePack
        ├── PredictionCommit
        ├── Issue[] → Attempt/EvidenceRef[]
        ├── ReleaseDecision (change + non-change)
        ├── PrototypeVersion v2
        ├── Rerun → source Attempt + equivalent InputVariant
        ├── FailureAndFixEntry
        └── ValidatorResult / HumanAudit
```

Required invariants include:

- an author and tester are different learners;
- the same tester does not satisfy multiple minimum attempts for the same author;
- each attempt is bound to one immutable v1 hash/checkpoint, acceptance contract, role card, input variant, and case version;
- the minimum set covers expected, messy/edge, and boundary/failure conditions;
- evidence is hidden from the author until the prediction commit and reveal gate;
- an author cannot remove a qualified adverse attempt;
- a rejected or disputed attempt has a reason, reviewer, replacement relation, and retained audit trail;
- a rerun names its source failure, equivalent-input group, v2 checkpoint, and outcome;
- reviewer-participation evidence is stored separately from the author's artifact evidence;
- platform incidents and accessibility alternatives remain linked without becoming learner failure labels.

### State machines

#### Exchange and author state

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
  → HUMAN_AUDIT_PENDING | COMPLETE
```

Side states must include `BLOCKED_BY_PLATFORM`, `FALLBACK_ACTIVE`, `DISPUTED`, `QUARANTINED_UNSAFE`, `REPAIR_REQUIRED`, and `INCIDENT_RELIEF_GRANTED`. A retry creates a new version or attempt; it must not overwrite history.

#### Assignment and attempt state

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

Transitions require idempotency keys. `QUALIFIED` is not synonymous with task success: success, partial completion, safe failure, and unsafe failure can all be qualified observations when the record is complete and authentic.

### Required event contract

The lesson's event list is a sound start. An implementable contract also requires:

| Event family | Required events or additions | Critical properties |
| --- | --- | --- |
| Matching | `exchange_window_opened`, `assignment_proposed`, `assignment_accepted`, `assignment_declined`, `assignment_expired`, `assignment_reassigned` | assignment ID, author/tester pseudonyms, section, stream/path, mode, algorithm and seed version, compatibility flags, reason code |
| Freeze/reveal | `acceptance_contract_frozen`, `prototype_version_frozen`, `prediction_committed`, `evidence_reveal_opened` | immutable hashes, timestamps, reveal rule, incident status |
| Consent/privacy | `consent_acknowledged`, `consent_withdrawn`, `evidence_redacted`, `attempt_quarantined` | consent version, evidence privacy class, retention class, reason; no accommodation detail |
| Attempt | existing `task_attempt_started` and `peer_test_completed`, plus `attempt_evidence_submitted` | role/input/case versions, prototype hash, task state, safety state, evidence refs, coaching/contact flag |
| Qualification | `attempt_qualification_passed`, `attempt_qualification_failed`, `attempt_disputed`, `attempt_replacement_issued` | check results, validator version, reviewer reason, replacement relation |
| Diagnosis/release | existing `issue_classified` and `release_decision_saved` | attempt/evidence refs, failure layer, consequence, confidence, change, non-change, guardrail, reversal evidence |
| Rerun | existing run events plus `rerun_linked` | source failure ID, equivalence group, v1/v2 hashes, result, incident ID |
| Submission/audit | existing `revision_submitted`, plus `reviewer_participation_submitted`, `human_audit_completed`, `score_released` | frozen pack version, rubric/anchor version, audit sample stratum, contest status |

Raw prompts, private payloads, inferred friendship, disability/accommodation details, and keystroke/time-on-page surveillance are not required event properties.

### Matching and fairness contract

For the minimum viable exchange, the matcher must:

1. issue every learner two pre-class outbound assignments and one live outbound assignment, producing three received attempts per author at minimum;
2. guarantee expected, messy/edge, and boundary/failure coverage across the author's set;
3. prevent self-assignment, duplicate tester-to-author credit, and reciprocal pairs where the roster permits;
4. bind an assignment to the author's frozen v1 before the tester begins;
5. route by task compatibility, role-card comprehension, modality, and timing—not by company prestige, prior grade, social network, or technical polish;
6. preserve Finance subpath and stream authenticity without requiring every tester to belong to the same stream;
7. provide accessible modality compatibility without disclosing accommodation status to peers;
8. randomize equivalent input variants and rotate them across sections so later sections do not inherit exposed hidden prompts;
9. detect decline, expiry, endpoint failure, absence, unsafe content, and invalid evidence early enough to issue a replacement;
10. publish a section-level unmatched and imbalance queue with an owner and SLA;
11. store matcher version, deterministic tie-break, and reason codes so distribution and incident relief can be audited; and
12. keep fallback evidence visibly labelled as live peer, cached peer replay, calibrated simulated case, or facilitator-authored case.

Friendship cannot be reliably inferred and should not be collected. Pseudonymization, non-reciprocity, randomization, and author inability to select or discard testers are the defensible controls.

### Validation and judgment boundary

| Decision | Deterministic | Model-assisted | Human/calibrated review |
| --- | --- | --- | --- |
| Assignment/identity/version validity | Primary | None | Exception only |
| Required attempt count and condition mix | Primary | None | Incident-equivalence approval |
| Consent version and privacy field presence | Primary | Redaction suggestion only | Ambiguous content and withdrawal |
| Observable task-state record completeness | Primary | Missing-evidence suggestion | Disputed authenticity |
| Failure-layer diagnosis | Schema/evidence-link presence | Coaching with cited spans and confidence | Strategic or contested diagnosis |
| Severity and business consequence | Field presence only | Suggestion | Stream judgment and borderlines |
| Change/non-change completeness | Primary for fields and evidence refs | Coherence coaching | Priority quality and 30% overlay |
| Rerun linkage and mechanical outcome | Primary | Log explanation | Whether safe escalation satisfies the business contract |
| Reviewer participation quality | Completion and evidence specificity | Coaching | Flags, abuse, and borderlines |
| Final high-stakes score | Evidence supplied only | Never sole judge | Audit model in the assessment contract |

### Privacy, safety, accessibility, and recovery

The session needs explicit operational controls beyond a generic consent checkbox:

- use supplied synthetic inputs and pseudonymous LMS identities; never ask testers to enter their own or another person's data;
- prohibit evaluator sign-up with personal email, social login, payment, browser extension, or broad connector permission;
- either proxy external prototypes through a controlled shell or disclose the external processor, data sent, retention, and deletion route before consent;
- strip author-controlled analytics identifiers that could reveal tester identity;
- permit text, structured event, accessible annotated image, or captioned recording evidence; a quote or recording is never mandatory;
- preflight one keyboard/screen-reader-readable route or issue an equivalent replay; do not make an assigned tester prove an inaccessible interface is unusable by being unable to participate;
- allow decline or safe-stop without grade penalty when content, identity, harassment, privacy, or accessibility boundaries are breached;
- preserve the learning construct during outage with a calibrated trace/replay pack, but label it as incident-equivalent rather than genuine peer behavior;
- distinguish author artifact credit, tester participation credit, and incident relief so one platform failure does not create two student penalties; and
- define retention, withdrawal, evidence deletion, administrative access, and appeal rules before the exchange opens.

### Learning and operations telemetry

Session 07 telemetry should answer learning and fairness questions, not measure engagement volume:

- What share of learners correctly separates behavior, opinion, and noise before and after the mission?
- Does diagnosis cite evidence and identify a plausible layer rather than defaulting to prompting?
- How often does observed evidence change the pre-reveal prediction?
- Does the v2 rerun improve the intended task without breaking its guardrail?
- Are safe failures recognized as correct boundaries?
- Are attempt qualification, replacement, dispute, fallback, completion, and audit rates equivalent by section, stream/Finance path, mode, prior readiness band, and accessible pathway?
- How often do model suggestions disagree with human audits, by criterion and case version?
- How much facilitator time is spent on unmatched assignments, unsafe content, technical incidents, disputes, and grading?

All rates must be incident-adjusted. Small attempt counts must not be presented as market validation or generalized user preference.

## Comparison with the current package

### What already passes

1. **Learning alignment:** Session 07 has a precise observable outcome, strong output contract, prediction-before-evidence step, failure-layer diagnosis, change/non-change decision, rerun, and honest tiny-sample language.
2. **Career coverage:** the lesson gives all nine streams and all three Finance paths role-authentic tester roles, failures, consequences, and release evidence.
3. **Judgment doctrine:** the concept and assessment system correctly separate deterministic evidence, model coaching, peer observation, and human high-stakes judgment.
4. **Failure posture:** cached replay, paper packs, precomputed logs, incident overrides, frozen submissions, and no-penalty platform relief are strong foundations.
5. **Accessibility posture:** the lesson and LMS concept support non-voice evidence, captioned media, readable role cards, timing alternatives, and no grade for polish or speaking speed.
6. **Telemetry restraint:** the current concept explicitly rejects raw prompts, sensitive payloads, keystrokes, prompt volume, and time online as default analytics or scoring signals.
7. **Assessment scale:** 100% mechanical checks, 100% structured peer attack, at least 20% stratified human audit, and cross-section double scoring are directionally feasible if staffed.

### Blockers

#### B1 — No implementable exchange state and entity contract

**Evidence:** `course-1-lms-concept.md` under **Core domain entities** has `Peer Review`, `Attempt`, and generic versioned objects, but no explicit Assignment, Exchange Window, Role Card/Input Variant version, Consent Record, Qualification Result, Issue, Release Decision, Rerun relation, or reviewer-participation record. Shell E describes the experience but not its legal transitions.

**Why this blocks release:** the system cannot prove which frozen prototype, acceptance test, role, input, tester, consent, and failure a release decision refers to. Late, duplicate, withdrawn, disputed, unsafe, and replacement attempts have no canonical lifecycle. A rerun or score would not be reproducible.

**Required repair:** add the entity graph, cardinalities, state machines, transition permissions, immutable version bindings, reveal gate, idempotency rules, dispute/quarantine states, and event schemas derived above.

**Release test:** replay a complete attempt from frozen records; reject an illegal transition; submit a duplicate idempotently; replace an expired assignment without double credit; quarantine and recover an unsafe attempt without erasing history.

#### B2 — V06 does not validate the lesson's minimum evidence contract

**Evidence:** Session 07's **Complete output contract** requires three to five attempts covering expected, messy/edge, and assigned boundary/failure conditions, plus an issue trail, one change, one rejected/deferred change, v2, a linked rerun, failure-and-fix entry, and provenance. `validator-contracts.md` **V06** checks only tester separation, role/input version, task state, redaction, evidence citation in a change/no-change decision, and an equivalent-input rerun.

**Why this blocks release:** a learner can pass V06 with one incomplete or cherry-picked attempt, no condition mix, no immutable v1/v2 relation, no issue trail, no honest small-sample statement, and no proof that an adverse qualified attempt was retained. The validator therefore does not support the assessed claim.

**Required repair:** expand V06 or create a Session 07 pack validator for minimum unique testers, condition coverage, frozen acceptance contract and prototype hashes, qualification result, evidence pointers, issue fields, change and non-change, rerun source/equivalence, provenance, no-market-validation wording, and incident-equivalent handling.

**Release test:** ship pass, partial, fail, unsafe, unavailable, cherry-picked, duplicate-tester, wrong-version, missing-boundary, invalid-rerun, disputed, accessibility, and platform-incident fixtures.

#### B3 — Matching fairness and replacement operations are still an open decision

**Evidence:** Session 07 says to match by compatible role card, avoid reciprocal pairs, pseudonymize, and fill missing attempts. The LMS concept's **Open decisions** still lists assignment and equivalence rules for three to five task attempts. Neither contract defines capacity, assignment cardinality, load balancing, route compatibility, variant rotation, expiry, replacement SLA, dispute, or an auditable matching algorithm.

**Why this blocks release:** at minimum the course needs 1,440 received attempt records. Missing or low-quality assignments will systematically affect the author's prototype score and the tester's participation score. Manual friend-matching or ad hoc fallback would introduce social-access, stream, section, and facilitator bias.

**Required repair:** freeze the matching contract above, including algorithm version/seed, non-self and unique-tester rules, non-reciprocity where possible, condition coverage, accessibility-safe compatibility, section leakage controls, expiry/reassignment, fallback evidence classes, and incident relief.

**Release test:** run the matcher on a synthetic 480-person roster with uneven stream/Finance distribution, absences, declines, accessibility routes, broken endpoints, and section timing. Verify 100% minimum coverage or explicit incident-equivalent assignment, bounded burden, no self-pairs, no duplicate minimum credit, and parity reports.

#### B4 — External-prototype privacy and consent boundary is not operationalized

**Evidence:** the documents correctly require consent, redaction, no PII, and minimal telemetry, but an assigned learner may still be sent to another student's externally hosted prototype. The contracts do not prohibit personal sign-in, declare external processors/retention, prevent author-side identity tracking, define consent withdrawal, or specify safe decline and deletion.

**Why this blocks release:** a compulsory assessed exchange could expose identity, IP address, account data, prompt content, or sensitive browser/connector permissions to a peer-controlled or vendor-controlled endpoint. A generic acknowledgement does not make that exposure necessary or informed.

**Required repair:** freeze a controlled test-input and account policy; prohibit personal sign-in, payment, extensions, broad connectors, and unsanctioned tracking; proxy or disclose external processing; pseudonymize author-visible logs; define withdrawal, retention, deletion, quarantine, and no-penalty decline.

**Release test:** privacy threat-model the app, workflow, grounded assistant, dashboard/model, and pipeline adapters; test sign-in requests, tracking identifiers, prompt/log PII, secret leakage, consent withdrawal, evidence deletion, and unsafe-content reporting.

### Major gaps

#### M1 — Prediction-before-reveal and v1 freeze are pedagogical instructions, not enforced transitions

The lesson commits a prediction before opening received evidence, and the task-attempt start should bind to v1. Current events include `prediction_committed` and `task_attempt_started`, but the concept does not prevent early evidence access or an author silently changing v1 while attempts are in flight. Add hard freeze/reveal transitions and bind every attempt to the immutable acceptance contract and prototype hash.

#### M2 — Fallback evidence classes are conflated

The lesson allows a calibrated simulated or facilitator-approved attempt pack when matching fails. This can preserve diagnosis and release-decision assessment, but it is not observed peer behavior and cannot support the same participation or public “tested by users” claim. Record `live_peer`, `cached_peer_replay`, `calibrated_simulation`, and `facilitator_case` evidence classes; define which scores and claims each supports; show incident relief separately.

#### M3 — Tester participation has no dedicated validation contract

The assessment gives 4% for two assigned peer attacks with observable evidence and one useful comment. V06 is builder-centered and does not define tester quality, abuse/sabotage handling, coaching/contact disclosure, or replacement when a tester submits noise. Add a separate reviewer-participation result with observable-task completeness and evidence specificity; peers never grade strategic quality.

#### M4 — Qualification and strategic judgment boundaries inside V06 are underspecified

V06 lists undifferentiated “Checks.” It does not state which are deterministic, model-assisted, or human, even though task authenticity, equivalent inputs, failure layer, severity, safe escalation, and business consequence contain judgment. Divide checks using the boundary table above and require evidence citations, confidence, and contest routing for model suggestions.

#### M5 — Accessibility is not a matcher constraint

The lesson has strong accessible evidence alternatives, but matching does not state how a learner who needs keyboard, screen-reader, text-only, asynchronous, or extended-time access receives a compatible route without exposing accommodation data. Add capability flags rather than diagnosis fields, preflight the route, issue equivalent replay when necessary, and report parity without identifying individuals.

#### M6 — Event properties cannot yet support validity or fairness analysis

The existing event taxonomy omits assignment status/history, matcher/case/role/input versions, v1/v2 hashes, evidence privacy class, author reveal time, qualification result/version, replacement relation, fallback evidence class, dispute, and incident link. Without these, the promised section/stream fairness, false-positive review, and score reproduction cannot be calculated.

#### M7 — The acceptance test can be gamed unless approved and frozen

V06 records a task result, while V05 says the core task is replayable, but neither requires the evaluator to use the Session 6 approved acceptance contract or a hidden condition. An author could weaken success criteria after seeing failures. Bind the approved contract to v1, lock it during exchange, and allow changes only as explicit release decisions; hidden pressure remains evaluator-controlled.

#### M8 — Live staffing and operational load are unresolved

The concept leaves facilitator-to-student ratio open. During one 120-minute section, approximately 60 learners can simultaneously encounter broken endpoints, invalid attempts, consent/safety issues, accessibility reroutes, validator disputes, and 17-minute repair windows. The lesson also asks each facilitator to run every represented stream card. Freeze an operating model, centralize golden-card QA, define matcher/incident desk ownership, and load-test the post-class audit plus flag queue. One unaided instructor is not a credible assumption.

#### M9 — Variant equivalence and cross-section leakage lack a Session 07 protocol

The documents require equivalent failures but do not specify an equivalence blueprint, seeded variant allocation, embargo, exposure tracking, or drift review for the role-card pressure prompts. Later sections may receive leaked conditions or systematically easier repairs. Pilot item/task equivalence, rotate variants by section and stream, record exposure, and use common anchor replays.

### Minor gaps

1. Rename `qualified_use_received` to `qualified_attempt_received`; “use” can overstate simulated/fallback evidence and the tiny sample's meaning.
2. Replace the stale `Company Brief` entity fields (`company, function, problem, target user`) with the frozen formal spine: target role, representative work context, consequential decision, inspectable evidence, and operator/advisor/investor mode.
3. Store `frequency within this small sample` as a descriptive count only. It should not dominate prioritization or be surfaced as a population estimate.
4. Clarify whether the live clean task plus adversarial extension is one attempt with two phases or two attempts. Cardinality, participation credit, and condition coverage depend on the answer.
5. Define whether the optional fourth and fifth attempts are author-requested follow-ups, incident replacements, or enrichment. They must not create an advantage for learners with more available peers or more polished prototypes.

## Required release evidence

Session 07 should move from FAIL only when the package contains:

1. a versioned entity/state/event specification for the exchange;
2. an expanded V06 plus a separate tester-participation validator;
3. a matching/equivalence/variant-rotation policy and a successful 480-learner synthetic roster test;
4. an external-prototype privacy threat model, consent copy, retention/deletion rules, and adapter-specific safety tests;
5. accessibility-aware routing and an equivalent no-network/no-endpoint path;
6. pass, partial, fail, unsafe, unavailable, dispute, replacement, accessibility, and incident fixtures;
7. an operations runbook with staffing, SLAs, escalation owners, section leakage controls, and load rehearsal;
8. criterion-level human/model agreement checks and stream-equivalence anchors; and
9. a telemetry dictionary that can reproduce every graded state and answer the stated learning/fairness questions without collecting raw prompts or sensitive payloads.

## Final verdict

**FAIL**

The lesson itself is one of the strongest parts of the course package: it creates a real ownership and reliability moment, uses all nine career streams credibly, resists fake-user theatre, and includes sensible fallbacks. The current LMS concept captures the right product posture, but Shell E and V06 remain conceptual. Until assignment, version, reveal, qualification, consent, replacement, rerun, dispute, and incident states are made explicit—and the 480-learner matcher is tested—the platform cannot validly or safely support the Session 07 assessment claim.

## Retest after revision

**Retest scope:** revised `mu-design-lms` skill, Session 07, `course-1-lms-concept.md`, `validator-contracts.md`, `course-1-assessment-system.md`, `course-1-gradebook-map.md`, and the new normative `task-attempt-exchange-contract.md`  
**Design-contract verdict:** **PASS WITH CHANGES**  
**Implementation/load-test readiness:** **NOT YET READY FOR PRODUCTION RELEASE**  
**New overall verdict:** **PASS WITH CHANGES**

The revision changes the result materially. All four original blockers are closed at the **design-contract** level. The package now specifies enough of the exchange to begin disciplined implementation and paper/pilot testing. It correctly states that implementation, privacy sign-off, equivalence testing, staffing approval, and the 480-learner load test remain pending; none is falsely represented as complete.

### Original blocker closure

| Original blocker | Retest result | Criterion-level evidence |
| --- | --- | --- |
| B1 — no implementable exchange state/entity contract | **Resolved for design** | `task-attempt-exchange-contract.md` now defines ExchangeWindow, Assignment, RoleCardVersion, InputVariantVersion, AcceptanceContract, PrototypeVersion, ConsentRecord, Attempt, Observation, QualificationResult, PredictionCommit, Issue, ReleaseDecision, Rerun, AuthorReleasePack, and TesterParticipationRecord. It supplies author/exchange and assignment/attempt state machines, immutable bindings, reveal enforcement, replacement relations, side states, idempotency, and history retention. The LMS concept makes this mission contract canonical rather than relying on generic Attempt/Peer Review entities. |
| B2 — V06 did not validate the lesson evidence contract | **Resolved for design** | Revised V06 requires three to five unique qualified attempts, expected/edge/boundary coverage, immutable v1/contract/card versions, adverse-evidence retention, prediction-before-reveal, issue/evidence links, change and non-change, v2 relation, source-linked equivalent rerun, provenance, evidence class, incident relation, and the small-sample disclaimer. The contract names corresponding pass/fail/adversarial fixtures. |
| B3 — matching fairness/replacement remained open | **Resolved for design; test pending** | The normative contract defines two pre-class plus one live outbound route, condition coverage, no self-pair, unique minimum testers, non-reciprocity where possible, accessibility-compatible routing, stream/path authenticity, section variant embargo, algorithm/seed/tie-break logging, replacement SLAs, evidence classes, and a named queue. It also defines the exact 480-person synthetic roster test and pass conditions. No result from that test exists yet. |
| B4 — external-prototype privacy/consent boundary was generic | **Resolved for design; sign-off and threat tests pending** | The contract prohibits personal sign-in, social login, payment, extensions, broad connectors, contact import, and unsanctioned tracking; requires processor/data/retention/cookie disclosure; prefers proxy/replay; pseudonymizes author-visible logs; supports safe decline and withdrawal; requires keyboard/screen-reader preflight; and defines adapter threat tests. Institution-approved retention, processor, privacy, and deletion decisions still need production sign-off. |

### Criterion-by-criterion retest

| Criterion | Design-contract status | Evidence and remaining condition |
| --- | --- | --- |
| State transitions | **Pass with change** | Dual state machines, side states, reveal enforcement, version invalidation, idempotency, and no-overwrite rules now exist. One ambiguity remains: the compact assignment diagram visually permits `DECLINED`, `EXPIRED`, or `REASSIGNMENT_REQUIRED` to flow to `CONSENTED`, and it does not show how each side state rejoins or terminates. Add an actor-by-transition legal/illegal transition table before coding. |
| Entities and relationships | **Pass** | The new entity/cardinality table covers every object needed to reproduce the graded state, including distinct author and tester records, consent, qualification, issue/release/rerun links, hashes, replacements, and audit history. The LMS concept also replaces the stale company/function/problem entity with the formal Work Sample Brief spine. |
| Event reproducibility | **Pass** | The exchange event dictionary includes matching, freeze/reveal, consent/privacy, attempt, qualification, decision, rerun, and scoring events with pseudonymous actor, section, exchange/assignment/attempt IDs, schema version, privacy class, timestamp, and idempotency key. It is sufficient to reconstruct a packet and distinguish learner, matcher, platform, reviewer, and incident actions. |
| Deterministic/model/peer/human boundaries | **Pass** | V06 and V06P distinguish mechanical checks from cited model coaching and named human adjudication. Peers observe but never score authors. The assessment system and gradebook now require a trained-human primary score for 100% of judgment-bearing packets, model assistance with no final criterion score, moderation of flags/appeals, and at least 10% stratified blind double scoring. |
| Matching fairness | **Pass for design; implementation evidence pending** | The matcher contract covers minimum routing, unique testers, condition mix, compatibility, non-prestige inputs, section leakage, deterministic versions/seeds, replacements, and parity review. Production release still requires the specified synthetic roster/property test with uneven streams, absences, consent declines, broken endpoints, accessible routes, duplicates, unsafe content, and leaked variants. |
| Privacy and consent | **Pass for design; approval/testing pending** | Route-specific consent, processor/data disclosure, safe decline, pseudonymous logs, optional recordings/quotes, withdrawal, redaction, quarantine, minimization, and threat-test cases now exist. The platform still needs an approved data controller/processor inventory, retention/deletion schedule, privacy review, and executed threat tests. |
| Failure recovery | **Pass for design; fixtures pending** | The contract defines expiry and replacement, 90-second live automation, three-minute incident intervention, endpoint quarantine, evidence classes, incident-equivalent credit, version-preserving retries, and author/tester penalty separation. The LMS retains network/model/validator/offline fallbacks. The named unavailable, replacement, invalid-rerun, incident, and consent-withdrawal fixtures have not yet been implemented or run. |
| Accessibility | **Pass for design; conformance testing pending** | Matching uses capability flags without exposing diagnoses; core routes require keyboard/screen-reader preflight; text and non-recorded evidence are valid; inaccessible endpoints receive compatible replay; safe decline cannot reduce the grade. WCAG-equivalent behavior and adapter-specific preflight still require real assistive-technology testing. |
| Telemetry and learning questions | **Pass with change** | The event contract supports exchange reliability, fairness, reveal order, issue linkage, release, rerun, scoring, and incident adjustment while excluding raw payloads, inferred friendships, diagnoses, keystrokes, and general time-on-page. The 480-person test names parity cuts. Add a short Session 07 measurement map that explicitly binds events to the learning questions: behavior-versus-opinion classification, prediction changed by evidence, plausible failure-layer diagnosis, guardrail-preserving rerun, safe-failure recognition, and human/model agreement. |
| Assessment validity | **Pass with change** | V06 validates the author claim; V06P validates the tester claim; the gradebook prevents lesson-score double counting; the final prototype packet includes Session 07 evidence; 70/30 judgment is human-scored; incident relief and appeals are versioned. However, tester cardinality is inconsistent: Session 07 and the exchange contract require two pre-class plus one live assignment, while the 10% gradebook component awards 4% for “two assigned attacks.” Freeze whether the third live attempt is mandatory assessed participation, an ungraded in-class duty, or one of the two graded attacks, and align V06P and student-facing policy. |
| Operations feasibility | **Pass for planning; staffing approval and rehearsal pending** | The contract names central exchange desk, privacy/safety moderator, section reviewer, access coordinator, trained scorer, and cross-section moderator, with live SLAs and an explicit statement that one unaided instructor is not assumed. The gradebook quantifies about 256 primary-scoring hours plus about 26 double-scoring hours. Production remains gated on MU approval of scorer capacity, turnaround SLA, facilitator ratio, moderation ownership, privacy/retention, and a staffed live rehearsal. |
| Stream and section equivalence | **Pass for design; content/equivalence evidence pending** | The matcher preserves stream and Finance authenticity without requiring same-stream testers; condition classes and equivalence groups are versioned; variants rotate under section embargo; the load test reviews path/mode/section parity. Role/input banks, difficulty anchors, exposure rules, and empirical equivalence results still have to be produced and piloted. |

### Status of the nine original major gaps

| Original major gap | Retest |
| --- | --- |
| M1 prediction/reveal and v1 freeze not enforced | **Closed:** freeze/reveal rules now block attempt start and author visibility, preserve started-attempt hashes, and prevent retroactive acceptance-test edits. |
| M2 fallback evidence classes conflated | **Closed:** four evidence classes now have distinct author, tester, and public-claim permissions. |
| M3 no tester-participation validator | **Closed:** V06P is separate from the author's V06 claim and includes incident, safe-decline, noise, duplication, and conduct boundaries. |
| M4 qualification/judgment division unclear | **Closed:** V06/V06P and the exchange contract assign deterministic, model, human scorer, and moderator authority explicitly. |
| M5 accessibility absent from matching | **Closed for design:** compatibility flags, privacy of diagnosis, preflight, safe decline, and equivalent replay are specified; conformance test pending. |
| M6 event properties insufficient | **Closed for design:** version, privacy, matcher, reveal, qualification, replacement, evidence-class, rerun, scoring, and incident properties are now present. |
| M7 acceptance test could be weakened | **Closed:** accepted contract and v1 are immutable during exchange; a changed criterion belongs to the explicit v2 release decision. |
| M8 staffing unresolved | **Partly closed:** roles, queues, SLAs, non-solo assumption, and scoring-hour baseline exist. Headcount, named owners, and MU approval remain production dependencies. |
| M9 variant equivalence/section leakage absent | **Closed for design:** equivalence group, exposure state, variant embargo, rotation, and leakage test are specified; content bank and empirical test pending. |

### Remaining contract changes before implementation freeze

These are not equivalent to the original blockers, but they should be corrected before engineering treats the contract as executable:

1. **Align tester cardinality and points.** Reconcile three required outbound assignments in Session 07/exchange with two graded attacks in the gradebook; state how replacement and safe decline affect the 4% participation receipt.
2. **Add a transition-authority matrix.** For every assignment and author side state, name allowed prior state, next state, actor, guard, emitted event, retry behavior, and whether it is terminal. Explicitly prohibit declined/expired/quarantined records from proceeding without a replacement/new consent relation.
3. **Freeze the Session 07 measurement map.** Name the learning question, event numerator/denominator, exclusion/incident rule, fairness cuts, decision threshold, owner, and retention class.
4. **Clarify the pre-class replacement deadline.** “Within 12 hours or by T-2, whichever comes first” is impossible for a decline after T-2. Specify immediate fallback/reassignment for late decline and the exact author/tester relief path.
5. **Define the load-test burden condition mathematically.** Replace “burden remains within one assignment across learners” with a measurable maximum spread or percentile/SLA rule after incident adjustment.

### Production evidence still required

The design contract passing does not imply that the LMS is launch-ready. No production release claim should be made until the repository contains actual results for:

- the 480-person synthetic matcher/load test and route-parity report;
- V06/V06P pass, partial, fail, unsafe, unavailable, early-reveal, wrong-version, dispute, replacement, consent-withdrawal, accessibility, leakage, and incident fixtures;
- external-adapter privacy threat tests and approved processor/retention/deletion policy;
- keyboard, screen-reader, text-only, extended-window, offline, and replay conformance tests;
- stream/Finance difficulty and variant-equivalence pilot results;
- a live section rehearsal measuring unmatched rate, replacement SLA, endpoint failure, facilitator queue load, and recovery time;
- trained-scorer anchor agreement, ten-minute packet timing, 10% double-score reliability, and 24-hour/grade-turnaround staffing capacity; and
- signed Masters' Union approval for assessment weights, participation rule, accommodations, appeals, privacy, staffing, and publication policy.

### New final verdict

**PASS WITH CHANGES**

The revised package passes the architectural forward test: it now describes the right exchange, preserves the two assessment claims, and makes the prior privacy, fairness, versioning, reveal, fallback, accessibility, and human-judgment requirements implementable. The five remaining contract edits are precise and bounded. Engineering and paper-pilot work can proceed after those edits.

It does **not** yet pass a production release gate. Load, equivalence, privacy, accessibility, fixture, scoring-reliability, and staffed-live tests are requirements written into the contract, not completed evidence. Production status should remain “not ready” until those tests and institutional approvals pass.

### Final contract verification

**Verification scope:** the five bounded changes named in the retest; implementation results were deliberately excluded from the design verdict.  
**Final design-contract verdict:** **PASS**  
**Production readiness:** **NOT YET READY; SEPARATELY GATED BY TESTS AND INSTITUTIONAL APPROVALS**

| Previously open contract issue | Final verification evidence | Result |
| --- | --- | --- |
| Tester cardinality and points | The exchange contract requires two pre-class plus one live assignment. The assessment component now says “three assigned attacks,” its participation breakdown awards the 4% receipt for three attacks, and the gradebook map uses the same three-attack rule with replacement/incident-equivalent relief. Session 07 retains the two pre-class tasks and the live assigned test in its run of show. | **Closed** |
| Transition authority | `task-attempt-exchange-contract.md` now has an actor/guard/from/to/event/retry matrix. It makes declined, expired, reassignment-required, rejected, and unresolved quarantined records non-progressing; assigns tester, matcher, validator, system, author, and moderator authority; requires new linked assignments for replacement; and preserves dispute/quarantine history. | **Closed** |
| Session 07 measurement map | The contract now maps seven learning/quality questions to numerator/denominator, events/evidence, incident exclusions and fairness cuts, decision threshold/owner, and retention class. It covers behavior-versus-opinion classification, evidence changing a prediction, cited failure diagnosis, guardrail-preserving rerun, safe-failure recognition, human/model alignment, and access fairness. | **Closed** |
| Late-decline replacement SLA | A decline before T-2 is replaced within 12 hours and no later than T-2. A decline at or after T-2 triggers immediate live-compatible reassignment or a calibrated incident-equivalent pack, with author and tester relief until the route exists. The prior impossible deadline interpretation is removed. | **Closed** |
| Matcher burden threshold | The load-test contract now requires exactly three credited outbound assignments after incident relief, `P95 − P5 ≤ 1` for actual started attempts, and no learner starting more than four required/replacement attempts unless they explicitly opt into ungraded enrichment. | **Closed** |

The Session 07 design contract is now internally coherent and executable as a product specification. It defines the learning claim and non-claim, actors and permissions, versioned entities and cardinalities, legal transitions, reveal rules, matching and replacement, evidence classes, privacy and accessibility boundaries, V06/V06P validation, human scoring, telemetry, queue ownership, and measurable launch tests without using implementation evidence as a substitute for design.

**Final design-contract verdict: PASS.**

This does not change the separate production status. The matcher/load run, validator fixtures, privacy threat tests, assistive-technology conformance, stream-equivalence pilot, staffed live rehearsal, scorer reliability, and Masters' Union approvals remain mandatory production release evidence.
