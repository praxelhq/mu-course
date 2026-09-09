# AI Operator Maturity — Part B Reserve/Incident Student Packet

**Version:** 0.1 — 18 July 2026  
**Release rule:** issue only the assigned reserve mission after assessment operations records an exposure/incident/accommodation-equivalence reason. Never expose both missions to one learner.  
**Time:** 30 minutes. **Tools:** supplied packet, dataset and basic calculator/spreadsheet only; no research model.  
**Data:** every record is labelled course-synthetic and represents no real company, person, campaign or transaction.

## Required response — both missions

Submit one structured packet containing:

1. decision owner, exact decision, outcome, guardrail, missing evidence and non-goal;
2. initial thesis and confidence (0–100) before calculation;
3. classification of the four AI-draft sentences as fact, calculation, inference or assumption, with correction;
4. requested calculation with population, exclusions/deduplication, formula, result and uncertainty;
5. allocation of four process steps to deterministic logic, model-assisted work, human judgment or accountable approver, with one reason each;
6. seeded-defect diagnosis, safe containment/repair and one held-out check;
7. a five-sentence recommendation: decision, evidence, trade-off/guardrail, limitation/authority, falsifying next test;
8. final confidence (0–100).

Strong work may recommend proceed, proceed with conditions, hold or stop. Confidence, positivity, polish and technical complexity are not scored.

---

## Operator Reserve R-O — Claim-Safe Variant Test

**Role:** Brand/marketing operations manager at fictional CedarHouse Learning.  
**Decision owner:** Brand lead; claims/legal owner approves any external claim.  
**Decision:** whether Variant B is ready for one additional bounded test against Variant A—not whether to publish or scale a campaign.

### Source 1 — test brief (synthetic)

CedarHouse is testing two messages for a fictional professional-learning product. A qualified response means the assigned participant completed the intended action and the message's claim passed the supplied claim check. Internal QA, ineligible audiences, invalid consent and duplicate participant-attempt records are excluded. The small assigned sample supports a test decision, not a market-share, revenue or causal claim.

### Source 2 — observation note (synthetic)

Several participants clicked but did not complete the intended action. One B response used a claim that failed the evidence check. A duplicated B event appeared after a page retry. The test has no revenue, retention or population-representativeness evidence.

### Policy excerpt CH-12 (synthetic)

- Deduplicate on `participant_id + attempt_id` before calculating.
- Eligible denominator: `audience_eligible=1`, `consent_valid=1`, `internal_qa=0`.
- Qualified numerator: eligible unique exposures where `qualified_response=1` and `claim_check=pass`.
- Model generation may draft within a locked, approved proposition; brand/claims owner approves external use.
- Missing consent, unsupported claim or duplicate event cannot be repaired by confident copy.

### Dataset and calculation

Use `data/maturity-operator-reserve-marketing-synthetic.csv`. Reproduce the **claim-safe qualified-response rate for A and B**:

`eligible unique exposures with qualified_response=1 and claim_check=pass / all eligible unique exposures`, by variant.

Report the percentage-point difference. Do not claim causality or market validation.

### AI draft to critique

> [1] Variant B converted 75% of the market and beat A by 35 percentage points. [2] This proves the AI message will increase revenue. [3] The system should automatically publish B and generate similar claims. [4] Duplicate, consent and claim-check records are operational details that can be cleaned after launch.

### Allocation steps

1. validate eligibility/consent and deduplicate exposures;
2. draft a variant inside the locked evidence-linked proposition;
3. interpret the small task evidence and decide whether another bounded test is justified;
4. approve any external claim or publication.

---

## Advisor/Investor Reserve R-A — Buyer-Screen Review

**Role:** Investment Banking analyst preparing a fictional sell-side buyer-screen review.  
**Decision owner:** Senior deal-team lead; client/compliance owner approves any external buyer contact or client material.  
**Decision:** whether the supplied buyer-screen universe is sufficiently clean and supported to advance to senior review—not whether to contact a buyer or recommend a transaction.

### Source 1 — screening brief (synthetic)

The fictional client seeks buyers in the permitted geography. A screen candidate qualifies only when the source is verified, the record is complete, strategic fit is positive and financing capacity passes the supplied screen. The screen is directional and does not establish interest, value, ability to close or client approval.

### Source 2 — analyst review note (synthetic)

The export may contain a duplicate buyer, one unverified source, one incomplete capacity field and one out-of-scope geography. Buyer names and status are synthetic. No outreach, transaction terms, valuation or confidential deal data are supplied.

### Policy excerpt BS-07 (synthetic)

- Count each `buyer_id` once; retain the duplicate in the audit note.
- Denominator: unique rows with `eligible_geography=1`, `source_verified=1`, `review_status=complete` and a non-missing capacity result.
- Numerator: denominator rows where `strategic_fit=1` and `financing_capacity=pass`.
- A screen may support senior review; buyer contact, client recommendation and external material remain human-approved.
- Unverified/malformed records are excluded from the rate and surfaced as diligence defects, not silently deleted.

### Dataset and calculation

Use `data/maturity-advisor-reserve-ib-synthetic.csv`. Reproduce the **qualifying-buyer rate**:

`unique valid verified eligible buyers meeting strategic-fit and financing-capacity rules / all unique valid verified eligible buyers`.

Report excluded/duplicate defects separately.

### AI draft to critique

> [1] Eighteen of twenty-four buyers qualify, so the buyer-screen rate is 75%. [2] The table proves strong buyer appetite and financing certainty. [3] The system should contact the top twelve buyers immediately. [4] Duplicate, unverified and incomplete records are immaterial because the shortlist is large.

### Allocation steps

1. validate/deduplicate buyer records and calculate the screen rate;
2. summarize source-linked strategic-fit evidence and open defects;
3. decide whether the screen advances to senior deal-team review;
4. approve buyer contact or client-facing material.

## Submission reminder

This is an assessment of framing, evidence/data, allocation, reliability and recommendation using the common 0–3 rubric. Do not identify or research real companies. State the synthetic-data and independent-assessment boundary in your recommendation.
