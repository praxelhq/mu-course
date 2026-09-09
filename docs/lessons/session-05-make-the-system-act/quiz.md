# Session 5 Quiz — Make the System Act

**Version:** 0.1  
**review_due:** 2026-10-17  
**Primary capabilities:** C5, C8

## Purpose and blueprint

This bank checks whether students can allocate deterministic/model/human/external-system work, place approvals at consequential boundaries, and diagnose duplicate/timeout behavior. It supplements state maps, logs, injected runs, and replay evidence.

| Slot | Timing/stakes | Construct | Demand | Form A context | Parallel Form B context |
| --- | --- | --- | --- | --- | --- |
| Entry diagnostic | minute 0; formative/readiness | distinguish D/M/H/X ownership | classify | Operations | Sales |
| Delayed 1 | 24–72 hours; 1 point | allocate deterministic/model/human step | apply | Operations | Corporate Finance |
| Delayed 2 | 24–72 hours; 1 point | choose approval/escalation boundary | evaluate | Operations | Sales |
| Delayed 3 | 24–72 hours; 1 point | diagnose duplicate/timeout behavior | diagnose | Sales | Corporate Finance |

The four labels are defined in the lesson: **D** deterministic rule/calculation, **M** model judgment, **H** accountable human decision, **X** external system action. Form B preserves consequence and failure visibility.

## Entry diagnostic

### S05-E-A — Allocate the step

- **Version / family:** 0.1 / `S05-dmhx-class`
- **Outcome ID:** S5-O1, S5-O6
- **Purpose / demand:** entry diagnostic; classify
- **Stream/context:** Supply Chain and Operations; delayed-shipment workflow
- **Difficulty / time:** easy; 55 seconds
- **Prompt:** Which allocation is most appropriate for the step “check whether the event ID was already completed”?
- **Options:**
  - A. M — ask a model whether it looks familiar.
  - B. H — require a planner to remember every event.
  - C. D — compare the exact idempotency/event key against the run store.
  - D. X — send another task and see whether the external system rejects it.
- **Correct answer:** C
- **Rationale:** Exact duplicate detection is a stable, auditable rule and should occur before any consequential action.
- **Why the distractors are plausible but wrong:** A uses probabilistic judgment for exact matching. B wastes accountable human attention and is unreliable. D tests after risking duplication.
- **Feedback:** “Use deterministic controls for exact schemas, IDs, arithmetic, and policy rules. Reserve models for ambiguity and humans for accountable consequence.”
- **Staleness/accessibility:** Evergreen; idempotency is explained through exact duplicate checking. No workflow UI knowledge.

### S05-E-B — Parallel retake: opt-out check

- **Version / family:** 0.1 / `S05-dmhx-class`
- **Outcome ID:** S5-O1, S5-O6
- **Purpose / demand:** equivalent retake; classify
- **Stream/context:** Sales; account-follow-up workflow
- **Difficulty / time:** easy; 55 seconds
- **Prompt:** Which allocation is most appropriate for the step “check whether the account has an active do-not-contact flag”?
- **Options:**
  - A. D — exact policy/record check before drafting or sending.
  - B. M — ask a model whether contacting feels appropriate.
  - C. H — let the seller notice only after a message is sent.
  - D. X — send to the CRM and hope it blocks the action.
- **Correct answer:** A
- **Rationale:** A clear consent/policy flag is a deterministic precondition and should block downstream work before external action.
- **Why the distractors are plausible but wrong:** B turns an exact rule into subjective inference. C is too late. D delegates control to an external side effect without verified behavior.
- **Feedback:** “Place exact consent and policy checks early as deterministic gates; do not ask a model to reinterpret them.”
- **Staleness/accessibility:** Evergreen; no current privacy law or CRM feature is tested.

## Delayed-retrieval items

### S05-D1-A — D, M, H, or X?

- **Version / family:** 0.1 / `S05-allocation`
- **Outcome ID:** S5-O1, S5-O6
- **Purpose / demand:** delayed retrieval; apply
- **Stream/context:** Supply Chain and Operations; shipment exception triage
- **Difficulty / time:** medium; 65 seconds
- **Prompt:** Which allocation best fits this workflow?
- **Options:**
  - A. D validates event/SLA fields; M summarizes an ambiguous exception; H planner approves rerouting; X mock control tower records the approved task.
  - B. M validates exact IDs and calculates SLA; X decides rerouting; H writes the log afterward.
  - C. H validates every field; M approves rerouting; D sends the action.
  - D. X interprets ambiguity; M performs exact duplicate checks; no human is needed.
- **Correct answer:** A
- **Rationale:** A gives exact work to deterministic rules, ambiguous interpretation to the model, consequential rerouting to the planner, and the approved side effect to the external system.
- **Why the distractors are plausible but wrong:** B and D misuse models/external systems for exact or accountable work. C assigns approval to a model and mislabels the external action.
- **Feedback:** “Allocate by work property: exact and stable → D; ambiguous synthesis → M; accountable consequence → H; side effect in another system → X.”
- **Staleness/accessibility:** Evergreen; all labels defined above; no diagram required.

### S05-D1-B — Parallel retake: capital request

- **Version / family:** 0.1 / `S05-allocation`
- **Outcome ID:** S5-O1, S5-O6
- **Purpose / demand:** delayed-retake; apply
- **Stream/context:** Finance — Corporate Finance; capital-request workflow
- **Difficulty / time:** medium; 65 seconds
- **Prompt:** Which allocation best fits this workflow?
- **Options:**
  - A. M checks exact formulas; X approves capital; H receives a summary.
  - B. D validates sources/formulas and scenario fields; M explains narrative exceptions; H CFO/budget owner approves allocation; X review queue records the decision.
  - C. H recalculates every field manually; M authorizes the spend; D emails the vendor.
  - D. X chooses the scenario; M checks account permissions; no human approval is needed.
- **Correct answer:** B
- **Rationale:** B preserves auditable calculation controls, uses the model for narrative ambiguity, and keeps capital authority with the human owner.
- **Why the distractors are plausible but wrong:** A and C transfer allocation authority to systems/models. D confuses external action with judgment and omits approval.
- **Feedback:** “Automation can prepare and route a capital decision; it cannot create the authority to commit funds.”
- **Staleness/accessibility:** Evergreen and no actual accounting standard or system is tested.

### S05-D2-A — Where should approval sit?

- **Version / family:** 0.1 / `S05-approval-boundary`
- **Outcome ID:** S5-O3, S5-O4, S5-O6
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** Supply Chain and Operations; rerouting exception
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** The workflow validates a delay event, summarizes options, creates a proposed reroute, and then updates the mock dispatch board. Where is the clearest accountable human gate?
- **Options:**
  - A. Before reading the event.
  - B. After the dispatch board has already been updated.
  - C. After the proposed reroute and supporting evidence are visible but before the dispatch-board action.
  - D. Only when the workflow crashes.
- **Correct answer:** C
- **Rationale:** The planner needs enough evidence to approve/edit/reject immediately before the consequential external action.
- **Why the distractors are plausible but wrong:** A provides no proposal/evidence. B is after the side effect. D treats approval as error handling rather than authority.
- **Feedback:** “Place approval immediately before the consequential action and show the human the evidence, choices, and effect.”
- **Staleness/accessibility:** Evergreen; sequence is expressed in text, not visually.

### S05-D2-B — Parallel retake: customer message

- **Version / family:** 0.1 / `S05-approval-boundary`
- **Outcome ID:** S5-O3, S5-O4, S5-O6
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** Sales; evidence-grounded follow-up
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** The workflow researches approved account facts, drafts a follow-up and proposed discount, then can send to a prospect. Where is the clearest accountable human gate?
- **Options:**
  - A. After the message and discount have been sent.
  - B. Before any public facts are structured.
  - C. Only when the prospect replies negatively.
  - D. After the seller can inspect/edit the evidence, claims, recipient, and discount but before send.
- **Correct answer:** D
- **Rationale:** External communication and a commercial concession require seller approval with the relevant evidence before action.
- **Why the distractors are plausible but wrong:** A and C intervene after consequence. B wastes approval on reversible preparation while not protecting send.
- **Feedback:** “Human accountability belongs at the boundary of external commitment, with approve/edit/reject and a logged rationale.”
- **Staleness/accessibility:** Evergreen; no email/CRM interface or current sales policy is tested.

### S05-D3-A — Duplicate or retry?

- **Version / family:** 0.1 / `S05-recovery`
- **Outcome ID:** S5-O4–S5-O5
- **Purpose / demand:** delayed retrieval; diagnose
- **Stream/context:** Sales; CRM task creation
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A workflow times out after requesting a CRM task. The log does not show whether the CRM created it. What is the safest next step?
- **Options:**
  - A. Immediately retry the create action with a new event ID.
  - B. Ask a model whether the task probably exists.
  - C. Reconcile using the original idempotency/external-action key; retry only if the action is confirmed absent, otherwise link the existing task or escalate.
  - D. Mark the run completed without checking.
- **Correct answer:** C
- **Rationale:** The outcome is uncertain. Reconciliation prevents duplicate customer/account actions while allowing safe recovery.
- **Why the distractors are plausible but wrong:** A can duplicate the action. B cannot observe external state reliably. D hides an unresolved execution.
- **Feedback:** “A timeout is not proof of failure. Reconcile external state using a stable key before retrying a consequential action.”
- **Staleness/accessibility:** Evergreen reliability principle; no API or CRM product knowledge required.

### S05-D3-B — Parallel retake: payment/request record

- **Version / family:** 0.1 / `S05-recovery`
- **Outcome ID:** S5-O4–S5-O5
- **Purpose / demand:** delayed-retake; diagnose
- **Stream/context:** Finance — Corporate Finance; capital-review task creation in a sandbox queue
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A workflow times out after submitting a review task. The log shows `request_sent` but not whether the queue accepted it. What is the safest recovery?
- **Options:**
  - A. Submit the request again with a different identifier.
  - B. Check the queue using the original request/idempotency key, link the existing task if present, and retry or escalate only when absence is established.
  - C. Let the model create a replacement entry from memory.
  - D. Ignore the timeout because the request was probably accepted.
- **Correct answer:** B
- **Rationale:** B resolves uncertain external state and prevents duplicate review actions while retaining an auditable recovery path.
- **Why the distractors are plausible but wrong:** A risks duplication. C fabricates state. D leaves the run unresolved and unobservable.
- **Feedback:** “Reliable recovery distinguishes an uncertain result from a failed result and uses stable identifiers to reconcile before replay.”
- **Staleness/accessibility:** Evergreen; sandbox context avoids any real financial action. Plain text.

## Scoring, threshold, and retake

- Entry diagnostic is formative; completion counts toward readiness participation, not quiz points.
- Delayed Form A: 3 points total.
- **3/3:** ready for this construct set. **2/3:** developing; assign the Controlled Execution repair card before Form B. **0–1/3:** facilitator support plus the repair card before Form B. Mastery is reported only across the cumulative delayed-retrieval checks.
- Form B unlocks after item feedback. Highest readiness score is retained; both attempts, confidence, and response time remain for calibration.
- Quiz performance cannot compensate for missing approval, unsafe external action, absent logs, or duplicate/recovery failure in the execution layer.
- Repeated misses trigger a worked state/log example, not unlimited option reshuffling.

## Item-quality checks before release

- Two reviewers independently answer every item and label D/M/H/X; disagreement triggers rewrite.
- Confirm A/B pairs are equivalent in step consequence, sequence visibility, and recovery ambiguity.
- Ensure exactly one response is safest under the stated state; do not omit facts that make retry versus stop genuinely ambiguous.
- Verify Operations, Sales, and Corporate Finance are treated as professional decision contexts, and safe stops are not framed as incompetence.
- Distractors must map to observed misconceptions: model for exact rule, approval after action, retry storm, unknown state treated as failure, logs as optional.
- Accessibility: labels expanded in the introduction; screen-reader/keyboard review; no node diagrams, color, or drag-and-drop dependence.
- No vendor connector, API syntax, pricing, or current regulation is tested. Review terminology before each delivery.
- Pilot analysis covers difficulty, discrimination, distractor function, omissions, time, and differential performance by section/stream; revisions receive new versions.
