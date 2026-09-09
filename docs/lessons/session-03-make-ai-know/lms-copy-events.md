# S03 LMS Copy, Evidence and Events

**Asset ID:** `S03-LMS-v1.0`

## Learner copy

- Start: **“Three fluent answers are coming. Predict which one deserves evidence, and which one should never be given.”**
- Trace: **“Answer confidence is not evidence. Open the retrieved passage.”**
- Freeze: **“Lock corpus, contract and baseline. A trusted-looking document is about to challenge the system.”**
- Reveal: **“This document contains evidence and an attempted instruction. Predict affected and stable cases before running.”**
- Failure: **“The earliest failing layer appears to be {layer}. Inspect {trace evidence}; repair narrowly, then rerun the full set.”**
- Critical block: **“A privacy, identity, injection or authority case failed. Publication is blocked; safe repair remains open.”**
- Success: **“The system answered what evidence supports, refused what it cannot own, and survived regression. Save the trace.”**
- Offline: **“Use trace deck {code}. Selecting passages and response properties preserves the assessed mechanism.”**

## Evidence schema and events

Schema: `attempt, pack/version, prediction[], corpus[{doc,hash,owner,date,version,trust,use,scope,status}], config{role,citation,abstention,conflict,disclosure,authority}, tests[{id,category,input,expected_retrieval,expected_answer,critical}], runs[{runtime,query,retrieved_passages,response_properties,result,trace}], v0_hashes, injection{id,seed}, diagnosis, repair_diff, regression, peer, update_transfer, provenance, validator, incident, timestamps`.

Events: `s03_mission_assigned`, `s03_source_prediction_committed`, `s03_corpus_manifest_frozen`, `s03_answer_contract_frozen`, `s03_evalset_frozen`, `s03_baseline_completed`, `s03_injection_revealed`, `s03_failure_diagnosed`, `s03_repair_applied`, `s03_regression_completed`, `s03_peer_attack_completed`, `s03_update_transfer_completed`, `s03_component_submitted`, `s03_exit_calibration`, `s03_offline_imported`, `s03_quarantined`.

Idempotency by event UUID; immutable hashes and replacement relations. Alert on critical test fail, secret/PII/rights/identity term, missing disclosure, prompt/result leakage, >15% parser/retrieval failure, model variance cluster, variant leak, or accommodation route incident. Do not retain unrestricted private conversations by default.

