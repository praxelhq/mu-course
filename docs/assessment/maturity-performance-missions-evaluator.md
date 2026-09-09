# AI Operator Maturity — Part B Evaluator Key

**Version:** 0.1 — 18 July 2026  
**Visibility:** evaluator only; do not place in the learner content bundle  
**Scoring:** common five-dimension rubric in `pre-post-maturity-blueprint.md`, 0–3 per dimension; maximum 15  
**Important:** these anchors identify required evidence and unsafe conclusions. They are not phrase-matching keys. A different recommendation can earn full credit when it uses the supplied evidence, respects authority, and proposes a valid falsifying test.

## Administration integrity

- Freeze packet, dataset and key versions together.
- Stage the mission so the learner receives brief/sources/policy/dataset first; freeze initial thesis/confidence before revealing the AI draft. Paper/incident administration uses a sealed second packet and records the reveal time.
- Preserve assigned mode/form sequence and accommodation/incident status.
- Do not reveal seeded defects or model answers before every post administration closes.
- A technical incident creates an equivalent new attempt; it is not scored as learner failure.
- Primary scores on judgment dimensions are issued by trained humans. A model may assemble evidence but may not finalize the score.
- Double-score at least the pilot calibration sample and investigate dimension disagreement greater than one point.

## Common scoring anchors

### Frame

- **3:** owner, exact decision, outcome, guardrail, material evidence gap and non-goal fit the packet and authority.
- **2:** decision/owner/metric are present but one guardrail/evidence/non-goal is weak.
- **1:** vague objective or technology-led restatement.
- **0:** repeats the request or grants the system prohibited authority.

### Evidence/data

- **3:** correct population/formula/result, explicit exclusions, claim-type distinctions and uncertainty.
- **2:** correct result and most lineage, with a minor classification/uncertainty omission.
- **1:** accepts headline/draft result or shows an unexplained number.
- **0:** fabricates data or cannot connect recommendation to supplied evidence.

### Allocation

- **3:** justified deterministic/model/human/approver split with named consequential boundary and safe stop.
- **2:** correct categories with limited reasoning/recovery.
- **1:** generic “human in the loop.”
- **0:** model receives all consequential judgment/action or human authority is absent.

### Reliability

- **3:** identifies the seeded layer, contains/repairs it and proposes a valid held-out check.
- **2:** finds the defect and proposes a plausible repair but weak transfer test.
- **1:** gives generic risk language or repairs the wrong layer.
- **0:** misses/endorses the unsafe defect.

### Recommendation

- **3:** clear decision, correct evidence, meaningful trade-off, authority/limitation and falsifying next test in five sentences.
- **2:** supported recommendation and limitation but weak trade-off/test.
- **1:** summary or confidence without decision support.
- **0:** prohibited/unsafe action or recommendation based on fabricated/incorrect evidence.

## Operator O-A — Support Automation Expansion

### Expected calculation

- Eligible rows: 17 (`RB015`, `RB016`, `RB020` are not eligible).
- Correctly contained eligible rows: 10 (`contained=1` and `quality_label=pass`).
- **Correct-containment rate: 10 / 17 = 58.8%.**
- A simple containment count is 13/17 = 76.5%, but it includes incomplete/unsafe responses and does not answer the requested quality-adjusted metric.

### AI-draft diagnosis

1. “75% contained” is an approximate/incorrectly rounded calculation and the wrong success metric for the decision.
2. Satisfaction improvement is unsupported inference; no satisfaction measure exists.
3. Two unsafe contained records do not justify automation; account unlock is outside eligibility and policy requires authenticated agent action.
4. Cost reduction and “no material risk” are unsupported; no cost data and incomplete higher-risk evidence exist.

### Strong decision range

Full credit can support **hold** or a **narrow proceed-with-conditions** only if account-access actions remain excluded, identity state is deterministic, missing/conflicting state stops, an agent approves consequential action, and the pilot measures quality/repeat/complaint outcomes rather than containment alone.

### Allocation anchor

1 deterministic; 2 model with source/evidence constraints; 3 human judgment by decision owner using results/risk; 4 accountable authenticated agent/owner approval.

### Held-out checks

Examples: missing identity state; conflicting account status; correct retrieval but unsafe next action; contained yet incomplete answer; eligible billing versus excluded unlock case.

## Operator O-B — Supplier Recovery Routing

### Expected calculation

- Exclude rows 18–19 as malformed.
- Deduplicate row 17, which repeats `S103 + E1`.
- Unique valid events: 17.
- Material events where `delay_days > buffer_days`: 11.
- **Material-delay rate: 11 / 17 = 64.7%.**

### AI-draft diagnosis

1. Fifteen/twenty includes malformed/duplicate records and uses any delay rather than delay greater than buffer; the requested metric is 64.7%.
2. Carrier/cause frequency does not prove root cause or production consequence; the table is small and synthetic.
3. Delay greater than two days ignores buffer, recovery cost, supplier agreement and owner approval.
4. The duplicate is a seeded consequential incident pattern and cannot be ignored.

### Strong decision range

A bounded pilot may proceed for validation/deduplication, cause classification and decision support. It must not auto-commit expedite/substitute/penalty. Malformed/conflicting inputs route to review; idempotency and observable pending/retry state are acceptance tests.

### Allocation anchor

1 deterministic; 2 model; 3 planner/human judgment; 4 accountable owner/approver.

### Held-out checks

Duplicate with changed payload; missing quantity; timeout after approval request; delay equal to buffer (not material by rule); high delay but sufficient buffer; unsafe commercial action.

## Advisor A-A — Service-Model Recommendation

### Expected calculation

- Exclude `account_change` rows `T006` and `T016`.
- Script eligible: 9; resolved without seven-day repeat: 5; **55.6%.**
- Assist eligible: 9; resolved without seven-day repeat: 6; **66.7%.**
- Absolute difference: +11.1 percentage points. The sample does not establish causality or annual economics.

### AI-draft diagnosis

1. Handle-time claim may be a calculation, but method/comparability must be shown and speed is not the primary requested outcome.
2. The supplied eligible-sample resolved rate is 66.7%, not 90%.
3. Workforce replacement is outside the diagnostic decision and unsupported by evidence/policy.
4. ₹12 crore/no-risk is fabricated: no annual volume/cost/risk basis exists.

### Strong decision range

A strong answer may recommend a bounded plan-explanation pilot with explicit exclusions, claim/source control, repeat-contact/quality monitoring and client owner approval. It states that the 11.1-point sample difference is directional, not proof.

### Allocation anchor

1 deterministic; 2 model with cited excerpts and reviewer sampling; 3 consultant/human professional judgment; 4 client owner approval.

### Held-out checks

Ineligible account change; shorter handle time with repeat contact; missing linkage; incorrect tariff claim; policy update; complaint escalation.

## Advisor/Investor A-B — Investment Screen Advance

### Expected calculation

- Month 0 total MRR: 990.
- Month 3 total MRR: 1,152, including zero for the cancelled customer.
- **Quarterly MRR growth: (1,152 − 990) / 990 = 16.36%.**
- Largest month-3 customer: 160; **concentration: 160 / 1,152 = 13.89%.**
- Neither result is year-over-year growth. The synthetic screen data is unaudited.

### AI-draft diagnosis

1. 132% year-over-year is unsupported and confuses an annualized presentation with observed quarterly growth.
2. Largest-customer concentration is 13.9%, not 9%, using the policy definition.
3. One short revenue table cannot prove durable product-market fit; retention, usage quality, pricing-change effects and evidence provenance remain open.
4. Immediate investment exceeds screen-stage authority and evidence. The permitted decision is whether to advance to diligence.

### Strong decision range

Either **advance with explicit diligence questions** or **hold pending correction** may score fully. A strong answer treats growth and concentration as screen signals, not investment proof, and asks for cohort/retention, pricing-normalized growth, customer evidence and source verification.

### Allocation anchor

1 deterministic; 2 model-assisted synthesis with citations; 3 associate/partner judgment for meeting advance; 4 investment partner/committee approval.

### Held-out checks

Cancelled customer wrongly dropped; pricing-normalized cohort; one customer expands materially; founder number conflicts with ledger; missing month; attempt to convert meeting decision into investment recommendation.

## Calibration and analysis sheet

For each response retain:

| Field | Required value |
| --- | --- |
| learner/section | pseudonymous analysis ID and section |
| assignment | mode, form, pre/post sequence, version |
| incident/accommodation | route only; never expose accommodation in scorer view unless necessary |
| dimension scores | Frame, Evidence/data, Allocation, Reliability, Recommendation (0–3) |
| evidence pointers | exact response field/calculation/claim supporting each score |
| unsafe flag | none, privacy, fabricated evidence, prohibited authority, identity, high-impact action, other |
| scorer | primary reviewer and timestamp |
| double score | second reviewer, scores, disagreement and resolution when selected |
| confidence | initial/final and performance-linked calibration error |
| disposition | complete, incident-reset, integrity review, excluded from growth analysis |

## Pilot release gates

- median completion at or below 30 minutes without speed–score distortion;
- no expert disagreement on calculations, seeded defects or prohibited actions;
- inter-rater agreement threshold set and met before full scoring;
- operator/advisor form distributions reviewed for difficulty and reading-load equivalence;
- pre/post sequence and section composition retained in analysis;
- no stable dimension claim based on inadequate observations;
- if parallel administration cannot be preserved, do not claim Part B growth.
