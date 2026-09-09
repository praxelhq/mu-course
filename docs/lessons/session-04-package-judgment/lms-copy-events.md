# S04 LMS Copy and Event Contract v1.0

## Mission copy

- **Launch:** “Your judgment works in your chat. Can it survive a stranger?”
- **Prediction gate:** “Commit before the runner opens. We grade the repair, not confidence.”
- **Peer rule:** “Hands off. If the runner needs you, log the ambiguity.”
- **Hidden reveal:** “The work changed. Diagnose the layer before editing.”
- **Unsafe stop:** “No action was taken. Your input is quarantined; switch to the supplied synthetic case.”
- **Success:** “Portable: the method passed a clean run, a boundary, and a changed condition.”
- **Error:** “This is a platform incident, not learner failure. Your evidence is saved.”

## Evidence envelope

`learner_id, section_id, pack_id, fixture_id, attempt_id, method_version, prediction_hash, input_hash, output_ref, status, failed_check_ids, failure_layer, revision_ref, provenance_ref, occurred_at`.

## Canonical transitions/events

Use simulator states and telemetry names exactly as in `simulator-spec.md`. `prediction_committed` is immutable/idempotent on `(learner, attempt)`. Test runs deduplicate on `(attempt, fixture, method_version, run_nonce)`. Hidden reveal requires completed peer run and stores section-salted variant. Retry links `replaces_run_id`; it does not overwrite. `unavailable` opens incident route and equivalent evidence.

## Alerts

Facilitator: unsafe/prohibited action; possible PII; three repeated fabricated-field failures; clean-run blocked >8 min; hidden repair blocked >6 min; peer/accessibility exception; platform incident cluster. No speed leaderboard.

## Quiz integration

Entry item `S04-E-A/B` runs at minute 0. Delayed families `S04-trigger-boundary`, `S04-io-contract`, `S04-generic-skill` unlock 24–72 hours after freeze. Form B appears only after feedback/repair card. Quiz cannot set `method_layer_frozen` or compensate for failed V03 checks.
