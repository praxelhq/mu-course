# S02 Synthetic Decision Records — Data Dictionary

**Asset ID:** `S02-DICT-v1.0` · Every row is course-synthetic and proves no selected-company fact.

| Field | Meaning |
| --- | --- |
| `synthetic_notice` | mandatory truth label |
| `record_id` | stable fictional row ID |
| `pathway` | practice context, not source company |
| `period` | comparison label; periods may not be equivalent |
| `numerator/denominator` | raw counts used for rate; inspect before comparison |
| `unit` | denominator unit |
| `definition_version` | metric contract version |
| `source_id/source_locator` | stable synthetic snapshot lineage |

Missing values must remain missing, never inferred silently. Derived rate = numerator ÷ denominator; describe percentage-point and relative changes separately. Preserve raw rows and record every normalization.

