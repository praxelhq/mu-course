# Course 1 · Session 3 source package

**Session:** Working with data, using AI  
**Duration:** 120 minutes  
**Audience:** eight sections; 50–60 learners per section; individual evidence  
**Lifecycle:** Authored. Generated assets have machine-validation receipts; the course has not yet advanced to Validated, Piloted, Loaded, Deployed, or Rehearsed.  
**Primary grade component:** Artifact quality (15% course component; this submission is one artifact in the component average)  
**Secondary evidence:** Praxy-bound portfolio through a separate public-safe memo linked after class; visualization check is formative and does not alter the best-three quiz rule

## Session promise

By the end of the class, a learner can get a business answer from a real dataset without confusing an AI's confidence with proof. They will know when to upload a small file, when to ask AI for a spreadsheet formula, when to provide only a schema and representative sample, and when to run AI-written Python against the data in Colab. They will ship a private verified data memo whose numbers, assumptions, and visual choices can be audited. After class, within 24 hours, they publish a separate method-focused memo that contains no TrustMRR row, derived value or screenshot and add its live public HTTPS link to the portfolio.

## Authority and privacy

This package follows, in order:

1. `lms/docs/build/SOURCE_OF_TRUTH.md`;
2. `lms/docs/build/10_sessions_3_5_redesign_brief.md`;
3. `lms/docs/build/04_course_outline_COT_v3.md`;
4. `lms/docs/build/01_scoring_methodology.md`;
5. the current Forge implementation and the delivered decks under `lms/docs/taught/`.

The TrustMRR source and all row-level or derived datasets remain in the roster-gated course environment. This directory contains schemas, question logic, and teaching copy only. It intentionally contains no source rows and no answer values. The evaluator resolves answers from the private, checksum-bound answer pack.

Learner processor boundary: real rows may be opened only in the roster-gated LMS and in Google Sheets/Colab while signed into the institution-managed MU Google account. Personal ChatGPT, Claude, Gemini, or other consumer AI workspaces receive only the learner-safe schema, synthetic sample, and requested output contract—never source rows, derivative rows, or answer-bearing aggregates. Unless the LMS material card names a separately approved managed AI workspace, no chat model is approved for real-row upload. The no-AI Sheets and starter-code lanes use the same rubric and score ceiling. Temporary MU Drive/Colab copies must be deleted when the correction window closes; the submitted formula/code and compact, non-row-level evidence remain under the LMS retention policy recorded at release.

## Package map

| File | Audience | Purpose |
| --- | --- | --- |
| `lesson-plan.md` | Instructor | Outcomes, evidence map, 120-minute run of show, demo, debrief, recovery |
| `deck-script.md` | Instructor/production | Slide-by-slide copy, speaker notes, activity timing, source ledger |
| `instructor-runbook.md` | Instructor | Setup, facilitation moves, reveals, troubleshooting, cross-section calibration |
| `learner-lab.md` | Student | In-class brief, staged tasks, evidence capture, submission instructions |
| `public-safe-portfolio-data-memo-template.md` | Student | Post-class public memo structure, publication boundary and exact portfolio-link instructions |
| `data-question-spec.md` | Build/evaluator | Stable mixed-question IDs, deterministic queries, response formats, scoring rules |
| `visualization-quiz.md` | Build/evaluator | Six scenario items, selection key, rationale anchors, feedback and calibration |
| `data-dictionary.md` | Student/build | Column contract, units, missingness cautions, privacy and representativeness limits |
| `spreadsheet-pathway.md` | Student/instructor | AI-to-formula prompts, Sheets formulas, checks, supported and extension routes |
| `colab-python-pathway.md` | Student/instructor | Schema/sample prompt contract, runnable analysis outline, assertions and outputs |
| `verification-checklist.md` | Student/evaluator | Required audit trail and pre-submission checks |
| `grading-and-anchors.md` | Evaluator/instructor | 4 × 10 artifact rubric, evidence anchors, AI escalation and calibration fixtures |
| `accessibility-and-fallbacks.md` | Instructor/build | Accessible equivalents, outage routes, late/absent recovery |
| `lms-manifest.md` | LMS build | Session, materials, fields, gates, grading, feedback and privacy contract |

## Frozen private data pack

Generator v1 has produced a deterministic, ignored pack under `lms/private/course-data/session-03/generated/v1/`:

- `trustmrr_s3_manifest_v1.json` — dataset version `trustmrr-s3-v1`, lineage, usage notice, checksums and size proof;
- `trustmrr_s3_learner_v1.csv` — learner analysis file;
- `trustmrr_s3_schema_v1.json` — machine-readable learner and peer-comparison contracts;
- `trustmrr_s3_representative_sample_v1.csv` — deterministic coverage sample of the learner CSV, not a proportional sample;
- `trustmrr_s3_peer_comparisons_v1.jsonl.gz` — over-context derivative; the manifest records 14,420,414 `cl100k_base` tokens under `tiktoken==0.12.0`;
- `trustmrr_s3_fact_pack_v1.json` — evaluator-only aggregates and stable answer paths.

The size proof is tokenizer-specific and is not a claim about every vendor's context or upload limit.

Completed authored checks, without advancing the course lifecycle:

- every `S3-DATA-*` ID and both `S3-SCALE-03` variants are mapped to the private fact/evaluator pack and independently recomputed;
- the deterministic 12-row nested peer sample and 59-path machine schema are generated and checksum-bound;
- the learner notebook has a synthetic smoke receipt, and the checksum-bound local runner has read the real private scale file successfully in a clean Python runtime;
- the complete offline runner, numbered answer sheet, accessible HTML and print PDF are generated under `lms/output/session-03/offline/`.

Remaining release dependencies:

- execute the learner notebook against the private file in a fresh institution-managed Colab runtime; the local-runner receipt is not a Colab rehearsal;
- verify the six learner-safe accessible visualization/table equivalents in `visualization-quiz-accessible-artifacts.md` through the loaded LMS;
- upload content-addressed private artifacts and bind their immutable release ID in the deployment environment;
- load the public-safe portfolio memo template and confirm an exact-label public HTTPS link cannot complete the `data-memo` portfolio slot until its crawl succeeds;
- complete mixed-confidence learner timing, outage, accessibility and section-facilitator rehearsals.

No lifecycle state advances beyond **Authored** until the verification checklist and the course validation gate pass.
