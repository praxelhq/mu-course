# AI Operator Maturity — Part B Performance Missions (Student Packets)

**Version:** 0.1 — 18 July 2026  
**Time:** 30 minutes  
**Stakes:** low-stakes diagnostic; completion required; performance does not directly change the course grade  
**Evidence policy:** every company, record and policy below is course-supplied synthetic material. Do not treat it as a real company claim.

The LMS assigns exactly one packet. Do not choose a preferred context. You may use the supplied spreadsheet and basic calculation tools; do not use project notes or another person. The LMS first reveals the brief, sources, policy and dataset. Submit and freeze the initial thesis/confidence before the AI draft is revealed; then record final confidence at submission. In a paper/incident route, the AI draft remains sealed as packet 2 until the invigilator records that freeze.

## Common response form

Submit these nine fields for any packet:

1. **Frame:** decision owner; decision; outcome metric; guardrail; one non-goal; most important missing evidence.
2. **Initial thesis:** one sentence plus confidence from 0–100.
3. **Claim ledger:** classify the four numbered claims in the AI draft as source fact, calculation, inference, assumption, or unsupported. A claim may contain more than one type—split it when needed.
4. **Calculation:** reproduce the calculation requested by the packet. Show formula, numerator, denominator, result and any excluded record.
5. **Allocation:** assign the four named process steps to deterministic logic, model work, human judgment, or accountable approval; one category may be used more than once. Give one reason each.
6. **Defect:** identify the seeded defect most likely to change the decision and name its layer: source/data, calculation, model/reasoning, workflow/control, user evidence, or communication.
7. **Repair:** rewrite or contain the defective part. State one held-out check.
8. **Recommendation:** five sentences maximum—decision, evidence, trade-off/risk, limitation, next falsifying test.
9. **Final confidence:** 0–100 and one reason it changed or stayed stable.

## Operator Form O-A — Support Automation Expansion

**Role:** Strategy manager in the fictional RiverBank Customer Operations team.  
**Decision owner:** Head of Customer Operations.  
**Decision:** whether to expand an AI-assisted support flow from billing questions to account-access questions for a four-week controlled pilot.

### Source 1 — pilot note (synthetic)

The billing pilot routes eligible text chats through an assistant that may retrieve approved help content and draft a response. A support agent approves any message involving fees, account status, identity, security or a promise to the customer. “Contained” means the conversation closed without agent takeover during the same session; it does not prove correct resolution or customer satisfaction. The pilot excluded suspected fraud and vulnerable-customer cases.

### Source 2 — quality review (synthetic)

A manual review of 40 randomly sampled contained billing chats found 34 correct and complete responses, four incomplete explanations and two cases where the answer was technically correct but the next action was unclear. Reviewers did not sample chats transferred to agents. Account-access questions have higher identity and security consequences than billing explanations.

### Policy excerpt RB-17 (synthetic)

- The assistant may classify an issue and retrieve approved content.
- Identity verification status must come from the deterministic account system; the model may not infer it.
- Any account unlock, credential change, fee promise or security advice requires an authenticated agent action.
- When identity state is missing, conflicting or stale, the flow must stop and route to an agent.

### Dataset

Use `data/maturity-operator-a-support-synthetic.csv`. Reproduce the **eligible-chat correct-containment rate**:

`correctly resolved without takeover / eligible chats`

Treat a contained chat as correct only when the quality label is `pass`. Exclude records marked `not_eligible` from both numerator and denominator.

### AI draft to critique

> [1] The billing assistant contained 75% of chats. [2] Customer satisfaction therefore improved by 75%. [3] Because only two contained chats were unsafe, the bank should fully automate account unlocks. [4] Expanding immediately will cut cost without material customer risk.

### Allocation steps

1. validate issue type and identity-state fields;
2. summarize the customer's free-text problem;
3. decide whether the pilot may expand and under what boundary;
4. approve any account unlock or external promise.

## Operator Form O-B — Supplier Recovery Routing

**Role:** Operations excellence manager at fictional Northline Appliances.  
**Decision owner:** VP Supply Operations.  
**Decision:** whether to pilot an AI-assisted exception router for delayed component shipments at Plant 2.

### Source 1 — operations note (synthetic)

The current team receives carrier events, checks whether a shipment threatens the frozen production window, and selects expedite, substitute, reschedule or monitor. Carrier reason text is inconsistent. A late event is not material when buffer inventory covers the delay. Expediting has a direct cost and may require supplier agreement.

### Source 2 — incident review (synthetic)

Last quarter, a duplicate carrier event created two expedite requests for the same shipment. One was caught before payment; the other required reversal. The review recommends a shipment-event idempotency key, observable pending states, and approval before any commercial commitment.

### Policy excerpt NL-04 (synthetic)

- Deterministic checks validate shipment ID, event ID, quantity, ETA and duplicate status.
- A model may classify free-text cause and draft a recovery summary.
- Materiality depends on days of buffer compared with days of delay.
- Expedite, substitute commitment and supplier penalty require the named planner/owner.
- Missing or conflicting quantities/ETAs route to `needs_review`.

### Dataset

Use `data/maturity-operator-b-shipments-synthetic.csv`. Reproduce the **material-delay rate among unique valid events**:

`unique valid events where delay_days > buffer_days / all unique valid events`

Exclude malformed records and count each `shipment_id + event_id` once.

### AI draft to critique

> [1] Fifteen of twenty events are delayed, a 75% material-delay rate. [2] Carrier X is the root cause of most production risk. [3] The router should automatically expedite every event delayed by more than two days. [4] Duplicate events are rare enough to ignore during the pilot.

### Allocation steps

1. validate and deduplicate event records;
2. classify free-text cause notes;
3. choose recovery option using buffer, cost and production consequence;
4. authorize an expedite or supplier commitment.

## Advisor/Investor Form A-A — Service-Model Recommendation

**Role:** Consultant advising fictional TrailTel on redesigning tier-one customer support.  
**Decision owner:** Client COO.  
**Decision:** whether to recommend a bounded AI-assist pilot for prepaid-plan questions in one service queue.

### Source 1 — client brief (synthetic)

TrailTel wants shorter resolution time without increasing repeat contact, complaint escalation or incorrect plan promises. The queue contains plan explanations, balance questions, identity/account changes and disputed charges. The client can pilot on plan explanations only. Union consultation and role redesign are outside this diagnostic decision.

### Source 2 — review note (synthetic)

Average handle time fell in the current script pilot, but repeat contact was not reported in the steering deck. Quality reviewers warn that shorter interactions may reflect premature closure. The client has no approved policy for a model to make tariff promises or account changes.

### Policy excerpt TT-09 (synthetic)

- Pilot recommendations must state eligible and excluded issue types.
- Resolution means no repeat contact for the same issue within seven days.
- Model-produced claims require a cited approved source.
- The client owner approves customer-facing policy, workforce changes and any expansion.
- Missing repeat-contact linkage is a decision limitation, not a zero value.

### Dataset

Use `data/maturity-advisor-a-service-synthetic.csv`. Reproduce the **seven-day resolved rate** for `script` and `assist` contacts:

`contacts with resolved_flag=1 and repeat_7d=0 / eligible contacts`

Exclude `issue_type=account_change` because it is outside the permitted pilot.

### AI draft to critique

> [1] AI assist cut average handle time by 31%. [2] It also raised true resolution to 90%. [3] The client should replace the tier-one team with a fully automated bot. [4] The pilot proves annual savings of ₹12 crore with no service risk.

### Allocation steps

1. validate issue eligibility and compute comparable outcome metrics;
2. summarize free-text failure themes with cited examples;
3. form the pilot recommendation and trade-off;
4. approve workforce or customer-policy change.

## Advisor/Investor Form A-B — Investment Screen Advance

**Role:** Venture Capital associate at fictional Meridian Seed Fund.  
**Decision owner:** Investment partner/committee.  
**Decision:** whether fictional B2B software company LatticeOps advances from initial screen to a diligence meeting.

### Source 1 — thesis note (synthetic)

Meridian considers India-focused B2B workflow software at seed stage. Initial-screen signals include recurring revenue quality, customer concentration, gross retention, plausible payback and evidence that workflow usage is not a one-time implementation spike. Passing a screen is not an investment recommendation.

### Source 2 — founder note (synthetic)

The founder states that revenue grew “more than 100% annualized” in the latest quarter and that “no customer represents meaningful concentration.” The company changed pricing midway through the period. The supplied table is a synthetic cohort extract and has not been audited.

### Policy excerpt MSF-03 (synthetic)

- Separate founder claims, supplied calculations and independently reproduced results.
- Annualized growth must not be presented as year-over-year growth.
- Customer concentration is measured as largest-customer ending MRR divided by total ending MRR.
- A meeting decision may proceed with stated diligence gaps; an investment recommendation requires deeper verification and partner authority.
- Sensitive personal/customer data is neither requested nor uploaded at screen stage.

### Dataset

Use `data/maturity-advisor-b-vc-synthetic.csv`. Reproduce:

1. quarterly MRR growth: `(month_3_total - month_0_total) / month_0_total`; and
2. largest-customer concentration at month 3: `largest month_3_mrr / month_3_total`.

Treat `status=cancelled_before_month_3` as month-3 MRR of zero; do not drop it.

### AI draft to critique

> [1] LatticeOps grew 132% year over year. [2] Its largest customer is only 9% of revenue. [3] The data proves durable product-market fit. [4] Meridian should invest immediately before the round becomes competitive.

### Allocation steps

1. validate customer rows and reproduce screen metrics;
2. summarize founder/product evidence and contradictions;
3. decide whether the company advances to a diligence meeting;
4. approve an investment or term sheet.

## Submission reminder

Strong work may conclude **proceed**, **proceed with conditions**, **hold**, or **stop**. Confidence and positivity are not scored. The response is scored on frame, evidence/data, allocation, reliability and decision-ready recommendation using the common 0–3 rubric.
