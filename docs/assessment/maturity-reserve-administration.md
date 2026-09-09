# AI Operator Maturity — Reserve/Incident Administration and Equivalence Note

**Version:** 0.1 — 18 July 2026  
**Scope:** secured reserve source for Part A and Part B. This document defines administration parity and evidence handling; it does not validate the instrument.

## Package manifest and access

| Asset | Audience | Release rule |
| --- | --- | --- |
| `maturity-part-a-reserve-secured.md` | assessment operations/evaluator | LMS extracts learner prompt/options; key/tags remain hidden |
| `maturity-performance-reserve-student.md` | assigned learner | release exactly one R-O or R-A mission |
| `maturity-performance-reserve-evaluator.md` | trained scorer | never accessible from learner route |
| `data/maturity-operator-reserve-marketing-synthetic.csv` | assigned R-O learner/scorer | bind immutable hash/version to attempt |
| `data/maturity-advisor-reserve-ib-synthetic.csv` | assigned R-A learner/scorer | bind immutable hash/version to attempt |

Separate storage, role-based permissions and post-window key release are implementation requirements. Do not send reserve files in general LMS announcements, Git learner bundles or public repositories.

## Authorized reserve use

Use only when one of these is recorded:

1. suspected/verified exposure of assigned form or hidden defect;
2. platform/network/file incident that materially revealed answers, prevented evidence capture or broke parallel conditions;
3. approved accessibility/administration route requiring a different but construct-equivalent packet;
4. assessment-operations error in assignment/version.

Ordinary low score, missed preparation, desire for practice or preference for another context is not a reserve trigger. Link reserve attempt to the original; never overwrite it. Mark original `incident_pending`, then `replaced_by_reserve`, `integrity_review` or `excluded`; a technical incident is not learner failure.

## Assignment and counterbalancing

- Preserve the learner's intended operator versus advisor/investor sequence whenever possible. If the exposed mission makes that impossible, record the mode deviation and exclude/stratify it in growth analysis rather than pretending parity.
- A learner receives one Part A form and one Part B mission only. Retain form, mode, sequence, version, assignment reason, section and timestamps.
- Reserve administration uses the same pre-instruction/post timing, 18-minute Part A window, 30-minute Part B window, tools, confidence prompts and scoring rubric as the released forms.
- Do not release answers/seeded defects until every post/reserve administration in the affected cohort closes.

## Accessibility and equivalent modalities

- Part A is semantic text with keyboard-operable radio/checkbox/order controls. Ordering also offers numbered dropdowns; no drag-only interaction. Screen readers announce option count, selection state and remaining time without color dependence.
- Part B sources, policy, AI draft and CSV have stable headings/column labels and linear reading order. CSVs may render as accessible HTML tables or tagged spreadsheets without changing values.
- A basic calculator, keyboard spreadsheet or paper arithmetic sheet is equivalent. Coding, chart reading, voice, public posting and rapid typing are not required.
- Approved extra time changes the clock, not sources, assistance boundary, defect, calculation, rubric or recommendation requirement. Pause/resume and break handling are logged.
- Written/typed responses are canonical. Dictation may be used with the transcript frozen and checked by the learner; no language/voice polish is scored.
- Low bandwidth uses a locally cached encrypted bundle. Full outage uses printed numbered packet, dataset table, answer sheet and sealed evaluator key; invigilator stamps start/end and packet/version, then dual-entry import is checked.
- If a file/parser/accessibility failure changes the evidence available, stop and issue a fresh reserve attempt; do not coach around the defect.

## Incident state and audit trail

`assigned → opened → started → completed → scored` is the normal path. Incident path: `started → incident_recorded → evidence_frozen → reserve_authorized → reserve_assigned → completed → scored → analysis_disposition`.

Every transition stores actor, timestamp, reason code, original/reserve IDs, form/mission/data hashes, confidence responses, accommodation route code, scorer, override and disposition. Retries are idempotent; they append delivery attempts and cannot duplicate a learning attempt. Exposed prompts/answers are not copied into broad telemetry.

## Design-equivalence argument — not a validity claim

### Part A

Reserve R preserves the 14-item M1–M9 count, demand map, format mix, time, confidence checkpoints and all-or-nothing scoring. Surface contexts and numbers change. Exact item-family mapping is in the secured form. Until piloted, analyze reserve item difficulty, distractor function, omissions, timing and differential performance separately; do not assume an equal raw score has identical meaning.

### Part B

Both reserve missions preserve one stakeholder brief, two short synthetic sources, one policy excerpt, one 24-row labelled dataset, one AI draft with four claims, one seeded data-quality defect, four allocation steps and nine required actions in 30 minutes. The common 0–3 five-dimension rubric is unchanged.

| Demand | Operator reserve | Advisor/investor reserve | Released-form equivalence target |
| --- | --- | --- | --- |
| frame | brand lead decides bounded retest | senior deal team decides screen review | named owner, bounded decision, guardrail/non-goal |
| data | dedupe/exclude; two rates and point difference | dedupe/exclude; qualifying rate | 20–30 rows, explicit population, reproducible calculation |
| allocation | validation/model/brand judgment/claims approval | validation/model/deal judgment/contact approval | deterministic/model/human/approver split |
| defect | duplicate plus eligibility/consent/claim conditions | duplicate plus verification/completeness/scope | consequential quality defect that changes claim/action |
| recommendation | retest/hold; never publish automatically | advance/hold; never contact automatically | decision, evidence, trade-off, limitation/authority, next test |

The IB packet may carry higher domain vocabulary and the Marketing packet may carry greater claim-policy load. Plain definitions and supplied formulas reduce this, but pilot timing/score evidence is required before declaring equivalence or pooling.

## Scoring, moderation and reporting

- Trained humans issue all five dimension scores; model assistance may only assemble cited evidence.
- Double-score the first reserve administrations and any safety/score-boundary/appeal case; resolve >1-point dimension disagreement with a named note.
- Retain reserve status in analysis. Compare released/reserve distributions and sequence/composition before any aggregate claim.
- Do not publish a single maturity score; retain Part A, Part B, calibration and dimension limitations defined in the blueprint.
- If parallel pre/post conditions fail, report only the defensible components and explicitly withhold performance-growth claims.

## Release checklist

- hashes/permissions verified; learner/evaluator bundles separated;
- 14 Part A records render without key leakage;
- both CSVs have 24 labelled synthetic rows and reproduce evaluator calculations;
- calculator/table/screen-reader/print routes checked;
- operator/advisor assignment and confidence checkpoints preserved;
- scorers calibrated on reserve anchors;
- incident/replacement/disposition audit works;
- post-window answer release owner and date named;
- pilot-equivalence limitation visible in every report.
