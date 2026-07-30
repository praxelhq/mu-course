# Sessions 3–5 delivery pack

These files are generated from the authored packages under `../course/`.
Regenerate learner assets with `../scripts/collateral/build_all_learner_collateral.sh`,
the manual with `../scripts/collateral/build_instructor_manual.sh`, and the decks
with `build_sessions_3_5_decks.mjs`; do not hand-edit generated binaries.

## Instructor delivery

- [`decks/session-03-working-with-data-using-ai.pptx`](decks/session-03-working-with-data-using-ai.pptx)
  and [PDF](decks/session-03-working-with-data-using-ai.pdf)
- [`decks/session-04-a-30k-clue-is-not-a-build-brief.pptx`](decks/session-04-a-30k-clue-is-not-a-build-brief.pptx)
  and [PDF](decks/session-04-a-30k-clue-is-not-a-build-brief.pdf)
- [`decks/session-05-revenue-systems-with-make.pptx`](decks/session-05-revenue-systems-with-make.pptx)
  and [PDF](decks/session-05-revenue-systems-with-make.pdf)
- [`manuals/sessions-03-05-instructor-manual.docx`](manuals/sessions-03-05-instructor-manual.docx),
  [PDF](manuals/sessions-03-05-instructor-manual.pdf), and
  [Markdown source](manuals/sessions-03-05-instructor-manual.md)

## Learner assets

- [`session-03/session-03-colab-starter.ipynb`](session-03/session-03-colab-starter.ipynb)
- [`session-03/session-03-formula-pivot-planner.xlsx`](session-03/session-03-formula-pivot-planner.xlsx)
- [`../course/session-03/public-safe-portfolio-data-memo-template.md`](../course/session-03/public-safe-portfolio-data-memo-template.md), the post-class method-only portfolio companion
- Session 3 checksum-bound offline runner, answer sheet, lab HTML/PDF, manifest and private-runtime validation in [`session-03/offline`](session-03/offline) and [`session-03`](session-03)
- Learner-safe quiz JSON/CSV and accessible scenario artifacts in [`quizzes`](quizzes)
- Instructor-only answer keys and key-bearing validation are generated only on the secure release workstation under the ignored `instructor/quizzes/` path.
- Session 5 sample chronology/state validation in [`session-05`](session-05)

The ignored `instructor/quizzes/INSTRUCTOR_ONLY_quiz-keys.v1.json` is neither a learner download nor a Git/Docker asset. The LMS loads quiz contracts by stable item/option IDs, keeps them dormant until an
instructor explicitly classifies and publishes them, and delays answer feedback
until the configured cross-section release.

## Private data boundary

The TrustMRR learner files, scale file, schema, manifest, fact pack, and evaluator
adapter are intentionally absent from this directory. They live in the ignored,
roster-gated release path under `../private/course-data/` and are uploaded only
by the explicit Sessions 3–5 reconciler.
