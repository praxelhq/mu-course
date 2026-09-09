# Masters' Union — Applied AI for Business, Course 1

This repository is the source of truth for Praxel's 20-hour, build-first Course 1 for 480 PGP students across eight sections.

## Start here

1. [Course concept](docs/course/course-1-concept.md)
2. [Architecture contract v2](docs/course/course-1-architecture-v2.md)
3. [Decision log](docs/course/DECISIONS.md)
4. [Career-stream coverage](docs/course/stream-coverage-matrix.md)
5. [Session experience map](docs/course/session-experience-map.md)
6. [Outcome registry](docs/course/outcome-registry.md)
7. [Assessment system](docs/assessment/course-1-assessment-system.md)
8. [Gradebook map](docs/assessment/course-1-gradebook-map.md)
9. [LMS concept](docs/lms/course-1-lms-concept.md)
10. [Validator contracts](docs/lms/validator-contracts.md)
11. [Task-attempt exchange](docs/lms/task-attempt-exchange-contract.md)
12. [Session package release contract](docs/operations/session-package-release-contract.md)
13. [Session asset index](docs/operations/session-asset-index.md)
14. [Resource and LMS upload matrix](docs/operations/course-resource-procurement-matrix.md)
15. [Learner workload budget](docs/operations/learner-workload-budget.md)
16. [Course production manifest](docs/operations/course-production-manifest.md)
17. [Operational asset inventory](docs/operations/asset-inventory.csv)
18. [Independent authored-source release review](docs/reviews/course-source-package-release-review-2026-07-18.md)

## Course production

- `docs/lessons/` — ten session plans and lesson-level quiz assets
- `docs/materials/` — student field guide/workbook, integrity/publication policy and facilitator handbook
- `docs/assessment/` — rubric, maturity, quiz and moderation contracts
- `docs/lms/` — Mission Room product, simulator and validation architecture
- `docs/operations/` — program coordination and delivery requirements
- `docs/research/` — external curriculum, artifact and case research
- `docs/reviews/` — independent release-gate findings
- `docs/source/` — extracts from earlier course drafts; reference, not current truth
- `.agents/skills/` — reusable Codex skills for architecture, stream mapping, lessons, materials, simulators, quizzes, LMS design and validation

## Current course doctrine

- One common operating core, nine career pathways, and IB/VC/Corporate Finance variants.
- Formal spine: `target role × representative work context × consequential decision × inspectable evidence`.
- Three universal assessed portfolio objects: decision evidence brief, role-authentic AI operating prototype, recruiter case page/proof pack.
- Artifact success and student ownership are assessed separately.
- Tools are replaceable delivery choices; capability and validator contracts are durable.
- The LMS captures predictions, evidence, failures, revisions, transfer and safe publication—not merely content completion.

## Working status

The repository now contains a complete authored source package for all ten sessions: lesson/quiz, pre/post work, student and instructor surfaces, slide/demo plans, cases/sources, eleven pathway packs, structured synthetic fixtures, simulator/LMS specifications, solution anchors, portfolio proof, and accessible/offline routes. It also contains authored Part A/Part B maturity forms and onboarding/operations materials.

Authored source is not a deployed-course claim. Independent document cross-audits, timed learner/facilitator pilots, source-rights and accessibility review, LMS implementation/loading, validator execution, MU workload/grading/publication/governance decisions, provisioning, scorer/facilitator capacity and room/network rehearsal remain separate release gates. See the [Market Research simulator benchmark](docs/reviews/market-research-simulator-benchmark.md), architecture open decisions and [Program Associate response draft](docs/operations/program-associate-response-draft.md).

Run `python3 scripts/verify_course_package.py` for repeatable structural checks. A pass confirms source-package completeness and ID/link/inventory consistency; it does not claim learner pilots, LMS implementation, institutional approvals, provisioning, or classroom rehearsal.
