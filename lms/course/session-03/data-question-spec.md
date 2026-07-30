# Session 3 mixed data-question specification

**Assessment class:** graded artifact question set  
**Dataset contract:** checksum-bound private learner slice  
**Response engine:** mixed assessment; do not force into the MCQ-only quiz engine  
**Answer values:** evaluator-only private pack; never materialise in this repository  
**Lifecycle:** Authored; the v1 fact pack, question-ID adapter and dual-computation checks exist. Instructor/model calibration remains pending.

## Dataset-version binding

Every attempt stores `datasetVersionId` and full SHA-256. The validator loads a private answer pack only when both match. A mismatch returns `version_mismatch`, preserves the draft, and tells the learner to download the current file; it never grades against a near match.

Private key generation must first assert:

- all 29 required columns exist exactly once;
- `record_id` is non-missing and unique;
- numeric columns parse under a documented coercion policy;
- `on_sale` normalises to true/false only;
- JSON-list columns parse as arrays;
- row count and SHA-256 equal the private manifest.

If any assertion fails, key generation stops. No fallback answer is guessed.

## Item blueprint

| ID | Outcome | Type | Demand | Difficulty | Time | Evaluation | Artifact dimension |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| S3-DATA-01 | S3-O1 | integer | apply | easy | 1m | deterministic | Functionality |
| S3-DATA-02 | S3-O1 | integer | apply | moderate | 2m | deterministic | Functionality |
| S3-DATA-03 | S3-O1 | percentage | apply/analyse | moderate | 1m | deterministic | Functionality |
| S3-DATA-04 | S3-O1 | USD | apply/analyse | moderate | 2m | deterministic | Functionality |
| S3-DATA-05 | S3-O1 | label + USD | analyse | moderate | 3m | deterministic | Functionality |
| S3-DATA-06 | S3-O1 | USD | analyse | moderate | 2m | deterministic | Functionality |
| S3-DATA-07 | S3-O4 | 120–180 words | judge | moderate | 3m | rubric-bound provisional AI | Relevance |
| S3-DATA-08 | S3-O4 | 120–180 words | judge | hard | 3m | rubric-bound provisional AI | Relevance |
| S3-DATA-09 | S3-O4 | 180–250 words | decide | hard | 5m | rubric-bound provisional AI | Relevance |
| S3-DATA-10 | S3-O3 | structured trace | verify | hard | 9m | deterministic checks + provisional AI | Verification evidence |
| S3-SCALE-01 | S3-O2 | 60–100 words | choose | moderate | 3m | rubric-bound provisional AI | Craft |
| S3-SCALE-02 | S3-O2 | prompt + formula/code | create | moderate | 8m | static checks + provisional AI | Craft |
| S3-SCALE-03 | S3-O2/O3 | aggregate output + counts + assertion | execute | hard | 11m | private solution comparison + static checks | Craft |

## Freshness controls

- Every data item is stale immediately when the bound dataset version or checksum changes; regenerate and dual-verify the key before re-opening.
- Column semantics, null rules and the peer-comparison generator version are part of the assessment version, not editable copy.
- Recheck Sheets formulas, Colab behavior and pandas APIs at T-7; a tool change may require pathway-copy revision without changing the analytical key.
- Judgment anchors are re-calibrated if slice construction changes because representativeness and missingness evidence may change.

## Deterministic item contracts

The pseudo-queries below define the key. The production generator must implement them in both pandas and a second independent reference implementation, then fail closed if outputs disagree.

### S3-DATA-01 · Record count

- **Columns:** `record_id`.
- **Query:** count data records after CSV parsing; header is not a record.
- **Precondition:** every `record_id` is non-missing and unique.
- **Response:** integer, no separators required.
- **Acceptance:** exact match.
- **Wrong-path codes:** `header_counted`, `blank_tail_counted`, `unique_count_without_precondition`.
- **Feedback after close:** “Count parsed data records, then assert `record_id` is complete and unique.”

### S3-DATA-02 · Missing country count

- **Columns:** `record_id`, `country`.
- **Normalisation:** missing if null or `strip(country) == ""`; do not treat a literal country code as missing.
- **Query:** count missing `country` only across populated dataset records.
- **Response:** integer.
- **Acceptance:** exact match.
- **Wrong-path codes:** `whole_sheet_countblank`, `null_only_no_whitespace`, `excluded_zero_irrelevant`.
- **Feedback:** “Anchor blank counting to populated `record_id` rows; open-ended sheet blanks are not data records.”

### S3-DATA-03 · Missing country percentage

- **Columns:** same as S3-DATA-02.
- **Query:** `100 * answer(S3-DATA-02) / answer(S3-DATA-01)`.
- **Rounding:** one decimal place using half-up display rounding; validator compares unrounded key to submitted numeric percentage.
- **Acceptance:** ±0.05 percentage points; `%` symbol optional.
- **Consistency check:** submitted count and percentage must be mutually consistent within tolerance.
- **Wrong-path codes:** `valid_country_denominator`, `fraction_not_percent`, `premature_integer_rounding`.

### S3-DATA-04 · Median MRR

- **Columns:** `mrr_usd`.
- **Inclusion:** all numeric values; legitimate zero included; missing excluded.
- **Query:** statistical median, including interpolation for an even-sized set.
- **Rounding:** nearest USD after computing the exact median.
- **Acceptance:** exact rounded integer or ±0.50 USD numeric tolerance before rounding.
- **Wrong-path codes:** `mean_used`, `zeros_excluded`, `upper_middle_only`, `currency_parse_error`.
- **Feedback:** “For an even-sized set, median is the midpoint of the two centre values; do not take only the upper middle row.”

### S3-DATA-05 · Category with largest total MRR

- **Columns:** `category`, `mrr_usd`.
- **Inclusion:** category non-null and non-blank after trimming; numeric MRR including zero.
- **Query:** group by the stored canonical category label; sum MRR; order total descending, then casefolded category ascending as deterministic tie-break.
- **Response:** `{categoryLabel, totalMrrUsd}`.
- **Label acceptance:** exact canonical label after outer-whitespace trim; do not silently merge distinct labels.
- **Value acceptance:** exact rounded USD or ±0.50 before rounding.
- **Wrong-path codes:** `median_not_sum`, `missing_category_group_wins`, `top_single_row`, `label_normalised_without_contract`.

### S3-DATA-06 · Median asking price for on-sale records

- **Columns:** `on_sale`, `asking_price_usd`.
- **Boolean normalisation:** native boolean or case-insensitive trimmed `true`/`false`; any other token fails key generation.
- **Inclusion:** `on_sale == true` and numeric asking price; legitimate zero retained.
- **Query:** median using the same even-set rule as S3-DATA-04.
- **Response:** USD, nearest whole.
- **Acceptance:** exact rounded USD or ±0.50 before rounding.
- **Wrong-path codes:** `all_records_used`, `missing_price_as_zero`, `false_string_truthy`, `mean_used`.

## Judgment item anchors

The grading model receives the learner response, the item rubric, answer-pack aggregates relevant to that item, and no raw TrustMRR rows. It must quote the learner's submitted evidence, never invent a citation.

### S3-DATA-07 · What is typical?

**Strong response**

- computes at least two valid checks (median plus mean, maximum, zero count or percentile);
- recognises strong skew/outlier sensitivity rather than declaring one statistic universally correct;
- recommends median or median + distribution for a “typical” description and explains the choice;
- distinguishes this teaching slice from a market-representative sample;
- labels observation vs inference.

**Weak response:** chooses median because “median is always better,” cites no computed evidence, or generalises to all startups.

**Model instruction:** cross-check every cited aggregate against the private pack with item-specific tolerance. Unsupported numeric claims lower evidence quality and trigger `numeric_claim_unverified`.

### S3-DATA-08 · Does traffic cause revenue?

**Strong response**

- states the complete-case denominator used for `visitors_30d` and `revenue_30d_usd`;
- reports a defensible association measure or scatter-plot reading;
- separates association from causation;
- flags missingness/selection, reverse causality, scale/outliers or omitted variables;
- proposes a next test rather than a causal verdict.

**Weak response:** infers that buying traffic causes revenue from correlation or uses the full record count as the complete-case denominator.

### S3-DATA-09 · Founder investigation priority

**Strong response**

- defines one audience/category segment precisely;
- cites at least two reproducible aggregates with denominators;
- links those observations to a concrete research question or next action;
- includes at least one missingness or slice-selection limitation;
- frames the result as a shortlist for investigation, not proof of market attractiveness.

Multiple recommendations can earn full credit. The evaluator judges evidence and reasoning, not agreement with one hidden product choice.

## S3-DATA-10 verification contract

Required fields:

- `verifiedItemId` in `{S3-DATA-03, S3-DATA-04, S3-DATA-05, S3-DATA-06}`;
- `methodA`, `workingA`, `resultA`, `unitA`;
- `methodB`, `workingB`, `resultB`, `unitB`;
- `absoluteGap`, `independenceRationale`, `gapExplanation`;
- `datasetVersionId`, `datasetSha256`.

Deterministic checks:

- both result fields parse in the expected response schema;
- units match the item;
- both results match the private key within the item tolerance;
- submitted gap equals `abs(A - B)` within numeric tolerance;
- dataset binding matches the attempt.

Model-assisted check:

- methods are mechanically independent enough to catch a shared error;
- working is reproducible, not a screenshot-only claim;
- a non-zero gap has a plausible diagnosis and repair.

Automatic flags: same text in both methods, two unexecuted AI prose responses, absent working, raw-row paste, checksum mismatch, prompt-injection language, or a claimed zero gap when parsed results differ.

## Scale item contracts

### S3-SCALE-01

Full credit requires a route tied to file size/access, output shape, repeatability and privacy. Tool prestige is irrelevant. A formula route can earn full credit for a bounded query; a Python route can earn full credit for a repeatable grouped query.

### S3-SCALE-02

Capture exact request plus formula/code as text. Static checks require all source columns to exist in the schema, an explicit null policy, output unit/rounding and no invented columns. The learner must name one pre-run correction they made.

### S3-SCALE-03

The learner chooses one equivalent evidence variant:

- `S3-SCALE-03F` — learner CSV grouped by non-missing `audience_type`; output record count and total `mrr_usd`, legitimate zeros included; sort total descending then label ascending; excluded count is missing audience. Verify via pivot.
- `S3-SCALE-03P` — `trustmrr_s3_peer_comparisons_v1.jsonl.gz`; group by `focal_record_id`; compute median non-null `comparison.mrr_ratio_to_peer` and median absolute `comparison.mrr_gap_usd`; require at least 20 valid ratios; output 10 lowest median ratios plus stable focal name/category/audience and valid-peer count; sort ratio ascending then ID ascending.

Required evidence is compact output, valid-row count, excluded-row count and one passed assertion. The output stays roster-gated. The frozen v1 manifest/fact pack includes an ID-bound adapter for both scale variants plus independent pandas and Python-standard-library checks. A version/hash mismatch must stop grading; never guess at runtime.

## Scoring and feedback

- `S3-DATA-01`–`06` produce the Functionality dimension (10 points): equal raw item weight, scaled to 10; the Q02/Q03 consistency check can cap Functionality at 8 until repaired.
- `S3-SCALE-01`–`03` plus clarity/reusability of working produce Craft (10).
- `S3-DATA-07`–`09` produce Relevance (10), weighted 3/3/4.
- `S3-DATA-10` produces Verification evidence (10).
- Final artifact total is 0–40 and enters the existing artifact-quality average; no new course component is created.

Objective correctness/expected values release only after the section assignment closes. During class, format errors and contract-level hints may appear, but not right/wrong state. Judgment feedback releases after the same close as **provisional feedback**; scores remain provisional until instructor finalisation. The student sees cited evidence and next action, never model prompt logs, confidence thresholds or hidden keys.

## Retake/correction policy

The first final submit creates Version 1. An instructor may open one correction window for Version 2 after feedback; both versions remain auditable and the instructor selects/finalises the counting version. A dataset/key error triggers a cohort-wide regrade, not a learner retake penalty.
