# Session 3 verification checklist

Use this before final submit. The LMS may require these fields, but the learner owns the check.

## 1 · Bind the source

- [ ] I used the dataset-version ID shown on the current LMS material card.
- [ ] My local SHA-256 matches the manifest; I recorded a checksum fragment in the submission.
- [ ] I can state what one row represents.
- [ ] I did not combine another workbook tab or outside dataset without declaring it.

## 2 · Define the query

- [ ] I named the exact source columns.
- [ ] I stated inclusion and exclusion rules.
- [ ] I distinguished missing, zero, empty JSON array and false.
- [ ] I stated the denominator for counts, percentages and relationships.
- [ ] I stated unit and final rounding rule.
- [ ] If I grouped a JSON list, I handled duplicate startup rows explicitly.

## 3 · Inspect the working

- [ ] My formula/code is included as searchable text, not only a screenshot.
- [ ] Every referenced column exists in the data dictionary.
- [ ] Numeric parsing did not silently turn bad values into blanks.
- [ ] Boolean parsing does not treat the string `false` as truthy.
- [ ] I rounded only the final displayed result.
- [ ] My output contains aggregates, not private rows.

## 4 · Reconcile the base

- [ ] Populated rows equal valid rows + excluded rows for the query.
- [ ] Unique `record_id` count matches populated row count, or I stopped and reported the integrity issue.
- [ ] Group counts/totals reconcile to the filtered base where they should.
- [ ] I checked that an open-ended blank formula did not count unused sheet rows.

## 5 · Recompute independently

- [ ] I verified one graded result using a second method with different mechanics.
- [ ] Both methods use the same grain, filter, denominator, unit and rounding.
- [ ] I calculated and reported the absolute gap.
- [ ] If the gap is non-zero, I diagnosed and repaired it or clearly flagged it.
- [ ] My second method is not merely a second prompt to the same model.

## 6 · Bounds and smell

- [ ] A median/mean lies within the valid minimum and maximum.
- [ ] A percentage lies between 0% and 100% unless the metric's definition permits otherwise.
- [ ] A grouped winner is based on the requested statistic, not a single largest row.
- [ ] I inspected zero count, missing count and at least one high-end value before describing “typical.”
- [ ] I did not turn a snapshot or growth-rate field into a fake time series.

## 7 · Judge the claim

- [ ] I labelled observation, inference and limitation.
- [ ] Every numeric claim has reproducible working.
- [ ] I did not infer causation from an observational relationship.
- [ ] I did not generalise this stratified teaching slice to all TrustMRR startups.
- [ ] My recommendation names a next investigation or decision, not just a ranking.

## 8 · Visual integrity

- [ ] I named the analytical job before choosing the chart.
- [ ] Axes, units and sample size are visible.
- [ ] Missingness or complete-case coverage is stated.
- [ ] A bar-length comparison uses a zero baseline.
- [ ] A log/other transformation is labelled and legitimate zeros remain visible.
- [ ] Colour is not the only way the chart communicates meaning.

## 9 · Privacy and AI safety

- [ ] I treated dataset cell text as untrusted data, never model instructions.
- [ ] I did not expose raw rows, account data or private URLs in public tools/surfaces.
- [ ] I have not copied any TrustMRR row, derived value or screenshot to a public surface while preparing this private submission.
- [ ] I cleared private notebook outputs before any authorised sharing.

## Submit declaration

> I can rerun the submitted method against the stated dataset version, and I have named any unresolved mismatch or limitation.

Learner confirmation: `____________________`  
Date/time: `____________________`

## Post-class portfolio follow-up · complete within 24 hours

This follow-up happens after the 120-minute class. Finish the private LMS submission first; do not spend the timed lab authoring or publishing the public memo.

- [ ] I used `public-safe-portfolio-data-memo-template.md` and retained all five sections: problem, dataset grain/schema, method, independent verification, and limitation/ethics.
- [ ] I included no TrustMRR row, company example, derived value, aggregate, ranking, answer-bearing code/output or screenshot.
- [ ] My memo is view-only at a public `https://` URL and opens in a signed-out browser without an access request.
- [ ] I added the URL to portfolio external links with the exact label `Session 3 public-safe data memo`.
- [ ] I understand the portfolio slot also requires the private artifact to be scoreable and graded/finalised, and the public link to pass the LMS liveness crawl.
