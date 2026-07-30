# Session 3 instructor runbook

**Purpose:** make the lesson repeatable across eight sections without leaking private answers or turning facilitation into technical support.  
**Lifecycle:** Authored; rehearsal pending.

## Non-negotiables

1. Students work individually on graded answers, though they may discuss method after the first checkpoint.
2. Tool choice never affects the score.
3. Do not confirm answer values during the timed challenge.
4. Never display or paste TrustMRR row data on a public/shared surface.
5. A schema/sample designs a method; it never stands in for executing against the full dataset.
6. AI grades are provisional. Instructors finalise; low-confidence and flagged work enters review.
7. The teaching slice is deliberately stratified and edge-preserving, not population-representative. Reject claims about the full TrustMRR market unless the evidence explicitly supports them.
8. The public portfolio memo is a separate post-class task due within 24 hours. Do not trade in-class analysis or verification time for public-authoring time.

## Room roles

For each 50–60 learner section:

- **Lead instructor:** pacing, reveals, concept and debrief.
- **TA A:** formula/pivot lane; notes recurring errors.
- **TA B:** Colab lane; handles runtime/file problems without writing the analysis for the learner.
- **LMS operator** (may be lead): gates, test-student check, incident log.

If only one instructor is present, keep everyone on the formula lane for the live guided build and make Colab the extension/follow-up. The learning ceiling does not change because path choice is not the score.

## T-7 checklist

- Recompute every private objective key from the frozen source via the generator.
- Compare private spreadsheet and pandas solution outputs; resolve every mismatch.
- Confirm the final learner dataset version and checksum in the LMS copy.
- Confirm the large derivative has a reproducible token-count proof above 1,000,000 tokens and a clear `derived/synthetic` label where applicable.
- Inspect representative sample coverage: include blanks, zeros, a boolean, JSON arrays, at least one large-but-redacted numeric pattern, and quoted text containing punctuation. Do not hand-pick a sample that makes the graded result inferable.
- Run grader calibration fixtures, including prompt injection embedded in a free-text answer.
- Recheck Google Sheets, Colab and pandas links in the deck source ledger.
- Produce an offline folder per section: lab PDF, data dictionary, small learner CSV, schema card, sample, local notebook/script, visual quiz images plus text equivalents.
- Review the public-safe portfolio memo template and confirm its exact-label HTTPS link will be crawled; never use a TrustMRR screenshot or derived value as a public example.

## T-30 checklist

1. Log in as test student for the section.
2. Verify Session 3 is open; the large scale pack and visual check are closed.
3. Download the small dataset and compare SHA-256 to the private manifest.
4. Open the mixed assessment, type a draft, refresh, and confirm autosave.
5. Open the Colab copy link in an incognito profile and run all cells.
6. Verify the projector cannot expose instructor notes, answer pack, browser history or private filenames.
7. Put the fallback pack on the instructor machine and one encrypted USB/managed Drive location.

## Opening script

> “Last time, we treated a spreadsheet and an AI chat as two routes to insight. Today you will discover the choices hidden inside both routes. You can use any tool. Your score comes from the answer contract, the working and the verification—not the logo on the tool.”

> “This dataset is authorised for this roster-gated course. Keep rows and derived figures inside the course workspace. Your separate public memo describes the method, not the private numbers. It is a post-class task due within 24 hours; we will not use analysis time to write it.”

## Hook setup

Prepare two outputs for one **non-graded** metric:

- A: zeros included, missing values excluded;
- B: zeros excluded, missing values excluded.

Use the same unit and rounding so the denominator is the only visible difference. The reveal is not “AI is bad.” The reveal is “underspecified questions let a system choose policy silently.”

Ask in order:

1. Which would you send?
2. What evidence would change your mind?
3. What definition could make both results mechanically correct?
4. What should the prompt or formula have stated?

## Challenge facilitation

When a learner asks, “Is this right?”, do not answer yes/no. Use one prompt:

- “Show me the row grain and denominator.”
- “Which rows did you exclude?”
- “What does blank mean here?”
- “Where is the unit?”
- “Can your working be rerun after the file changes?”
- “What is one independent check?”

At minute 11, scan the instructor dashboard for draft completion only. Do not inspect or broadcast scores. If fewer than 70% have reached `S3-DATA-04`, extend the challenge by three minutes and remove those minutes from whole-room discussion, not verification.

## Context-wall reveal

Show these three pieces only:

1. over-context derivative filename and version;
2. byte size, token count and named counting method;
3. checksum.

Do not stage a theatrical upload that might unexpectedly succeed and undermine the lesson. If you demonstrate an upload, narrate that different products may accept, truncate, sample, transform or reject files differently. The claim is: **fitting is neither guaranteed nor sufficient for a reproducible analysis.**

## Lane management

### Formula lane

Success means the learner:

- states grain, inclusion rule, unit and rounding in the AI request;
- receives a formula rather than an answer;
- reads the formula and maps every referenced column;
- runs it in Sheets;
- verifies via pivot or a different formula;
- records the gap.

### Colab lane

Success means the learner:

- gives AI the schema, sample and output contract, not the private full dataset;
- inspects required columns and null policy in generated code;
- executes code against the gated full file;
- reads assertion and row-count outputs before the aggregate;
- exports a compact result and verification trace;
- does not share a notebook containing private outputs publicly.

### What does not count

- copying an AI's prose number without executable working;
- estimating a full result from the sample;
- two prompts to the same model with the same assumptions;
- a screenshot without a formula/code cell and dataset version;
- a result that cannot state its denominator.

## Visualization debrief

For every scenario, ask three questions:

1. What decision is the viewer trying to make?
2. What data shape matters: category, distribution, relationship, time or part-to-whole?
3. What guardrail prevents the chart from exaggerating or hiding the data?

Avoid “chart rules” without context. A bar chart is not universally better than a pie; it is better here because comparison across many categories is the task. A scatter plot does not prove causation. A line chart requires an actual ordered time dimension.

## Instructor-only reveal boundary

Never place the following in student materials, chat, deck notes visible during presenting, LMS preview metadata or filenames:

- objective answer values;
- private aggregate rankings or outlier identities;
- evaluator prompts or calibration fixtures;
- rubric scores, confidence thresholds or prompt logs;
- the exact representative-sample sampling seed before all sections complete;
- grader flags and review-queue reasons attached to a named learner.

## Multi-section calibration

After each section, record only aggregate facilitation evidence:

- median completion time by question ID;
- objective item facility and most common wrong-path code;
- distribution of rationale rubric bands;
- number and class of technical incidents;
- number of low-confidence/flagged responses;
- minutes gained/lost against the run sheet.

Do not change answer tolerances, prompts, sample, or rubric mid-cohort. Urgent factual correction requires a version bump, an incident note, the same correction for every remaining section, and a fair regrade path for prior sections.

## Close script

> “You did not prove that one AI is good at data. You proved that you can frame a query, place computation where the data lives, and audit the result. Next session, we use evidence to choose what to build—and a feature contract to stop a one-hour app build from becoming wishful thinking.”

Point to `public-safe-portfolio-data-memo-template.md`, the exact link label `Session 3 public-safe data memo`, and the 24-hour post-class deadline. Learners should record the task now and begin it after class. Remind them that no TrustMRR row, derived value or screenshot may appear in the public memo.
