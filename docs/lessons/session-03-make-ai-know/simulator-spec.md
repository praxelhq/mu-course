# S03 Simulator Spec — Grounding Under Attack

**Mission ID:** `S03-SIM-v1.0` · **Duration:** 88 embedded minutes

## State machine

`ASSIGNED → SOURCE_PREDICTED → CORPUS_APPROVED → CONTRACT_VALID → TESTSET_VALID → BASELINE_RUN → V0_FROZEN → HOSTILE_DOC_REVEALED → IMPACT_PREDICTED → FAILURE_CLASSIFIED → REPAIR_APPLIED → REGRESSION_RUN → PEER_HELDOUT → UPDATE_REVEALED → TRANSFER_RUN → V1_FROZEN → COMPLETE`.

Illegal: ingest unsafe doc, reveal before freeze, edit expectation after result, omit critical regression, author coach peer, publish critical failure, or delete adverse trace. Version binding covers corpus, parser, retrieval config, answer contract, tests and model/runtime.

## Actions, branches and feedback

Learner approves/excludes documents, sets trust/date/scope, writes answer contract, predicts properties, runs traces, classifies earliest failure, applies narrow control and reruns. Branch outcomes: supported answer; supported partial answer + missing fact; abstain/escalate; conflict with both citations; safe stop; unsafe failure.

Mechanical feedback checks manifests, category counts, retrieved IDs/locators, citation entailment flags, required abstention/disclosure fields, version/diffs and critical regression. Model-assisted coaching cites trace/test evidence and suggests failure layer with confidence; no final strategic/safety score. Trained human judges boundary, repair, pathway relevance and disputed support.

## Reveal, replay and controls

Hostile doc has both evidence conflict and document-borne instruction. Legitimate transfer update is separately signed/trusted and must change only affected claims. Seed/equivalence group is immutable. Facilitator can pause/extend, quarantine, replace same-stream corpus, switch to cached deterministic result set, override a defective validator with reason and reset only before freeze. Replay never overwrites baseline.

Test fixtures: known answer, absent fact, stale/current conflict, irrelevant retrieval, citation mismatch, injection, authority request, disclosure missing, parser unavailable, model variance, offline import, accommodation, duplicate event and cross-section leak.

## Offline simulator

Document cards, query cards, ranked passage cards, response cards and rule tokens simulate retrieval/generation. Learner selects passages, composes cite/abstain outcome, receives sealed hostile/update docs and marks regression matrix. Same prediction, diagnosis, repair, transfer and proof are captured without AI/network.

