# S07 Simulator Spec — Release Room

**Mission ID:** S07-SIM-01 · **Target:** C6/C8 · **Duration:** 96 learner-action minutes · **Validator:** V06/V06P

## State and reveal model

READY → V1_FROZEN → PREDICTION_COMMITTED → LIVE_ATTEMPT → BOUNDARY_REVEALED → EVIDENCE_RELEASED → ISSUES_CLASSIFIED → RELEASE_DECIDED → V2_FROZEN → RERUN_RECORDED → PACK_SUBMITTED. Side states: FALLBACK_ACTIVE, DISPUTED, QUARANTINED, INCIDENT_RELIEF. Illegal: evidence release before prediction; delete adverse attempt; rerun against unrelated/easier input; overwrite version.

## Learner actions and consequences

Learner accepts/declines consent, performs uncoached task, records task/safety state, predicts release, links evidence to issues, chooses change/non-change, patches and reruns. Boundary reveal contradicts a plausible preference signal. Unsafe action quarantines; correct stop/escalation can pass. Reset creates a new attempt/version and preserves history.

## Feedback

- Mechanical: IDs, 3–5 count, condition mix, privacy, versions, evidence links and equivalent rerun.
- Model-assisted: cites the learner’s evidence and suggests a likely missing layer with confidence; never qualifies disputes or scores judgment.
- Human/peer: tester supplies bounded observation; trained human scores consequence and 30% pathway anchor. Repair occurs before final freeze.

## Hidden/transfer fixtures

Assessed input differs from D-A/D-B/D-C. Each pathway has expected, edge, boundary and equivalent-rerun variants; section seed/embargo recorded. Hidden failure changes a decision or authority path, not UI trivia.

## Facilitator controls and telemetry

Pause reveal, replace match, activate fallback, quarantine, grant incident relief; never alter student prediction. Events: assignment_proposed/accepted/declined; task_attempt_started; peer_test_completed; prediction_committed; evidence_reveal_opened; issue_classified; release_decision_saved; checkpoint_saved; rerun_completed; author_pack_submitted; V06 result. Every event has actor, section, version, privacy class and idempotency key.

## Non-AI classroom version

Sealed paper attempt cards, role cards, event tables, acetate/pen diff and equivalent rerun card preserve prediction, surprise, diagnosis, repair and proof. Facilitator uses the deterministic answer key only for mechanical checks; human scoring remains anchored.

