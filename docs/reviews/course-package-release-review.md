# Course 1 Package — Independent Release Review

> **Superseding source-content review:** the per-session `TBD` production-source gap documented below was closed on 18 July 2026. See [Course 1 Authored Source Package — Independent Release Review](course-source-package-release-review-2026-07-18.md). Historical findings remain below; runtime, institutional, pilot and rehearsal gates remain open.

**Review date:** 17 July 2026  
**Reviewer posture:** fresh release gate using `mu-validate-learning-assets`  
**Scope reviewed:** course concept, architecture, decisions, stream matrix, LMS concept, validator contracts, assessment system, maturity blueprint, quiz matrix, ten lesson plans, ten quiz banks, operations/readiness documents, production manifest, and research/case documents  
**Release target tested:** a defensible design package that can progress to asset production, followed by a classroom/LMS release for 480 students in eight sections

## Executive verdict

The package has a strong and unusually coherent learning story. Its formal spine—**target role × representative work context × consequential decision × inspectable evidence**—survives across the concept, stream matrix, ten-session arc, lesson plans, portfolio, and LMS. All nine career streams are present in every lesson; Finance is consistently split into Investment Banking, Venture Capital, and Corporate Finance. The 120-minute plans generally protect 74–92 minutes for student prediction, building, testing, repair, review, transfer, or proof capture. Accessibility, low-tech fallback, publication safety, human authority, and anti-gaming are treated as learning design rather than appendices.

However, the package cannot yet support valid production grading or a valid pre/post growth claim. The most serious issue is a missing scorer for strategic and stream judgment on most submissions: deterministic systems cannot score those constructs, AI is prohibited from being the sole high-stakes judge, peers do not grade, and humans see only a sample. The post performance mission specified by the maturity blueprint is also absent from the delivery sequence, unless the team intends to reuse a much longer, graded Session 10 sprint—which would not be parallel to the low-stakes pre measure. In addition, the LMS phase plan defers a required graded task-attempt exchange until after the phase that claims it can deliver the course to all eight sections.

This report therefore distinguishes two claims:

- **Architecture quality:** promising and structurally coherent, but requires the major corrections below before architecture approval.
- **Classroom/LMS launch readiness:** not ready; the repository correctly describes itself as a specification and draft content base, but the actual datasets, simulator fixtures, starter assets, validator implementations, rubric anchors, maturity forms, production policies, and rehearsals do not yet exist as release evidence.

## Blockers

### B1 — No valid scorer is assigned to strategic and stream judgment for most students

**Evidence**

- The course grade includes business judgment-heavy criteria such as framing, evidence quality, system design, risk, ownership, communication, and nine stream overlays: `docs/assessment/course-1-assessment-system.md:25-54`.
- Deterministic validators cover observable structure and mechanics for 100% of students, while human audit covers only flags/borderlines/safety cases plus at least 20%: `docs/assessment/course-1-assessment-system.md:81-90`.
- Model-assisted review is explicitly “never sole high-stakes judge,” and peers do not assign artifact grades: `docs/assessment/course-1-assessment-system.md:87-89`.
- The LMS likewise says AI feedback cannot produce an unreviewable final grade: `docs/lms/course-1-lms-concept.md:238-251`.
- The transfer validator admits that strategic quality requires the 70/30 rubric and human-audit model, while the validator supplies only facts and flags: `docs/lms/validator-contracts.md:217-231`.

**Impact**

For roughly 80% of unflagged submissions, the package does not identify who assigns the 70% common judgment score or the 30% stream score. Mechanical checks cannot decide whether an investment thesis, workforce intervention, transformation recommendation, release decision, or analytical recommendation is strategically sound. The current design therefore cannot generate a valid grade for all 480 students.

**Smallest correction**

Choose and document one complete scoring path:

1. **Preferred:** trained human scoring of the judgment criteria for 100% of the four major components, with deterministic evidence packets, bounded scoring time, staffing/SLA, anchors, moderation, and the existing sample used for double-scoring and reliability—not as a substitute for primary scoring; or
2. redesign the score so 100%-scored criteria are genuinely deterministic/performance-property based and restrict human judgment to a smaller explicitly weighted component; or
3. if calibrated AI scoring is retained, state that it generates provisional criterion scores, define the human oversight/error study and appeal route, and remove the contradictory “never sole high-stakes judge” claim. This option requires evidence of acceptable agreement and fairness before launch.

Do not approve weights or send the evaluation model to Masters' Union until every graded criterion has a named primary scorer.

### B2 — The pre/post maturity performance measure is not administered in the ten-session plan

**Evidence**

- The maturity blueprint requires a 30-minute performance mission on both pre and post forms: `docs/assessment/pre-post-maturity-blueprint.md:43-58`.
- It states that pre/post forms use the same rubric and equivalent anchors: `docs/assessment/pre-post-maturity-blueprint.md:64-74`.
- Session 10 requires only the 12–16 item post objective-literacy form before class: `docs/lessons/session-10-operate-under-pressure/lesson-plan.md:56-63`.
- Session 10 itself is a graded, 120-minute, stream-specific transfer sprint worth 25%: `docs/lessons/session-10-operate-under-pressure/lesson-plan.md:1-9` and `docs/lessons/session-10-operate-under-pressure/lesson-plan.md:95-112`.
- The assessment contract says maturity growth is reported separately and is not the course grade: `docs/assessment/course-1-assessment-system.md:13-23`.

**Impact**

There is no delivery slot for the post 30-minute performance mission. Reusing Session 10 would compare a low-stakes, 30-minute pre task with a high-stakes, 120-minute, stream-specific post task under different scaffolding and motivation. That would confound course growth with time, stakes, stream familiarity, and test format. The resulting “maturity growth” claim would be invalid.

**Smallest correction**

Add a separate, low-stakes 30-minute post mission outside the graded sprint, using an equated parallel form and the same administration conditions as pre. If total workload cannot absorb it, remove the performance-growth claim and report only Part A plus calibration until a valid parallel mission is fielded. Do not merge the 25% transfer grade with the growth measure.

### B3 — LMS phases defer a required graded mechanism until after the stated eight-section delivery phase

**Evidence**

- Three to five assigned task attempts are required evidence for the 30% prototype and an explicit assessment gate: `docs/assessment/course-1-assessment-system.md:15-21` and `docs/assessment/course-1-assessment-system.md:68-77`.
- Phase 1 claims the goal is to “reliably deliver the course to all eight sections”: `docs/lms/course-1-lms-concept.md:657-674`.
- Peer adversarial testing is not added until Phase 2: `docs/lms/course-1-lms-concept.md:676-691`.
- The cross-section task-attempt exchange is deferred to Phase 3: `docs/lms/course-1-lms-concept.md:693-704`.
- Session 7 cannot pass without three attempts except under a documented incident: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:31-50`.

**Impact**

If Phase 1 is the version used to deliver all sections, students cannot produce required prototype evidence or the participation/peer-attack evidence. A later portfolio phase cannot retroactively repair the learning and grading contract.

**Smallest correction**

Move sanitized role-card matching, task evidence capture, reassignment/fallback packs, and V06 into the minimum pre-delivery phase. Rename Phase 1 if it is only an internal alpha. The system may defer richer cross-section social features, but it may not defer the assessed task-attempt mechanism.

### B4 — This is a production specification, not a releasable classroom package

**Evidence**

- The production manifest correctly says a lesson plan alone is not a releasable session: `docs/operations/course-production-manifest.md:1-16`.
- It requires global student/facilitator assets, but lists requirements rather than linked files, owners, or current status: `docs/operations/course-production-manifest.md:18-60`.
- Every session still requires actual source/data packs, starter files, simulator fixtures, hidden/reserve variants, validator implementations, answer fixtures, accessibility assets, and outage packs: `docs/operations/course-production-manifest.md:62-226`.
- Assessment release still requires anchor submissions, live forms, pilot statistics, hidden variants, policies, and evidence exports: `docs/operations/course-production-manifest.md:228-239`.
- The manifest itself states the course is not launch-ready: `docs/operations/course-production-manifest.md:270-280`.

**Impact**

The lesson plans are detailed, but a facilitator cannot yet run them without inventing materials, data, tool behavior, answer keys, and fallback evidence. At eight-section scale, that creates section drift and invalid assessment.

**Smallest correction**

Treat the current repository as **design release v0.1**, not delivery release. Convert the manifest to an inventory with one row per asset: file/URL, owner, status, due date, version, validator/pilot evidence, and release signatory. Build and paper-pilot the Finance, HR, and Marketing golden journeys before producing the other six packs, as the stream matrix recommends at `docs/course/stream-coverage-matrix.md:323-329`.

## Major findings

### M1 — The LMS data model reintroduces the obsolete “company × function × problem” frame

**Evidence**

- The approved formal spine is target role × representative work context × consequential decision × inspectable evidence: `docs/course/course-1-architecture-v2.md:14-27`.
- The LMS core entity is still named `Company Brief` and stores company, function, problem, target user, and outcome rather than role, mode, decision owner, decision, representative work product, evidence boundary, and authority: `docs/lms/course-1-lms-concept.md:201-213`.
- Telemetry still emits `company_brief_submitted`: `docs/lms/course-1-lms-concept.md:510-516`.
- V00 and the lessons use `Work Sample Brief`: `docs/lms/validator-contracts.md:32-48`.

**Impact**

The implementation data model would push Consulting, IB, and VC back into an inauthentic internal-company frame and cannot persist the fields V00 needs.

**Smallest correction**

Rename the entity and event to `Work Sample Brief`; adopt the V00 fields as the canonical schema; retain company/employer/client/deal as optional context fields.

### M2 — The package does not define how lesson rubrics roll into the five course-grade components

**Evidence**

- The course defines five component weights but no component subweight or evidence aggregation rule: `docs/assessment/course-1-assessment-system.md:13-23`.
- Sessions 1–6 each publish separate 70/30 “lesson scoring” rubrics; for example Sessions 4–6: `docs/lessons/session-04-package-judgment/lesson-plan.md:227-243`, `docs/lessons/session-05-make-the-system-act/lesson-plan.md:236-250`, and `docs/lessons/session-06-ship-the-right-prototype/lesson-plan.md:259-274`.
- Session 7 says its rubric supplies both prototype and participation evidence: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:231-245`.
- Session 8 says it contributes to both prototype and recruiter proof: `docs/lessons/session-08-communicate-for-the-role/lesson-plan.md:1-9` and `docs/lessons/session-08-communicate-for-the-role/lesson-plan.md:207-219`.

**Impact**

The same evidence can be counted twice, and two facilitators could aggregate Sessions 4–8 into the 30% prototype differently. Students cannot know which checkpoints are formative, gated, or grade-bearing.

**Smallest correction**

Create a one-page gradebook map. For each course component, list evidence sources, criterion weights, scorer, submission freeze, retry policy, and whether lesson rubrics are formative or summative. Prefer one final component rubric that draws evidence from checkpoints rather than averaging five lesson scores.

### M3 — Quiz thresholds contradict one another and the three-item format cannot express the stated 70/80/90 policy

**Evidence**

- The course-wide policy says 70% is developing, 80% is readiness, and 90% is mastery: `docs/assessment/quiz-design-and-matrix.md:67-75`.
- Three-item quizzes can yield only 0%, 33%, 67%, or 100%.
- Sessions 1–5 treat 2/3 as readiness and 3/3 as mastery; for example `docs/lessons/session-01-find-the-leverage/quiz.md:177-184`.
- Sessions 6–10 treat 2/3 as Developing and 3/3 as readiness, while mastery is 90% across delayed checks; for example `docs/lessons/session-06-ship-the-right-prototype/quiz.md:178-186` and `docs/lessons/session-10-operate-under-pressure/quiz.md:179-187`.

**Impact**

Identical 2/3 performance triggers different progression and support depending on the lesson. The nominal 80% readiness threshold is impossible within a three-item quiz.

**Smallest correction**

Freeze a discrete policy for three-item banks, such as 3/3 ready, 2/3 repair then retake, 0–1/3 facilitator support; define mastery only across the ten delayed checks. Update all quiz files and the LMS concept to match. Alternatively use five-item gates if an 80% lesson threshold is essential.

### M4 — Outcome and validator identifiers are not canonical across lessons

**Evidence**

- The course capability map defines only C1–C9: `docs/course/course-1-architecture-v2.md:145-157`.
- Sessions 1–3 introduce undeclared sub-IDs such as C1.1, C8.1, and C9.1: `docs/lessons/session-01-find-the-leverage/lesson-plan.md:63-72`.
- Sessions 4–6 switch to S4-O1-style outcome IDs: `docs/lessons/session-04-package-judgment/lesson-plan.md:80-91`.
- Sessions 7–10 return to C-level IDs without lesson outcome IDs: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:21-29`.
- Lesson checkpoint sections describe validators but do not name V00–V10, while the production manifest does.

**Impact**

The LMS cannot reliably join outcomes, quiz items, mission evidence, validator results, mastery records, and gradebook criteria. Analytics by capability will be ambiguous.

**Smallest correction**

Create one outcome registry with canonical IDs and mappings, for example `C1` → `C1.1…C1.n`, `L04-O1` → capabilities, and `V03` → evidence/checks. Require every lesson, quiz item, telemetry event, validator, and rubric row to reference that registry.

### M5 — The maturity instrument overclaims construct-level reporting and changes work mode across forms

**Evidence**

- Four constructs receive only one objective item each: M4, M5, M7, and M9 at `docs/assessment/pre-post-maturity-blueprint.md:31-42`.
- The instrument nevertheless proposes dimension-level reporting: `docs/assessment/pre-post-maturity-blueprint.md:76-86`.
- The pre performance task is a consumer-services operator case, while post is an advisor/investor or B2B operations case: `docs/assessment/pre-post-maturity-blueprint.md:43-48`.

**Impact**

One item cannot support a stable dimension claim. A systematic operator-to-advisor/investor mode shift can make apparent growth or decline reflect domain/mode familiarity instead of course learning—especially across nine streams.

**Smallest correction**

Report a defensible composite until each construct has enough items. Counterbalance or randomly assign equated operator and advisor/investor forms at both administrations, then test form/stream differential performance in the pilot.

### M6 — Human-review workload is calculated per artifact but not accumulated across the course

**Evidence**

- Sessions 7, 9, and 10 each estimate roughly 72 minutes per section for a 20% sample, plus flags: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:254-262`, `docs/lessons/session-09-recruiter-proof/lesson-plan.md:277-285`, and `docs/lessons/session-10-operate-under-pressure/lesson-plan.md:273-280`.
- Session 8 adds another 20% audit: `docs/lessons/session-08-communicate-for-the-role/lesson-plan.md:229-237`.
- Earlier briefs and prototype layers also contain human judgment and exception queues.
- Staffing and turnaround remain open: `docs/course/course-1-architecture-v2.md:271-279`.

**Impact**

The visible base alone is about 4.8 facilitator-hours per section across Sessions 7–10, before flagged cases, scoring the evidence brief/prototype, appeals, moderation, or feedback. The package does not state who performs this work or when grades/feedback return.

**Smallest correction**

Build a course-wide assessment operations model: submissions × review minutes × expected flag rate × sections, with named reviewer roles, concurrency, SLA, moderation hours, and contingency. Include it in the Program Associate request and delivery readiness gate.

### M7 — Stream equivalence is specified but not yet evidenced

**Evidence**

- The stream matrix supplies credible role decisions and risks for all nine streams and distinct Finance pathways: `docs/course/stream-coverage-matrix.md:83-95` and `docs/course/stream-coverage-matrix.md:144-159`.
- It explicitly says to build and paper-pilot Finance, HR, and Marketing first: `docs/course/stream-coverage-matrix.md:323-329`.
- The production timeline still marks golden journeys, full pathway packs, and calibration as future work: `docs/operations/course-delivery-readiness.md:120-142`.

**Impact**

Coverage is excellent on paper, but equivalent time, information volume, difficulty, and scoring have not been demonstrated. Finance/Data may face heavier quantitative work; Marketing/Product may receive more visible prototype forms; HR carries more safety constraints.

**Smallest correction**

Run the proposed high-contrast paper pilot and publish an equivalence report with task time, completion, scaffold use, score distribution, and reviewer agreement. Adjust packs before scaling to all nine.

### M8 — Production privacy/governance decisions lack named controls and deadlines

**Evidence**

- The LMS correctly calls for retention/deletion rules before launch: `docs/lms/course-1-lms-concept.md:526-536`.
- Retention periods and formal appeals remain open: `docs/lms/course-1-lms-concept.md:751-763`.
- The production manifest names a generic legal/privacy owner but no person, due date, data controller/processor decision, vendor review, or approved scraping allow-list: `docs/operations/course-production-manifest.md:241-278`.

**Impact**

The course will hold student identity, accommodations, grades, prompts/evidence, voice/media consent, repository data, and task-attempt telemetry. At 480-student scale, “define before launch” is not an implementable control.

**Smallest correction**

Add a data-governance decision sheet covering controller/processor roles, approved vendors and regions, data classes, purpose, access roles, retention/deletion, breach/incident path, student export/correction, consent withdrawal, scraping allow-list, and named MU/Praxel signatories with deadlines.

### M9 — The production manifest is not yet an operational manifest

**Evidence**

- It defines useful statuses—Defined, Drafted, Validated, Loaded, Rehearsed: `docs/operations/course-production-manifest.md:6-16`.
- Its asset lists contain requirements and gates but no status, path, owner, due date, dependency, or evidence link: `docs/operations/course-production-manifest.md:18-60` and `docs/operations/course-production-manifest.md:62-226`.

**Impact**

The team cannot tell what exists, what is missing, who owns it, or whether a session can release. The document is a specification, not a control surface.

**Smallest correction**

Add a machine-readable table or YAML/CSV companion with asset ID, lesson, file/URL, owner, status, dependency, due date, validator/pilot evidence, and sign-off. Generate the human manifest from that source where possible.

### M10 — The Program Associate response repeats unresolved evaluation claims and omits two operational safeguards

**Evidence**

- The response presents the current sample-based human-review model despite the scorer gap in B1: `docs/operations/program-associate-response-draft.md:60-72`.
- It asks for a scraper/extractor capability but student decorum does not explicitly restrict scraping to allow-listed sources and permitted terms/licenses: `docs/operations/program-associate-response-draft.md:23-45` and `docs/operations/program-associate-response-draft.md:74-86`.
- The course's actual evidence policy says public visibility is not sufficient permission: `docs/course/stream-coverage-matrix.md:273-282`.
- Availability remains a placeholder: `docs/operations/program-associate-response-draft.md:101-115`.

**Impact**

Sending the draft now could imply a settled grading system and leave scraping/copyright/vendor-governance expectations underspecified.

**Smallest correction**

Before sending: replace the evaluation paragraph with “proposed, pending academic and staffing validation”; explicitly request/confirm the institution's legal/privacy/IT owner and vendor/data-processing approval; add allow-listed/terms-compliant scraping language; include grade turnaround and reviewer-capacity questions; fill availability and sender.

### M11 — LMS “frozen decisions” and “open decisions” contradict the course decision log

**Evidence**

- The LMS calls the weights and assessment mix approved: `docs/lms/course-1-lms-concept.md:441-451`.
- The same document lists assessment weights, number of defences, and artifact/team structure as open: `docs/lms/course-1-lms-concept.md:751-763`.
- The architecture release gate says weights, audit model, and portfolio policy require approval: `docs/course/course-1-architecture-v2.md:281-289`.
- The decision log marks the three objects, 70/30 rule, and audit model Accepted internally: `docs/course/DECISIONS.md:92-124`.

**Impact**

Internal design decisions are being confused with Masters' Union approval. Engineering, instructors, and the Program Associate cannot tell what is frozen versus proposed.

**Smallest correction**

Use two statuses everywhere: **internally frozen for build** and **externally approved by MU**. Remove resolved items from LMS “open decisions” or identify the precise unresolved parameter.

## Minor findings

### N1 — Mandatory disclaimer conflicts with allowed consented evidence

The public label says “Public/synthetic data only” at `docs/lessons/session-09-recruiter-proof/lesson-plan.md:33-48`, while the proof view permits consented observations/recordings at `docs/lessons/session-09-recruiter-proof/lesson-plan.md:50-66`. Replace with language such as: “Public, licensed, course-supplied synthetic, or consented evidence as labelled; no confidential company data.”

### N2 — Earlier research documents can be mistaken for the current contract

The artifact-backward research still describes a “Venture” studio and a universal-looking article/clone/app/film chain at `docs/research/2026-07-15-artifact-backward-curriculum-research.md:583-619`. The document is valuable research history, but add a prominent banner linking to D-013/D-014 and stating that the three-object, two-mode architecture supersedes those recommendations.

### N3 — FOCOS naming is inconsistent

The LMS uses “Founder's Office” at `docs/lms/course-1-lms-concept.md:22-32`; the course and user taxonomy use “Founders' Office.” Standardize the label for portfolio filters, analytics, and recruiter pages.

### N4 — Review dates are inconsistent in form

Sessions 1–5 use “before the next course delivery,” while Sessions 6–10 use 17 October 2026. Both are defensible, but the item bank needs one machine-readable `review_due` convention so stale-item routing can work.

## Gate summary

| Gate | Result | Notes |
| --- | --- | --- |
| Alignment | Pass with changes | Strong formal spine and session dependency chain; gradebook aggregation and canonical IDs missing |
| Authenticity | Pass | Nine role pathways and three Finance variants use credible decisions, pressures, and human boundaries |
| Demonstrability | Pass with changes | Proof/transfer design is strong; actual fixtures and evaluator packets remain to be built |
| Feasibility | Fail for launch | Timed plans are plausible on scaffolds, but task-exchange phase order, review staffing, golden paths, tools, and assets are unresolved |
| Fairness | Pass with changes | Equivalent forms, no paid-tool bonus, access alternatives, and assigned task attempts are strong; stream equivalence and scoring coverage are not validated |
| Consistency | Fail | Scoring responsibility, quiz thresholds, IDs, LMS entity names, and approval status conflict |
| Reliability | Pass at concept level | Excellent outage/incident principles; implementations and load rehearsals do not exist yet |
| Accessibility | Pass at concept level | Every lesson includes modality/access and low-tech paths; production WCAG and assistive-tech tests remain required |
| Portfolio signal | Pass with changes | Role-ready three-object portfolio is credible; disclaimer and actual recruiter/replay tests need correction |
| Maintainability | Pass with changes | Tool choices are isolated and research is dated; canonical registry, actual manifest, and superseded banners are needed |
| Career coverage | Pass at design level | All nine streams and IB/VC/Corporate Finance appear consistently; equivalence still needs pilot evidence |
| Ownership | Pass with changes | Prediction, hidden failure, clean transfer, task attempts, and defence are strong; scorer and post-maturity administration are unresolved |

## Release checklist

### Required before architecture approval

- [ ] Resolve B1: name a valid primary scorer for every graded criterion and all 480 students.
- [ ] Resolve B2: add a truly parallel post performance mission or narrow the maturity claim.
- [ ] Resolve B3: move the assessed task-attempt mechanism into the minimum pre-delivery LMS phase.
- [ ] Publish the gradebook aggregation map for Sessions 1–10 and five grade components.
- [ ] Standardize quiz thresholds and canonical outcome/validator IDs.
- [ ] Replace `Company Brief` with the canonical Work Sample Brief schema.
- [ ] Separate internal freeze from MU academic approval.

### Required before classroom/LMS launch

- [ ] Convert the production manifest into a status/owner/evidence inventory.
- [ ] Build and pilot complete Finance, HR, and Marketing golden journeys.
- [ ] Validate all nine stream packs and Finance subpaths for time, difficulty, and scoring equivalence.
- [ ] Build actual student briefs, cases, datasets, starter repos, simulator branches, known/hidden/reserve fixtures, validator implementations, answer keys, and offline packs.
- [ ] Produce rubric anchors and demonstrate inter-rater agreement.
- [ ] Run the task exchange and 480-user/load/failure rehearsal.
- [ ] Approve data governance, scraping allow-list, identity/media consent, publication, retention/deletion, incident, integrity, accommodation, late/absence, moderation, and appeal policies.
- [ ] Confirm facilitator/reviewer staffing, total review hours, feedback/grade SLA, rooms, accounts/credits, network, and section calendar.
- [ ] Complete accessibility testing in the production LMS and timed rehearsals for each section lead.
- [ ] Fill and approve the Program Associate response only after the evaluation and workload claims are accurate.

## Final release decision

**FAIL**

The design is substantially better than a conventional AI-in-business syllabus and should proceed, but it must not be represented as grading-valid or launch-ready until B1–B4 are resolved. After those corrections, the package is likely to reach **PASS WITH CHANGES** quickly at the architecture gate; classroom release still requires the production assets and pilots already identified by the manifest.

## Post-correction architecture gate

**Re-audit date:** 17 July 2026  
**Scope:** the complete correction pass, including gradebook map, outcome registry, assessment operations, data governance, operational asset inventory, task-attempt exchange, global student/facilitator materials, quiz updates, maturity administration, LMS changes, validator changes, and revised lesson language  
**Method:** each original Blocker/Major was retested against its smallest correction; launch evidence was kept separate from design completeness

### Summary

The correction pass materially changes the verdict. The package now has a valid proposed scoring chain: every judgment-bearing packet has a trained-human primary scorer, AI produces no final criterion score, moderation covers exceptions, and at least 10% of every major component is blindly double-scored. The post maturity mission is now explicitly separate from the graded transfer sprint and counterbalanced across work modes. The minimum LMS phase now includes the assigned task exchange. A canonical gradebook map, outcome registry, operational asset inventory, governance sheet, and exchange state machine now exist.

The design/architecture can therefore pass into controlled production with changes. The classroom/LMS cannot launch yet: the inventory truthfully shows most session content packs, simulator fixtures, fallback packs, rubric anchors, validator implementations, hidden forms, and transfer/maturity instruments as `Defined`/`TBD` or `Drafted`, with no pilot, load, accessibility, calibration, external approval, LMS load, or section rehearsal evidence.

### Original finding disposition

#### B1 — No valid scorer for strategic and stream judgment

**Status: Resolved for architecture; staffing approval remains a production gate.**

- The gradebook now assigns a trained human primary scorer to 100% of all four judgment-bearing components and the individual transfer packet: `docs/assessment/course-1-gradebook-map.md:11-20`.
- The scoring workflow forbids AI final scores and requires criterion-level human evidence citations: `docs/assessment/course-1-gradebook-map.md:36-44`.
- The assessment system now states 100% trained-human coverage and 10% double scoring: `docs/assessment/course-1-assessment-system.md:83-95`.
- The operations model budgets 256 first-pass hours, 25.6 double-score hours, and a 338-hour planning envelope with named role types and an SLA: `docs/operations/assessment-operations-model.md:6-19` and `docs/operations/assessment-operations-model.md:21-56`.

The architecture is now grading-valid in principle. Production still depends on MU approving approximately 338 hours, assigning names, and validating scoring times during pilots; the documents correctly state that constraint.

#### B2 — Missing/confounded post maturity performance mission

**Status: Resolved for architecture; actual forms and equivalence evidence remain production assets.**

- The blueprint now defines two operator and two advisor/investor forms with counterbalanced sequence: `docs/assessment/pre-post-maturity-blueprint.md:43-57`.
- Reporting is limited to defensible composites, with sparse dimensions treated descriptively: `docs/assessment/pre-post-maturity-blueprint.md:75-86`.
- A separate low-stakes post mission is scheduled 48–72 hours after Session 10 under baseline-parallel conditions; if it cannot run, the course explicitly forbids a performance-growth claim: `docs/assessment/pre-post-maturity-blueprint.md:88-97`.
- The course concept includes that mission in the asynchronous workload: `docs/course/course-1-concept.md:136-140`.

`GLOBAL-MATURITY-01` remains `Drafted`, dependent on parallel forms and a pilot: `docs/operations/asset-inventory.csv:16`. That is an appropriate production gate, not an architecture contradiction.

#### B3 — Required task exchange deferred beyond the eight-section delivery phase

**Status: Resolved for the original phase-order defect; one cardinality clarification remains.**

- Phase 1 now includes the sanitized exchange, consent/access boundaries, fair matching, reassignment/fallback, structured evidence, rerun receipt, and V06: `docs/lms/course-1-lms-concept.md:668-686`.
- Later phases now defer only richer variants, matcher optimization, discovery, and analytics: `docs/lms/course-1-lms-concept.md:688-716`.
- The normative exchange contract defines evidence, permissions, state transitions, matching, privacy, qualification, incident relief, scoring, events, operations, and 480-roster load tests: `docs/lms/task-attempt-exchange-contract.md:1-14`, `docs/lms/task-attempt-exchange-contract.md:47-91`, `docs/lms/task-attempt-exchange-contract.md:93-194`, and `docs/lms/task-attempt-exchange-contract.md:268-288`.

The original blocker is closed. Before content lock, clarify whether the Session 6 fresh attempt is one of the exchange's “two pre-class” tester assignments or an additional fourth assignment; see Residual R2 below.

#### B4 — Specification, not releasable classroom package

**Status: Open for production launch; substantially improved as a controlled production specification.**

- Global field guide, workbook, facilitator handbook, and integrity/publication policy now exist as drafts: `docs/materials/course-field-guide.md`, `docs/materials/student-workbook.md`, `docs/materials/facilitator-handbook.md`, and `docs/materials/ai-integrity-publication-policy.md`.
- The production manifest now points to a real control surface: `docs/operations/course-production-manifest.md:1-18`.
- The CSV has consistent ten-column rows with asset path, owner role, status, dependency, due gate, validation evidence, and signatory: `docs/operations/asset-inventory.csv:1-16`.
- All per-session content packs, simulator implementations, and accessibility/fallback packs remain `Defined` with `TBD` paths; representative evidence is visible from `docs/operations/asset-inventory.csv:17-66`.
- Rubric anchors remain `TBD`: `docs/operations/asset-inventory.csv:10`.

The current status is honest and operationally legible. It is still a launch blocker by design.

#### M1 — Obsolete Company Brief entity

**Status: Resolved.**

- The LMS entity is now `Work Sample Brief` and contains the formal-spine/V00 fields: `docs/lms/course-1-lms-concept.md:203-216`.
- The event is now `work_sample_brief_submitted`: `docs/lms/course-1-lms-concept.md:515-525`.
- The student workbook opens with the same contract: `docs/materials/student-workbook.md:1-48`.

#### M2 — No rule for rolling lesson evidence into grade components

**Status: Resolved.**

- The gradebook non-duplication rule says lesson rubrics are formative unless named and that one evidence item receives points in only one component: `docs/assessment/course-1-gradebook-map.md:7-10`.
- The component table defines frozen evidence, allocation, scorer, verification, freeze, and retry: `docs/assessment/course-1-gradebook-map.md:11-20`.
- The lesson crosswalk gives every session one summative destination or a conditional/formative role: `docs/assessment/course-1-gradebook-map.md:21-34`.
- The assessment contract makes that map canonical: `docs/assessment/course-1-assessment-system.md:23-25`.

#### M3 — Inconsistent/impossible three-item quiz thresholds

**Status: Resolved.**

- The course policy now acknowledges attainable scores and freezes `3/3 ready`, `2/3 repair`, and `0–1/3 support + repair`, with mastery only across cumulative delayed checks: `docs/assessment/quiz-design-and-matrix.md:67-75`.
- The LMS repeats the same discrete policy: `docs/lms/course-1-lms-concept.md:418-426`.
- Session banks now use the same rule; representative early and late examples are `docs/lessons/session-01-find-the-leverage/quiz.md:177-184`, `docs/lessons/session-06-ship-the-right-prototype/quiz.md:178-186`, and `docs/lessons/session-10-operate-under-pressure/quiz.md:179-187`.
- The student field guide states the same contract: `docs/materials/course-field-guide.md:79-103`.

#### M4 — Non-canonical outcome and validator identifiers

**Status: Partly resolved.**

- A canonical registry now defines capability, lesson outcome, validator, quiz, content-pack, and telemetry namespaces: `docs/course/outcome-registry.md:1-17`.
- It maps all ten sessions, previous aliases, capabilities, evidence, and validators: `docs/course/outcome-registry.md:32-94`.
- It defines required joins and a content-load failure for missing/unknown IDs: `docs/course/outcome-registry.md:95-103`.

Two gaps remain:

1. the validator namespace is declared as only `V00–V10` at `docs/course/outcome-registry.md:9-16`, but the validator contract now adds normative `V06P` at `docs/lms/validator-contracts.md:171-177`; and
2. the registry requires every quiz to store a canonical `L` ID, but the quiz documents still primarily carry course capability and `Sxx` item-family IDs. The lesson plans also retain only aliases/prose and do not link their canonical `Lxx-Ox` metadata. The registry can support a loader-side alias map, but the required referential-integrity test is still pending: `docs/operations/asset-inventory.csv:4`.

Add `V06P` to the namespace and propagate canonical lesson IDs into source lesson/quiz metadata or prove the alias-loader join before marking this resolved.

#### M5 — Maturity construct overclaim and mode confound

**Status: Resolved for design.**

- Counterbalanced operator/advisor sequences address systematic administration-order confounding: `docs/assessment/pre-post-maturity-blueprint.md:43-57`.
- Sparse Part A dimensions are no longer reported as stable scores: `docs/assessment/pre-post-maturity-blueprint.md:75-86`.
- Form equivalence, sample composition, reserve form, and no-claim fallback are explicit: `docs/assessment/pre-post-maturity-blueprint.md:88-103`.

Pilot reliability and differential performance remain necessary before claims are released, as the blueprint correctly states.

#### M6 — Human-review workload not accumulated across the course

**Status: Resolved for planning; production staffing approval remains open.**

- The gradebook budgets 256 primary hours and 26 double-score hours: `docs/assessment/course-1-gradebook-map.md:46-50`.
- The operations model adds flags/appeals/calibration contingency for approximately 338 hours and assigns role types: `docs/operations/assessment-operations-model.md:6-32`.
- It distinguishes seven-day artifact feedback from the 24-hour operational pulse: `docs/operations/assessment-operations-model.md:34-44`.
- The Program Associate request now explicitly asks for scorer capacity, turnaround, and appeal SLA: `docs/operations/program-associate-response-draft.md:89-104`.

No launch claim should be made until MU approves names/capacity. The package already states this.

#### M7 — Stream equivalence specified but not evidenced

**Status: Open for production; design controls are stronger.**

- All nine streams and all three Finance subpaths remain consistently represented in lessons, quiz contexts, field guide, stream matrix, and exchange contract.
- The asset inventory now makes every pathway pack and its equivalence evidence visible; for example Sessions 1–3 are `Defined`/`TBD` at `docs/operations/asset-inventory.csv:17-31`, and Sessions 4–10 continue at `docs/operations/asset-inventory.csv:32-66`.
- The exchange contract defines a synthetic 480-roster fairness/equivalence test: `docs/lms/task-attempt-exchange-contract.md:268-288`.

No actual three-stream golden-journey pilot, noun-swap test, timing distribution, stream-score comparison, or reviewer-agreement result exists yet. This remains a launch blocker, not a reason to reject the architecture.

#### M8 — Privacy/governance controls lacked owners and deadlines

**Status: Partly resolved; approvals and named people remain open.**

- The governance sheet now covers controller/processor roles, inventory, purpose, vendors/regions, RBAC, retention/deletion, rights, incidents, scraping, identity, publication, exchange, accommodation, and academic records with owner roles and due gates: `docs/operations/data-governance-decision-sheet.md:1-21`.
- Protective defaults apply until approval: `docs/operations/data-governance-decision-sheet.md:23-34`.
- The task-exchange contract adds detailed consent, access, processor, withdrawal, accessibility, quarantine, and threat-test rules: `docs/lms/task-attempt-exchange-contract.md:196-208`.

Most production answers remain `Open` or `Drafted`, and named MU/Praxel signatories are still missing. This is correctly treated as a pre-provisioning/launch block.

#### M9 — Production manifest was not operational

**Status: Resolved.**

- The manifest points to the CSV control surface and preserves clear status semantics: `docs/operations/course-production-manifest.md:1-18`.
- The CSV contains 65 assets plus header, all with consistent fields and valid declared statuses: `docs/operations/asset-inventory.csv:1-66`.
- It does not falsely call TBD assets ready; current gaps and their gates are visible.

#### M10 — Program Associate response contained unresolved evaluation claims and omitted safeguards

**Status: Partly resolved; substantively safe but not send-ready.**

- Evaluation is now explicitly proposed pending academic/scorer approval, and 100% trained-human primary scoring is explained: `docs/operations/program-associate-response-draft.md:60-72`.
- The extraction service is allow-listed and decorum now covers terms, licenses, rates, snapshots, and provenance: `docs/operations/program-associate-response-draft.md:23-45` and `docs/operations/program-associate-response-draft.md:74-87`.
- The batch request now asks for named academic/IT/privacy/accessibility owners, scorer capacity, turnaround, and appeal SLA: `docs/operations/program-associate-response-draft.md:89-104`.
- Availability and sender remain placeholders: `docs/operations/program-associate-response-draft.md:106-118`.

Also align line 83's “public/course-provided data” wording with the new course policy's broader “public, licensed, course-supplied synthetic, or consented evidence as labelled.”

#### M11 — Internal freeze versus MU approval was contradictory

**Status: Resolved.**

- The LMS labels the evidence mix internally frozen and MU approval pending: `docs/lms/course-1-lms-concept.md:452-462`.
- It now separates internal build decisions from external approvals: `docs/lms/course-1-lms-concept.md:763-779`.
- The gradebook and operations documents repeat that status: `docs/assessment/course-1-gradebook-map.md:1-5` and `docs/operations/assessment-operations-model.md:1-4`.

### Residual corrections discovered in the re-audit

#### R1 — Add V06P and canonical lesson IDs to the implemented metadata contract

This is the unresolved portion of M4. `V06P` is normative but outside the declared validator namespace, and canonical `Lxx-Ox` IDs are not yet embedded in source lesson/quiz records. Fix before LMS content loading or analytics joins.

#### R2 — Reconcile the exchange's three outbound assignments with the Session 6–7 run-of-show

The exchange contract assigns exactly two pre-class and one live outbound task per learner: `docs/lms/task-attempt-exchange-contract.md:34-45` and `docs/lms/task-attempt-exchange-contract.md:140-155`. Session 6 already gives every prototype a fresh assigned attempt at minutes 83–96: `docs/lessons/session-06-ship-the-right-prototype/lesson-plan.md:128-150`. Session 7 then says each student completed two assigned tester tasks before class and performs another live task: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:51-69` and `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:93-111`.

The likely intended interpretation is: Session 6 counts as the first pre-Session-7 assignment, one additional task occurs asynchronously, and the third occurs live in Session 7. State that explicitly and reduce the async time copy if appropriate. Otherwise the lesson flow creates four outbound attempts while the matcher/load contract and participation grade assume three.

#### R3 — Finish the evidence-policy wording sweep

The approved publication policy now correctly permits public, licensed, course-supplied synthetic, or consented evidence: `docs/materials/ai-integrity-publication-policy.md:116-130`. The course concept still says “public/course data only” at `docs/course/course-1-concept.md:142-151`, and the Program Associate decorum section uses similar wording at `docs/operations/program-associate-response-draft.md:74-87`. Align these so consented evidence is not simultaneously allowed and prohibited.

#### R4 — Do not interpret drafted global materials as validated learner materials

The new field guide, workbook, handbook, and policy are strong drafts, but the inventory correctly withholds validation. Run student comprehension, accessibility, facilitator rehearsal, and policy approval gates before issue: `docs/operations/asset-inventory.csv:6-12`.

### Separate release verdicts

#### A. Design/architecture release

**PASS WITH CHANGES**

The formal spine, portfolio, nine-stream/Finance coverage, ten-session dependency chain, assessment ownership, task-exchange state model, maturity design, LMS phase model, safety/accessibility doctrine, gradebook aggregation, and operational governance now form a coherent design contract. No original grading-validity blocker remains at the architecture level.

Required changes before calling architecture fully frozen:

- add `V06P` to the registry and complete/prove canonical ID joins;
- clarify Session 6–7 outbound assignment cardinality;
- complete the evidence-policy wording sweep;
- record MU's decisions on workload, assessment, staffing, publication, and governance as approvals rather than internal assumptions.

#### B. Production classroom/LMS launch

**FAIL**

The launch verdict remains fail because the repository intentionally contains `Drafted` global assets and `Defined`/`TBD` per-session implementation assets rather than validated, loaded, and rehearsed production evidence. The following gates remain open:

- full pathway content/data/corpus/event/constraint/hidden packs for all sessions;
- simulator/workbench/exchange/clean-session implementations and V00–V10/V06P fixtures;
- actual pre/post forms, reserve forms, pilot statistics, and form-equivalence evidence;
- rubric anchors, scorer calibration, 338-hour staffing approval, moderation and appeal operations;
- 480-roster matcher/load/threat/section-leakage tests;
- WCAG/assistive-technology and modality-parity tests;
- data-processing, retention/deletion, scraping, identity/media, publication, incident and academic-record approvals;
- centrally provisioned tools/credits, room/network rehearsal, named signatories, section runbooks, and facilitator rehearsals.

The correct next gate is not more curriculum prose. It is production of the three high-contrast golden journeys—Finance, HR, and Marketing—followed by timed learner/facilitator pilots, scorer agreement, task-exchange load tests, and inventory status advancement from `Defined/Drafted` to `Validated`.

### Residual correction verification

**Narrow verification scope:** R1–R3 only. R4 and all production evidence, approval, implementation, pilot, accessibility, staffing, rehearsal and launch gates were not re-adjudicated.

#### R1 — Canonical validator and lesson/quiz joins

**Status: Resolved for design/architecture.**

- The validator namespace now explicitly includes `V06P`, and `L07-O5` resolves to it: `docs/course/outcome-registry.md:13` and `docs/course/outcome-registry.md:78`.
- Every lesson plan now declares its canonical outcome range. The ten declarations are present at `docs/lessons/session-01-find-the-leverage/lesson-plan.md:7`, `docs/lessons/session-02-build-the-evidence-engine/lesson-plan.md:7`, `docs/lessons/session-03-make-ai-know/lesson-plan.md:7`, `docs/lessons/session-04-package-judgment/lesson-plan.md:6`, `docs/lessons/session-05-make-the-system-act/lesson-plan.md:6`, `docs/lessons/session-06-ship-the-right-prototype/lesson-plan.md:6`, `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:6`, `docs/lessons/session-08-communicate-for-the-role/lesson-plan.md:6`, `docs/lessons/session-09-recruiter-proof/lesson-plan.md:6`, and `docs/lessons/session-10-operate-under-pressure/lesson-plan.md:6`.
- The registry now carries the normative 40-family quiz-to-`L` join and a fail-closed release-fixture contract for all 80 A/B item records: `docs/course/outcome-registry.md:105-152`.
- A read-only referential-integrity check against the current quiz headings found 80 item records, 40 mapped families, zero unmapped families and zero unused registry families.

This closes the architecture join gap. Implementing and executing the declared loader fixture in the production LMS remains part of the unchanged production gate.

#### R2 — Task-exchange assignment cardinality

**Status: Resolved.**

- The exchange contract now defines exactly three graded outbound assignments: the Session 6 fresh attempt, one additional asynchronous attempt, and one two-phase Session 7 live/adversarial assignment: `docs/lms/task-attempt-exchange-contract.md:36` and `docs/lms/task-attempt-exchange-contract.md:144`.
- Session 6 explicitly labels its fresh attempt assignment 1 of 3: `docs/lessons/session-06-ship-the-right-prototype/lesson-plan.md:146`.
- Session 7 requires exactly one additional 10–15 minute asynchronous task, then treats the live round as assignment 3 and its adversarial extension as phase two of that same assignment rather than a fourth attempt: `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:60-62` and `docs/lessons/session-07-task-attempts-and-reliability/lesson-plan.md:104-105`.
- The load-test contract independently enforces exactly three credited outbound assignments after incident relief: `docs/lms/task-attempt-exchange-contract.md:268-282`.

The lesson run-of-show, matcher contract, participation evidence and load-test invariant now agree.

#### R3 — Evidence-policy wording

**Status: Resolved.**

The course concept, architecture, LMS, Program Associate draft and publication policy now consistently permit public, licensed, course-supplied synthetic, or explicitly consented evidence when labelled, while excluding confidential company data and preserving scraping/licensing constraints: `docs/course/course-1-concept.md:144`, `docs/course/course-1-architecture-v2.md:92` and `docs/course/course-1-architecture-v2.md:228`, `docs/lms/course-1-lms-concept.md:119`, `docs/operations/program-associate-response-draft.md:83`, and `docs/materials/ai-integrity-publication-policy.md:46` and `docs/materials/ai-integrity-publication-policy.md:122`.

#### Final design/architecture verdict

**PASS**

This verdict supersedes the provisional **PASS WITH CHANGES** above. R1–R3 are closed, and the package is internally coherent enough to freeze the design/architecture and proceed into production. This is not MU approval and does not assert that drafted assets have passed learner validation.

#### Production classroom/LMS launch verdict

**FAIL — unchanged.**

R4 remains open, and the production gates listed above still require implemented assets, executed fixtures and load/threat/accessibility tests, learner and facilitator pilots, scorer calibration and staffing, governance and institutional approvals, provisioning, and rehearsal evidence before classroom or LMS launch.
