# S07 LMS Copy and Events

## Learner copy

- Start: “Ratings are opinions. Your release unlocks when you can show what happened.”
- Prediction lock: “Commit the change you expect before opening attempts. You may revise your judgment, not history.”
- Reveal: “One plausible answer is about to break. Keep every qualified adverse attempt.”
- Error V06-E03: “Your rerun is not linked to the failed/equivalent condition. Choose the source issue and retry.”
- Safe success: “You contained the risk and proved the boundary. Safe escalation is a valid result.”
- Completion: “Release v2 earned: evidence changed or legitimately confirmed a consequential decision.”

## IDs, evidence and transitions

Canonical entities: exchange_id, assignment_id, attempt_id, role_card_version, input_variant_version, acceptance_hash, v1_hash, prediction_id, issue_id, release_id, v2_hash, rerun_id. Required transitions and event names are in simulator-spec.md and the normative task-attempt exchange contract. Each write uses idempotency_key; retries create versioned children, never overwrite.

## Facilitator alerts

ALERT-S07-PRIVACY immediately quarantines; ALERT-S07-NOMATCH at 90 sec routes central desk; ALERT-S07-EARLY-REVEAL blocks author state; ALERT-S07-MISSING-CONDITION at minute 52 issues incident-equivalent pack; ALERT-S07-UNSAFE-CHANGE routes human review. No alert reveals accommodation status.

Evidence schema binds pathway_pack_id, fixture_id, quiz_family, validator_version and portfolio_receipt. Raw prompts, keystrokes and popularity are not collected.

