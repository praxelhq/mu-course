# S05 Student Build Brief — Useful Action Without Uncontrolled Autonomy v1.0

## Role and stakes

You are the operator/advisor converting your S04 method into a controlled execution system. A fast happy path is not enough: duplicate work, invalid evidence, silent timeout, or approval theatre can create financial, operational, trust, or dignity harm.

## Build one unit of work

Map and implement/replay: structured event → validation → method version → approval → mock/sandbox action → immutable log → retry/stop/escalate. Assign every consequential step D/M/H/X. Declare state, terminal outcomes, idempotency key, correlation ID, approver information, retryable vs non-retryable failure, and shutdown owner.

## Tests

Commit predictions. Run normal event; invalid/out-of-policy boundary; peer approval edit/reject; hidden duplicate/timeout/low-confidence/policy change; repair and replay. A successful recovery performs at most one consequential action.

## Definition of done

One event becomes one visible unit of work; malformed inputs stop; model output is checked; human can approve/edit/reject from evidence; sandbox action occurs only after approval; log reconstructs state; retry does not duplicate; unsafe action quarantines. Submit map/export, three run traces + replay, approval, diff, runbook, provenance, human boundary.

Public work is an independent educational project using labelled synthetic/public evidence. Do not connect production email, CRM, finance, HRIS, logistics, ad, payment, or employee systems.
