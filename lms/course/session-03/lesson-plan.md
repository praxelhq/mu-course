# Session 3 lesson plan · Working with data, using AI

**Version:** 1.0 · 30 July 2026  
**Expected time:** 120 minutes  
**Outcome IDs:** S3-O1–S3-O5  
**Lifecycle:** Authored  

## Bridge from Session 2

Students have already seen two simple routes to insight: work inside Google Sheets or upload a CSV to an LLM and ask questions in plain language. They have also learned tokens, context windows, hallucination, CO-STAR prompting, and the principle that the human edits and judges AI output. Session 3 keeps those useful ideas and adds the missing operating discipline: grain, denominator, missingness, scale, executable formulas/code, and independent verification.

Say this plainly at the start: **“Last time, upload-and-ask was a path. Today, you learn when that path stops being trustworthy or stops working at all.”**

## Observable outcomes and evidence

| Outcome | By the end, the learner can… | Evidence |
| --- | --- | --- |
| **S3-O1 · Compute** | answer a bounded business question with the correct row grain, filter, denominator, unit and rounding | `S3-DATA-01`–`S3-DATA-06`; deterministic validator against the private answer pack |
| **S3-O2 · Choose a path** | choose among whole-file chat, an AI-written Sheets formula, schema + sample, or Python/Colab and explain the choice | `S3-SCALE-01` path choice and `S3-SCALE-02` prompt/plan |
| **S3-O3 · Verify** | reproduce one result with a genuinely independent method and explain any gap | `S3-DATA-10` method A/method B trace, result gap and checksum/version |
| **S3-O4 · Judge** | make a decision-oriented recommendation while separating observation, inference and limitation | `S3-DATA-07`–`S3-DATA-09`; provisional rubric-bound AI score with evidence citations |
| **S3-O5 · Visualize** | select a chart that fits the analytical job and defend the encoding without overstating the data | `S3-VIZ-01`–`S3-VIZ-06`; deterministic selection plus provisional rationale feedback |

## Prerequisites

- Session 2 concepts: token, context window, hallucination, structured prompting.
- A laptop and MU Google account.
- Ability to open a CSV in Google Sheets. Coding experience is not required.
- Optional AI assistant for method drafting. Personal consumer AI workspaces receive only the learner-safe schema, synthetic sample and output contract; they never receive TrustMRR rows or answer-bearing aggregates.
- Real data may run only in the roster-gated LMS or Google Sheets/Colab under the institution-managed MU Google account. A supplied no-AI Sheets/starter-code lane has the same score ceiling.

## Materials and environment check

Instructor checks at T-7 and again 30 minutes before class:

1. `trustmrr_s3_manifest_v1.json`, `trustmrr_s3_learner_v1.csv` and the private fact pack share dataset version `trustmrr-s3-v1`; the learner-file SHA-256 matches the manifest.
2. The learner CSV downloads, previews, and opens in Sheets; no answer values appear in previews or filenames.
3. `trustmrr_s3_peer_comparisons_v1.jsonl.gz`, its field-level schema, deterministic peer JSONL sample and 8,757,576-token `cl100k_base` proof are present but gated. Do not substitute the learner-CSV sample for the nested peer file.
4. The Colab starter opens from a copy-only link and completes a clean runtime run.
5. `S3-DATA-*` mixed assessment and `S3-VIZ-*` scenario check work for a test student.
6. Gates are section-scoped; the instructor can open the scale pack without exposing instructor keys.
7. A local/offline pack is available for network fallback.
8. The LMS material card names the approved processors, account type, correction-window close and deletion deadline. If that card is absent, do not release the dataset.
9. The public-safe portfolio memo template is visible as an open learner material; publishing is a post-class task due within 24 hours, not an in-class activity.

## 120-minute run of show

| Time | Min | Mode | Instructor action | Learner work/evidence |
| --- | ---: | --- | --- | --- |
| 00:00–00:05 | 5 | Retrieval | Revisit “Sheets or upload” and ask what could make either route fail. Collect three predictions. | Write one failure condition; pair-share. |
| 00:05–00:11 | 6 | Consequential hook | Show two confident answers to the same aggregate, produced with different denominators. Do not reveal which is correct. | Vote, then name the hidden choice that could explain the gap. |
| 00:11–00:16 | 5 | Contract | State privacy/processor boundary, individual-work rule, dataset version, units, deletion deadline, and “AI answer = hypothesis until checked.” Demonstrate where the checksum/version is visible. | Open the dataset in the MU-managed workspace and assessment; record dataset-version ID. |
| 00:16–00:38 | 22 | **Independent challenge 1** | Release `S3-DATA-01`–`S3-DATA-09`. Circulate; ask only recovery questions. | Answer six objective and three judgment questions using any tool. Autosave draft. |
| 00:38–00:46 | 8 | Checkpoint/reveal | Close editing for a two-minute snapshot. Reveal the two denominator traps, not the answers. Model one “show me the working” move. | Reopen and repair one answer; label observation, inference and limitation. |
| 00:46–00:54 | 8 | Live proof: the wall | Show the token-count manifest for the large derivative, then attempt the whole-file strategy. Explain that product/file limits vary; the durable lesson is not to rely on fitting the file into chat. | Predict the next move and its trade-off. |
| 00:54–01:00 | 6 | Decision ladder | Teach six moves: inspect; ask; formula; schema + sample; execute code; verify/visualize. Map each to dataset size, repeatability and risk. | Complete `S3-SCALE-01`. |
| 01:00–01:22 | 22 | **Guided build** | Split room by confidence. Supported lane uses an AI-written Sheets formula. Core lane asks AI for Python from schema + sample and runs it in Colab. Learners may switch lanes. | Produce `S3-SCALE-02` and run `S3-SCALE-03`; capture formula/code and output. |
| 01:22–01:31 | 9 | **Verification and repair** | Demonstrate a reconciliation: row count → valid-value count → grouped totals → independent recomputation. Prompt bounds and smell checks. | Complete `S3-DATA-10` using two methods; explain zero/non-zero gap. |
| 01:31–01:39 | 8 | Visual judgment mini-lesson | Teach five analytical jobs: compare, distribute, relate, change, compose. Show one misleading axis and one missingness annotation. | Diagnose why the “prettier” chart is weaker. |
| 01:39–01:54 | 15 | **Scenario check** | Open `S3-VIZ-*` with the six versioned learner-safe equivalents in `visualization-quiz-accessible-artifacts.md`. Do not coach selections. At minute 10, remind learners that rationale must mention the decision and encoding. | Select and defend six visual choices. Submit formative check. |
| 01:54–01:58 | 4 | Ship | Show required fields and privacy reminder. Keep the artifact gate open until the section's published deadline. | Submit verified data memo with answer set, scale trace and verification evidence. |
| 01:58–02:00 | 2 | Bridge | “Next session, the data stops being the answer and becomes product evidence.” Point to the separate post-class public memo template and its 24-hour deadline; do not start it in class or preview the selected TrustMRR product. | Record the follow-up deadline and exact portfolio-link label; begin the public memo only after class. |

**Protected student-work time:** 72 minutes (independent challenge 22; guided build 22; verification 9; scenario check 15; ship 4). Retrieval, repair and path selection add further learner activity. The public memo is post-class and adds no classroom minutes. Compress instructor discussion before compressing the independent challenge, guided build, or verification trace.

## Instructor demo: exact sequence

Use a demonstration aggregate that is not one of the graded items.

1. Open the learner CSV and point to the manifest, not to any company row.
2. Ask an AI: “Give me the average of this metric.” Show that the prompt omits null handling, zero handling, scope and unit.
3. Ask the room which choices the AI must silently make.
4. Ask AI for a formula, not an answer: include table grain, source column, inclusion rule, unit and desired rounding.
5. Paste and run the formula in Sheets. Show the exact formula cell.
6. Recompute the same result with a pivot or a second formula whose mechanics are independent.
7. Deliberately use an open-ended `COUNTBLANK` over an entire column; show why it counts unused rows. Repair it by anchoring the blank count to populated `record_id` rows.
8. Open the large-file manifest. Show token count, method and checksum. Do not claim that every chat product has the same limit.
9. Give an AI only the schema card, representative sample and desired output contract. Ask for code with assertions and no invented column names.
10. Run the generated code in Colab. Read the assertions and row counts before reading the answer.
11. Close with: “The model drafted the method. The runtime touched the data. You verified the result.”

## Debrief questions

- What did the AI have to decide because your question did not?
- Which result changed when you changed the denominator?
- When is a formula preferable to a chat answer even if both are possible?
- What can a schema and sample reveal, and what can they never prove about the full file?
- What made your second method independent rather than a restatement of the first?
- Which chart choice changed when the business question changed?

## Likely misconceptions and recovery prompts

| Misconception | Recovery prompt |
| --- | --- |
| “The AI read every row because I uploaded the file.” | “What evidence shows how the tool processed the file? Can you get executable working and row counts?” |
| “A sample is enough to calculate the full answer.” | “A sample teaches structure and edge cases. Where will the code actually run against the full file?” |
| “Blank means zero.” | “Which business event does zero represent? Which event does missing represent? Would the denominator change?” |
| “Mean is the typical value.” | “Compare mean, median, maximum and zero count. Which statistic survives the outlier?” |
| “The biggest category in this slice is biggest in the market.” | “How was this teaching slice selected? What population claim is justified?” |
| “Two AI answers agreeing is verification.” | “Did the second route share the same prompt, model, code or assumption? What changed mechanically?” |
| “A line chart makes trends visible.” | “Where is the time field? A growth-rate snapshot is not a time series.” |

## Differentiation

**Supported route:** paired work; formula prompt template; pre-labelled column map; copy-ready formula with two blanks to fill; pivot-table verification; no Python requirement.

**Core route:** schema + sample → AI-generated pandas code → Colab execution → assertions → aggregate output → independent formula/pivot check on the small file.

**Extension route:** parameterise the Python query, add a missingness table and write a test that fails when the dataset checksum/version or required columns change. Extension does not raise the core grade ceiling.

## Submission, feedback and follow-up

- One individual submission; draft autosave allowed.
- Objective fields validate for format during drafting, but correctness and expected values release only after the section assignment closes; the in-class reveal teaches contracts, not answers.
- Judgment and visualization rationales receive provisional AI feedback with quoted evidence, confidence and flags. An instructor finalises artifact grades.
- Low-confidence, prompt-injection-like, evidence-free, outlier, duplicate or appealed responses enter review.
- One instructor-authorised correction window may reopen the same milestone as Version 2; history remains visible.
- After class and within 24 hours, the learner uses `public-safe-portfolio-data-memo-template.md` to publish a 350–550-word method memo. It contains no TrustMRR row, company example, derived value, aggregate, ranking, answer-bearing code/output or screenshot.
- The learner adds the public `https://` URL to portfolio external links with the exact label `Session 3 public-safe data memo`. The `data-memo` portfolio slot is complete only when a scoreable graded/finalised artifact exists and that exact link passes the LMS crawl.

## Release dependencies

Lifecycle may move from Authored to Validated only after:

- private answer pack recomputes from the frozen checksum;
- formula and Python paths agree for every objective item;
- prompt-injection and low-confidence grader fixtures pass;
- all six visualization items pass section-equivalence and accessibility checks;
- gates, autosave, submission, review queue and private-file handling pass in the target LMS;
- a facilitator completes a 120-minute rehearsal without exposing answers.
