# S06 Simulator — Prototype Release Lab v1.0

## Contract and states

**Capability:** form selection + thin integration + observed task. **Pack:** S06-*-PACK-01. **Validator:** V05. `briefed → form_predicted → tests_committed → shell_selected → integrated → instrumented → self_tested → safe_failure_tested → frozen_for_attempt → assigned → attempted → observed → issue_decided → revised|no_change → rerun → released|held → defended`.

Illegal: build before tests; author modify during frozen attempt; self-test count as assigned attempt; screenshot as run evidence; public release after safety/privacy failure. Reset/replacement links prior assignment and immutable version.

## Reveal and consequence

Initially: job, form matrix, visible normal N01 and boundary B01 inputs, shells. The section-salted H01 changed/unsafe input is visible only to the assigned tester after the artifact and tests freeze; the author sees it only through the completed observation. Result changes release state: completion + safe boundary + held-out evidence allows bounded release; no log/unsafe action/broken route holds; platform incident triggers an equivalent held-out replay, not learner fail.

## Feedback

Deterministic: form/test fields, S04/S05 versions, URL/replay liveness, input/output, log envelope, failure state, zero prohibited action, independent tester, issue/rerun, disclosure/access essentials. Model coaching cites evidence; no final score. Tester reports observable path/friction; no preference score. Human scores 70/30.

## Controls, events, fallback

Facilitator assigns/replaces tester, freezes/unfreezes for incident, substitutes curated core or replay, quarantines, issues equivalent variant, logs override. Events: `s06_form_predicted`, `acceptance_committed`, `shell_selected`, `integration_saved`, `event_instrumented`, `normal_test_completed`, `safe_failure_completed`, `test_version_frozen`, `task_assigned`, `attempt_started/completed`, `observation_submitted`, `issue_decided`, `revision_saved`, `affected_test_rerun`, `prototype_released/held`, `defence_submitted`, `platform_incident`.

Offline: paper/clickable surface receives role-card input; facilitator/student operates frozen S04/S05 cards behind it; action receipt/log records states. Independent tester performs same decision without author explanation. Static invalid case proves safe stop.

## Test bank

Normal, invalid, unsafe, changed requirement, inaccessible route, author coaching, broken endpoint, missing log, secret/PII, unsupported form, model/connector outage, absent tester, consent decline, section leakage, delayed accommodation, advanced shell equivalence.
