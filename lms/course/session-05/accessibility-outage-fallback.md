# Accessibility and outage replay

**Goal:** preserve S5-O1–S5-O5 when the Make UI, network, model, or a connection is unavailable or inaccessible.

## Accessibility-equivalent routes

- Every diagram submission accepts a text-node/state-table equivalent; visual polish is not required for design correctness.
- Slides and PNGs use high contrast, large labels, and redundant text/shape cues rather than colour alone.
- Provide the workflow pack, contracts, fixtures, and expected states as structured text.
- A student who cannot operate the canvas can serve as navigator/system owner while a partner drives; the student individually completes the state model, test predictions, feedback disposition, and oral/typed ownership defence.
- All videos/live demonstrations have narrated module names, mappings, state transitions, and resulting evidence.
- The gallery PNG requires an 80–180 word accessibility description.
- Allow keyboard-readable JSON/log/table evidence instead of screenshot-only evidence.
- Extra time changes timing, not the five-test or safety standard.

## Model outage

Use two peers or the instructor with `assessment/ai-flowchart-feedback-rubric.md`:

1. reviewer identifies at most three blockers with cited node IDs;
2. student accepts/adapts/rejects advice;
3. instructor records a feedback-bypass token in the LMS;
4. build gate opens with the same revision requirement.

No learner is blocked because an AI service failed.

## Make/network outage · 35-minute execution replay

### Materials

- revised flowchart;
- five input fixtures;
- expected-results manifest held by instructor until predictions;
- blank trace table below;
- module/state cards: receive, validate, dedupe, decide, queue, approve, retry, quarantine, audit.

### Replay

1. **Predict (5 min):** student fills expected final state/action count for all fixtures.
2. **Normal trace (6 min):** move the event card node by node; write each state and output.
3. **Duplicate trace (5 min):** replay same key; stop the first attempted second action and explain the control.
4. **Malformed trace (4 min):** identify the first failed contract rule and quarantine reason.
5. **Timeout trace (6 min):** record attempt 1, scheduled retry/incomplete state, exhaustion/manual owner; no infinite loop.
6. **Approval trace (4 min):** pause at pending; prove action count remains zero until a separate approved event.
7. **Repair and evidence (5 min):** change one chart node/control and complete sample output.

### Blank trace table

| Step | Fixture | Node/state before | Contract/condition | Action attempted | Result/state after | Evidence written | Owner |
|---:|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |

### Replay acceptance

- every fixture reaches the expected terminal/waiting state;
- duplicate and approval action counts are zero;
- malformed never retries;
- timeout retry is bounded and stateful;
- trace, reason, and owner exist;
- student can name the limitation: this proves logic, not live integration.

## Recovery window

When Make returns, the student imports/builds the scenario, recreates demo connections, and reruns normal + duplicate within the published recovery window. If persistent accessibility prevents direct canvas operation, the partner/instructor operates the exact student-authored mapping while the student directs and defends every node. The LMS records the equivalent route; it does not lower the rubric ceiling or hide the accommodation.

### Late-outage branches

- **Outage before 00:52:** switch immediately to the full 35-minute replay; submit the revised design and replay evidence in class. Complete live normal + duplicate in the 24-hour recovery window.
- **Outage from 00:52–01:27:** preserve the last saved blueprint/trace, use the remaining class time for the five-card replay and evidence packaging, then complete live normal + duplicate within 24 hours.
- **Outage after 01:27:** submit the saved blueprint plus honest partial log, finish the missing fixture evidence with the replay pack, and complete the two live checks within 24 hours.

An outage receipt opens the recovery window automatically. It never changes the five-test, privacy, or ownership standard and carries no grade penalty.

## Connection outage only

- substitute a demo queue sheet for Gmail/Slack/CRM;
- retain the same state/action evidence;
- record the unavailable connection in `limitationChange`;
- never use a personal account as an emergency shortcut.

## Instructor evidence

Record section, outage start/end, affected gate, bypasses, fallback route, recovery deadline, and whether final live verification occurred. Apply the same policy across all sections.
