# Primary Maturity and Onboarding Package — Independent Cross-Audit

**Date:** 18 July 2026  
**Reviewer:** Sessions 04–06/reserve-package agent, independent of primary-package authoring  
**Scope:** primary Part A forms, four Part B missions and evaluator key, four primary CSVs, pre-course onboarding, and learner workload budget  
**Verdict after corrections:** **PASS WITH EXTERNAL VALIDATION GATES** — authored source is internally consistent; no psychometric validity, empirical equivalence or pilot reliability is claimed.

## Files reviewed

- `docs/assessment/maturity-part-a-forms.md`
- `docs/assessment/maturity-performance-missions-student.md`
- `docs/assessment/maturity-performance-missions-evaluator.md`
- `docs/assessment/data/maturity-operator-a-support-synthetic.csv`
- `docs/assessment/data/maturity-operator-b-shipments-synthetic.csv`
- `docs/assessment/data/maturity-advisor-a-service-synthetic.csv`
- `docs/assessment/data/maturity-advisor-b-vc-synthetic.csv`
- `docs/materials/pre-course-onboarding-pack.md`
- `docs/operations/learner-workload-budget.md`

## Calculation audit

All evaluator results reproduce from the labelled CSVs.

| Mission | Population/check | Recomputed result | Key | Result |
| --- | --- | ---: | ---: | --- |
| Operator O-A | eligible rows; contained + `quality_label=pass` | 10/17 = 58.8% | 58.8% | PASS |
| Operator O-B | valid unique shipment/event; delay > buffer | 11/17 = 64.7% | 64.7% | PASS |
| Advisor A-A | exclude account changes; resolved + no 7-day repeat | script 5/9 = 55.6%; assist 6/9 = 66.7%; +11.1 pp | same | PASS |
| Advisor A-B | include cancelled customer at zero month-3 MRR | M0=990; M3=1,152; growth=16.36%; concentration=160/1,152=13.89% | same | PASS |

Every CSV has 20 data rows and an in-body `COURSE_SYNTHETIC_NOT_REAL_DATA` label. Exclusion, deduplication, period/population and authority rules in the student packet agree with evaluator calculations. No keyed recommendation is phrase-dependent; safe hold and bounded proceed paths are both defensible where the evidence permits them.

## Part A blueprint audit

Both A and B contain 14 items and independently reproduce the blueprint:

| Construct | Required | Form A | Form B |
| --- | ---: | ---: | ---: |
| M1 | 2 | 2 | 2 |
| M2 | 2 | 2 | 2 |
| M3 | 2 | 2 | 2 |
| M4 | 1 | 1 | 1 |
| M5 | 1 | 1 | 1 |
| M6 | 2 | 2 | 2 |
| M7 | 1 | 1 | 1 |
| M8 | 2 | 2 | 2 |
| M9 | 1 | 1 | 1 |

Each form has eight single-best-answer items, three output critiques, two all-or-nothing select-all items and one complete-order item. Confidence checkpoints occur after items 2, 7, 10 and 14. Options have one defensible keyed answer under the stated facts; risk items distinguish stop/escalate from permitted synthetic/public evidence rather than rewarding blanket refusal.

## Pre/post timing and calibration integrity

- Part A is 18 minutes; Part B is 30 minutes; post remains 48–72 hours after Session 10 in the blueprint.
- The original onboarding table allocated Part B 25–35 minutes despite the canonical 30-minute mission and understated total onboarding as 60–75 minutes. Corrected to 30 minutes and 83 minutes standard total.
- The Part B student packet asked for confidence before seeing the AI draft but exposed the draft in the same continuous packet. This was a **Major calibration-integrity risk**. LMS and paper routes now freeze initial thesis/confidence before staged/sealed AI-draft reveal; evaluator administration records the reveal.
- Form, mode, sequence, confidence, accommodation/incident status and version remain retained for analysis.

## Form-equivalence and defensibility

Part A family mapping holds construct and cognitive demand while changing domain. Part B forms preserve the same nine actions, 20-row table, one calculation, four process allocations, AI-draft critique, seeded defect and common five-dimension rubric. Operator and advisor contexts have materially different domain reading/calculation burden, so current “equivalence” is a design target only. Primary sources correctly require pilot timing, score-distribution, distractor, differential-performance and scorer-agreement review before pooling or stable claims.

Potential answer ambiguity was checked in all 28 Part A items and four mission recommendation ranges. No blocker/major remained: safe degraded operation, human authority and alternative bounded recommendations are explicitly recognized.

## Incident and accessibility parity

PASS at authored-source level:

- keyboard/screen-reader scenario forms and tables;
- spreadsheet/basic-calculator/static-paper calculation routes;
- extended time applied without revealing accommodation;
- incident attempt suspended/replaced rather than scored as learner failure;
- same source set, seeded defect, response fields and rubric across accessible/static routes;
- newly explicit sealed AI-draft page for paper calibration parity;
- keys and rationales now explicitly marked secured authoring source and withheld from learner bundles.

Implementation permission checks, assistive-technology testing and real incident replay remain external gates.

## Workload audit and correction

The session table sums to:

- session-linked pre-work: 208–230 minutes, not 208–225;
- post-work/bridges: 312–402 minutes;
- session-linked async: 520–632 minutes;
- onboarding/baseline: 83 minutes;
- total async including onboarding: 603–715 minutes = 10.1–11.9 hours;
- plus 20 live hours: 30.1–31.9 hours total.

The prior budget both under-added maximum pre-work by five minutes and omitted required onboarding from total commitment. This was a **Major planning/fairness defect** and is corrected. Extra-time accommodations remain outside planning medians and are never interpreted as learner inefficiency.

## Validity-claim audit

The item file states that forms are authored, not validated; thresholds are provisional. Evaluator gates require timing, difficulty, distribution, scorer agreement and differential-performance evidence. The onboarding purpose previously said “fair baseline,” which implied an unsupported property; it now says a versioned baseline under common assigned conditions. No single maturity number or performance-growth claim is authorized when parallel conditions fail.

## Findings and disposition

| Severity | Finding | Correction |
| --- | --- | --- |
| Major | onboarding/workload time and totals were internally wrong and excluded onboarding | corrected standard onboarding and all workload sums |
| Major | initial-confidence instruction lacked an enforceable reveal boundary | added staged LMS and sealed-paper reveal to student, evaluator and onboarding operations |
| Major | “fair baseline” and keyed-master visibility were insufficiently bounded | removed unsupported fairness wording; marked keyed Part A source secured/not learner-bundled |
| Blocker | none | — |
| Open major | none | — |
| Minor | none material to release | — |

## Remaining external gates

Independent expert item review; cognitive interviews; timed pilot; item difficulty/discrimination/distractor/omission analysis; form/mode/sequence comparison; inter-rater calibration and agreement; accessibility/AT testing; permission/key-leakage test; incident rehearsal; and MU approval. Until those pass, report authored baseline evidence descriptively and do not claim validated maturity growth.
