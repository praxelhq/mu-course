# S02 Simulator Spec — Claim Chain Forensics

**Mission ID:** `S02-SIM-v1.0` · **Duration:** 91 embedded minutes

## State and reveal

`ASSIGNED → SOURCE_PREDICTED → CHAIN_DRAFT → DATA_VALID → CALC_VALID → V0_FROZEN → CONTRADICTION_REVEALED → CONFLICT_CLASSIFIED → CHAIN_REPAIRED_OR_HELD → PEER_REPRODUCED → V1_FROZEN → TRANSFER → COMPLETE`.

Contradiction reveal requires immutable v0. Learner must classify date/definition/scope/provenance/arithmetic before editing. Silent removal of a source/row, post-hoc formula replacement, early reveal or peer-answer exposure is illegal and logged.

## Feedback and scoring

- deterministic: source count/type/locator, required lineage fields, formula visibility, units/period/denominator, claim-type label, version/diff, contradiction retention and reproduction variance;
- model-assisted: cites exact claim/source spans to ask whether wording exceeds support; never decides strategic truth or grade;
- human: source directness, decision relevance, counter-hypothesis, conflict resolution and 30% pathway judgment.

Success permits decision; partial narrows claim; safe hold names missing evidence; unsafe blocks fabricated/confidential/causal or regulated advice. Feedback arrives at checkpoints and repair remains open.

## Hidden variant, controls and tests

Assign one equivalence-group contradiction from `data/s02_synthetic_contradictions.csv`; unseen transfer changes domain and numbers. Facilitator may reassign matching cached pack, pause/extend, quarantine, override validator with reason and issue offline code. Reset only before freeze; replay preserves hashes.

Test: supported pass, unsupported citation, wrong denominator, mixed unit, stale source, duplicate row, honest unresolved, causal overclaim, offline import, duplicate event, section leak and accommodation timing.

## Offline form

Numbered source excerpts, extraction sheet, calculator/formula card, sealed contradiction, reproduction slip and transfer micro-pack preserve all assessed actions. Facilitator stamps v0/v1 and withholds answer card from reviewer.

