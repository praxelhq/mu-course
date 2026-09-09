# S01 LMS Copy, Evidence and Events

**Asset ID:** `S01-LMS-v1.0`

## Learner copy

- Arrival: **“Two projects look impressive. Only one deserves a decision. Choose before the reveal.”**
- Freeze: **“Lock v0. The next evidence will challenge an assumption; your original remains visible.”**
- Reveal: **“Constraint received: {class}. Predict the failing layer before editing.”**
- Weak repair: **“The wording changed, but the decision system did not. Change evidence, authority, testability or value—or justify a safe hold.”**
- Success: **“You earned this state by repairing a consequential assumption. Save the before/after proof.”**
- Safety stop: **“This proposal crosses an authority or data boundary. It is quarantined, not failed; use the repair route.”**
- Error/offline: **“Your evidence is saved locally as {receipt}. Continue with the numbered packet; sync will not change your score.”**

## Evidence schema

`attempt_id, learner_id, section_id, pack_id/version, state, prediction{choice,rationale,confidence}, brief_version/hash, fields{role,mode,owner,decision,metric,guardrail,evidence,mechanism,tests,boundary}, constraint{class,seed}, diagnosis, diff_fields, peer_record, transfer_variant/response, provenance_refs, validator_version/result, facilitator_override, timestamps`.

## Canonical events

`s01_mission_assigned`, `s01_prediction_committed`, `s01_demo_viewed`, `s01_canvas_checkpointed`, `s01_brief_prefailure_frozen`, `s01_failure_revealed`, `s01_failure_diagnosed`, `s01_brief_revised`, `s01_peer_attack_completed`, `s01_brief_v1_submitted`, `s01_transfer_submitted`, `s01_exit_calibration`, `s01_offline_receipt_imported`, `s01_attempt_quarantined`.

All writes use `event_id` idempotency keys; retries append delivery attempts, not learning events. Freeze/reveal is server-authoritative or facilitator-stamped offline. Alert on >15% stuck at one gate for 5 minutes, safety/PII terms, reveal mismatch, accessibility route failure, duplicate hashes, and section-level variant leakage. Full prompts are not telemetry by default.

