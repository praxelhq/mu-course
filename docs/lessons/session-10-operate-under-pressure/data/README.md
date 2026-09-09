# S10 Synthetic Variant Registry

**ID:** S10-FX-VARIANTS-01 v1.0 · authored 18 July 2026. All entries in synthetic-transfer-variant-registry.csv are fictional authoring metadata; not learner answers and not real organization data.

Fields: variant_id, pathway_pack_id, equivalence_group, context_label, decision_metric, seeded_layer_class, substantive_change_class, guardrail_class, reading_band, calculation_band, section_embargo. This registry may be visible only to authorized assessment staff. Actual payloads/answer keys must be separate secured versioned fixtures before LMS load. Freeze checksum; rotate any exposed variant.

Authoring-complete secured inputs comprise A and B pools: synthetic-transfer-case-payloads.json, synthetic-transfer-case-payloads-b.json, synthetic-transfer-test-fixtures.json and synthetic-transfer-test-fixtures-b.json. A/B change the material defect, not only names. LMS implementation must split learner payloads from evaluator test keys, bind immutable checksums, assign A/B plus a frozen learner-specific numeric/label seed, prevent exact payload reuse across adjacent sections and enforce section embargo; the repository copies are source masters, not a permission model.
