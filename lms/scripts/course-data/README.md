# Session 3 TrustMRR data pack

These scripts reproduce the private Session 3 teaching pack from the frozen,
ignored TrustMRR source slice. The scripts and schema definitions are safe to
track; generated row-level data and answer facts belong only under
`lms/private/course-data/`, which `lms/.gitignore` excludes.

## Generate and verify

From the repository root:

```bash
cd lms/scripts/course-data
uv run --with-requirements requirements-trustmrr-session3.txt \
  python generate_trustmrr_session3_pack.py \
  --source ../../private/course-data/session-03/source/trustmrr_s3_learning_slice.csv \
  --output-dir ../../private/course-data/session-03/generated/v1 \
  --verify-determinism
```

The verification mode performs two complete generations and fails if any
artifact checksum differs. It pins `tiktoken==0.12.0` and counts the
uncompressed peer-comparison JSONL with the named `cl100k_base` tokenizer. It
also pins `pandas==3.0.0` and requires the pandas and standard-library key
implementations to produce identical canonical result hashes.

Generated v1 contains:

- the byte-identical learner CSV and machine-readable data dictionary;
- a 36-row learner-table coverage sample;
- the oversized peer-comparison JSONL.GZ;
- a 12-row `trustmrr_s3_peer_comparisons_sample_v1.jsonl` preserving the full
  nested shape across match, null, zero, visitor, sale and denominator cases;
- an evaluator-only fact pack; and
- `trustmrr_s3_evaluator_adapter_v1.json`, bound to the learner and peer
  checksums and stable IDs `S3-DATA-01` through `S3-DATA-10` plus
  `S3-SCALE-03F/P`.

The tracked evaluator-adapter builder contains query contracts only. Exact
keys and grader contexts are resolved into the ignored private output and must
never be returned by student-facing APIs.

## Run the reference analysis in Colab

Upload `analyze_trustmrr_session3.py` and the learner CSV to the same Colab
runtime, then run:

```bash
!python analyze_trustmrr_session3.py \
  --input trustmrr_s3_learner_v1.csv \
  --output trustmrr_s3_fact_pack_v1.json
```

The analysis script uses only Python's standard library. Its output is an
evaluator-only answer fact pack and must not be exposed to learners before the
assessment closes.

## Privacy and lineage

The manifest records snapshot lineage, exact SHA-256 checksums, row/column/cell
counts, both sample-coverage reports, the 59-path nested peer dictionary,
oversized token proof, evaluator item bindings, dual-implementation evidence,
and the project-specific usage notice. Missing values remain blank/null;
observed zeros are never filled or coerced. The peer artifact contains
deterministic similarity candidates for analysis practice, not causal,
valuation, or investment claims.
