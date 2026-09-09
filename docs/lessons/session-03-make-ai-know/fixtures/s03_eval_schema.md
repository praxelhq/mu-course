# S03 Evaluation Fixture Schema

**Asset ID:** `S03-EVAL-SCHEMA-v1.0` · Applies to `s03_synthetic_eval_set.json`.

Each `case` has stable `id`; `category` in `answerable|absent|conflict_time|injection|unsafe_authority|missing_input|regression`; learner-facing `input`; `expected_retrieval` as document-section IDs (empty means support must not be fabricated); `expected_answer` as observable properties, never exact prose; and boolean `critical`. A critical miss blocks publication and requires human-visible repair/regression. Metadata must label the fixture synthetic and record corpus version. Real personal/customer data are prohibited.

