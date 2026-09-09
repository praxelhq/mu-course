# S02 LMS Copy, Evidence and Events

**Asset ID:** `S02-LMS-v1.0`

## Copy

- Start: **“A confident memo is on the desk. Decide whether it deserves to move a real decision.”**
- Source warning: **“A link exists, but the locator does not support this wording.”**
- Formula warning: **“Result found; denominator, period or formula is not yet inspectable.”**
- Freeze: **“Lock the Claim Chain. The next source may contradict it; losing evidence cannot be deleted.”**
- Reveal: **“Conflict {id}: classify the broken link before repairing downstream claims.”**
- Safe hold: **“Evidence remains unresolved. Holding the decision with a named evidence request is a valid outcome.”**
- Success: **“Your reviewer reproduced the number. Save source → formula → contradiction as proof.”**
- Offline: **“Continue with packet {code}; your stamped versions preserve evidence parity.”**

## Evidence and events

Schema: `attempt, pack/version, prediction, questions[], sources[{id,type,owner,date,locator,use,limit}], rows[{raw,normalized,unit,period,locator,transform}], calculation{formula,inputs,denominator,rounding,result}, claim{wording,type,caveat,counter,implication}, v0_hash, contradiction{id,class}, repair_diff, status, peer{reviewer,result,variance,locator}, transfer, provenance, validator, timestamps`.

Events: `s02_mission_assigned`, `s02_source_prediction_committed`, `s02_source_plan_checkpointed`, `s02_dataset_checkpointed`, `s02_calculation_checkpointed`, `s02_claim_chain_prefailure_frozen`, `s02_contradiction_revealed`, `s02_contradiction_classified`, `s02_claim_chain_repaired`, `s02_peer_reproduction_completed`, `s02_dossier_submitted`, `s02_transfer_submitted`, `s02_exit_calibration`, `s02_offline_imported`, `s02_quarantined`.

Idempotency key = event UUID; version hashes immutable; retry records delivery only. Alerts: unsupported citation rate, >15% denominator failures, source-license/PII flag, contradiction deletion, formula parser incident, section variant leakage and reproduction variance beyond tolerance.

