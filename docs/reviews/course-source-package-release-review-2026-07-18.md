# Course 1 Authored Source Package — Independent Release Review

**Review date:** 18 July 2026  
**Scope:** complete Course 1 source package after production and cross-audit  
**Not in scope:** claiming learner-pilot validity, deployed LMS behavior, institutional approval, staffing, provisioning, source-rights sign-off or classroom rehearsal  
**Benchmark:** an initially uninterested student is hooked, makes consequential decisions, encounters a genuine failure, repairs it using feedback, transfers the capability, and leaves with recruiter-inspectable evidence.

## Executive verdict

| Release layer | Verdict | Meaning |
| --- | --- | --- |
| architecture and learning contract | **PASS** | course story, three-object portfolio, ten-session dependency chain, eleven pathways, assessment doctrine and LMS concept agree |
| complete authored source package | **PASS** | every session has the mandatory student/instructor/case/data/simulator/LMS/assessment/fallback source set and independent document cross-audit |
| cold-student experience design | **PASS WITH EXTERNAL VALIDATION GATES** | all sessions clear 22/26 and mandatory dimensions; S9/S10 intentionally score 25/26; felt delight/learning still needs real cold-learner pilots |
| maturity/onboarding source package | **PASS WITH EXTERNAL VALIDATION GATES** | primary and reserve forms, data, keys and incident routes are internally consistent; psychometric/form-equivalence claims remain prohibited until pilot evidence |
| deployed LMS and live classroom launch | **FAIL — expected at this stage** | implementation, secure content separation, executed validators, pilots, accessibility/load tests, approvals, staffing and rehearsals are not present merely because source exists |

The previous production-launch FAIL in `course-package-release-review.md` was correct when per-session paths were `TBD`. That specific source-content gap is now closed. Product/runtime/approval gates remain open and must not be collapsed into the authored-source PASS.

## Package evidence

The repeatable validator checks the current repository and reports:

- 10 lesson directories and 214 session files;
- every required session filename present and non-trivial;
- at least 11 stable pathway pack IDs per session;
- 24 parseable session CSV/JSON/JSONL fixtures with synthetic labels;
- 80 lesson quiz item records in 40 Form A/B families;
- canonical L01–L10, V00–V10/V06P and quiz-family joins;
- independent cross-audit record in every session;
- 262 local links resolved;
- 85 inventory rows: 51 Authored and 34 Drafted; no false Validated/Piloted/Loaded/Rehearsed claims;
- eight repo-local course production/validation skills intact.

Command: `python3 scripts/verify_course_package.py`  
Result after final remediation: `status=pass`, `errors=[]`.

## Required source assets now present in every session

Every session contains the approved 120-minute plan and contract; capped pre/post work; student brief/handout; instructor runbook, slides and demo; source/case pack; eleven pathway packs; structured normal/boundary/hidden/transfer fixtures; simulator and LMS copy/events; quiz and anchors; recruiter proof; accessibility/offline route; self-audit and independent cross-audit.

Operational entry point: `docs/operations/session-asset-index.md`.

## Independent cold-student scores after remediation

| Session | Score | Strongest designed aha | Residual external risk |
| ---: | ---: | --- | --- |
| 1 | 26/26 | polished idea collapses when owner/evidence/test disappears | learner comprehension and variant timing |
| 2 | 26/26 | citation-rich claim fails reproduction/contradiction | research/data timing and source rights |
| 3 | 26/26 | fluent grounded system is compromised; abstention becomes a feature | tight timing and grounding runtime |
| 4 | 26/26 | mega-prompt fails clean use; method survives literal execution | timed clean-run pilot |
| 5 | 26/26 | two “successful” runs create duplicate consequence | emulator/workflow and outage rehearsal |
| 6 | 26/26 | plain role-fit surface beats attractive wrong form | supported shell and repair feasibility |
| 7 | 26/26 | positive ratings conflict with unsafe/abandoned task evidence | matcher, privacy and repair timing |
| 8 | 26/26 | one-click media invents a claim; evidence lock controls format | templates and media rights/provisioning |
| 9 | 25/26 | tool museum loses to proof story; Surprise remains 1 pending learner evidence | dual-view build and publication controls |
| 10 | 25/26 | unseen context forces diagnosis/repair rather than memory; reliability remains 1 until secure runtime exists | key isolation, seeding, leakage/load/incident tests |

All sessions have Hook, Agency, Consequence, Feedback, Learning and Proof at 2; no dimension is 0; every total exceeds 22. S9 and S10 are not inflated to perfect scores where actual learner surprise or implemented reliability is still unproven.

## Material defects found and corrected

### Canonical and assessment validity

- Sessions 1–3 invented parallel validator-like IDs. Every local check now nests under V00, V01 or V02.
- Session 10 originally placed post-course literacy before the graded sprint. It now uses a neutral readiness check; Part A and Part B post open 48–72 hours later; sprint confidence is formative and excluded from growth.

### Fixtures, fallbacks and security

- Session 5 events violated their own schema by omitting `occurred_at` and `source`; all now pass, with normal/boundary/hidden-family records per pathway.
- Session 6 did not guarantee held-out work; it now separates visible boundary tests from post-freeze tester-only tasks and allows a viable repair/hold window.
- Session 7's fallback expanded from one to expected/edge/boundary attempts, with evaluator labels removed from learner-safe data.
- Session 8 expanded from one to three evidence-linked claims per pathway.
- Session 9 split learner-safe and planted-risk evaluator manifests.
- Session 10 added materially different B payloads/tests for all eleven pathways and seed/non-reuse rules. Secured masters must remain outside learner-readable/public builds.

### Experience and production fidelity

- Sessions 4–6 slide outlines and source governance were rebuilt to the tightened contract, and role/owner/approver/hiring signal now appear at minute zero.
- Session 8 freezes its hook commitment by minute nine; Session 10 freezes its first inspect-versus-reprompt commitment by minute two.

### Maturity/onboarding and workload

- All primary Part B calculations were independently reproduced from CSVs.
- Both Part A forms match the M1–M9 and 8 SBA / 3 critique / 2 select-all / 1 ordering blueprint.
- Initial confidence freezes before staged/sealed AI-draft reveal.
- Onboarding corrected to 83 minutes; total asynchronous commitment is 603–715 minutes (10.1–11.9 hours), or 30.1–31.9 total course hours under the contact-hours assumption.
- Unsupported “fair baseline” language was removed; keyed forms are secured.
- Secured reserve Part A and operator/advisor Part B forms, data, keys and incident administration now exist.

Independent assessment review: `docs/reviews/2026-07-18-primary-maturity-onboarding-cross-audit.md`.

## Market Research simulator benchmark

Course 1 now meets or exceeds Praxel's Market Research simulator in authored learning architecture, career specificity, ownership proof, transfer, assessment integrity and accessibility/reliability design. It does not yet equal the simulator's felt quality because Market Research is an implemented staged product.

Course 1 reaches that benchmark only when the source states become a real Mission Room with mission launch, control room, incident reveal, repair receipt and proof dock, then pass cold-learner and facilitator pilots. See `docs/reviews/market-research-simulator-benchmark.md`.

## External gates before real launch

### Institutional

- confirm 20 live hours versus total effort and approve 10.1–11.9 asynchronous hours or reduce scope;
- approve weights, attendance/late rules, scoring capacity, turnaround, moderation and appeals;
- approve publication/private route, recording/consent, vendors/processors/retention and source extraction;
- receive batch mix, experience, devices, language/support needs and accommodations.

### Product and security

- implement states, permissions, immutable versions, reveal gates, evidence schemas and facilitator controls;
- keep learner, evaluator and later-section assets in separately authorized stores/builds;
- execute V00–V10/V06P pass/partial/fail/unsafe/incident suites;
- load-test SSO, quotas, 480-person exchange, section isolation, idempotency, reassignment and deletion;
- test secret/PII/rights/publication scans and incident kill switches.

### Learning and delivery

- run cold-learner timed pilots, especially S3, S6, S8, S9 and S10;
- test assistive-technology, low-bandwidth and offline routes for evidence parity;
- pilot maturity difficulty, discrimination, equivalence, calibration and scorer agreement before growth claims;
- freeze source rights/snapshots and hidden variants;
- provision accounts/credits and train/calibrate facilitators/scorers;
- rehearse normal, failure and outage paths from real accounts in every room.

## Final release statement

**The complete Course 1 authored source package passes independent document release after remediation.** It is coherent, inspectable, pathway-authentic and implementation-ready as a content/product specification.

**The deployed LMS and live classroom do not yet pass launch.** That is the correct boundary between source authorship and evidence from implementation, people, policy, pilots and rehearsal.
