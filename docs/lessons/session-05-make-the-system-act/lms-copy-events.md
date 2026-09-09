# S05 LMS Copy and Events v1.0

## Copy

- Launch: “Your method can decide. Can your system act exactly once?”
- Gate: “Predict the terminal state and prohibited action before Run.”
- Approval: “You own the consequence. Review evidence; approve, edit, or reject.”
- Duplicate: “Green is not proof. Count consequential actions.”
- Recovery success: “Controlled: one event, one authorized action, one inspectable trace.”
- Incident: “The platform failed; your learning evidence is preserved.”

## Evidence schema and transitions

`execution_id, learner_id, section_id, pack_id, event_fixture_id, event_hash, method_version, workflow_version, correlation_id, idempotency_key, state, dmhx_allocation, approval_ref, action_ref, action_count, error_class, retry_of, log_ref, occurred_at`.

Transitions mirror `simulator-spec.md`. Event ingestion idempotent on source+idempotency key; state writes append-only; action uses idempotency token; retries link prior run and never replace. `unavailable` routes incident-equivalent evidence.

## Alerts and quiz

Alert action-before-approval, action_count>1, non-retryable retry, missing/changed authority, secret/PII, log gap, prolonged wait, incident cluster. Entry family `S05-dmhx-class`; delayed `S05-allocation`, `S05-approval-boundary`, `S05-recovery`. Quiz is formative and cannot freeze V04 evidence.
