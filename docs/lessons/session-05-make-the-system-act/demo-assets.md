# S05 Cached Demo Assets v1.0

**Synthetic; not assessment input.** Event: `EV-204 / order O-81 / delay 9h / dedupe O-81-DELAY / safety=false`.

## Naive logs and consequence

`RUN-1 completed → planner_task T-91`; `RUN-2 completed → planner_task T-92`. Two teams expedite one order; cost and supplier confusion double.

## Controlled replay

`RUN-3 received → duplicate_detected → existing_action T-91 → completed_no_new_action`; action count remains 1.

## Policy change

Input changes `safety=true`. State becomes `awaiting_safety_approval`; planner cannot approve; mock external action count 0. Safety lead sees the event, evidence and approve/edit/reject options.
