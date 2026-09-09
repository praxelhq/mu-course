# Course 1 Outcome Registry

**Version:** 0.1  
**Status:** canonical for LMS joins and content production  
**Rule:** capability, lesson outcome, quiz family, validator and telemetry IDs are different levels. Never invent a new capability ID inside a lesson.

## ID namespaces

| Namespace | Pattern | Meaning |
| --- | --- | --- |
| Course capability | `C1`–`C9` | durable course-level capability |
| Lesson outcome | `L01-O1`–`L10-O6` | observable outcome taught and evidenced in one lesson |
| Validator | `V00`–`V10`, plus `V06P` | deterministic evidence/check contract, never the full judgment score; V06P is the tester-participation sibling of author-pack V06 |
| Quiz item family | `S01-D-*`, `S01-R-*` … `S10-D-*`, `S10-R-*` | equivalent diagnostic/retrieval item family |
| Content pack | `S{NN}-{PATH}-PACK-{NN}` | stream/subpath implementation pack |
| Telemetry event | `s{nn}_{past_tense_action}` | versioned learning or system event linked to lesson outcome/evidence |

## Course capabilities

| ID | Observable capability |
| --- | --- |
| C1 | frame an AI opportunity with role, owner, decision, metric, constraints and acceptance tests |
| C2 | build a reproducible evidence chain from sources to data to claims |
| C3 | control model behavior with context, retrieval, citations, abstention and evaluation |
| C4 | encode a recurring method as a reusable, bounded skill |
| C5 | orchestrate deterministic/model/human/external steps with permission, logging and recovery |
| C6 | select, scope, deploy/replay, observe and revise a role-authentic operating prototype |
| C7 | translate evidence into a role-authentic multimodal/stakeholder communication |
| C8 | verify, diagnose and adapt under a hidden or changed condition |
| C9 | communicate a recommendation and defend business/technical trade-offs |

## Lesson outcome crosswalk

Existing labels are retained as display aliases so current lesson content does not break. New systems store the canonical `Lxx-Ox` ID plus capability IDs.

| Canonical ID | Existing/display alias | Capability mapping | Evidence summary | Validator |
| --- | --- | --- | --- | --- |
| L01-O1 | C1.1 | C1 | role, mode, context, owner and decision | V00 |
| L01-O2 | C1.2 | C1 | metric and guardrail | V00 |
| L01-O3 | C1.3 | C1 | thin system and non-goals | V00 |
| L01-O4 | C1.4 | C1 | acceptance tests and stop/escalation | V00 |
| L01-O5 | C8.1 | C8 | changed-assumption revision | V00 |
| L01-O6 | C9.1 | C9 | role relevance/vulnerable-assumption defence | V00 |
| L02-O1 | C2.1 | C2 | source classification | V01 |
| L02-O2 | C2.2 | C2 | structured extraction with lineage | V01 |
| L02-O3 | C2.3 | C2 | reproducible calculation | V01 |
| L02-O4 | C2.4 | C2 | calibrated claim | V01 |
| L02-O5 | C8.2 | C8 | contradiction diagnosis | V01 |
| L02-O6 | C9.2 | C9 | evidence-led thesis change | V01 |
| L03-O1 | C3.1 | C3 | distinguish prior/retrieved/unsupported response | V02 |
| L03-O2 | C3.2 | C3 | citation/abstention/authority/disclosure contract | V02 |
| L03-O3 | C3.3 | C3 | balanced evaluation set | V02 |
| L03-O4 | C3.4 | C3 | retrieval versus answer diagnosis | V02 |
| L03-O5 | C8.3 | C8 | hostile/conflicting corpus repair | V02 |
| L03-O6 | C9.3 | C9 | scope/limitation disclosure | V02 |
| L04-O1 | S4-O1 | C4, C1 | bounded recurring job and authority | V03 |
| L04-O2 | S4-O2 | C4, C2, C3 | versioned portable method | V03 |
| L04-O3 | S4-O3 | C4, C8 | clean-session success | V03 |
| L04-O4 | S4-O4 | C4, C8 | non-trigger and messy input | V03 |
| L04-O5 | S4-O5 | C8 | hidden-change repair | V03 |
| L04-O6 | S4-O6 | C9 | human-owned judgment defence | V03 |
| L05-O1 | S5-O1 | C5 | event/state/action/owner map | V04 |
| L05-O2 | S5-O2 | C4, C5 | method-to-execution connection | V04 |
| L05-O3 | S5-O3 | C5 | normal approved run and log | V04 |
| L05-O4 | S5-O4 | C5, C8 | invalid/unsafe stop | V04 |
| L05-O5 | S5-O5 | C5, C8 | duplicate/service/policy recovery | V04 |
| L05-O6 | S5-O6 | C5, C9 | D/M/H/X defence | V04 |
| L06-O1 | S6-O1 | C6 | role-authentic form choice | V05 |
| L06-O2 | S6-O2 | C6 | precommitted acceptance tests | V05 |
| L06-O3 | S6-O3 | C4, C5, C6 | method/execution integration | V05 |
| L06-O4 | S6-O4 | C6 | fresh tester core-task attempt | V05, V06 |
| L06-O5 | S6-O5 | C5, C8 | safe invalid/out-of-scope response | V05 |
| L06-O6 | S6-O6 | C6, C8 | observability and release decision | V05 |
| L07-O1 | observed versus stated | C6 | structured assigned-attempt record | V06 |
| L07-O2 | failure by layer | C8 | failure taxonomy and evidence | V06 |
| L07-O3 | release decision | C6 | change/non-change priority note | V06 |
| L07-O4 | repair and verify | C5, C8 | v2 and equivalent rerun | V06 |
| L07-O5 | good-faith peer attack | C8 | tester evidence and participation receipt | V06P |
| L08-O1 | format from decision | C7, C9 | audience/action/format rationale | V07 |
| L08-O2 | preserve evidence | C2, C7 | source/claim/asset/caveat trace | V07 |
| L08-O3 | direct multimodal system | C7 | brief/storyboard/assets/revision | V07 |
| L08-O4 | changed communication constraint | C8 | revised artifact and change note | V07 |
| L08-O5 | defend role authenticity | C9 | blind scan and rationale | V07 |
| L09-O1 | role-value lead | C1, C9 | recruiter scan story | V09 |
| L09-O2 | public/private proof | C2, C9 | classified evidence views | V08, V09 |
| L09-O3 | reproducibility | C2, C6 | manifest, repo and replay | V08 |
| L09-O4 | failure and ownership | C8, C9 | failure/fix and contribution statement | V08 |
| L09-O5 | publication safety | C9 | disclaimer, rights, consent, secrets and links | V09 |
| L10-O1 | reframe unseen decision | C1 | owner, decision, metric, guardrail and gap | V10 |
| L10-O2 | diagnose seeded defect | C2, C8 | evidence-linked failure diagnosis | V10 |
| L10-O3 | substantive adaptation | C4, C5, C6, C8 | changed system layer | V10 |
| L10-O4 | verify human control | C5, C8 | before/after test and authority boundary | V10 |
| L10-O5 | defend recommendation | C9 | structured defence | V10 |

## Join requirements

- Every lesson source declares its canonical `L` range. Every quiz record stores one or more `C` IDs and an existing `Sxx-*` item-family ID; the loader deterministically resolves that family to `L` IDs through the normative table below.
- Every mission/submission stores session ID, content-pack ID, lesson-outcome IDs, capability IDs, validator versions and rubric version.
- Every validator result cites the evidence ID and lesson outcome it checks; passing a validator does not itself award a strategic score.
- Every telemetry event declares `lesson_id`, `outcome_ids`, `capability_ids`, `attempt_id`, `content_pack_id`, `privacy_class` and schema version where applicable.
- Every gradebook criterion points to frozen evidence IDs through the [Gradebook Map](../assessment/course-1-gradebook-map.md).

Missing or unknown IDs fail content load; aliases are accepted only through this registry.

## Quiz family → canonical lesson outcome join

Form A/B variants inherit the same mapping from the family ID. The content loader stores both family and resolved `L` IDs on every item record.

| Quiz family | Canonical outcome(s) |
| --- | --- |
| S01-E | L01-O1 |
| S01-D1 | L01-O1, L01-O4 |
| S01-D2 | L01-O2, L01-O3 |
| S01-D3 | L01-O4, L01-O5 |
| S02-E | L02-O1, L02-O4 |
| S02-D1 | L02-O1 |
| S02-D2 | L02-O3, L02-O4 |
| S02-D3 | L02-O4, L02-O5 |
| S03-E | L03-O2, L03-O6 |
| S03-D1 | L03-O4, L03-O5 |
| S03-D2 | L03-O2, L03-O3 |
| S03-D3 | L03-O5, L03-O6 |
| S04-E | L04-O1 |
| S04-D1 | L04-O1, L04-O4 |
| S04-D2 | L04-O2, L04-O5 |
| S04-D3 | L04-O2, L04-O3 |
| S05-E | L05-O1, L05-O6 |
| S05-D1 | L05-O1, L05-O6 |
| S05-D2 | L05-O3, L05-O4 |
| S05-D3 | L05-O4, L05-O5 |
| S06-D-01 | L06-O1 |
| S06-R-01 | L06-O1 |
| S06-R-02 | L06-O2, L06-O3 |
| S06-R-03 | L06-O4, L06-O6 |
| S07-D-01 | L07-O1, L07-O5 |
| S07-R-01 | L07-O1 |
| S07-R-02 | L07-O2, L07-O3 |
| S07-R-03 | L07-O4, L07-O5 |
| S08-D-01 | L08-O1, L08-O5 |
| S08-R-01 | L08-O1, L08-O2 |
| S08-R-02 | L08-O2, L08-O4 |
| S08-R-03 | L08-O3, L08-O5 |
| S09-D-01 | L09-O1 |
| S09-R-01 | L09-O1, L09-O3 |
| S09-R-02 | L09-O2, L09-O5 |
| S09-R-03 | L09-O4, L09-O5 |
| S10-D-01 | L10-O3, L10-O4 |
| S10-R-01 | L10-O2, L10-O3 |
| S10-R-02 | L10-O3, L10-O4 |
| S10-R-03 | L10-O5 |

The release fixture loads all 80 A/B item records and fails on an unknown family, missing lesson range, unresolved alias, or validator outside this namespace.
