---
name: mu-create-quizzes
description: Create Course 1 diagnostics, surprise quizzes, scenario checks, mixed objective/subjective data questions, visualization-judgment items, answer keys, feedback, scoring rules, and AI-grader calibration fixtures. Use when assessment evidence must map to the current COT v3 and Forge LMS.
---

# MU Quiz Builder

Measure change in understanding and judgment while keeping build artifacts as the primary evidence.

## Resolve the assessment contract

Read `lms/docs/build/SOURCE_OF_TRUTH.md`, the active lesson, `01_scoring_methodology.md`, current quiz/submission implementation, and relevant grader/eval code. The current continuous-evaluation rule is best three surprise-quiz percentages for 5% of the final grade. Preserve diagnostic isolation: never expose instructor-only diagnostic status or counting logic on a student surface.

Classify each assessment as diagnostic, formative feedback, counted surprise quiz, graded artifact question set, or retention check.

## Blueprint before writing

Map every item to:

- outcome and exact evidence;
- response type;
- deterministic versus model-assisted evaluation;
- difficulty and cognitive demand;
- estimated time;
- student feedback;
- LMS route and evaluator-only data.

Use the existing MCQ quiz engine only for single-answer multiple choice. Route or specify an implementation delta for:

- numeric answers with units/tolerance;
- formula/expression answers;
- multi-part data questions;
- free-response reasoning;
- chart-selection plus rationale;
- uploaded evidence or code/output traces.

Objective facts should be computed from a versioned answer key and deterministic validator. Subjective answers may receive rubric-bound provisional AI scoring that quotes/cites the submitted evidence, reports confidence and flags, and remains reviewable/finalisable by an instructor.

## Item requirements

For every item include:

- stable item/outcome/dataset-version IDs;
- prompt and response format;
- correct answer or anchored response bands;
- accepted units, rounding, tolerance and edge cases;
- rationale and common wrong-path diagnosis;
- why distractors are plausible where applicable;
- difficulty and time;
- immediate/delayed feedback copy;
- stale-content flag and T-7 check where tool behavior matters.

For dataset questions, store the exact query/formula/script used to generate the key and test it against the frozen dataset checksum. For subjective graders, include pass/fail exemplars, prompt-injection fixtures, low-confidence examples, disagreement cases, and expected score bands. Do not leak keys through filenames, previews, APIs, exports, or model context available to students.

## Output

Return the quiz blueprint, student form, evaluator-only key, scoring/feedback rules, mastery threshold, retake/counting policy, LMS schema delta, calibration fixtures, and quality checks. Validate equivalent difficulty across sections without requiring nine cosmetic career variants.

Send the assessment package to `$mu-validate-learning-assets` before loading.
