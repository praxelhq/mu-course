# Session 4 Quiz — Package Judgment

**Version:** 0.1  
**review_due:** 2026-10-17  
**Primary capabilities:** C4, C8

## Purpose and blueprint

This bank checks whether students can distinguish a reusable bounded method from a one-off prompt, define triggers and non-triggers, repair an input/output contract, and diagnose generic copied methods. It supplements clean-session execution and hidden-change evidence.

| Slot | Timing/stakes | Construct | Demand | Form A context | Parallel Form B context |
| --- | --- | --- | --- | --- | --- |
| Entry diagnostic | minute 0; formative/readiness | one-off prompt versus reusable method | classify | Product | Investment Banking |
| Delayed 1 | 24–72 hours; 1 point | choose trigger/non-trigger | apply | Product | HR |
| Delayed 2 | 24–72 hours; 1 point | repair input/output contract | analyse | Product | Investment Banking |
| Delayed 3 | 24–72 hours; 1 point | diagnose generic copied skill | evaluate | Product | HR |

Form B is equivalent in contract depth and consequence. The bank never tests a `SKILL.md` syntax detail or a particular agent product.

## Entry diagnostic

### S04-E-A — Prompt or method?

- **Version / family:** 0.1 / `S04-method-class`
- **Outcome ID:** S4-O1, C4
- **Purpose / demand:** entry diagnostic; classify
- **Stream/context:** Product; release-evidence review
- **Difficulty / time:** easy; 50 seconds
- **Prompt:** Which description is closest to a reusable method rather than a one-off prompt?
- **Options:**
  - A. “Write a persuasive launch memo in a crisp tone.”
  - B. “When a release review begins, require the user job, acceptance tests, task evidence, and risk flags; return ship/hold/cut-scope with cited reasons; stop if safety evidence is missing.”
  - C. “Make this PRD better.”
  - D. “Act like the world's best product manager.”
- **Correct answer:** B
- **Rationale:** B defines trigger, required inputs, judgment/output, evidence, and a stop condition that can be tested in a clean session.
- **Why the distractors are plausible but wrong:** A is a formatting/content request. C is vague and depends on current chat context. D is persona language without an operating contract or tests.
- **Feedback:** “A reusable method packages when to run, what it needs, what judgment it performs, what it returns, and when it must stop.”
- **Staleness/accessibility:** Evergreen and vendor-neutral; no file-format or UI knowledge required.

### S04-E-B — Parallel retake: diligence review

- **Version / family:** 0.1 / `S04-method-class`
- **Outcome ID:** S4-O1, C4
- **Purpose / demand:** equivalent retake; classify
- **Stream/context:** Finance — Investment Banking; data-room review
- **Difficulty / time:** easy; 50 seconds
- **Prompt:** Which description is closest to a reusable method rather than a one-off prompt?
- **Options:**
  - A. “Summarize this filing for the deal team.”
  - B. “Think like a senior banker and be very accurate.”
  - C. “Create a beautiful transaction overview.”
  - D. “When a new filing enters review, require source/date/period and key fields; reconcile to the model, return exceptions and diligence questions; stop on unsupported material numbers.”
- **Correct answer:** D
- **Rationale:** D is portable and bounded, with a trigger, inputs, output, checks, and a material-number stop condition.
- **Why the distractors are plausible but wrong:** A is a one-time request. B relies on persona and adjectives. C names an artifact without repeatable judgment.
- **Feedback:** “Professional expertise becomes reusable only when its evidence and decision rules are inspectable and testable.”
- **Staleness/accessibility:** Evergreen; no actual transaction or filing rule is tested.

## Delayed-retrieval items

### S04-D1-A — Trigger and non-trigger

- **Version / family:** 0.1 / `S04-trigger-boundary`
- **Outcome ID:** S4-O1, S4-O4
- **Purpose / demand:** delayed retrieval; apply
- **Stream/context:** Product; `Release Evidence Reviewer`
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which pair best defines a valid trigger and non-trigger for the method?
- **Options:**
  - A. Trigger: any product question. Non-trigger: nothing; the method should always help.
  - B. Trigger: a release decision with user job, acceptance tests, evidence, and risk inputs. Non-trigger: a request to write campaign slogans.
  - C. Trigger: when the PM says “urgent.” Non-trigger: when the request is short.
  - D. Trigger: any request containing “AI.” Non-trigger: any request without a spreadsheet.
- **Correct answer:** B
- **Rationale:** B describes the recurring professional job and a clearly out-of-scope task unrelated to its authority.
- **Why the distractors are plausible but wrong:** A maximizes helpfulness at the cost of boundaries. C uses superficial signals. D keys on words/formats rather than the business job.
- **Feedback:** “Write triggers from the work event and required evidence; write non-triggers from jobs the method must decline.”
- **Staleness/accessibility:** Evergreen. No product lifecycle framework or UI dependency.

### S04-D1-B — Parallel retake: workforce safeguard

- **Version / family:** 0.1 / `S04-trigger-boundary`
- **Outcome ID:** S4-O1, S4-O4
- **Purpose / demand:** delayed-retake; apply
- **Stream/context:** HR; `Workforce Decision Safeguard`
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which pair best defines a valid trigger and non-trigger for the method?
- **Options:**
  - A. Trigger: any message about an employee. Non-trigger: none.
  - B. Trigger: any spreadsheet containing names. Non-trigger: a spreadsheet without names.
  - C. Trigger: a manager decision-support request with approved minimal fields, policy, and review purpose. Non-trigger: a request to rank real candidates or decide discipline.
  - D. Trigger: whenever the model feels confident. Non-trigger: when it writes “maybe.”
- **Correct answer:** C
- **Rationale:** C binds the method to approved decision support and explicitly declines high-impact autonomous judgment.
- **Why the distractors are plausible but wrong:** A is over-broad. B treats data format as authority and invites PII. D delegates scope to model style/confidence.
- **Feedback:** “A method boundary names authorized work and prohibited decisions; confidence cannot create authority.”
- **Staleness/accessibility:** Evergreen; no law or HR system is tested. Plain-language terms.

### S04-D2-A — Repair the contract

- **Version / family:** 0.1 / `S04-io-contract`
- **Outcome ID:** S4-O2, S4-O4, S4-O5
- **Purpose / demand:** delayed retrieval; analyse
- **Stream/context:** Product; a release method receives a messy input
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** The method requires `user_job`, `acceptance_tests`, and `task_evidence`. An input contains only a feature name and launch date. What is the best behavior?
- **Options:**
  - A. Infer the missing user job and evidence from general product knowledge.
  - B. Produce a ship recommendation but mark it “draft.”
  - C. Return a structured missing-input response identifying the absent fields and stop before release judgment.
  - D. Change the output to a launch slogan because that is possible with the available input.
- **Correct answer:** C
- **Rationale:** The contract cannot support the intended judgment. C makes the failure inspectable and avoids fabricating evidence or changing the job.
- **Why the distractors are plausible but wrong:** A invents critical inputs. B still makes unsupported judgment. D silently switches tasks.
- **Feedback:** “Messy-input success can be a safe stop with a precise request for missing evidence.”
- **Staleness/accessibility:** Evergreen; field names are defined in the prompt and readable as plain text.

### S04-D2-B — Parallel retake: period mismatch

- **Version / family:** 0.1 / `S04-io-contract`
- **Outcome ID:** S4-O2, S4-O4, S4-O5
- **Purpose / demand:** delayed-retake; analyse
- **Stream/context:** Finance — Investment Banking; data-room method input
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** The method requires a source locator, reporting period, currency/unit, and model field. A new input omits the reporting period. What is the best behavior?
- **Options:**
  - A. Assume it matches the latest period in the conversation.
  - B. Stop the reconciliation, identify the missing period, and request/route the evidence before updating the model exception list.
  - C. Use the number because a source locator is present.
  - D. Average it with the prior period.
- **Correct answer:** B
- **Rationale:** Period is necessary to compare/reconcile the value. The method should fail closed rather than infer or combine non-equivalent data.
- **Why the distractors are plausible but wrong:** A depends on hidden context. C treats one valid field as sufficient. D performs unjustified transformation.
- **Feedback:** “Input contracts protect downstream decisions. Missing period/unit/source is a stop condition, not an invitation to guess.”
- **Staleness/accessibility:** Evergreen finance evidence practice; no actual securities or model software involved.

### S04-D3-A — Generic copied skill

- **Version / family:** 0.1 / `S04-generic-skill`
- **Outcome ID:** S4-O2–S4-O5
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** Product; a copied “Ultimate PM Skill”
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A method says, “For any product task, research deeply, think step by step, create a PRD, roadmap, launch plan, and metrics.” It has no input schema, non-triggers, tests, or stop condition. What is the most important diagnosis?
- **Options:**
  - A. It needs more adjectives describing quality.
  - B. It is over-broad and untestable; narrow it to one recurring judgment with explicit inputs, output, boundaries, and known tests.
  - C. It should add more deliverables so it covers the full lifecycle.
  - D. It is already reusable because it is long.
- **Correct answer:** B
- **Rationale:** The package lacks a bounded job and observable contract. Length and breadth make portability harder, not stronger.
- **Why the distractors are plausible but wrong:** A repeats prompt-polish behavior. C expands the failure. D equates instructions volume with reusable control.
- **Feedback:** “A copied mega-prompt becomes a method only after narrowing the job and making triggers, evidence, outputs, boundaries, and tests explicit.”
- **Staleness/accessibility:** Evergreen and vendor-neutral. No knowledge of a particular skill format.

### S04-D3-B — Parallel retake: generic manager helper

- **Version / family:** 0.1 / `S04-generic-skill`
- **Outcome ID:** S4-O2–S4-O5
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** HR; a copied “AI HR Manager” method
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A method claims it can recruit, assess performance, handle grievances, plan compensation, and coach managers from “whatever files are available.” It has no prohibited uses or tests. What is the most important diagnosis?
- **Options:**
  - A. It should sound more empathetic.
  - B. It needs access to more employee files.
  - C. It is over-broad, unsafe, and untestable; isolate one permitted decision-support job with minimal inputs, human/appeal boundaries, and normal/messy/non-trigger tests.
  - D. It is suitable because HR work benefits from one unified assistant.
- **Correct answer:** C
- **Rationale:** C addresses scope, data minimization, authority, and testability rather than cosmetic tone or access.
- **Why the distractors are plausible but wrong:** A ignores the operating failure. B increases privacy/authority risk. D assumes consolidation is inherently valuable.
- **Feedback:** “Professional range is not a method contract. Package one authorized recurring job and prove safe behavior on boundaries.”
- **Staleness/accessibility:** Evergreen; no jurisdiction-specific employment rule is tested.

## Scoring, threshold, and retake

- Entry diagnostic is formative; completion counts toward readiness participation, not quiz points.
- Delayed Form A: 3 points total.
- **3/3:** ready for this construct set. **2/3:** developing; assign the Method Contract repair card before Form B. **0–1/3:** facilitator support plus the repair card before Form B. Mastery is reported only across the cumulative delayed-retrieval checks.
- Form B unlocks after feedback as the equivalent retake; store both attempts, retain highest readiness result, and prevent repeated option guessing.
- A quiz pass does not compensate for a method that fails clean-session, non-trigger, messy-input, or hidden-change evidence.

## Item-quality checks before release

- Two reviewers independently classify and answer all variants; rewrite disagreements.
- Verify A/B pairs have equivalent method-contract fields, missing information, authority consequence, and reading load.
- Confirm each scenario has one clearly best response and that safe refusal/stop is treated as success where appropriate.
- Check Product, IB, and HR contexts represent substantive judgment rather than stereotypes; Finance sub-track is labelled.
- Ensure distractors map to documented misconceptions: mega-prompt, hidden context, broad scope, style-as-quality, missing-data invention.
- Accessibility: keyboard/screen-reader check, no color/diagram dependency, field names defined in prompt, time accommodation supported.
- No tool syntax, product feature, pricing, or current law is tested. Review only terminology before each delivery.
- After pilot, inspect difficulty, discrimination, distractor function, omissions, time, and differential performance; version all revisions.
