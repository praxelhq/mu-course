# S01 Simulator Spec — The Leverage Room

**Mission ID:** `S01-SIM-v1.0` · **Capability:** C1/C8 · **Duration:** 82 minutes embedded

## State machine

`ASSIGNED → PREDICTED → FRAME_DRAFT → V0_FROZEN → CONSTRAINT_REVEALED → DIAGNOSED → REPAIRED → PEER_ATTACKED → V1_FROZEN → TRANSFER_SUBMITTED → COMPLETE`

Illegal: reveal before freeze; edit prediction; submit v1 without diagnosis/diff; author score own peer attack; publish a safety-flagged brief. Every transition is idempotent on learner+mission+version.

## Learner actions, reveal and consequences

Initially show role card, evidence inventory and six gates. Learner chooses decision, metric, evidence, mechanism and authority. V00 gives mechanical completeness/coherence flags; model-assisted coaching may cite fields and ask one rubric-bound question, never score strategy. On v0 freeze, reveal exactly one seeded constraint: access, authority, testability or metric corruption. The learner predicts failing layer before seeing repair options. A valid substantive diff unlocks peer attack; a cosmetic diff keeps state `DIAGNOSED`.

Hidden transfer uses a different industry, facts and action but equivalent construct. It has no model, own-brief retrieval or leaderboard. Human scorer owns the 70/30 judgment; peer only records evidence-specific attack.

## Scoring and feedback

- deterministic: required fields, evidence type, observable-test syntax, named authority, prohibited data/actions, version/diff;
- coaching: coherence, leverage and scope questions citing submitted fields;
- human: consequentiality, stream authenticity and repair judgment.

Success, partial, safe-stop and unsafe states are explicit. Reward `+proof` only for correct diagnosis/repair or honest escalation—never clicks or length.

## Controls, telemetry and replay

Facilitator can pause timer, extend accommodation, reassign same-equivalence pack, quarantine, reveal offline code, override validator with reason, and reset only before v0 freeze. Log canonical events in `lms-copy-events.md`, seed, pack/version, actor, timestamp and evidence hashes. Replays preserve old versions; replacement relations are explicit.

## Test cases

1. pass: narrow shipment triage with planner approval; 2. partial: coherent decision but vanity metric; 3. safe: no legal evidence, learner holds; 4. unsafe: autonomous discipline/capital action; 5. malformed: blank owner; 6. duplicate submit; 7. early reveal attempt; 8. accessible/offline import; 9. service outage; 10. transfer copy-detection.

## Non-AI classroom version

Printed pack card, canvas, red constraint envelope, validator checklist, peer card and blue transfer envelope preserve every assessed decision. Facilitator stamps freeze time and imports structured evidence later. Model output is never required.
