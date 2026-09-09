# S01 Demo — The $2 Million Copilot That Cannot Answer One Question

**Asset ID:** `S01-DEMO-v1.0` · **Duration:** 7 minutes · **Demo input is never assessed**

## Setup

Open two static briefs: `DEMO-A` “CEO Copilot” and `DEMO-B` “Delayed-shipment triage.” Cache one polished memo, one normal triage record, and one ambiguous record. Show no vendor UI chrome.

## Script

1. **0:00:** “Which would you fund?” Lock room vote.
2. **0:30:** Ask DEMO-A for a weekly decision. Read the polished output.
3. **1:20:** Ask: “Who owns this decision? What source can we inspect? What test would fail?” Reveal blanks one by one.
4. **2:30:** Run DEMO-B normal record. It returns classification, rule ID, confidence and `planner_approval_required`.
5. **3:30:** Run ambiguous record. It stops instead of rerouting.
6. **4:30:** Open the nine-link stack behind DEMO-B and its two acceptance tests.
7. **5:40:** Change confidence from `.82` to `.54`; show action change from `recommend` to `escalate`.
8. **6:30:** “The smaller system is not safer because it is small. It is trustworthy because its evidence, decision and boundary are inspectable.”

**Transfer cue (not solved in demo):** flash a retail-inventory card and ask which two stack links would change; collect one prediction, then close. The assessed transfer later uses fictional hospital procurement and never exposes a solution.

## Assets and fallback

Use the normal/ambiguous objects in `fixtures/s01_synthetic_opportunity_cards.json`; screenshots or printed three-frame storyboard are equivalent. If live generation varies, play the cached memo and focus on missing fields. Do not teach prompting or imply the synthetic log is company data.
