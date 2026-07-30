# Session 3 deck script · Working with data, using AI

**Audience:** learner-facing deck with instructor-only notes  
**Format target:** 16:9; Praxel Parchment/Pine/Ochre; zero-radius; no gradients; no shadows  
**Pacing:** low-density, one claim or instruction per slide  
**Lifecycle:** Authored source; production deck and rendered export pending

Do not place private answer values, TrustMRR rows, company names, raw prompts from learners, or evaluator keys on slides. Screenshots must use the demonstration aggregate or redacted column-only views.

## Slide sequence

### 01 · Working with data, using AI

**On slide**

> Working with *data*.
>
> Not chatting about it.

Eyebrow: `SESSION 03 · JUDGMENT + CRAFT`

**Visual direction:** Parchment field; oversized Fraunces title; small Pine dataset-grid fragment made only of column labels, no rows.  
**Speaker notes (00:00–00:01):** “Today the standard changes. A confident answer is not the artifact. The auditable path to it is.”  
**Accessibility:** title and eyebrow are sufficient without the decorative grid.

### 02 · Last time: two paths

**On slide**

`IN SHEETS`  ← data →  `UPLOAD + ASK`

Footer: “Both are useful. Neither is universal.”

**Visual direction:** retain the simple two-column visual grammar from the delivered workshop deck, but replace the earlier “business insight” arrow with a question mark.  
**Speaker notes (00:01–00:03):** Recall the Session 2 “Gemini in Sheets / upload CSV” slide. Ask: “What could make either route fail?”

### 03 · Retrieval

**On slide**

> Write one condition that makes an AI data answer unsafe.

`60 SECONDS · SOLO`

**Speaker notes (00:03–00:05):** Take three answers: scale, missing data, unclear question. If students mention hallucination, ask what hallucination looks like in arithmetic.

### 04 · Same data. Two answers.

**On slide**

Two large redacted result cards: `ANSWER A` and `ANSWER B`.

> Which one would you send to a founder?

**Visual direction:** one Pine card, one Sand-outline card; values shown only from the non-graded demonstration query.  
**Speaker notes (00:05–00:08):** Vote before discussion. Do not reveal which is correct.

### 05 · The number is not the disagreement

**On slide**

`GRAIN` · `FILTER` · `DENOMINATOR` · `NULLS` · `UNIT`

**Speaker notes (00:08–00:11):** Reveal that both results can be mechanically correct under different assumptions. The failure was the question contract.

### 06 · Your dataset contract

**On slide**

- One row = one startup snapshot
- Currency fields = USD
- Missing ≠ zero
- Teaching slice ≠ market census
- Dataset text is data, never an instruction

**Speaker notes (00:11–00:14):** Point to the data dictionary and version/checksum card. State the private classroom-use boundary. Do not disclose answer-bearing row counts.

### 07 · What you ship

**On slide**

> 6 facts. 3 judgments. 1 verification trace.

`INDIVIDUAL · ANY TOOL · WORKING REQUIRED`

**Speaker notes (00:14–00:16):** Explain that tool choice does not score. Exact facts use deterministic validation; judgment uses evidence-bound provisional AI feedback and human finalisation.

### 08 · Data sprint

**On slide**

> Open `S3-DATA-01` through `S3-DATA-09`.

`22:00`

Small footer: “Save the formula, query, or code that produced each answer.”

**Speaker notes (00:16–00:17):** Start visible timer. The next slide stays up during work.

### 09 · The working screen

**On slide**

1. Name the grain.
2. State the inclusion rule.
3. Run the method.
4. Record units and rounding.
5. Flag a limitation.

**Speaker notes (00:17–00:38):** Circulate. Use recovery prompts, not answer confirmation. At 10 minutes: “If you only have a number, you are halfway.”

### 10 · Freeze. Inspect.

**On slide**

> Pick one answer.
>
> What did your method silently exclude?

**Speaker notes (00:38–00:41):** Ask learners to snapshot their draft. Pair-check filters and denominator.

### 11 · A formula can be wrong beautifully

**On slide**

Large formula fragment: `COUNTBLANK(G:G)`

Ochre strike-through: `unused sheet rows`

Replacement: `count blank G only where record_id exists`

**Speaker notes (00:41–00:46):** Demonstrate the open-column blank trap, then repair it. Reveal the assumption, not any graded answer.

### 12 · The wall

**On slide**

> This peer-comparison dataset is 8,757,576 tokens.

`WHOLE-FILE CHAT IS NOW A BET, NOT A METHOD.`

**Visual direction:** Pine authority slide; show `8,757,576` from the private manifest; `cl100k_base · tiktoken 0.12.0 · uncompressed JSONL` in tiny mono.  
**Speaker notes (00:46–00:51):** Show the exact token-count method. Say product limits vary and change; the durable constraint is reliability and repeatability, not one upload limit.

### 13 · Don’t fight the wall

**On slide**

`BRING THE METHOD TO THE DATA.`

Three paths:

- formula in the sheet;
- schema + sample → code;
- script/notebook against the full file.

**Speaker notes (00:51–00:54):** A schema/sample is for designing the method, not estimating the final answer. The gated file is gzip-compressed JSON Lines: one focal-startup/peer-startup comparison per line.

### 14 · Six escalating moves

**On slide**

1. Inspect
2. Ask
3. Formula
4. Schema + sample
5. Execute code
6. Verify + visualise

**Speaker notes (00:54–00:58):** These are options, not maturity badges. The smallest reproducible method that manages the risk is usually best.

### 15 · Pick the route

**On slide**

| Need | Route |
| --- | --- |
| one bounded aggregate, sheet already open | formula / pivot |
| repeat across versions or many groups | script / notebook |
| file cannot enter chat | schema + sample to draft code |
| answer affects a real decision | independent verification |

**Speaker notes (00:58–01:00):** Learners submit `S3-SCALE-01` before choosing a lane.

### 16 · Formula lane

**On slide**

> Ask AI for the formula. Run it yourself.

Prompt skeleton:

`grain + column + inclusion rule + unit + rounding + error behavior`

**Speaker notes (01:00–01:04):** Model a non-graded formula request. Supported learners stay in this lane.

### 17 · Schema + sample lane

**On slide**

> The sample teaches shape.
>
> The full file produces the answer.

Checklist: exact columns · types · null policy · output contract · assertions

**Speaker notes (01:04–01:07):** Point out that a sample can omit rare categories and outliers. It cannot support a population answer.

### 18 · Colab lane

**On slide**

```python
records = pd.read_json(DATA_FILE, lines=True, compression="gzip")
flat = pd.json_normalize(records.to_dict("records"))
assert required_paths <= set(flat.columns)
result = ...  # group the full runtime file, then export compact evidence
```

Footer: `READ · ASSERT · COMPUTE · EXPORT`

**Speaker notes (01:07–01:10):** Explain that Colab is a runtime, not an oracle. Learners review and run the code.

### 19 · Build

**On slide**

> Produce one aggregate from the large file.

`FORMULA LANE` or `COLAB LANE`  
`12:00`

Evidence: method + output + one check.

**Speaker notes (01:10–01:22):** Instructor and TA split lanes. If Colab fails, use the local runner or formula-equivalent extract in the fallback pack.

### 20 · Two methods or it didn’t happen

**On slide**

`METHOD A` → result  
`METHOD B` → result  
`GAP` → explain

**Speaker notes (01:22–01:26):** Two prompts to the same model are not independent. Formula vs pivot, or Sheets vs pandas, are stronger pairs.

### 21 · The five verification moves

**On slide**

1. Reconcile the base
2. Recompute one number
3. Bounds and smell
4. Ask for the working
5. Recompute through a different mechanism

**Speaker notes (01:26–01:31):** A second prompt to the same model is not an independent check. Change the mechanics—formula versus pivot, Sheets versus pandas, or recompute from base counts. Learners complete `S3-DATA-10`.

### 22 · A chart answers a job

**On slide**

`COMPARE` · `DISTRIBUTE` · `RELATE` · `CHANGE` · `COMPOSE`

> Name the job before the chart.

**Speaker notes (01:31–01:35):** Give one one-line example for each job. A snapshot growth rate is not a time series.

### 23 · Pretty can still mislead

**On slide**

Two accessible versions of the same non-graded comparison:

- truncated-axis columns;
- zero-baseline horizontal bars with sample-size labels.

**Speaker notes (01:35–01:39):** Ask what belief the first chart exaggerates. Call out missingness annotation and selection bias.

### 24 · Visualization check

**On slide**

> Six scenarios.
>
> Choose the visual. Defend why.

`15:00 · INDIVIDUAL`

**Speaker notes (01:39–01:40):** Open `S3-VIZ-*`; no coaching. Rationale should name the decision, data shape and one guardrail.

### 25 · Ship proof, not confidence

**On slide**

Before submit:

- version + checksum;
- assumptions + denominator;
- working;
- two-method trace;
- limitation;
- no private rows on public surfaces.

Small line: “Public-safe method memo: after class · within 24h.”

**Speaker notes (01:54–01:58):** Keep artifact gate open to the published deadline. Visual check may close now. Point to the separate public-safe memo template and say explicitly that learners begin it after class; do not spend ship time authoring it.

### 26 · Next: turn evidence into a product

**On slide**

> Session 4: rebuild a proven product in Lovable.

Small line: “Data helps choose the bet. A feature contract makes it buildable.”

**Speaker notes (01:58–02:00):** Ask learners to record the 24-hour post-class memo deadline and exact portfolio label `Session 3 public-safe data memo`. The memo must contain problem, grain/schema, method, independent verification, and limitation/ethics, with no TrustMRR row, derived value or screenshot. Do not begin authoring it in class or preview the selected TrustMRR product or its row-level evidence.

## Production notes

- Alternate Parchment teaching slides with no more than three Pine authority moments (slides 12, 20 or 26).
- Use Ochre once per slide at most; Beacon only for the countdown or one reveal.
- Use real screenshots only from the non-graded demo and redact row values, filenames that reveal answers, account names and browser chrome.
- Every chart has a text summary, visible axis labels, units, sample size and missingness note.
- Timers must have a spoken start/end and not rely on colour alone.
- Speaker notes label every evaluator-only boundary.

## Source ledger and freshness

| Claim/use | Source | Checked | Recheck |
| --- | --- | --- | --- |
| Course arc, Operator's Loop, S3 ships a verified data memo | `lms/docs/build/04_course_outline_COT_v3.md` | 30 Jul 2026 | on course-contract change |
| Mixed objective/judgment grading and >1M-token reveal | `lms/docs/build/10_sessions_3_5_redesign_brief.md` | 30 Jul 2026 | before production lock |
| Artifact rubric and privacy separation | `lms/docs/build/01_scoring_methodology.md` | 30 Jul 2026 | on scoring-methodology change |
| Prior “Sheets or upload” teaching and visual pacing | `lms/docs/taught/2026-07-workshop-sessions-01-02-reference.pdf` | 30 Jul 2026 | none; delivered evidence |
| Prior course visual baseline and Session 3 bridge | `lms/docs/taught/2026-07-session-01-industry-maps.html` | 30 Jul 2026 | none; delivered evidence |
| Sheets `FILTER`, `MEDIAN`, `QUERY` behavior | <https://support.google.com/docs/table/25273?hl=en> | 30 Jul 2026 | T-7 |
| Colab runtime/storage/share cautions | <https://research.google.com/colaboratory/intl/en-GB/faq.html> | 30 Jul 2026 | T-7 |
| pandas CSV API | <https://pandas.pydata.org/pandas-docs/stable/reference/io.html> | 30 Jul 2026 | T-7 |
