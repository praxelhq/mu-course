# Session 3 accessibility and outage fallbacks

**Principle:** change the access route, not the learning outcome or grade ceiling.

## Accessible equivalents

### Dataset and spreadsheet

- Provide CSV plus an accessible HTML data dictionary with a real heading/table structure.
- Freeze headers, use explicit cell labels and avoid merged cells in the supported Sheet.
- Do not encode missingness, validity or answer status by colour alone.
- Provide a column-letter map and plain-language field definitions.
- For screen-reader users, offer a bounded query worksheet where every input/output cell is labelled; pivot output also exports as a simple table.
- Permit keyboard-only formula entry and a text-based local/Python route.

### Colab/notebook

- Put prose before each code cell: purpose, expected input and expected output.
- Keep cells short and sequential; no answer depends on dragging a visual control.
- Echo assertions and counts as text.
- Provide a `.py` equivalent and terminal instructions for learners who cannot use the notebook interface.
- Accept dictated reasoning transcribed to text. Grade content, not typing speed.

### Visualizations

- Every chart includes title, axes, units, sample size and a text summary of pattern and caveat.
- Provide a data table/text alternative for each `S3-VIZ-*` scenario.
- Do not name answer choices by colour or position alone; use A–D and chart names.
- Rationale may be typed, dictated or recorded and transcribed.
- Timer warnings are spoken and written; an accommodation gate can extend time without exposing answers.

## Outage matrix

| Failure | Classroom response | Evidence remains |
| --- | --- | --- |
| One AI assistant unavailable or out of credits | Use another assistant, a TA-provided prompt critique, or the supplied formula/code skeleton. Tool choice is not scored. | formula/code, output, verification trace |
| All model access unavailable | Learners use supported formulas/pivot or complete the schema-to-method design manually; instructor provides generated starter only after method is written. | same query contract and two-method proof |
| Google Sheets unavailable | Use LibreOffice/Excel equivalent or the local Python runner. Provide formulas in generic pseudocode if syntax differs. | working, counts, output |
| Colab unavailable/quota-limited | Run the supplied `.py` file locally or on the instructor machine against a learner-selected query parameter; return compact output. | code, assertion log, output |
| LMS unavailable during challenge | Use the numbered offline answer sheet; timestamp locally; upload when service returns. Do not email private rows. | same IDs and fields |
| S3/material storage unavailable | Use checksum-verified encrypted/local copies distributed in class; record fallback manifest ID. | source binding preserved |
| Projector fails | Instructor reads hook and instructions; learners use accessible handout. Skip no assessed work. | learner screens/handout |
| Network fails section-wide | Run small-file challenge and formula path offline; use precomputed large-file execution log for interpretation, clearly labelled as demonstration. Schedule actual scale execution as recovery. | small-file artifact now; scale trace later |
| Grading worker/model unavailable | Accept and queue submission; show “received, feedback pending”; deterministic checks may run, but no provisional total is released until complete. | immutable submission/version |

Never solve an outage by making a private dataset publicly downloadable, turning off checksum binding, proxying file bytes through the app tier, or finalising an unreviewed AI grade.

## Time/access accommodations

- Use per-student gate exceptions through the existing gate system; do not create an easier alternate item.
- A learner who receives extra time sees the same dataset version, item IDs and rubric.
- If fatigue or assistive-technology needs make the 22-minute sprint inappropriate, split it into two gated blocks without feedback between them.
- Permit an approved scribe, speech-to-text or structured oral response for judgment items; objective values and method still originate with the learner.

## Late or absent learner recovery

Run a 75-minute supervised recovery within the published window:

1. 5 minutes — privacy/source contract and hook recap.
2. 22 minutes — same small-file question set and dataset version.
3. 8 minutes — recorded context-wall explanation and route choice.
4. 20 minutes — supported formula or Colab path.
5. 8 minutes — independent verification trace.
6. 10 minutes — same visualization scenario check with options order rotated.
7. 2 minutes — submit.

If the original dataset version has been corrected, use the new version for everyone and apply the documented cohort-wide regrade path; do not give late learners a silent different key.

## Incident record

For each section, record timestamp, affected gate/material/service, number affected, fallback invoked, duration, any assessment impact and remediation. Do not record private answer values or learner dataset rows in the incident log.

