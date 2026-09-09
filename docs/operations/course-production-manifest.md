# Course 1 Production Manifest

**Purpose:** convert the approved course architecture into a release-controlled set of classroom and LMS assets for 480 students across eight sections.  
**Rule:** a lesson plan is not a releasable session. A session is releasable only when every required student, facilitator, LMS, assessment, data, and fallback asset below has an owner and has passed its gate.

The operational control surface is [asset-inventory.csv](asset-inventory.csv), which records asset ID, path, owner role, current status, dependency, gate, validation evidence and signatory. This document explains the requirements; the CSV reports whether each one exists.

The mandatory per-session filenames, experience loop, anti-gaming rules, and internal source-release threshold are defined in the [Session Package Release Contract](session-package-release-contract.md). The [Cold-Student Experience Rubric](../reviews/cold-student-experience-rubric.md) is a required review surface, not an optional engagement checklist.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Defined | Requirement and acceptance test exist in this repository |
| Drafted | Content exists but has not passed independent review/pilot |
| Authored | Complete source content and required links/fixtures exist; no pilot or implementation claim |
| Validated | Content has passed content, stream-equivalence, accessibility, and technical checks |
| Piloted | Representative learners/facilitators completed the version within the declared thresholds |
| Loaded | Validated content is configured in the production LMS |
| Rehearsed | A facilitator has run the timed experience using a student account |

No asset should be labelled “ready” merely because text exists.

## Global student pack

These assets are issued once and reused throughout the course.

| Asset | Required contents | Gate |
| --- | --- | --- |
| Course field guide | course promise; ten-session map; three portfolio objects; operator/advisor modes; workload; assessment weights; support route | comprehension test with students from at least three streams |
| Work Sample Brief template | target role; employer/client/deal context; consequential decision; representative task; evidence; prototype form; stakeholder; boundary; public/private status | V00 fixtures and facilitator calibration |
| Evidence kit | source log; claim ledger; calculation sheet; data dictionary; counter-hypothesis; citation guide | correct/incorrect worked examples |
| Prototype kit | method card; workflow canvas; approval matrix; failure register; evaluation set; release note | form adapters for app, workflow, assistant, dashboard/model, and data pipeline |
| Proof kit | public case-page template; private proof manifest; repository structure; setup/replay guide; provenance manifest; non-affiliation notice | a new reviewer can inspect and reproduce the supplied exemplar |
| AI-use and integrity policy | allowed assistance by task; provenance; privacy; scraping; voice/likeness; confidential data; appeal route | policy quiz and acknowledgement |
| Tool quick-starts | golden-path research, build, workflow, deployment, analytics, media, and Git workflows | tested on minimum supported student device/network |
| Accessibility pack | keyboard and screen-reader routes; captions/transcripts; colour-safe templates; text alternative to audio/video; accommodation route | accessibility check using the production LMS |
| Offline/fallback pack | printable mission forms; cached source/data bundle; static prototype outputs; manual submission route | 30-minute outage drill |

## Global facilitator pack

| Asset | Required contents | Gate |
| --- | --- | --- |
| Course delivery handbook | doctrine; timing; language; escalation; common misconceptions; support boundaries | lead-facilitator sign-off |
| Section runbook | roster; stream mix; team/peer matching; room plan; credentials; accommodations; incident contacts | section owner signs T-48 hours |
| Demo pack | deterministic demo account; seeded inputs; expected outputs; failure branch; backup recording and screenshots | live rehearsal on classroom network |
| Calibration pack | anchor responses at four mastery bands; common/stream overlays; flag rules; moderation examples | inter-rater calibration threshold met |
| Intervention guide | stuck learner; over-builder; unsupported claim; safety breach; inaccessible task; service outage | tabletop exercise |
| Feedback macros | evidence-specific prompts mapped to rubric criteria; never generic praise or model-only grades | sampled for accuracy and tone |
| Post-session report | attendance; completion; misconception heat map; incidents; exceptions; feedback; changes before next section | submitted within 24 hours |

## LMS platform pack

Every mission requires:

- persistent student, stream, work-sample, artifact, attempt, feedback, and publication records;
- prediction-before-assistance and attempt-before-feedback gates;
- role/stream overlays with equivalence metadata;
- deterministic validation, rubric-bound AI coaching, peer attack, 100% human primary scoring of judgment evidence, moderation and double-score routing;
- timestamps, version history, provenance, consent, public/private state, and appeal history;
- a facilitator heat map, exception queue, incident kill switch, and downloadable grade evidence;
- accessible, printable, and offline-compatible core tasks;
- section isolation with cross-section exchange only through sanitized task cards;
- hidden-form control for quizzes and individual transfer missions.

The detailed platform contract is in [Course 1 LMS Concept](../lms/course-1-lms-concept.md); mechanical checks are in [Validator Contracts](../lms/validator-contracts.md).

## Per-session release manifests

### Session 1 — Find the Leverage

**Student assets**

- stream-specific role/task gallery with Finance split into IB, VC, and Corporate Finance;
- Chegg evidence card and one non-technology counterexample;
- opportunity-framing worksheet and Work Sample Brief template;
- good/bad opportunity exemplars and a value-risk-feasibility comparison set;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Evidence Under Pressure shell with source reveal, prediction lock, and changed-requirement inject;
- V00 brief validator, stream-equivalence tags, facilitator approval queue, and curated fallback briefs.

**Release evidence:** every stream can reach a bounded, ethical, role-representative decision without privileged company access.

### Session 2 — Build the Evidence Engine

**Student assets**

- public source/data bundle in at least nine role contexts;
- claim ledger, source log, calculation sheet, data dictionary, and counter-hypothesis templates;
- supported and advanced research routes; compliant extraction/scraping guide;
- evidence brief exemplar with deliberate defects;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- source-trust and claim-provenance workspace;
- contradictory source inject, stale-data inject, V01 validator, and unsafe-scraping stop.

**Release evidence:** a student can produce one inspectable calculation and distinguish source fact, derived result, inference, and model suggestion.

### Session 3 — Make AI Know, Not Pretend

**Student assets**

- small approved corpus and question/evaluation set per role family;
- chunking, retrieval, citation, abstention, and prompt-control worksheet;
- misleading high-fluency answer and grounded comparison output;
- controlled identity/voice lab script using fictional, consenting, public-domain, or non-imitative material;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Controlled Grounding Lab with corpus version, retrieval trace, answer trace, and hidden unsupported-question set;
- V02 validator and hard stops for unauthorized voice/likeness or private data.

**Release evidence:** students improve grounded answer quality on a held-out set and can explain when the system should abstain.

### Session 4 — Package Judgment

**Student assets**

- method/skill specification template with inputs, outputs, rules, examples, counterexamples, and uncertainty;
- role-specific expert-method cards and intentionally ambiguous requests;
- evaluation set and revision log templates;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Prototype Method Layer workbench with version comparison and hidden boundary cases;
- V03 validator and portability test on an unseen but analogous input.

**Release evidence:** the packaged method outperforms a generic prompt on the same test set without hiding consequential judgment.

### Session 5 — Make the System Act

**Student assets**

- workflow canvas; trigger/action/data/owner map; approval and escalation matrix; failure register;
- role-specific event cards, malformed inputs, duplicate-event and timeout fixtures;
- replay and incident-note templates;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Workflow Control Room with deterministic events, approvals, retries, idempotency checks, safe stop, replay, and V04;
- no live consequential external action during assessment.

**Release evidence:** every workflow has a named human owner, reversible action or safe stop, observable state, and recovery path.

### Session 6 — Ship the Right Prototype

**Student assets**

- prototype-form chooser covering app, workflow, grounded assistant, dashboard/model, data pipeline, and combinations;
- starter repositories/adapters, deployment or replay guide, evaluation checklist, and release-note template;
- role-authentic input fixtures and acceptance tests;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Role-Authentic Prototype Lab with V05 form adapters, technical health checks, and no-code/replay fallback;
- instrumented attempt URL or replay bundle capture.

**Release evidence:** prototype form follows the decision and task, not tool fashion; an evaluator can exercise the core path without the student present.

### Session 7 — Earn Evidence from Task Attempts

**Student assets**

- sanitized role/input task cards; tester instructions; consent and prohibited-data rules;
- observation log, failure taxonomy, severity/recurrence matrix, and v2 release-note template;
- worked example where high satisfaction hides task failure;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- cross-section task-attempt exchange; fair matching; three-to-five assigned attempts; no popularity metric;
- event trace, structured observation, V06, flagging, reassignment, and outage replay.

**Release evidence:** at least one observed failure produces a traceable prototype change; unsupported testimonials receive no credit.

### Session 8 — Communicate for the Role

**Student assets**

- Evidence → Audience → Action → Format → Proof canvas;
- stakeholder format gallery for all streams and Finance variants;
- claim-safe image/video/audio production guide, provenance sheet, captions/transcript template;
- exemplar showing one evidence base translated for three decisions;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- Role-Authentic Communication Lab with audience switch, claim lock, artifact provenance, accessibility checks, and V07;
- video optional and assessed only when it is authentic to the role/task.

**Release evidence:** the communication leads with a decision and preserves source/uncertainty boundaries across formats.

### Session 9 — Make the Work Recruiter-Legible

**Student assets**

- 60–90 second public case-page template and private proof-pack template;
- repository scaffold, proof manifest, setup/replay guide, redaction checklist, and non-affiliation language;
- Scan → Inspect → Reproduce recruiter test;
- readiness quiz, exit retrieval quiz, and parallel Form B.

**LMS/simulation assets**

- public/private proof controls; V08 repository/proof checks; V09 publication checks; revocation and consent log;
- recruiter-view preview without private or licensed material.

**Release evidence:** a reviewer can understand the role, decision, evidence, prototype, result, failure, limitation, and student ownership, then reproduce the core path.

### Session 10 — Operate Under Pressure

**Student assets**

- sealed unseen mission forms stratified by stream and difficulty;
- clean-session rules, allowed-resources card, incident route, and accessibility alternatives;
- decision memo/defence template and post-course reflection;
- post-course maturity assessment; no lesson-answer feedback until all sections finish.

**LMS/simulation assets**

- individually assigned hidden variants; clean-session capture; V10 transfer validator; anomaly/flag routing;
- 100% structured/mechanical review, 100% trained-human primary scoring of the bounded transfer packet, all flags/borderlines moderated, and ≥10% of all packets blind-double-scored.

**Release evidence:** the mission measures individual transfer to a changed context, not memory, typing speed, polish, or access to a stronger teammate.

## Programme-level assessment pack

Before launch, the academic owner needs:

1. final grade weights and pass rules approved by Masters' Union;
2. the 70% common and 30% stream rubric in the LMS gradebook;
3. anchor responses and scorer notes for all mastery bands;
4. pre/post scenario and performance forms, item map, answer/rationale keys, and pilot statistics;
5. ten readiness/retrieval/transfer quiz sets plus equivalent Form B;
6. hidden transfer variants, assignment rules, scorer assignment, moderation queue, double-score sample generator and reliability sheet;
7. late, absence, accommodation, technical incident, integrity, moderation, and appeal policies;
8. an export mapping every mark to student evidence, validator result, feedback, reviewer, and version.

## Ownership model

| Owner | Accountable for |
| --- | --- |
| Course architect | doctrine, sequence, scope and decision log |
| Lesson owner | timed plan, student/facilitator assets and async bridge |
| Stream reviewer | role authenticity and equivalent demand for assigned streams |
| Assessment lead | blueprint, item quality, anchors, moderation and validity |
| LMS product lead | mission flow, data model, permissions, telemetry and failure recovery |
| Technical producer | fixtures, integrations, starter repos, validators and fallbacks |
| Accessibility reviewer | accessible content and assessment accommodations |
| Legal/privacy owner | data, scraping, copyright, identity, consent and publication boundaries |
| Section lead | rehearsal, delivery, incident response and 24-hour report |
| Program Associate | roster, room, accounts, materials, calendar, feedback and MU coordination |

One person may hold more than one role, but no release gate may be self-approved by its author alone.

## Release sequence

1. **Architecture gate:** decision, stream, portfolio and assessment contracts agree.
2. **Content gate:** every required asset exists, uses only approved facts/data, and has answer/rationale keys.
3. **Equivalence gate:** stream variants measure the same construct at comparable difficulty.
4. **Safety/accessibility gate:** data, identity, scraping, publication, accommodation and fallback routes pass.
5. **Technical gate:** production student accounts complete the happy path and injected-failure path.
6. **Calibration gate:** facilitators score anchors consistently and can explain feedback.
7. **Pilot gate:** representative students complete the experience within the time budget; telemetry supports the intended interpretation.
8. **Load/rehearsal gate:** production LMS content is version-locked and each section lead runs the session.
9. **Post-session gate:** feedback, learning data and incidents are reviewed before the next section or session.

## External decisions that block production release

- whether 20 hours is contact time or total student effort;
- final session spacing, section timings, attendance rule, grading policy and turnaround;
- batch profile, stream distribution, coding/tool familiarity, device constraints and accommodations;
- supported vendor stack, accounts/credits, network, rooms and facilitator/TA capacity;
- permission to publish sanitized work on Praxy and applicable consent/recording policy;
- approved public/licensed case, data and media sources;
- identity of academic, IT, privacy/legal, accessibility and assessment signatories.

The repository now contains the complete authored source set required by the session release contract, including student/instructor surfaces, eleven pathway packs, structured fixtures, simulator/LMS specifications, assessment anchors and accessibility/outage routes. Until the external decisions and executed gates above are resolved, this is an authored and auditable course source package—not a claim that the LMS or live classroom is launch-ready.
