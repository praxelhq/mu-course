# AI Operator Maturity — Part A Reserve/Incident Form R

**Version:** 0.1 — authored 18 July 2026  
**Security:** secured evaluator/assessment-operations master; the LMS must render prompts/options without answers, rationales or construct tags. Do not place this file in a learner bundle.  
**Use:** suspected exposure, verified platform incident or approved equivalent-administration need only; not an easier retake.  
**Administration:** 14 items, 18 minutes; capture confidence (0–100) after R02, R07, R10 and R14.  
**Scoring:** one point per item; select-all is all-or-nothing; ordering requires the complete sequence.  
**Validity boundary:** design equivalence is documented below. No claim of psychometric equivalence, reliability or pilot validity is made until empirical review.

## Blueprint

| Construct | Items | Demand |
| --- | --- | --- |
| M1 | R01–R02 | choose/repair problem contract |
| M2 | R03–R04 | allocate work and approval |
| M3 | R05–R06 | source and claim judgment |
| M4 | R07 | metric/data diagnosis |
| M5 | R08 | reusable-method boundary |
| M6 | R09–R10 | failure diagnosis and safe response |
| M7 | R11 | qualified task evidence |
| M8 | R12–R13 | privacy/authority/identity/fairness boundary |
| M9 | R14 | evidence-led recommendation order |

The format mix matches the released blueprint: eight single-best-answer, three output critiques, two select-all, one ordering.

## Secured items, keys and rationales

### R01 — Bound the workforce-planning decision

- **Construct/format:** M1; single best answer; Human Resources.
- **Prompt:** A people team asks for “an AI talent engine that finds the best employees.” Which rewrite is most decision-ready?
- **Options:**
  - A. Train a model on every available employee field and rank people.
  - B. For a supplied synthetic skills inventory, let the workforce-planning lead identify role-family skill gaps and decide whether to pilot a learning intervention, while suppressing small groups and excluding individual selection or adverse action.
  - C. Build a friendly career chatbot for everyone.
  - D. Generate a talent dashboard and maximize time spent.
- **Correct:** B.
- **Rationale:** B names the evidence, role-authentic decision, owner, outcome boundary, privacy/fairness guardrail and non-goal. The others are technology/activity led or unsafe.
- **Distractor logic:** A confuses access with authority; C lacks a decision; D uses a vanity metric.

### R02 — Repair a consulting brief

- **Construct/format:** M1; output critique; Consulting.
- **Prompt:** A proposal says, “Use AI to redesign the client's operations and guarantee 30% savings.” Choose the most important repair.
- **Options:**
  - A. Add more examples of AI tools.
  - B. Ask the model for a more persuasive guarantee.
  - C. Define one process decision, decision owner, baseline/source, measurable pilot outcome, service guardrail, uncertainty and client-approval boundary; remove the guarantee.
  - D. Make the proposal visually stronger.
- **Correct:** C.
- **Rationale:** C converts an unsupported transformation claim into a bounded, evidence-testable recommendation.
- **Confidence:** 0–100.

### R03 — Allocate a product-support task

- **Construct/format:** M2; single best answer; Product Management.
- **Prompt:** A product-support prototype receives a user issue and a policy excerpt. Which allocation is strongest?
- **Options:**
  - A. The model validates account state, decides the exception and changes the account.
  - B. Deterministic logic validates required IDs/state; the model classifies the free-text issue and drafts a cited answer; a support specialist handles ambiguity; the authorized product/policy owner approves any policy or account-changing action.
  - C. A human retypes every field while the model writes a greeting.
  - D. The model does everything and a person checks the tone later.
- **Correct:** B.
- **Rationale:** Stable validation belongs to rules, ambiguous language to bounded model work, and consequential action to named human authority.

### R04 — Locate the marketing approval boundary

- **Construct/format:** M2; single best answer; Marketing.
- **Prompt:** A campaign workflow reads an approved brief, generates two variants, checks required fields and proposes publishing the winner. Which step most clearly needs accountable approval?
- **Options:** A. reading the brief ID; B. checking that required fields exist; C. publishing an evidence-linked claim under the brand; D. writing the run timestamp.
- **Correct:** C.
- **Rationale:** External brand speech and product claims create legal, reputational and customer consequences; validation/logging are controlled but not the final authority boundary.

### R05 — Select a fit-for-decision source

- **Construct/format:** M3; single best answer; Supply Chain and Operations.
- **Prompt:** A planner must decide whether a current shipment delay threatens a frozen production window. Which evidence should anchor the ETA?
- **Options:**
  - A. a model's remembered average transit time;
  - B. an undated supplier marketing page;
  - C. the versioned carrier event reconciled to shipment ID and the current approved production/buffer record;
  - D. the most alarming message in the email thread.
- **Correct:** C.
- **Rationale:** The decision requires current, identifier-matched and authoritative records; fluency or urgency is not evidence quality.

### R06 — Separate transaction fact from inference

- **Construct/format:** M3; output critique; Investment Banking.
- **Prompt:** A buyer-screen note says, “The target reported ₹240 million EBITDA, so Buyer K will certainly pay the highest multiple.” Which classification is correct?
- **Options:**
  - A. Both clauses are facts if the note cites a filing.
  - B. The EBITDA may be a sourced fact after period/unit reconciliation; the buyer-price statement is an inference requiring buyer evidence, valuation assumptions and senior review.
  - C. Both clauses are calculations.
  - D. The second clause becomes true if the model is confident.
- **Correct:** B.
- **Rationale:** A sourced operating number does not prove buyer intent or valuation; fact, inference and authority remain separate.

### R07 — Diagnose the experiment denominator

- **Construct/format:** M4; single best answer; Marketing/Data.
- **Prompt:** A test memo reports qualified-response rate as `36 / 60 = 60%`. Ten records are internal QA and five lacked valid participation consent. What is responsible?
- **Options:**
  - A. Keep 60%; using every row is more objective.
  - B. Recompute on unique eligible consented exposures, document exclusions/deduplication and compare variants on the same definition before deciding.
  - C. Remove the lowest-performing variant.
  - D. Average the original rate with the corrected rate.
- **Correct:** B.
- **Rationale:** Metric population and data-quality rules must match the decision; silent inclusion or post-hoc deletion breaks reproducibility.
- **Confidence:** 0–100.

### R08 — Make an anomaly review reusable

- **Construct/format:** M5; single best answer; Data.
- **Prompt:** Which specification turns a one-off anomaly explanation into a bounded reusable method?
- **Options:**
  - A. “Act as the world's best analyst and explain anything unusual.”
  - B. Trigger on a versioned metric alert; require definition, period, lineage and quality checks; return valid/invalid/needs-review with evidence; decline causal claims; test normal, definition-change and missing-lineage cases.
  - C. Save the longest successful conversation.
  - D. Add more chart styles.
- **Correct:** B.
- **Rationale:** Reuse requires trigger, inputs, output contract, evidence/checks, non-trigger/boundary and tests—not persona or presentation.

### R09 — Diagnose the earliest failing layer

- **Construct/format:** M6; single best answer; FOCOS.
- **Prompt:** A weekly-priority assistant omits a protected initiative. The retrieval trace shows the correct initiative record was excluded because `protected=true` was parsed as missing. What failed first?
- **Options:** A. parsing/filtering; B. final recommendation tone; C. CEO judgment; D. slide design.
- **Correct:** A.
- **Rationale:** The required evidence never reached the judgment layer. Repair parsing/filtering and regress affected/stable cases before changing prose.

### R10 — Respond safely to an outbound incident

- **Construct/format:** M6; select all; Sales.
- **Prompt:** A workflow receives a duplicate buyer signal, the consent field is missing and the CRM service times out after a draft is created. Select every responsible immediate behavior.
- **Options:**
  - A. deduplicate on the signal/account key;
  - B. assume consent because the buyer is a business contact;
  - C. hold sending, preserve an observable pending state and request/reconcile consent;
  - D. use bounded retry only for the service failure and escalate when exhausted;
  - E. delete the failed run to keep the record clean.
- **Correct:** A, C, D.
- **Rationale:** Idempotency, consent/authority checks, observable state and bounded recovery prevent duplicate or unauthorized outreach.
- **Confidence:** 0–100.

### R11 — Interpret small task-attempt evidence

- **Construct/format:** M7; single best answer; FOCOS/Product.
- **Prompt:** Four assigned role-card users complete a decision cockpit task. Three finish, but two misread the “approve” action as an automatic budget commitment. What may the builder claim?
- **Options:**
  - A. The product is validated because most users finished.
  - B. This small task sample reveals an authority-label/control problem; clarify the action and rerun an equivalent task before broader claims.
  - C. Remove approval because users dislike it.
  - D. The sample proves the cockpit has no value.
- **Correct:** B.
- **Rationale:** Observed behavior supports a bounded repair and retest, not market validation or removal of the control boundary.

### R12 — Stop and escalate risky data/actions

- **Construct/format:** M8; select all; Data/Finance/Sales.
- **Prompt:** Which inputs/actions require stop or escalation? Select all.
- **Options:**
  - A. an unredacted customer export placed in a public prompt;
  - B. a labelled course-synthetic buyer table;
  - C. changing a capital commitment without the CFO/authorized owner;
  - D. a dated public filing with locator and usage note;
  - E. auto-sending an unverified security claim to a prospect.
- **Correct:** A, C, E.
- **Rationale:** Unauthorized personal data, consequential financial action and unapproved external claims cross clear boundaries. Labelled synthetic and properly handled public evidence do not.

### R13 — Repair identity/fairness theatre

- **Construct/format:** M8; output critique; Marketing/HR.
- **Prompt:** A team proposes: “Clone a living public leader without consent, use the voice to explain workforce rankings, and add a disclosure at the end.” What is the strongest response?
- **Options:**
  - A. Proceed because disclosure cures identity and ranking risk.
  - B. Use a more accurate voice model.
  - C. Stop the identity imitation and autonomous ranking; use an authorized fictional/composite identity or text route, disclose before interaction, and keep workforce support aggregate, reviewable and appealable.
  - D. Publish only inside the classroom.
- **Correct:** C.
- **Rationale:** Disclosure does not create consent or authority. The redesign must address identity, high-impact decision, fairness and accessibility together.

### R14 — Order a capital recommendation

- **Construct/format:** M9; ordering; Corporate Finance.
- **Prompt:** Put the recommendation in the strongest order.
- **Elements:** (1) limitation and falsifying next test; (2) approve/revise/defer decision input; (3) scenario evidence and reproduced calculation; (4) downside/guardrail and human authority.
- **Correct order:** 2 → 3 → 4 → 1.
- **Rationale:** Lead with the bounded decision, support it, expose downside/authority, then state uncertainty and the next disconfirming test.
- **Confidence:** 0–100.

## Design-equivalence notes

| Family | Released construct/demand | Reserve implementation | Preserved property |
| --- | --- | --- | --- |
| F01–F02 | M1 choose/repair contract | HR and Consulting | owner, outcome, guardrail, non-goal |
| F03–F04 | M2 allocation/approval | Product and Marketing | D/M/H/approver boundary |
| F05–F06 | M3 source/claim | Operations and IB | authority/recency plus fact/inference |
| F07 | M4 calculation defect | experiment population | denominator and reproducibility |
| F08 | M5 reusable boundary | Data method | trigger/schema/checks/non-trigger |
| F09–F10 | M6 diagnose/recover | parsing and outbound incident | earliest layer plus safe recovery |
| F11 | M7 qualified evidence | FOCOS/Product attempts | bounded claim from observed behavior |
| F12–F13 | M8 boundaries | data/finance/outbound and identity/HR | privacy, authority, identity, fairness |
| F14 | M9 recommendation | Corporate Finance | decision→evidence→trade-off→test |

Reading load, option count, response format, time and scoring match the blueprint by design. Context familiarity, difficulty, distractor function and differential performance may differ; therefore assignment must retain form/version/sequence and reserve results must be examined separately until pilot evidence supports pooling.
