# S05 Session Contract — Make the System Act v1.0

**State:** Authored; self-validation in `self-audit.md`. **Duration:** 120 live + 30–45 postwork. **Capabilities:** C5, C8; reinforces C4. **Canonical outcomes:** L05-O1–L05-O6 (aliases S5-O1–S5-O6). **Canonical validator:** V04; all local checks nest under it.

## Promise and mechanism

Turn the frozen S04 method into a controlled execution layer that receives one event, validates it, applies judgment, waits for the right human, takes one sandboxed action, and leaves a trace. Shared contract: `Event → Validate → Decide → Human gate → Sandboxed action → Log → Recover`, with each step labelled `D` deterministic, `M` model-assisted, `H` human, or `X` external system.

## Evidence and portfolio

Freeze execution map/export, version-linked S04 method, normal/boundary/failure/replay traces, approval record, idempotency evidence, operator runbook, provenance, and boundary defence. This becomes the control layer of the same prototype.

## Dependencies

Passing S04 method or curated method; structured trigger payload; mock connectors/state-machine emulator; no production credentials. Demo `S05-DEMO-OPS-01` differs from assessed `S05-*-PACK-01`.

## Ownership and proof

Prediction precedes the run; student allocates D/M/H/X, diagnoses injected duplicate/timeout/policy failure, makes the smallest layer repair, and proves no duplicate/prohibited action. Recruiter proof: replay event, point to approval/action log, inject failure, show recovery, name shutdown owner.
