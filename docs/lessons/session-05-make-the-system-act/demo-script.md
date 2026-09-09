# S05 Demo — The Workflow That “Succeeded” Twice v1.0

**7.5 minutes. Synthetic S05-DEMO-OPS-01.** Use mock `BluePeak Foods` control tower only.

1. Commit vote: duplicate means retry / new incident / cannot know (30 sec).
2. Run `EV-204`: validate delay, method assigns priority, planner approves, mock task `T-91` created, log completes (75 sec).
3. Replay identical event. Naive workflow creates `T-92`; both runs show green. Reveal consequence: two teams now expedite one order (60 sec).
4. Open execution map: states, `dedupe_key=order+event_type`, D/M/H/X labels, approver evidence, terminal statuses (90 sec).
5. Repair idempotency at validation/state layer. Replay: returns existing `T-91`, action count stays 1 (60 sec).
6. Inject changed policy: safety flag now requires safety lead, not planner. First controlled run stops at `awaiting_safety_approval`; nothing is sent (60 sec).
7. Show log as evidence, not debugging. Close: “Autonomy did more. Control made one correct action and knew when authority changed.” (45 sec).

Static fallback contains event card, naive logs, duplicate consequence, repaired map/log, policy stop. Demo payload never appears in assessment.
