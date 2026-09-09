# Session 1 Quiz — Find the Leverage

**Version:** 0.1  
**review_due:** 2026-10-17  
**Primary capability:** C1  
**Supporting capabilities:** C8, C9

## Purpose and blueprint

This bank checks whether students can recognize a decision-ready AI opportunity rather than an attractive feature idea. It supplements the Work Sample Brief and transfer task; it cannot prove applied mastery.

| Slot | Timing/stakes | Construct | Demand | Form A context | Parallel Form B context |
| --- | --- | --- | --- | --- | --- |
| Entry diagnostic | minute 0; formative/readiness only | owner and consequential decision | analyse | Consulting | Product |
| Delayed 1 | 24–72 hours; 1 point | identify a decision-ready brief | evaluate | FOCOS | Marketing |
| Delayed 2 | 24–72 hours; 1 point | distinguish business outcome from AI feature/output | apply | Consulting | Venture Capital |
| Delayed 3 | 24–72 hours; 1 point | identify missing evidence/non-goal needed for feasibility | evaluate | FOCOS | Corporate Finance |

Form B is an equivalent retake after feedback, not a harder extension. Options may be shuffled within an item; scenario and answer mapping must stay fixed.

## Entry diagnostic

### S01-E-A — Name the decision

- **Version / family:** 0.1 / `S01-owner-decision`
- **Outcome ID:** C1.1
- **Purpose / demand:** entry diagnostic; analyse
- **Stream/context:** Consulting; a team proposes an AI transformation for an airline client
- **Difficulty / time:** easy; 45 seconds
- **Prompt:** Which brief most clearly identifies a consequential decision and the person accountable for it?
- **Options:**
  - A. “Use generative AI to modernize the airline's customer experience.”
  - B. “Build a chatbot that answers passenger questions faster.”
  - C. “Help the disruption-operations lead decide which delayed-flight cases require human escalation, using public policy and a supplied case log.”
  - D. “Create an AI strategy deck for senior management.”
- **Correct answer:** C
- **Rationale:** C names the role, the decision, the work context, and feasible evidence. It can later receive a metric, guardrail, and acceptance tests.
- **Why the distractors are plausible but wrong:** A sounds strategic but has no decision or owner. B names a feature, not the consequential decision or authority. D names a deliverable and audience but not the decision it improves.
- **Feedback:** “Start with who must decide or act differently. The AI form comes after the role, decision, evidence, and boundary.”
- **Staleness/accessibility:** Evergreen construct; no vendor facts. Plain text, no visual dependency, and screen-reader-safe option labels.

### S01-E-B — Parallel retake: release owner

- **Version / family:** 0.1 / `S01-owner-decision`
- **Outcome ID:** C1.1
- **Purpose / demand:** equivalent retake; analyse
- **Stream/context:** Product; a PM considers an AI feature for post-order support
- **Difficulty / time:** easy; 45 seconds
- **Prompt:** Which brief most clearly identifies a consequential decision and the person accountable for it?
- **Options:**
  - A. “Add AI to make the app feel more personalized.”
  - B. “Help the product and trust owner decide whether a self-service issue path is safe to release, using task-completion and escalation evidence.”
  - C. “Generate friendly support copy for every screen.”
  - D. “Benchmark the newest customer-service models.”
- **Correct answer:** B
- **Rationale:** B names accountable roles, a release decision, and evidence that can support that decision.
- **Why the distractors are plausible but wrong:** A is an aspiration without a job or measure. C is an output task, not the release decision. D is tool comparison disconnected from user value and authority.
- **Feedback:** “A recruiter-ready brief makes the decision owner and decision testable; it does not begin with novelty.”
- **Staleness/accessibility:** Evergreen construct; “release” is explained by context. No product UI knowledge or visual dependency.

## Delayed-retrieval items

### S01-D1-A — Decision-ready brief

- **Version / family:** 0.1 / `S01-ready-brief`
- **Outcome ID:** C1.1–C1.4
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** FOCOS; weekly operating review at a consumer company
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which proposal is ready to pass the first Work Sample Brief gate?
- **Options:**
  - A. “An AI Chief of Staff that reads everything and tells the CEO what to do.”
  - B. “A dashboard that summarizes weekly company performance.”
  - C. “A decision cockpit that helps the Chief of Staff prioritize two initiatives from a supplied operating pack, records missing evidence and owners, and leaves budget commitment to the CEO.”
  - D. “A system that automates strategy across all departments.”
- **Correct answer:** C
- **Rationale:** C is bounded, role-authentic, evidence-feasible, and explicit about authority. Its task can be tested without internal credentials.
- **Why the distractors are plausible but wrong:** A resembles a popular executive copilot but requires impossible access and transfers authority. B names a surface with no consequential decision. D is broad, untestable, and unsafe.
- **Feedback:** “The stronger opportunity is usually narrower: one role, one decision, inspectable evidence, and a named human boundary.”
- **Staleness/accessibility:** Evergreen. The scenario does not require familiarity with a specific company or organization chart.

### S01-D1-B — Parallel retake: proposition test

- **Version / family:** 0.1 / `S01-ready-brief`
- **Outcome ID:** C1.1–C1.4
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** Marketing; brand manager testing a new segment
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which proposal is ready to pass the first Work Sample Brief gate?
- **Options:**
  - A. “Generate a viral AI campaign for the brand.”
  - B. “Clone a celebrity to make the launch famous.”
  - C. “Automate all marketing content to reduce cost.”
  - D. “Help the brand manager decide whether a new-segment proposition deserves a test, using approved audience evidence, claim checks, and a qualified response metric.”
- **Correct answer:** D
- **Rationale:** D identifies a decision, owner, evidence, test, and claim boundary without presupposing a creative format.
- **Why the distractors are plausible but wrong:** A optimizes for vague virality. B creates identity/consent risk and no decision logic. C is over-broad and treats cost as the only outcome.
- **Feedback:** “A campaign is an execution option. First establish the proposition decision, evidence, metric, and claims guardrail.”
- **Staleness/accessibility:** Evergreen and vendor-neutral; no celebrity or campaign knowledge is needed.

### S01-D2-A — Outcome or feature?

- **Version / family:** 0.1 / `S01-outcome-feature`
- **Outcome ID:** C1.2–C1.3
- **Purpose / demand:** delayed retrieval; apply
- **Stream/context:** Consulting; client support redesign
- **Difficulty / time:** medium; 50 seconds
- **Prompt:** A student writes, “Success means the client receives an AI-generated slide deck in five minutes.” What is the best correction?
- **Options:**
  - A. Add more slides so the output looks comprehensive.
  - B. Replace the output measure with a business outcome such as time to identify a defensible intervention, while tracking recommendation error or service risk as a guardrail.
  - C. Compare several slide-generation tools and select the fastest.
  - D. Keep the measure because speed is always business value.
- **Correct answer:** B
- **Rationale:** The deck is an output. B measures whether the role's decision improves and names a guardrail against fast but poor work.
- **Why the distractors are plausible but wrong:** A and C improve the artifact/tool, not the business outcome. D confuses activity compression with value and ignores quality/risk.
- **Feedback:** “Measure the changed decision or operating outcome. Treat generated artifacts as means, not value by themselves.”
- **Staleness/accessibility:** Evergreen; no software knowledge. The distinction is stated in text.

### S01-D2-B — Parallel retake: investment screen

- **Version / family:** 0.1 / `S01-outcome-feature`
- **Outcome ID:** C1.2–C1.3
- **Purpose / demand:** delayed-retake; apply
- **Stream/context:** Finance — Venture Capital; first-pass opportunity screen
- **Difficulty / time:** medium; 50 seconds
- **Prompt:** A student writes, “Success means the AI produces a complete investment memo.” What is the best correction?
- **Options:**
  - A. Measure whether the system helps an associate identify a justified advance/hold/pass recommendation and the highest-value diligence gaps, while prohibiting invented private metrics.
  - B. Require a longer memo with more market buzzwords.
  - C. Measure only how quickly the memo is generated.
  - D. Ask the AI to make the investment decision autonomously.
- **Correct answer:** A
- **Rationale:** A ties the build to role-authentic judgment, evidence gaps, and an authority boundary. A memo is only the communication surface.
- **Why the distractors are plausible but wrong:** B rewards polish. C ignores correctness and decision usefulness. D transfers accountable investment judgment and encourages unsupported certainty.
- **Feedback:** “In investing, the work sample should expose evidence, uncertainty, counter-case, and judgment—not merely a finished memo.”
- **Staleness/accessibility:** Evergreen finance construct; no market data or regulated-advice knowledge is required beyond the scenario.

### S01-D3-A — Missing feasibility boundary

- **Version / family:** 0.1 / `S01-evidence-nongoal`
- **Outcome ID:** C1.3–C1.4, C8.1
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** FOCOS; company-wide operating assistant
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** A student's proposal depends on confidential company emails and promises to “recommend the final budget.” Which revision most directly makes the project feasible and safe?
- **Options:**
  - A. State that the student will request executive access later.
  - B. Use a supplied synthetic operating pack, narrow the output to options and unresolved risks, and make CEO/budget-owner approval an explicit non-goal boundary.
  - C. Remove the word “confidential” but keep the same data requirement.
  - D. Ask classmates to invent realistic internal emails and present them as company records.
- **Correct answer:** B
- **Rationale:** B replaces privileged access with labelled course evidence, narrows authority, and retains a testable role-authentic job.
- **Why the distractors are plausible but wrong:** A delays rather than solves feasibility. C changes wording, not risk. D fabricates company evidence and misrepresents synthetic data.
- **Feedback:** “When access collapses, change the evidence and authority design—not the label. Synthetic data must remain visibly synthetic.”
- **Staleness/accessibility:** Evergreen. Confidential/synthetic terms are defined in course pre-work; plain-text format.

### S01-D3-B — Parallel retake: capital recommendation

- **Version / family:** 0.1 / `S01-evidence-nongoal`
- **Outcome ID:** C1.3–C1.4, C8.1
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** Finance — Corporate Finance; capital-request review
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** A project requires an employer's private forecast and says the prototype will “approve the best capital request.” Which revision best preserves useful learning?
- **Options:**
  - A. Use official filings plus a labelled synthetic scenario pack, produce an auditable range and recommendation, and leave allocation approval to the CFO/budget owner.
  - B. Estimate the private forecast from social media and call it internal data.
  - C. Keep autonomous approval but add a disclaimer at the end.
  - D. Drop all calculations and generate a persuasive approval email.
- **Correct answer:** A
- **Rationale:** A creates feasible evidence, role-authentic analysis, and a clear human authority boundary.
- **Why the distractors are plausible but wrong:** B fabricates provenance. C leaves the unsafe authority design intact. D abandons the decision evidence rather than repairing it.
- **Feedback:** “A safe speculative finance project can model scenarios and surface recommendations; it must not pretend to authorize capital or possess private forecasts.”
- **Staleness/accessibility:** Evergreen. No actual securities or company figures appear; no numerical disability barrier.

## Scoring, threshold, and retake

- Entry diagnostic: recorded as correct/incorrect for facilitator routing; completion earns readiness participation, not quiz points.
- Delayed Form A: 1 point per item, 3 points total.
- **3/3:** ready for this construct set. **2/3:** developing; review feedback and complete the C1 repair card before Form B. **0–1/3:** facilitator support plus the repair card before Form B. Mastery is reported only across the cumulative delayed-retrieval checks, not from one three-item bank.
- Form B is available immediately after mechanism-level feedback. Highest demonstrated score is retained for readiness; both attempts remain visible for calibration.
- A quiz score cannot compensate for an unsafe or failed Work Sample Brief/transfer task.
- Retake options are not shown until Form A is submitted. A second failure triggers worked examples and facilitator review rather than unlimited guessing.

## Item-quality checks before release

- Two reviewers independently answer all eight variants; disagreement triggers rewrite.
- Verify each pair tests the same construct, reading load, evidence visibility, demand, and time.
- Confirm only one option is defensible under the stated facts and every distractor maps to a documented misconception.
- Check that Consulting, FOCOS, Product, Marketing, VC, and Corporate Finance are portrayed as consequential professional work, not stereotypes.
- Run screen-reader and keyboard review; confirm no answer depends on color, layout, speed, idiom, or company familiarity.
- No item references a vendor interface, current price, feature, or unstable regulation. Re-review only contextual terminology before each delivery.
- After pilot, inspect difficulty, discrimination, option selection, omissions, completion time, and differential performance by section/stream. Revise or retire versioned items; never silently alter a live form.
