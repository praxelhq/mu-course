# Session 2 Quiz — Build the Evidence Engine

**Version:** 0.1  
**review_due:** 2026-10-17  
**Primary capability:** C2  
**Supporting capabilities:** C8, C9

## Purpose and blueprint

This bank checks source judgment, calculation audit, and contradiction handling after students build a Claim Chain. It cannot replace the dossier, reproducible number, peer audit, or transfer evidence.

| Slot | Timing/stakes | Construct | Demand | Form A context | Parallel Form B context |
| --- | --- | --- | --- | --- | --- |
| Entry diagnostic | minute 0; formative/readiness | source supports claim versus merely mentions topic | analyse | Data | Consulting |
| Delayed 1 | 24–72 hours; 1 point | rank source authority/directness/recency | evaluate | Corporate Finance | Marketing |
| Delayed 2 | 24–72 hours; 1 point | audit a calculation/claim | analyse | Data | Operations |
| Delayed 3 | 24–72 hours; 1 point | respond to contradiction | evaluate | Investment Banking | Consulting |

Form B preserves construct and demand while changing surface context. Option order may be shuffled, but the scenario must not be partially randomized.

## Entry diagnostic

### S02-E-A — Mention is not support

- **Version / family:** 0.1 / `S02-support-match`
- **Outcome ID:** C2.1, C2.4
- **Purpose / demand:** entry diagnostic; analyse
- **Stream/context:** Data; an analyst explains a churn anomaly
- **Difficulty / time:** easy; 50 seconds
- **Prompt:** A report claims, “A price change caused churn to rise.” Its citation is an official table showing that price and churn both rose in the same quarter. What is the strongest claim the table supports by itself?
- **Options:**
  - A. The price change caused the churn increase.
  - B. Price and churn rose in the same quarter; causation remains unproven.
  - C. Churn will continue rising next quarter.
  - D. The company should reverse the price immediately.
- **Correct answer:** B
- **Rationale:** Co-movement is observable; causal direction, forecast, and recommended action require additional evidence and analysis.
- **Why the distractors are plausible but wrong:** A is the tempting causal story. C extrapolates without a model or assumptions. D jumps from observation to action without alternatives or trade-offs.
- **Feedback:** “A source can support a fact while failing to support the inference built on it. Label fact, calculation, inference, and assumption separately.”
- **Staleness/accessibility:** Evergreen, vendor-neutral, and numeracy-light. No chart or color dependency.

### S02-E-B — Parallel retake: client-process claim

- **Version / family:** 0.1 / `S02-support-match`
- **Outcome ID:** C2.1, C2.4
- **Purpose / demand:** equivalent retake; analyse
- **Stream/context:** Consulting; a client support-process diagnostic
- **Difficulty / time:** easy; 50 seconds
- **Prompt:** A memo claims, “Longer handling time is the main cause of customer dissatisfaction.” Its source only shows that handling time and complaints rose in the same month. What is the strongest supported claim?
- **Options:**
  - A. Longer handling time definitely caused complaints.
  - B. Hiring more agents will solve dissatisfaction.
  - C. Handling time and complaints rose together; competing explanations must be tested.
  - D. The support process should be fully automated.
- **Correct answer:** C
- **Rationale:** C preserves the observable relationship and explicitly withholds unsupported causation and intervention.
- **Why the distractors are plausible but wrong:** A overstates correlation. B proposes a remedy without evidence. D jumps to an automation form without a decision chain.
- **Feedback:** “Use the evidence to narrow the next question. Do not let a plausible narrative outrun the source.”
- **Staleness/accessibility:** Evergreen; no specialized consulting framework or visual interpretation required.

## Delayed-retrieval items

### S02-D1-A — Best source for the claim

- **Version / family:** 0.1 / `S02-source-rank`
- **Outcome ID:** C2.1
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** Finance — Corporate Finance; reported revenue and current capital planning
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which source should be the primary authority for the company's latest reported quarterly revenue?
- **Options:**
  - A. A recent social-media post summarizing the earnings call.
  - B. The company's current official exchange filing for that quarter.
  - C. A three-year-old industry blog with a revenue chart.
  - D. A search-result snippet that mentions the company.
- **Correct answer:** B
- **Rationale:** The official current filing is primary, direct, and period-specific for reported revenue.
- **Why the distractors are plausible but wrong:** A may be recent but is a secondary summary. C may offer context but is stale and indirect. D is lead-only and may be truncated or misindexed.
- **Feedback:** “Match authority to the claim: for reported company figures, begin with the dated official filing and retain exact period and locator.”
- **Staleness/accessibility:** Evergreen rule; no actual company figures. Review terminology if filing regimes change, but answer logic is stable.

### S02-D1-B — Parallel retake: product claim

- **Version / family:** 0.1 / `S02-source-rank`
- **Outcome ID:** C2.1
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** Marketing; validating a current product-performance claim
- **Difficulty / time:** medium; 60 seconds
- **Prompt:** Which source should be the primary authority for the exact claims a brand currently permits on product packaging?
- **Options:**
  - A. A creator's review from last year.
  - B. A competitor's advertisement.
  - C. The brand's current approved product/packaging specification or official claim sheet.
  - D. A high-ranking search snippet.
- **Correct answer:** C
- **Rationale:** The current approved specification is direct and authoritative for what the brand claims; independent sources may test truth but do not define the approved wording.
- **Why the distractors are plausible but wrong:** A reflects user opinion, not authorized claims. B is about another product. D is lead-only and lacks context/version.
- **Feedback:** “Source choice depends on the claim. Use the direct owner/versioned document for approved wording, then independent evidence for substantiation.”
- **Staleness/accessibility:** Evergreen and brand-neutral; no image or packaging recognition required.

### S02-D2-A — Audit the denominator

- **Version / family:** 0.1 / `S02-calculation-audit`
- **Outcome ID:** C2.2–C2.4
- **Purpose / demand:** delayed retrieval; analyse
- **Stream/context:** Data; conversion analysis
- **Difficulty / time:** medium; 75 seconds
- **Prompt:** A funnel had 200 completed tasks from 1,000 eligible attempts last month and 250 from 1,250 this month. A generated memo says, “Completion improved from 20% to 25%.” What is the correct audit conclusion?
- **Options:**
  - A. Correct: completions rose from 200 to 250, so the rate rose five percentage points.
  - B. Incorrect: both months have a 20% completion rate; the count rose but the denominator also rose.
  - C. Correct: any increase in completed tasks means the rate improved.
  - D. Insufficient: a rate can never be calculated from counts.
- **Correct answer:** B
- **Rationale:** 200/1,000 and 250/1,250 both equal 20%. The memo confuses count growth with rate improvement.
- **Why the distractors are plausible but wrong:** A uses the correct first rate but assumes 250/1,250 is 25%. C ignores denominator. D is wrong because both numerator and denominator are present.
- **Feedback:** “Reproduce the number before accepting the sentence. Record numerator, denominator, period, unit, and formula.”
- **Staleness/accessibility:** Evergreen arithmetic; screen-reader-compatible numerals. Calculator allowed because audit judgment, not mental speed, is assessed.

### S02-D2-B — Parallel retake: service level

- **Version / family:** 0.1 / `S02-calculation-audit`
- **Outcome ID:** C2.2–C2.4
- **Purpose / demand:** delayed-retake; analyse
- **Stream/context:** Supply Chain and Operations; delayed shipments
- **Difficulty / time:** medium; 75 seconds
- **Prompt:** A hub had 80 delayed shipments out of 800 last week and 90 out of 1,000 this week. A generated note says, “Delay performance worsened because delayed shipments increased by 10.” What is the correct audit conclusion?
- **Options:**
  - A. Correct: any increase in delayed count means the delay rate worsened.
  - B. Incorrect: the delay rate improved from 10% to 9%, although the delayed count rose.
  - C. Incorrect: both delay rates are 10%.
  - D. Insufficient: shipment counts cannot support a service calculation.
- **Correct answer:** B
- **Rationale:** 80/800 is 10%; 90/1,000 is 9%. Operational interpretation must distinguish volume from rate.
- **Why the distractors are plausible but wrong:** A focuses on workload count and ignores exposure. C miscalculates the second rate. D ignores the supplied denominators.
- **Feedback:** “Counts and rates answer different questions. State which one matters for the decision and preserve both when operational load also matters.”
- **Staleness/accessibility:** Evergreen; calculator permitted; no chart reading or domain jargon beyond defined “delay rate.”

### S02-D3-A — Contradictory filing

- **Version / family:** 0.1 / `S02-contradiction-response`
- **Outcome ID:** C8.2, C2.4
- **Purpose / demand:** delayed retrieval; evaluate
- **Stream/context:** Finance — Investment Banking; deal-team model review
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A later official filing restates a material figure used in your transaction model. What is the best response?
- **Options:**
  - A. Keep the earlier figure because it preserves consistency with your first memo.
  - B. Average the figures so neither source is ignored.
  - C. Preserve both versions, classify the restatement/date conflict, update the model and affected claims, and flag the decision impact to the deal team.
  - D. Delete the earlier source and write that the new figure was always used.
- **Correct answer:** C
- **Rationale:** C keeps provenance, resolves version hierarchy, propagates the correction, and communicates material impact.
- **Why the distractors are plausible but wrong:** A values narrative stability over evidence. B combines non-equivalent versions without basis. D destroys the audit trail and invents history.
- **Feedback:** “Contradiction repair is a versioned chain update: retain, classify, revise downstream work, and explain what changed.”
- **Staleness/accessibility:** Evergreen and not transaction-specific. No regulated recommendation is requested.

### S02-D3-B — Parallel retake: client baseline conflict

- **Version / family:** 0.1 / `S02-contradiction-response`
- **Outcome ID:** C8.2, C2.4
- **Purpose / demand:** delayed-retake; evaluate
- **Stream/context:** Consulting; process-improvement value case
- **Difficulty / time:** medium; 70 seconds
- **Prompt:** A client stakeholder supplies a new baseline measured with a different definition from the one in your proposal. What is the best response?
- **Options:**
  - A. Replace the old number immediately and leave the value case unchanged.
  - B. Classify the definition/scope conflict, make the measures comparable or mark them unresolved, recalculate value, and record how the recommendation changes.
  - C. Choose whichever baseline creates the larger benefit.
  - D. Average the two baselines without examining definitions.
- **Correct answer:** B
- **Rationale:** Definition alignment must precede reconciliation. The value case and recommendation may need to change.
- **Why the distractors are plausible but wrong:** A updates data but not downstream logic. C is cherry-picking. D hides non-comparability behind arithmetic.
- **Feedback:** “Before reconciling two numbers, determine whether they measure the same population, period, unit, and definition.”
- **Staleness/accessibility:** Evergreen; no proprietary consulting method. Plain-language definition of baseline is inferable from context.

## Scoring, threshold, and retake

- Entry diagnostic is formative; completion contributes to readiness participation, not quiz points.
- Delayed Form A: 3 points total, one per item.
- **3/3:** ready for this construct set. **2/3:** developing; issue the C2 Claim Chain repair card before Form B. **0–1/3:** facilitator support plus the repair card before Form B. Mastery is reported only across the cumulative delayed-retrieval checks.
- After feedback, Form B is the immediate equivalent retake. Retain the highest demonstrated readiness score while storing both attempts and confidence.
- Retake feedback reveals source/denominator/contradiction rules, never hidden transfer fixtures.
- Quiz performance cannot compensate for fabricated sources, non-reproducible analysis, or concealed synthetic data in the applied evidence.

## Item-quality checks before release

- Two independent reviewers answer all items; rewrite any disagreement or multiple-defensible-answer case.
- Pairwise check Form A/B for reading load, number complexity, defect visibility, and cognitive demand.
- Recalculate all arithmetic with an independent spreadsheet/check; calculators remain permitted to avoid speed bias.
- Verify source questions do not imply that “primary” always means sufficient; directness and claim fit remain explicit.
- Confirm Data, Consulting, Corporate Finance, Marketing, Operations, and IB contexts are equivalent in professional status and risk.
- Accessibility review: screen reader, keyboard, no color/spatial dependency, numbers read unambiguously, and domain terms explained.
- No vendor UI, live market number, current product claim, or unstable regulation is tested. Context language is reviewed before delivery.
- Post-pilot inspect difficulty, discrimination, distractor function, omissions, response time, and section/stream differential performance; version and retire visibly.
