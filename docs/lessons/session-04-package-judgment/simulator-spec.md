# S04 Simulator Specification — Method Test Bench v1.0

**Capability:** package and test bounded judgment. **Duration:** 98 minutes inside class. **Modes:** operator or advisor/investor. **Content:** `S04-*-PACK-01`. **Validator:** V03.

## State model

`briefed → predicted → contract_drafted → known_tests → clean_run → peer_defect → hidden_revealed → diagnosed → repaired → rerun → frozen → defended`

Illegal: edit prediction after first run; reveal hidden before clean run; freeze without affected rerun; author operate peer run. Reset creates a new attempt linked to prior evidence; it never erases a qualified adverse run.

## Reveals and actions

- Initially visible: role, stakes, normal/messy/non-trigger fixtures, templates.
- After prediction: runner opens.
- After three known tests: peer assignment opens.
- After peer evidence: one section-bound hidden fixture reveals.
- Learner actions: define fields/rules/boundaries, run, inspect, classify, revise, rerun, defend.

## Feedback

- **Deterministic:** required fields; trigger match; normal schema; missing-required-field stop; non-trigger decline; prohibited action absent; unique attempt/version; affected rerun.
- **Model-assisted:** cites exact contract/run evidence and suggests likely failure layer with confidence; cannot award score.
- **Human/peer:** peer records literal ambiguity/behavior; trained human later judges role authenticity and the 30% anchor.

Celebration copy appears only after a failed consequential behavior becomes a passing rerun: “You did not make the answer prettier; you restored control.”

## Hidden failure bank

Each pack provides one changed schema/policy/evidence/authority fixture. Assignment is section-salted; equivalent variants rotate. Success changes artifact state from `repair_required` to `verified_known_change`. Unsafe action quarantines publication and alerts facilitator.

## Scoring for feedback, not final grade

Mechanical readiness: 6 checks (contract, normal, messy, non-trigger, clean run, repair). Common coaching 70%; pathway judgment 30% per `solution-anchors.md`. The model cannot convert checks into a high-stakes grade.

## Facilitator controls

Pause reveal; substitute accessible/offline runner; issue equivalent variant; reset platform incident; quarantine unsafe data; approve a false-negative override with reason; view heat map without leaderboard.

## Telemetry

`s04_brief_opened`, `s04_prediction_committed`, `s04_contract_saved`, `s04_test_run`, `s04_clean_run_started/completed`, `s04_peer_defect_submitted`, `s04_hidden_revealed`, `s04_failure_classified`, `s04_revision_saved`, `s04_affected_test_rerun`, `s04_layer_frozen`, `s04_boundary_defended`, `platform_incident`. Every event binds learner, section, pack/fixture/method/attempt versions and timestamp.

## Non-AI/offline version

A peer executes numbered method cards literally against printed inputs; deterministic answer cards validate required properties; a sealed envelope supplies the hidden change; before/after sheets and facilitator stamp provide equivalent evidence. No model output is required to assess the decision.

## Acceptance tests

Pass, partial, fail, unsafe, unavailable; novice/advanced equivalent; screen-reader; duplicate attempt; early reveal; platform incident; wrong pack version; hidden fixture leak; clean runner requests author coaching.
