# S04 Working Handout — Method Test Bench v1.0

**Name / pack ID / method version:** __________

**Minute-0 assigned pack header:** Pathway ___ · Role/mode ___ · Decision owner ___ · Approver ___ · Consequential decision ___ · Hiring signal ___

## 0–22 | Notice the difference

Entry classification: __________. Demo prediction: polished / bounded / safe stop. Why? __________. What changed your mind? __________.

## 22–28 | Prediction gate

Trigger: ___  Non-trigger: ___  Expected normal output: ___  Missing-field behavior: ___  Human stop: ___  Confidence: ___%.

## 28–52 | Method Contract

| Surface | My decision |
| --- | --- |
| recurring job and user | |
| accountable owner / approver | |
| required / optional inputs | |
| deterministic steps | |
| model-assisted judgment | |
| output fields | |
| checks | |
| prohibited actions | |
| stop / ask / escalate | |

## 52–72 | Known-test log

| Run | Prediction | Observed evidence | Pass? | Failure layer | Next change |
| --- | --- | --- | --- | --- | --- |
| normal | | | | | |
| messy | | | | | |
| non-trigger | | | | | |

Failure layers: `input`, `evidence`, `method`, `model`, `output check`, `authority`, `platform`.

## 72–90 | Clean runner

Author may not explain. Runner records invocation, missing questions, output, and one evidence-specific defect. Defect: __________. Useful behavior: __________.

## 90–108 | Hidden change and repair

Change revealed: ___  First result: ___  Layer: ___  Smallest repair: ___  Affected test: ___  Rerun receipt: ___  Why not rewrite everything? ___

## 108–120 | Freeze and defend

Human owns: ___ because ___. Remaining limitation: ___. Provenance refs: ___. Portfolio receipt ID: ___. Session 5 trigger payload: ___.

### Two-minute recruiter card

`0:00` job + boundary → `0:25` clean run → `0:55` failure → `1:20` repair → `1:45` human authority + limitation.
