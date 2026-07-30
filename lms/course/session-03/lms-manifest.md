# Session 3 LMS field and gate manifest

**Logical contract:** implementation may choose schema details, but must preserve every ID, evidence rule, privacy boundary and gate behavior below.  
**Current compatibility:** preserve `spage_3`, `asg_s3_datamemo`, the `data-memo` assignment-type slug, `artifact-quality` weight bucket, section scoping and `lib/gates`.  
**Implementation delta:** the current MCQ-only quiz engine and five-kind submission schema cannot represent this mixed assessment. Add only generic `number` and `singleChoice` field kinds; keep formulas/code and rationales in existing `writeup`, short metadata in `text`, and outputs in `file`. Group related fields visually from schema metadata. Do not build a one-off Session 3 page.

## Session page

```yaml
id: spage_3
sessionNo: 3
title: Working with data, using AI
summaryMd: >-
  Get defensible answers from a real startup dataset. Start with a small
  question set, then move computation to Sheets or Colab when the file no
  longer fits in chat. Ship a verified data memo with working, a two-method
  check, and a responsible business recommendation. Publish the separate
  public-safe method memo after class, within 24 hours.
linkedAssignmentIds:
  - asg_s3_datamemo
linkedAssessmentIds:
  - assess_s3_data_v1
  - assess_s3_visuals_v1
```

The page displays a private-use notice above materials and submission. It never displays answer values, grader confidence, flags or prompt logs.

## Materials

| ID | Kind | Student title | Gate at start | Notes |
| --- | --- | --- | --- | --- |
| `mat_s3_lab_v1` | lab-sheet | Session 3 learner lab | open | HTML/PDF; no keys |
| `mat_s3_dictionary_v1` | reference | TrustMRR learner slice · data dictionary | open | accessible HTML |
| `mat_s3_public_memo_v1` | template | Public-safe portfolio data memo template | open | post-class, within 24 hours; no TrustMRR row, derived value or screenshot |
| `mat_s3_learner_csv_v1` | dataset | `trustmrr_s3_learner_v1.csv` | open | private S3; CSV; manifest/version/checksum shown |
| `mat_s3_formula_v1` | reference | Spreadsheet pathway | open | no output values |
| `mat_s3_colab_starter_v1` | notebook | Colab starter · make your own copy | open | no private outputs/keys embedded |
| `mat_s3_visuals_a11y_v1` | assessment-support | Visualization check · accessible artifacts | open with visualization check | `visualization-quiz-accessible-artifacts.md`; learner-safe; no keys |
| `mat_s3_scale_manifest_v1` | scale-pack | `trustmrr_s3_manifest_v1.json` | locked | open at context-wall reveal |
| `mat_s3_scale_schema_v1` | schema-pack | `trustmrr_s3_schema_v1.json` | locked | open with manifest |
| `mat_s3_learner_sample_v1` | schema-pack | `trustmrr_s3_representative_sample_v1.csv` | open | learner-table coverage sample; not proportional |
| `mat_s3_scale_sample_v1` | schema-pack | `trustmrr_s3_peer_comparisons_sample_v1.jsonl` | locked | deterministic 12-row nested-shape coverage sample; checksum-bound; cannot reveal key |
| `mat_s3_scale_data_v1` | dataset | `trustmrr_s3_peer_comparisons_v1.jsonl.gz` | locked | private direct S3 download; 8,757,576-token proof in manifest |
| `mat_s3_offline_v1` | fallback | Instructor offline pack | instructor-only | generated runner, answer sheet and accessible HTML/print PDF; never student-gated in normal delivery |
| `mat_s3_answer_pack_v1` | evaluator-key | Session 3 answer pack | instructor/evaluator-only | never reachable through student material APIs |

All file bytes use presigned S3 routes. No app-tier proxy. Raw/derived TrustMRR assets are absent from public repository and galleries.

## Assignment

```yaml
id: asg_s3_datamemo
assignmentTypeSlug: data-memo
title: S3 · Verified data memo
sessionNo: 3
teamBased: false
galleryEligible: false
aiGraded: true
weightBucket: artifact-quality
versionPolicy: controlled
```

The assignment is the durable artifact. `assess_s3_data_v1` supplies its structured responses; the final submit snapshots responses, working and files into immutable Submission Version 1.

The immutable assessment binds this portfolio policy:

```yaml
portfolioPolicy:
  include: true
  slot: data-memo
  requiredPublicLink:
    label: Session 3 public-safe data memo
```

Using the canonical `data-memo` slot replaces the legacy definition instead of creating a seventh completeness row. The slot is present only when the learner has a scoreable graded/finalised artifact and PortfolioEntry external links contain that exact label with a public HTTPS URL whose latest crawl result is successful. Policies without `requiredPublicLink` keep their existing completeness behavior.

## Mixed data assessment

```yaml
id: assess_s3_data_v1
kind: artifact-question-set
datasetBound: true
answerRelease: after-section-assignment-close
items:
  - S3-DATA-01
  - S3-DATA-02
  - S3-DATA-03
  - S3-DATA-04
  - S3-DATA-05
  - S3-DATA-06
  - S3-DATA-07
  - S3-DATA-08
  - S3-DATA-09
  - S3-DATA-10
  - S3-SCALE-01
  - S3-SCALE-02
  - S3-SCALE-03
```

### Logical fields

| Key | Field kind | Required | Validation/display |
| --- | --- | --- | --- |
| `datasetVersionId` | text | yes | exact active manifest ID; read-only after first final submit |
| `datasetSha256` | text/hash | yes | 64 lowercase hex; exact manifest match |
| `S3-DATA-01` | number | yes | integer |
| `S3-DATA-02` | number | yes | integer |
| `S3-DATA-03` | number | yes | percentage; one decimal display |
| `S3-DATA-04` | number | yes | USD; nearest whole display |
| `S3-DATA-05.category` | singleChoice | yes | canonical source category; options derived from the bound release |
| `S3-DATA-05.totalMrrUsd` | number | yes | USD; nearest whole display |
| `S3-DATA-06` | number | yes | USD; nearest whole display |
| `S3-DATA-07` | writeup | yes | 120–180 words; no raw rows |
| `S3-DATA-08` | writeup | yes | 120–180 words; no raw rows |
| `S3-DATA-09` | writeup | yes | 180–250 words; no raw rows |
| `S3-DATA-10.verifiedItemId` | singleChoice | yes | one of S3-DATA-03 through S3-DATA-06 |
| `S3-DATA-10.methodA` | text | yes | method label |
| `S3-DATA-10.workingA` | writeup | yes | exact formula/code as searchable text |
| `S3-DATA-10.resultA` | text | yes | value/label in the verified item's response shape |
| `S3-DATA-10.unitA` | text | yes | item unit, for example USD or percentage points |
| `S3-DATA-10.methodB` | text | yes | method label |
| `S3-DATA-10.workingB` | writeup | yes | exact formula/code as searchable text |
| `S3-DATA-10.resultB` | text | yes | value/label in the verified item's response shape |
| `S3-DATA-10.unitB` | text | yes | must match the item and unit A |
| `S3-DATA-10.absoluteGap` | number | yes | item-appropriate numeric gap; category must also match |
| `S3-DATA-10.independenceRationale` | writeup | yes | why the mechanics can catch a different error |
| `S3-DATA-10.gapExplanation` | writeup | yes | cause/repair, or “zero gap” with check |
| `S3-SCALE-01` | writeup | yes | 60–100 words |
| `S3-SCALE-02.prompt` | writeup | yes | exact method request |
| `S3-SCALE-02.working` | writeup | yes | searchable formula/code text; max 20k chars |
| `S3-SCALE-02.correction` | text | yes | named pre-run change |
| `S3-SCALE-03.output` | file | yes | aggregate CSV/TXT/JSON only; field-level cap 2 MB |
| `S3-SCALE-03.variant` | singleChoice | yes | `formula` (`S3-SCALE-03F`) or `python` (`S3-SCALE-03P`) |
| `S3-SCALE-03.validCount` | number | yes | non-negative integer |
| `S3-SCALE-03.excludedCount` | number | yes | non-negative integer |
| `S3-SCALE-03.assertion` | text | yes | one passed assertion, no secret/path |
| `verificationDeclaration` | singleChoice | yes | sole option is the exact declaration from checklist |

The form autosaves draft responses. It never tells a learner which objective item is correct while the section assignment is open. It validates format immediately, computes correctness in the background after final submit, and withholds right/wrong state and expected values until the assignment gate closes for the section.

## Visualization scenario check

```yaml
id: assess_s3_visuals_v1
version: assess_s3_visuals_v1
kind: formative-mixed-scenario
items:
  - { itemId: S3-VIZ-01, version: S3-VIZ-01@1, artifactId: S3-VIZ-01-A11Y@1 }
  - { itemId: S3-VIZ-02, version: S3-VIZ-02@1, artifactId: S3-VIZ-02-A11Y@1 }
  - { itemId: S3-VIZ-03, version: S3-VIZ-03@1, artifactId: S3-VIZ-03-A11Y@1 }
  - { itemId: S3-VIZ-04, version: S3-VIZ-04@1, artifactId: S3-VIZ-04-A11Y@1 }
  - { itemId: S3-VIZ-05, version: S3-VIZ-05@1, artifactId: S3-VIZ-05-A11Y@1 }
  - { itemId: S3-VIZ-06, version: S3-VIZ-06@1, artifactId: S3-VIZ-06-A11Y@1 }
selectionScoring: deterministic
rationaleScoring: provisional-ai
courseWeight: 0
retakes: 1
optionIdentity: stable-option-id
displayOrder: shuffled-per-attempt
retryShuffleKey: "assessmentVersionId + itemVersionId + attemptNumber"
answerRelease: after-section-delivery-window-close
optionIdsByItemVersion:
  S3-VIZ-01@1: [S3-VIZ-01-PIE20, S3-VIZ-01-SORTED-BAR, S3-VIZ-01-ROW-LINE, S3-VIZ-01-COUNTRY-MAP]
  S3-VIZ-02@1: [S3-VIZ-02-SCATTER, S3-VIZ-02-PROVIDER-STACK, S3-VIZ-02-VISITOR-DONUT, S3-VIZ-02-CORRELATION-KPI]
  S3-VIZ-03@1: [S3-VIZ-03-HISTOGRAM, S3-VIZ-03-VALUE-PIE, S3-VIZ-03-NAME-LINE, S3-VIZ-03-MEAN-KPI]
  S3-VIZ-04@1: [S3-VIZ-04-DIVERGING-BAR, S3-VIZ-04-TIME-LINES, S3-VIZ-04-PERCENT-TREEMAP, S3-VIZ-04-CATEGORY-GAUGES]
  S3-VIZ-05@1: [S3-VIZ-05-PROVIDER-BAR, S3-VIZ-05-PIE-3D, S3-VIZ-05-RANDOM-BUBBLE, S3-VIZ-05-ROW-LINE]
  S3-VIZ-06@1: [S3-VIZ-06-MEAN-BARS, S3-VIZ-06-BOX-POINTS, S3-VIZ-06-THREE-PIES, S3-VIZ-06-STACKED-AREA]
```

Each item stores `selectedOptionId`, `rationale`, assessment version, item version and attempt. Options are shuffled while the IDs in `visualization-quiz.md` preserve the key; no display letter or array index is scored. The retry derives a fresh display order from the declared shuffle key while preserving the same option IDs. Feedback releases only after the section delivery window closes. If multiple sections share this exact assessment version, the delivery window closes after the last scheduled participating section, preventing cross-section answer leakage. This assessment never enters the `surprise_quiz` table or best-three calculation.

## Rubric

Preserve the existing four artifact dimension keys expected by the scoring pipeline:

```yaml
dimensions:
  - key: functionality
    label: Functionality
    max: 10
  - key: craft
    label: Craft
    max: 10
  - key: relevance
    label: Relevance
    max: 10
  - key: verification-evidence
    label: Verification evidence
    max: 10
```

Deterministic item statuses are trusted for Functionality. The model cannot override them. Code recomputes the 0–40 total from dimensions. All grades remain provisional until instructor finalisation.

## Gate timeline per section

All changes go through `lib/gates.resolveGate` and are audit-logged.

| Relative time | Target | State/action |
| --- | --- | --- |
| T-30 | `spage_3` and open materials | test exception only | instructor test-student verifies flow |
| 00:00 | `spage_3`, first five materials, `asg_s3_datamemo`, `assess_s3_data_v1` | open | draft/autosave; correctness hidden |
| 00:38 | challenge phase | checkpoint | snapshot completion; do not close assignment |
| 00:46 | `mat_s3_scale_manifest_v1`, schema, sample, data | open | section-specific reveal |
| 01:39 | `assess_s3_visuals_v1` + `mat_s3_visuals_a11y_v1` | open | one attempt in class; stable IDs retained under shuffle |
| 01:54 | `assess_s3_visuals_v1` | closed | attempt receipt only; feedback waits for the section/delivery window close |
| 01:58 | `asg_s3_datamemo` | submission reminder | remains open to the published section deadline |
| published deadline | assignment + mixed data assessment | closed | queued drafts preserved; no silent loss |
| after class, within 24h | portfolio external link | learner follow-up | exact label `Session 3 public-safe data memo`; public HTTPS URL must pass crawl |

Per-student exceptions support accessibility, outage and supervised recovery. The current Session 2 setup script must not relock or remove these gates/materials.

## Submission/version policy

- Version 1 is immutable after final submit.
- One instructor-authorised Version 2 correction window may open after provisional feedback or a documented technical incident.
- Version 2 starts from a copy of Version 1, records changed fields and retains both versions.
- Instructor finalises the counting version with a reason; no overwrite/delete.
- A dataset/key defect triggers a cohort-wide regrade and notification, not a learner penalty.

## Grading jobs

1. `validate_s3_objective` — deterministic, checksum/version-bound.
2. `inspect_s3_working` — static schema/column/null/output checks; no provider call.
3. `grade_s3_judgment` — queued through `lib/ai`; evidence-bound provisional scoring.
4. `grade_s3_visual_rationale` — queued formative feedback only.
5. `assemble_s3_grade` — recompute dimensions/total; enqueue review when configured confidence/flag/outlier/appeal rule matches.

No AI SDK/provider import appears outside `lib/ai`. Request handlers only validate, persist and enqueue. Student-derived context is bounded; code/output truncation is visible rather than silent. Dataset cells and learner text are wrapped as untrusted evidence.

## Review/finalisation UI

Instructor sees, side by side:

- dataset version/checksum status;
- deterministic item status and wrong-path code;
- learner formula/code and compact output;
- learner evidence quoted by the model;
- provisional dimension scores, confidence and flags;
- section distribution/outlier reason;
- Version 1/Version 2 diff;
- finalise/override with required reason.

Student sees provisional/final label, dimension feedback and next move. They never see prompt logs, private keys, confidence threshold, peer data or another learner's submission.

## Gallery and Praxy behavior

- `data-memo` remains `galleryEligible: false` because TrustMRR-derived values are private.
- No Session 3 answer, aggregate, dataset file, code output or screenshot enters the grade-free gallery.
- Portfolio completeness may reference only the separate public-safe method memo URL. The dataset-bound assessment remains excluded from public export; no value, row, screenshot, grade, confidence, flag or prompt log moves to Praxy.

## Notifications

| Event | Student copy |
| --- | --- |
| scale pack opens | “The large-file schema, sample and dataset are open for your section.” |
| autosave failure | “Your latest change was not saved. Copy your response, reconnect, and try again.” |
| final submit received | “Version 1 received. Keep this page open until file processing completes.” |
| grading delayed | “Your submission is safe. Feedback is still processing.” |
| provisional feedback ready | “Provisional feedback is ready. An instructor will finalise the artifact grade.” |
| correction window opens | “Version 2 is open until [time]. Your Version 1 remains unchanged.” |
| finalised | “Your Session 3 artifact grade and feedback are final.” |

System messages use no exclamation marks and expose no hidden score in push/email previews.

## Acceptance checks

- Idempotent setup preserves current Session 1–2 content and repeated runs do not duplicate/relock Session 3.
- Mixed numeric/tolerance/select/writeup/code/structured fields validate and autosave.
- Answer key cannot be fetched through any student path, preview, filename, export or error.
- Deterministic and Python/reference keys agree for every objective item.
- Version mismatch fails closed.
- Visual scenario results never affect best-three quiz logic.
- Low-confidence, any flag, percentile outlier and appeal reach review.
- Raw/derived TrustMRR data never reaches public gallery/Praxy/export.
- Session 3 replaces the canonical `data-memo` slot and requires both a scoreable graded/finalised artifact and the exact-label, crawl-live public HTTPS memo URL; no seventh `data-analysis` slot appears.
- The public memo is assigned after class with a 24-hour deadline, so the protected 120-minute run of show is unchanged.
- Presigned upload/download, file type/cap and section gate tests pass.
- Screen-reader, keyboard, outage and late-recovery flows pass.
