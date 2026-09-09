# S06 LMS Copy and Events v1.0

## Copy

- Launch: “Five prototypes. One lets the role do the work.”
- Form gate: “Choose one—and reject the seductive wrong answer.”
- Freeze: “Hands off. A fresh operator now owns the task.”
- Observation: “Preference is optional; observable friction is evidence.”
- Safe success: “Released because the task worked and the dangerous path did not.”
- Hold: “A safe hold is a release decision, not a failed demo.”
- Incident: “Endpoint unavailable; switching to immutable replay without penalty.”

## Evidence and transitions

`prototype_id/version, learner/section/pack, form, rejected_form, method_version, execution_version, acceptance_hash, attempt_id, tester_pseudonym, role/input versions, consent/evidence_class, started/ended, task_state, safety_state, event/log refs, observation_ref, issue_decision, revision/replay refs, release_state, provenance/disclosure/access refs`.

Transitions match simulator spec. Freeze binds artifact+acceptance hashes; assignment cannot target author; observation reveals after end; replacement links prior; retries never erase; URL unavailable uses replay incident route. Quiz entry `S06-D-01`; delayed `S06-R-01/02/03`; quiz cannot replace V05 evidence.

Alerts: unsafe action, endpoint fail, no event, author coaching, duplicate tester, PII/secret, inaccessible path, consent decline, prolonged stall, section incident cluster. No page-view or speed leaderboard.
