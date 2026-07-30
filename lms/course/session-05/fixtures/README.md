# Session 05 deterministic fixture suite

**Default suite ID:** S5-GTM-FIXTURES-v1  
**Default pack ID:** S5-WP-GTM-01  
**Target:** preferred GTM lead-routing workflow  
**Data:** synthetic; `.test` identities only  
**Controlling results:** evaluator-only `expected-results.json` supplied through the secure release channel; it is never committed or included in a Railway image.

Learner-fixture and sample-evidence checksums are recorded in `checksums.sha256`; the expected-result digest exists only inside the evaluator-only package. `evaluator-bundle.v1.json` normalizes the exact checks for all three packs into one private bundle. The loader canonicalizes that bundle, stores it under a content-addressed release key, and binds its SHA-256 and byte count into the final assessment answer key. Recompute the source checksums and issue a new evaluator/assessment version if any fixture, expected result, rule, or sample evidence changes; never edit a released object in place.

This directory’s root suite is the preferred GTM build. `workflowPack` is a required single-choice field and stores one of these stable IDs; labels are display-only. Students choosing another pack use the same five failure categories with the matching suite:

- `operations/` → S5-WP-OPS-02;
- `revenue/` → S5-WP-REV-03.

Each suite has its own checksum and expected-results file. Do not grade an operations or revenue submission against the GTM answer contract.

## Deterministic grading receipt

The grader reads the exact committed `runLogFile` object version and refuses a byte-count or SHA-256 mismatch. It then requires exactly five records in authored order: normal, duplicate, malformed, timeout, approval. Each case passes only when every normalized check in the selected pack passes. One passed case supplies 2 of 10 artifact-functionality points and 4 of 20 workflow-execution points.

The comparator persists check status and a hash of each actual value, never the raw log value. The receipt binds the exact submission ID, assessment version, owner, submission version/attempt/content hash, assessment/evaluator hashes, pack/suite/rule, evaluator bundle, expected results, and run-log evidence receipt. The one-to-one `AssessmentResult.structuredFeedback.workflowEvaluation` record is the implemented persistence equivalent of a separate `WorkflowEvaluation`: it is independently read by exact submission/version/attempt, is separate from `Grade`, and terminal database immutability prevents replacement after completion.

Provider judgment cannot change a fixture result. Server code maps cited `relevance` evidence onto usefulness (0–30), uses deterministic five-case execution (0–20), and maps cited `verification-evidence` onto individual ownership (0–10). The selected team version supplies usefulness/execution; each learner’s own exact final version supplies ownership.

## Run order

1. Clear the demo audit/queue stores.
2. Run `normal.json`.
3. Run `duplicate.json` without clearing the store. It intentionally shares the normal event’s idempotency key.
4. Run `malformed.json`.
5. Run `timeout.json` against the controlled instructor mock or the outage replay.
6. Run `approval.json`.

Do not change input files between prediction and run. If the workflow needs a different contract, write a small adapter and retain the original fixture + adapter version in evidence.

## Counting rules

- `safe_output_count`: draft or demo queue item created.
- `external_action_count`: sent/published/deleted/paid/production-state actions. This must remain zero for every classroom fixture.
- `audit_event_count`: evidence rows/events; duplicates may create a duplicate audit event without creating a second safe output.
- `attempt_count`: attempts at the transient dependency, not the whole scenario.

## Timeout determinism

`timeout.json` carries `test_mode: "timeout"`. The private instructor scenario routes it to a controlled slow mock. The public artifact must not contain that endpoint. The in-class expected state after the first timeout is `retrying` with an incomplete execution; the full replay ends `manual_recovery` after three failed attempts. Both states are defined in the result manifest.

If Make or the controlled mock is unavailable, the replay—not a random public endpoint—is authoritative.

## Reset rules

- Reset only between full suite runs.
- Never delete the normal key before running duplicate.
- Preserve run IDs and expected/actual output.
- A rerun of the full suite uses a new isolated fixture-store namespace, not edited event IDs.

## Privacy

These inputs contain no real PII. Do not replace them with live leads. Do not expose the private webhook URL in logs, screenshots, blueprint notes, or the gallery.
