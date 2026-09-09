# AI Operator Maturity — Part A Scenario Forms

**Version:** 0.1 — authored 18 July 2026  
**Purpose:** low-stakes pre/post literacy and judgment measure  
**Administration:** 14 items, 18 minutes, one assigned form; capture confidence (0–100) after Items 2, 7, 10 and 14  
**Security:** learner sees feedback only after the post window closes; reserve/incident items must remain separate  
**Visibility:** secured assessment-authoring source; do not place this keyed master in a learner content bundle. The LMS renders prompts/options and withholds keys/rationales until the post window closes.  
**Scoring:** one point per item. Select-all items use all-or-nothing until pilot evidence supports another rule. Ordering item requires the complete order.

These are authored forms, not validated measures. Thresholds remain provisional until difficulty, discrimination, form equivalence, timing and differential performance are piloted.

## Form A — operator contexts

### A01 — Decision-ready frame

- **Construct:** M1; single best answer; Product Management
- **Prompt:** A grocery app team asks for “an AI shopping assistant to increase engagement.” Which rewrite is most decision-ready?
- **Options:**
  - A. Build a conversational assistant using the best available model.
  - B. Let first-time weekly shoppers compare a shortlist; the category lead decides whether to pilot if task completion rises without increasing unsuitable substitutions.
  - C. Use AI to personalize shopping for all users.
  - D. Launch a prototype and measure total messages.
- **Correct:** B
- **Rationale:** B names user/task, decision owner, release decision, outcome and guardrail. The others specify technology or vanity activity.
- **Feedback:** Begin with the decision and acceptance boundary; the interface comes later.

### A02 — Guardrail and non-goal

- **Construct:** M1; output critique; FOCOS
- **Prompt:** A founder-office brief says: “Summarize every weekly metric and recommend actions automatically.” Choose the most important repair.
- **Options:**
  - A. Add a longer list of metrics.
  - B. Ask the model to sound more like the founder.
  - C. Define the operating-review decision, materiality thresholds, source freshness, and actions that require an accountable owner; exclude autonomous commitments.
  - D. Generate a prettier dashboard.
- **Correct:** C
- **Rationale:** C adds a bounded decision, evidence rules, authority and non-goal. More content or style does not control the work.
- **Confidence:** 0–100

### A03 — Human–AI allocation

- **Construct:** M2; single best answer; Supply Chain and Operations
- **Prompt:** An exception workflow receives a delayed-shipment event. Which allocation is strongest?
- **Options:**
  - A. Model parses event, decides supplier penalty and sends it.
  - B. Deterministic logic validates IDs and SLA; model summarizes unstructured cause notes; planner selects recovery; authorized owner approves any commercial action.
  - C. Human copies every field, model does nothing.
  - D. Model drafts all steps and a human is “in the loop” somewhere.
- **Correct:** B
- **Rationale:** B uses deterministic checks for stable rules, model work for ambiguity, and named human authority for consequential decisions.

### A04 — Approval point

- **Construct:** M2; single best answer; Sales
- **Prompt:** A workflow extracts a public account trigger, categorizes it, drafts an email and proposes a discount. Where is accountable approval most necessary?
- **Options:** A. field extraction; B. category lookup; C. sending the personalized email and discount; D. writing a run ID
- **Correct:** C
- **Rationale:** The external message and concession create relationship, claim, consent and pricing consequences.

### A05 — Source choice

- **Construct:** M3; single best answer; Corporate Finance
- **Prompt:** For a current liquidity review, which source should anchor the cash balance?
- **Options:**
  - A. a model answer with no citation;
  - B. a two-year-old media profile;
  - C. the dated, approved ledger extract supplied for the review, reconciled to its control total;
  - D. a colleague's memory of last quarter.
- **Correct:** C
- **Rationale:** Decision evidence needs authority, relevant date and a reproducible control—not merely public reputation or fluency.

### A06 — Claim classification

- **Construct:** M3; output critique; Marketing
- **Prompt:** A campaign memo says: “Survey respondents preferred Concept A by 18 percentage points, so it will grow market share.” Which classification is correct?
- **Options:**
  - A. Both clauses are facts.
  - B. Preference difference is a calculation if reproducible; market-share growth is an inference requiring a test.
  - C. Both clauses are assumptions and should be deleted.
  - D. The entire sentence becomes a fact if cited.
- **Correct:** B
- **Rationale:** A derived result can be reproduced from data; the causal business outcome does not follow automatically.

### A07 — Calculation defect

- **Construct:** M4; single best answer; Data
- **Prompt:** A dashboard reports conversion as `orders / all_sessions = 600 / 10,000 = 6%`. The experiment eligibility table shows only 8,000 sessions were exposed. What is the responsible response?
- **Options:**
  - A. Keep 6%; all sessions are more conservative.
  - B. Report 7.5% for the exposed population, document the denominator rule, and compare like-for-like before recommending.
  - C. Average 6% and 7.5%.
  - D. Ask a model which percentage sounds right.
- **Correct:** B
- **Rationale:** The decision population determines the denominator. The correction and rule must be traceable.
- **Confidence:** 0–100

### A08 — Reusable method boundary

- **Construct:** M5; single best answer; Consulting
- **Prompt:** Which change most clearly turns a one-off analysis prompt into a reusable method?
- **Options:**
  - A. Make it longer.
  - B. Add the phrase “act as a senior consultant.”
  - C. Define trigger/non-trigger, input schema, steps, output contract, checks, evidence rules and escalation, then test fresh cases.
  - D. Save the conversation as a PDF.
- **Correct:** C
- **Rationale:** Reuse requires an explicit operating contract and tests, not persona language or length.

### A09 — Failure-layer diagnosis

- **Construct:** M6; output critique; HR
- **Prompt:** A policy assistant cites the correct paragraph but recommends an exception that the paragraph explicitly prohibits. What failed first?
- **Options:** A. retrieval; B. generation/reasoning against retrieved evidence; C. network; D. visual design
- **Correct:** B
- **Rationale:** The relevant evidence was retrieved; the answer violated it. Repair answer constraints/evaluation before changing retrieval.

### A10 — Safe response

- **Construct:** M6; select all; Operations
- **Prompt:** A workflow receives the same purchase-order event twice and the approval service times out. Select every responsible immediate behavior.
- **Options:**
  - A. use an idempotency key to prevent duplicate action;
  - B. assume approval after a delay;
  - C. retain a pending/unknown state with an audit log;
  - D. retry within a bounded policy and escalate when exhausted;
  - E. hide the second event from the log.
- **Correct:** A, C, D
- **Rationale:** Duplicate protection, observable state and bounded recovery preserve control. Silence and assumed approval are unsafe.
- **Confidence:** 0–100

### A11 — Qualified user evidence

- **Construct:** M7; single best answer; Product Management
- **Prompt:** Five classmates say a prototype “looks useful.” Logs from three assigned role-card tasks show two users abandon at the approval step. What may the team claim?
- **Options:**
  - A. The product is validated because five people liked it.
  - B. The approval step is an observed usability/control issue in this small task sample; repair and rerun before a broader claim.
  - C. Users dislike approvals, so remove the human boundary.
  - D. The sample proves there is no demand.
- **Correct:** B
- **Rationale:** Observed behavior supports a bounded iteration decision, not product-market or population claims.

### A12 — Privacy and outbound boundary

- **Construct:** M8; select all; Sales/HR
- **Prompt:** Which inputs/actions require the system to stop or escalate? Select all.
- **Options:**
  - A. an internal employee file uploaded without course authorization;
  - B. a course-supplied synthetic account table;
  - C. automatically sending a personalized claim to a prospect;
  - D. a published annual report with date/source recorded;
  - E. ranking employees for termination with no accountable review.
- **Correct:** A, C, E
- **Rationale:** Private data, external claims and high-impact employment decisions require prohibition or named human authority. Labelled synthetic and properly sourced public evidence are permitted within policy.

### A13 — Identity and fairness

- **Construct:** M8; single best answer; Marketing/HR
- **Prompt:** Which proposal is acceptable for a common classroom identity/voice exercise?
- **Options:**
  - A. clone a living CEO from online interviews because the use is educational;
  - B. imitate a professor without telling the audience;
  - C. use an authorized fictional/course identity, disclose synthesis, constrain the source corpus, and provide a text-equivalent route;
  - D. clone any public figure if the output is not sold.
- **Correct:** C
- **Rationale:** Public availability and non-commercial use do not create consent. The acceptable route controls identity, disclosure, corpus and access.

### A14 — Recommendation order

- **Construct:** M9; ordering; Venture Capital
- **Prompt:** Put the investment-screen conclusion in the strongest order.
- **Elements:** (1) limitation and falsifying next test; (2) decision/recommendation; (3) evidence and calculation; (4) trade-off/risk
- **Correct order:** 2 → 3 → 4 → 1
- **Rationale:** Lead with the decision, support it, expose the trade-off, then state what remains uncertain and how to test it.
- **Confidence:** 0–100

## Form B — advisor/investor and alternate operator contexts

### B01 — Decision-ready frame

- **Construct:** M1; single best answer; Investment Banking
- **Prompt:** A team asks for “an AI deal copilot.” Which rewrite is most decision-ready?
- **Options:**
  - A. Build a chatbot trained on transaction documents.
  - B. For a sell-side preparation, let the deal team screen a supplied buyer universe against explicit strategic/financial criteria; the senior banker approves the shortlist and all external claims.
  - C. Automate investment banking with AI.
  - D. Summarize every file and maximize message volume.
- **Correct:** B
- **Rationale:** B defines representative work, decision, criteria and authority without pretending to have client data.

### B02 — Guardrail and non-goal

- **Construct:** M1; output critique; Venture Capital
- **Prompt:** A screening brief says: “Find the best startups and produce an investment recommendation.” Choose the most important repair.
- **Options:**
  - A. Search more companies.
  - B. Define stage/thesis, evidence set, screen decision, uncertainty and IC boundary; exclude autonomous investment decisions.
  - C. Use a larger model.
  - D. Write a more confident memo.
- **Correct:** B
- **Rationale:** A bounded screen with evidence and authority is inspectable; “best” and autonomous recommendation are not.
- **Confidence:** 0–100

### B03 — Human–AI allocation

- **Construct:** M2; single best answer; Consulting
- **Prompt:** A client diagnostic uses survey records, interview notes and policy. Which allocation is strongest?
- **Options:**
  - A. Model decides the restructuring recommendation and writes it to employees.
  - B. Deterministic logic checks survey completeness; model clusters interview themes with cited excerpts; consultant tests counter-evidence; client owner approves any operating change.
  - C. Consultant manually copies all records and ignores AI.
  - D. Model performs every step and consultant checks the final slide color.
- **Correct:** B
- **Rationale:** B allocates stable checks, ambiguous synthesis, professional judgment and accountable action distinctly.

### B04 — Approval point

- **Construct:** M2; single best answer; Corporate Finance
- **Prompt:** A forecast workflow imports actuals, flags variance, drafts commentary and proposes a revised cash commitment. Which step most clearly needs accountable approval?
- **Options:** A. validating period IDs; B. calculating variance; C. changing the cash commitment; D. recording the run timestamp
- **Correct:** C
- **Rationale:** The commitment changes a consequential financial decision; calculation and logging remain controlled but are not the approval boundary.

### B05 — Source choice

- **Construct:** M3; single best answer; Venture Capital
- **Prompt:** Which evidence should anchor a market-growth statement in a screening memo?
- **Options:**
  - A. a founder's unsourced pitch sentence;
  - B. a model's remembered number;
  - C. a dated primary/regulatory/credible industry series whose definition matches the target market, with the calculation shown;
  - D. the largest number found online.
- **Correct:** C
- **Rationale:** Authority alone is insufficient; definition, date and reproducibility must fit the claim.

### B06 — Claim classification

- **Construct:** M3; output critique; Consulting
- **Prompt:** A memo says: “Support tickets fell 22% after the bot launch, proving the bot improved customer satisfaction.” Which classification is correct?
- **Options:**
  - A. both are facts;
  - B. the ticket change is a calculation if cohorts/periods are comparable; the satisfaction conclusion is an inference needing direct evidence and alternatives;
  - C. both are false;
  - D. a citation makes causality proven.
- **Correct:** B
- **Rationale:** A measured operational change does not alone prove cause or customer sentiment.

### B07 — Calculation defect

- **Construct:** M4; single best answer; Investment Banking
- **Prompt:** A buyer-screen sheet reports average EBITDA margin as `(10% + 20% + 30%) / 3 = 20%`. Revenues differ tenfold and the stated method requires aggregate margin. What is responsible?
- **Options:**
  - A. use 20%; averages are always valid;
  - B. recompute `sum EBITDA / sum revenue`, preserve the company-level margins, and explain why the weighted result answers the stated question;
  - C. use the highest margin;
  - D. ask the model to choose.
- **Correct:** B
- **Rationale:** The required calculation must match the economic definition; an unweighted mean may answer a different question.
- **Confidence:** 0–100

### B08 — Reusable method boundary

- **Construct:** M5; single best answer; HR
- **Prompt:** Which specification makes a manager-support analysis reusable without turning it into autonomous HR judgment?
- **Options:**
  - A. “Act as a CHRO and decide what to do.”
  - B. trigger, permitted aggregate inputs, question sequence, evidence-citing output schema, non-trigger for individual adverse action, fairness/privacy checks and HR escalation.
  - C. a saved chat with one example.
  - D. a model-generated policy summary with no tests.
- **Correct:** B
- **Rationale:** A reusable method needs explicit interfaces, boundaries, checks and human authority.

### B09 — Failure-layer diagnosis

- **Construct:** M6; output critique; Sales
- **Prompt:** A grounded account assistant returns “no evidence found,” but the trace shows the relevant document was filtered out because its date metadata was parsed incorrectly. What failed first?
- **Options:** A. retrieval/filtering; B. final prose style; C. user demand; D. approval design
- **Correct:** A
- **Rationale:** The evidence never reached the answer layer; repair metadata/parsing/filtering and rerun before changing generation.

### B10 — Safe response

- **Construct:** M6; select all; Corporate Finance
- **Prompt:** A close-review workflow receives a malformed ledger row and the model service is unavailable. Select every responsible behavior.
- **Options:**
  - A. reject/quarantine the malformed row with reason;
  - B. invent the missing field from surrounding values;
  - C. preserve deterministic checks and route model-dependent commentary to pending/manual review;
  - D. mark the close complete to avoid delay;
  - E. log incident, affected records and recovery state.
- **Correct:** A, C, E
- **Rationale:** Containment, degraded operation and observability preserve the decision boundary; invention or false completion do not.
- **Confidence:** 0–100

### B11 — Qualified task evidence

- **Construct:** M7; single best answer; Marketing
- **Prompt:** Four peers praise a campaign prototype. Two assigned role-card reviewers cannot identify the intended action, and one flags an unsupported product claim. What is the strongest conclusion?
- **Options:**
  - A. launch because positive comments outnumber issues;
  - B. in this small test, action clarity and claim safety failed; repair those elements and rerun an equivalent blind scan;
  - C. the entire proposition is disproven;
  - D. remove the disclosure so the message is clearer.
- **Correct:** B
- **Rationale:** The evidence supports bounded repair and retest, not popularity counting or broad market claims.

### B12 — Privacy and outbound boundary

- **Construct:** M8; select all; Consulting/IB
- **Prompt:** Which inputs/actions require stop or escalation? Select all.
- **Options:**
  - A. leaked client data found in a shared drive;
  - B. a labelled course-supplied synthetic deal table;
  - C. sending buyer outreach without the authorized deal owner;
  - D. a public filing with source/date recorded;
  - E. publishing licensed research text outside its permitted use.
- **Correct:** A, C, E
- **Rationale:** Unauthorized private data, external deal action and license violation are prohibited/escalated. Synthetic and properly sourced public evidence remain bounded inputs.

### B13 — Identity and fairness

- **Construct:** M8; single best answer; Data/HR
- **Prompt:** A workforce model has lower error overall but double the false-negative rate for a smaller group. What is responsible?
- **Options:**
  - A. deploy because the overall score is higher;
  - B. hide group results to protect privacy;
  - C. investigate data/threshold consequences, report group uncertainty, keep accountable human review, and stop adverse automated use until the boundary is resolved;
  - D. ask the model to write a fairness statement.
- **Correct:** C
- **Rationale:** Aggregate performance cannot erase differential harm; evidence, uncertainty and authority determine release.

### B14 — Recommendation order

- **Construct:** M9; ordering; Consulting
- **Prompt:** Put the client recommendation in the strongest order.
- **Elements:** (1) limitation and next disconfirming test; (2) recommended decision; (3) strongest evidence/calculation; (4) trade-off and implementation boundary
- **Correct order:** 2 → 3 → 4 → 1
- **Rationale:** A decision-ready recommendation is explicit, supported, bounded, and falsifiable.
- **Confidence:** 0–100

## Form-equivalence map

| Family | Form A | Form B | Construct/demand held constant |
| --- | --- | --- | --- |
| F01 | A01 Product | B01 IB | choose a decision-ready project contract |
| F02 | A02 FOCOS | B02 VC | repair guardrail/non-goal/authority |
| F03 | A03 Operations | B03 Consulting | allocate deterministic/model/human/approver |
| F04 | A04 Sales | B04 Corp Fin | locate consequential approval |
| F05 | A05 Corp Fin | B05 VC | select fit-for-claim authoritative evidence |
| F06 | A06 Marketing | B06 Consulting | separate calculation from causal inference |
| F07 | A07 Data | B07 IB | repair a denominator/aggregation definition |
| F08 | A08 Consulting | B08 HR | identify reusable method contract |
| F09 | A09 HR | B09 Sales | diagnose retrieval versus generation layer |
| F10 | A10 Operations | B10 Corp Fin | choose safe degraded/duplicate/malformed behavior |
| F11 | A11 Product | B11 Marketing | interpret small observed task evidence without overclaim |
| F12 | A12 Sales/HR | B12 Consulting/IB | identify privacy/outbound/license stop conditions |
| F13 | A13 Marketing/HR | B13 Data/HR | identity/fairness release boundary |
| F14 | A14 VC | B14 Consulting | order evidence-led recommendation |

## Part C — coaching-only self-perception

Rate 1 (not yet) to 5 (consistently) and give one optional evidence pointer. These items never contribute to the mastery score.

1. I turn an AI request into a named decision, owner, outcome and guardrail.
2. I can distinguish source fact, calculation, inference, assumption and model suggestion.
3. I reproduce important numbers rather than trusting fluent summaries.
4. I divide work explicitly among deterministic logic, model work, human judgment and approval.
5. I define tests, failure states, safe stops and recovery before release.
6. I interpret observed user/task behavior without calling a tiny sample “validation.”
7. I can explain what I changed after a failure and why the change addressed the right layer.
8. I can show a recruiter evidence of my own judgment and state a limitation without weakening the story.

## Release checks still required

- two independent expert item reviews with zero answer disagreement;
- accessibility/readability review and timed cognitive interview;
- pilot difficulty, discrimination, distractor and omission statistics;
- Form A/B timing and score-distribution comparison by assigned sequence;
- differential-performance review by section/pathway where sample size permits;
- reserve/incident form authored and separately contained;
- version lock before the first baseline administration.
