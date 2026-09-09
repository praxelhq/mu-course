# S04 Cached Demo Assets v1.0

**Synthetic projector/text fallback; not assessment input. Source:** `data/s04-demo-weekly-pack-synthetic.csv`.

## Transcript A — generic prompt

“Priority 1: West Region Launch—high growth, owned by Arun. Priority 2: Packaging Redesign—assign to Operations. Pause Food Safety Audit to free capacity.” Seeded defects: growth metric is stale; Packaging has no owner; Food Safety is protected. Mock consequence: `routing_failed: owner missing`; `policy_violation: protected initiative displaced`.

## Transcript B — bounded method

`PRIORITIZE Kitchen Scheduling Pilot` (current evidence, owner Mina); `REVIEW West Region Launch` (stale metric); `HOLD Packaging Redesign` (owner required); `PRESERVE Food Safety Audit` (protected); final decision awaits CEO.

## Transcript C — changed field

Before: `missing required field business_impact`. Repair: map new `impact_range`, retain source field, rerun. After: schema passes; no judgment instruction changed.
