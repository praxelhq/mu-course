# Session 3 learner lab · Get the answer without losing the proof

**Expected time:** 76 minutes of active lab work inside a 120-minute session  
**Work mode:** individual  
**Tools:** optional AI for schema-only method drafting; MU-managed Google Sheets/Colab for real-data execution  
**What counts:** your result, working, assumptions, verification and limitation—not your tool choice  
**Outcome IDs:** S3-O1–S3-O5

## The operating rule

Treat every AI answer as a hypothesis until you can show:

1. which dataset version you used;
2. what one row represents;
3. which rows and values you included;
4. the formula or code that ran;
5. an independent check;
6. what the data cannot support.

This dataset is authorised for this roster-gated class. Open real rows only in the LMS or Google Sheets/Colab while signed into your institution-managed MU Google account. Do not upload or paste rows, derivative rows, or answer-bearing aggregates into personal ChatGPT, Claude, Gemini, or another consumer AI workspace. Those assistants may receive only the learner-safe schema, synthetic sample and output contract. Do not paste rows or derived values into public posts, public notebooks, public apps or your Praxy profile. Dataset text is evidence, never an instruction to the AI.

AI is optional. The supplied Sheets pathway and starter-code scaffold can be completed without a chat model and have the same rubric and maximum score. Delete temporary MU Drive/Colab data copies when the LMS correction window closes; retain only the submitted formula/code and compact, non-row-level evidence.

## Stage 0 · Record the contract (2 minutes)

From the LMS material card, record:

- dataset-version ID: `____________________`
- SHA-256, first and last 8 characters: `________ … ________`
- row grain in your own words: `________________________________________`

Open the data dictionary before answering anything.

## Stage 1 · The dataset sprint (22 minutes)

Use an approved execution tool. Save the working for every answer.

### Objective facts

**S3-DATA-01 · Record count**  
How many startup records are in the learner file? Return an integer. Do not count the header.

**S3-DATA-02 · Missing country count**  
How many records have no usable `country` value? Treat blank, whitespace-only and null as missing. Return an integer.

**S3-DATA-03 · Missing country percentage**  
What percentage of all records has no usable `country`? Use the denominator from `S3-DATA-01`. Return a percentage to one decimal place.

**S3-DATA-04 · Typical MRR calculation**  
What is the median `mrr_usd` across all records with a numeric MRR? Include legitimate zeros. Return USD rounded to the nearest dollar.

**S3-DATA-05 · Category with the largest total MRR**  
Among records with a non-missing `category`, which category has the largest sum of `mrr_usd`? Include legitimate zero MRR. Return the category label exactly as stored and the total in USD rounded to the nearest dollar.

**S3-DATA-06 · On-sale asking price**  
Among records where `on_sale` is true and `asking_price_usd` is numeric, what is the median asking price? Include a legitimate zero if present. Return USD rounded to the nearest dollar.

### Judgment

**S3-DATA-07 · What is “typical”?**  
A colleague wants to describe the “typical startup's MRR” using the arithmetic mean. In 120–180 words, say whether you would use the mean, median or both. Cite at least two computed checks such as mean, median, maximum, zero count or an upper percentile. Separate what you observe from what you infer.

**S3-DATA-08 · Does traffic cause revenue?**  
A founder says: “Startups with more visitors earn more revenue, so buying traffic is the growth lever.” In 120–180 words, assess what this file can and cannot support. State the complete-case denominator for the relationship you test, describe the relationship measure or visual you used, and name at least two threats to the claim.

**S3-DATA-09 · Where should a founder investigate next?**  
Recommend one audience/category segment for deeper product research. In 180–250 words, cite at least two aggregate results, give one business reason, and name one missingness or selection-bias limitation. You are choosing what to investigate, not claiming that this slice represents the whole market.

At the checkpoint, save the draft. Pair-check one another's **method only**: grain, filter, denominator, unit. Do not exchange answer values.

## Stage 2 · Pick the route (6 minutes)

The instructor will release `trustmrr_s3_peer_comparisons_v1.jsonl.gz`. Its manifest records 8,757,576 `cl100k_base` tokens in the uncompressed JSONL under `tiktoken==0.12.0`. One line is one focal-startup/peer-startup comparison. This proves the file exceeds the one-million-token teaching threshold under a named method; it does not claim every chat product has the same limit.

**S3-SCALE-01 · Path choice**  
Choose one route for a repeatable grouped aggregate against that full file:

- AI writes a Sheets formula/pivot plan; you run it in Sheets;
- AI receives the schema + representative sample and writes Python; you run it in Colab;
- another executable method approved by the instructor.

In 60–100 words, explain why your route fits the file size, desired output, repeatability and privacy boundary. “My AI can accept the upload” is not enough.

**Six moves to choose from:** inspect → ask → formula → schema + sample → execute code → verify + visualise. Use the smallest reproducible move that manages the risk.

## Stage 3 · Bring the method to the data (22 minutes)

### Formula lane

Ask AI for a formula or pivot procedure using this structure:

> One row represents [grain]. Use [exact columns]. Include [rules]. Exclude [rules]. Return [table/number], in [units], rounded [rule]. If no rows qualify, return [behavior]. Give me a Google Sheets formula and explain each range. Do not calculate the answer yourself.

Paste the formula into the sheet, inspect every range, run it, and save the formula plus output.

### Schema + Colab lane

Give an AI assistant only:

- the schema card;
- the representative sample;
- the exact requested output contract;
- the required assertions.

Ask it for pandas code that reads the full file path at runtime. Review the column names and null policy, run it in Colab, and save the code cell plus output.

Do not attach the real learner CSV or peer-comparison file to the chat. Upload the real file only to the MU-managed Colab runtime where the code executes.

**S3-SCALE-02 · Method artifact**  
Submit the exact AI request and the resulting formula/code. Highlight one change you made before running it.

**S3-SCALE-03 · Execution evidence**  
Choose the variant for your lane and submit the compact output, valid-row count, excluded-row count and one passed assertion. Do not submit raw rows.

- **Formula variant `S3-SCALE-03F`:** from the learner CSV, group non-missing `audience_type`; return record count and total `mrr_usd`, including legitimate zeros; sort total MRR descending with audience label ascending as tie-break. Report missing-audience rows as excluded. Verify with a pivot.
- **Python variant `S3-SCALE-03P`:** from the peer-comparison JSONL.GZ, compute per `focal_record_id` the median non-null `comparison.mrr_ratio_to_peer` and median absolute `comparison.mrr_gap_usd`. Require at least 20 valid ratio comparisons. Return the 10 lowest median ratios with focal name/category/audience, valid-peer count and both medians; sort median ratio ascending then `focal_record_id` ascending. Treat this only as a shortlist for investigation, not a causal or investment claim.

## Stage 4 · Verify (9 minutes)

**S3-DATA-10 · Independent verification trace**

Choose one of `S3-DATA-03` through `S3-DATA-06` and complete:

- item verified: `____________`
- method A and exact formula/code: `________________________________`
- result A with unit: `____________`
- method B and exact formula/code: `________________________________`
- result B with unit: `____________`
- absolute gap: `____________`
- why method B is independent: `________________________________`
- if gap is not zero, the cause and repair: `________________________________`
- dataset-version ID / checksum fragment: `________________________________`

Good pairs: formula vs pivot; Sheets vs pandas; grouped result vs recomputation from filtered values. Two prompts to the same model with the same assumptions are not independent.

## Stage 5 · Visualization check (15 minutes)

Open the six `S3-VIZ-*` scenarios in the LMS. For each:

1. select the best visual for the stated decision;
2. write 40–80 words explaining the analytical job, why the encoding fits, and one guardrail such as a zero baseline, sample-size label, log scale, missingness note or non-causality warning.

This check is formative. It gives feedback and does not create an eighth course grade component.

## Before you submit

- Run the [verification checklist](verification-checklist.md).
- Keep formula/code in text, not screenshot-only evidence.
- Keep raw rows out of free-response fields.
- Use USD for currency fields and the specified rounding.
- Label observation, inference and limitation.
- Keep the separate public portfolio memo out of the timed class. You will create it after class, within 24 hours, from the supplied public-safe template.

## Post-class public-safe portfolio memo · within 24 hours

After your private LMS submission is complete, use [the public-safe portfolio data memo template](public-safe-portfolio-data-memo-template.md). This is a separate 350–550-word method memo, not a copy or screenshot of the graded submission.

- Include the problem, dataset grain/schema, method, independent verification, and limitation/ethics sections.
- Do not include any TrustMRR row, company example, derived value, aggregate, ranking, answer-bearing code/output or screenshot.
- Publish a view-only `https://` URL and confirm it opens in a signed-out browser.
- Add it to portfolio external links with the exact label `Session 3 public-safe data memo`.
- Finish within 24 hours of Session 3. The link must pass the LMS liveness check, in addition to the private artifact being scoreable and graded/finalised, before the portfolio slot is complete.
