# S05 Simulator — Controlled Execution Room v1.0

## Contract

**Capability:** allocate and recover one event-driven unit of work. **Pack:** S05-*-PACK-01. **Validator:** V04. **Duration:** 91 minutes. Initial info: event schema, method version, normal/boundary inputs, action catalogue. Hidden after valid human-gate run: duplicate/timeout/low-confidence/policy change.

## State machine

`briefed → predicted → mapped → connected → received → validated → method_applied → awaiting_approval → approved|edited|rejected → action_attempted → completed|safe_stopped|escalated|retry_wait → replayed → frozen → defended`

Action before approval, retry of non-retryable event, duplicate action, or overwrite of log is illegal. Reset links attempts; incident reset cannot erase evidence.

## Rules and feedback

Deterministic: schema, idempotency, allowed transition, method-version binding, approval before action, max-one action, correlation/log fields, secret scan, replay relation. Model: bounded interpretation and evidence-citing coaching; no arithmetic/ID generation or final score. Human: approve/edit/reject; trained scorer judges system/stream quality.

Consequences change system state: invalid → zero action; duplicate → existing receipt; low confidence → escalation; changed authority → new approval; unsafe → quarantine. Celebration only after replay proves controlled recovery.

## Controls and telemetry

Facilitator can pause, substitute mock action, approve via persona card, issue equivalent variant, flag incident, quarantine, or override false negative with reason. Events: `s05_prediction_committed`, `execution_map_saved`, `workflow_connected`, `run_started`, `state_entered`, `approval_requested/decided`, `mock_action_attempted/completed`, `failure_injected`, `failure_classified`, `repair_saved`, `replay_completed`, `layer_frozen`, `boundary_defended`, `platform_incident`. Bind pack/event/method/workflow/version/correlation/idempotency IDs.

## Offline version

Students pass printed event envelopes through D, M, H, X role stations. Station rules and cached candidate output implement the system; approval card records choice; action token can be issued once per dedupe key; clerk writes immutable run log. Hidden card changes failure/authority. Same decision and evidence.

## Tests

Normal, invalid, duplicate, timeout, policy change, low confidence, unsafe, unavailable, screen-reader, extra time, approval absent, connector down, secret/PII, wrong method version, two-section fixture leak.
