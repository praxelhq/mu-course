# Session Package Release Contract

**Applies to:** Masters' Union Applied AI for Business — Course 1  
**Unit:** each 120-minute session  
**Scale assumption:** 480 learners, eight sections, mixed technical confidence  
**Release bar:** classroom-ready source assets and implementation-ready LMS specifications; institutional approvals and software implementation remain separate gates.

## The promise of every two-hour class

An initially uninterested student should be able to answer all five questions by the end:

1. **Why did this matter?** A consequential business decision created tension in the first ten minutes.
2. **What did I do?** I made a prediction, used evidence, built or operated a mechanism, and made a decision.
3. **What surprised me?** A visible contrast, failure, stakeholder response, or changed requirement overturned a plausible first answer.
4. **What did I learn?** I can name and transfer one durable capability without relying on a specific product UI.
5. **What can I show?** I have inspectable evidence that advances my role-ready portfolio and can survive a two-minute recruiter proof.

A session fails this contract if its main learner action is listening, copying an instructor output, filling a generic prompt template, or polishing an artifact that has no ownership test.

## Required learner loop

Every session implements this complete loop:

`hook → prediction → mechanism → guided attempt → consequential choice → injected failure/change → diagnosis and repair → unseen transfer → evidence capture → bridge`

At least 60 minutes must be protected for learner action. The hook may use a case, live result, AI persona, or business incident, but exposition before the first learner commitment may not exceed 12 minutes.

## Required source assets

Each `docs/lessons/session-*` directory must contain the existing `lesson-plan.md` and `quiz.md` plus:

| File | Minimum contract |
| --- | --- |
| `session-contract.md` | learner promise; observable outcome; evidence; portfolio contribution; capability IDs; validator IDs; prerequisites; session dependencies; common mechanism |
| `prework.md` | 15–30 minute cap; compelling source or supplied snapshot; prediction/retrieval task; no paid account; completion evidence; accessible alternative |
| `student-brief.md` | role, stakes, supplied inputs, task, constraints, success/failure conditions, submission steps, public/private boundary, non-affiliation language |
| `student-handout.md` | minute-labelled working surfaces; prediction; decisions; build checkpoints; test log; failure diagnosis; reflection; portfolio receipt |
| `instructor-runbook.md` | setup; intent; exact timings; hook/demo moves; prompts; expected responses; misconceptions; room checks; reveal timing; recovery; debrief; section-consistency notes |
| `slide-outline.md` | action-first slide sequence with exact purpose, visual/input, learner prompt, reveal, speaker move, and timing; lecture slides stay subordinate to the build |
| `demo-script.md` | smallest reproducible demo; setup state; normal run; failure run; repair; transfer; narration; assets; screenshots/static replay fallback |
| `source-pack.md` | case provocation; public/licensed source links and dates; supplied excerpt/snapshot guidance; instructor fact notes; synthetic-data notices; staleness/replacement owner |
| `content-packs.md` | eleven authentic pathway cards: nine streams with separate IB, VC, and Corporate Finance rows; stable IDs; role/mode; decision; owner/approver; evidence/data; schema; metric; rule; failure; action; boundary; proof |
| `simulator-spec.md` | mission state machine; learner actions; reveal rules; deterministic versus model-assisted feedback; hidden variant; reset/replay; scoring; facilitator controls; telemetry; non-AI classroom version |
| `solution-anchors.md` | pass/partial/fail/unsafe examples; 70% common and 30% pathway judgment anchors; likely scoring disagreement; moderation rule; no copy-ready final submission |
| `postwork.md` | retrieval/retention task; revision or field application; time cap; next-session bridge; evidence uploaded; optional extension |
| `lms-copy-events.md` | learner-facing mission/reveal/error/success copy; state transitions; evidence schema; canonical IDs; events; facilitator alerts; idempotency/retry notes |
| `accessibility-fallback.md` | keyboard/screen-reader/low-bandwidth alternatives; text/static equivalent; outage route; extra-time handling; facilitator activation rule; evidence parity |

Where structured inputs matter, include small, inspectable source files under `data/` or `fixtures/`. Synthetic records must be labelled in both the filename and file body, include a data dictionary or schema, and never imply access to the selected company's private systems.

## Content-pack authenticity

Every session provides the following eleven rows:

1. Consulting;
2. FOCOS;
3. Product Management;
4. Finance — Investment Banking;
5. Finance — Venture Capital;
6. Finance — Corporate Finance;
7. Human Resources;
8. Supply Chain and Operations;
9. Sales;
10. Marketing;
11. Data.

Each row must change at least four of these seven fields from another pathway: payload/schema, calculation/metric, decision rule, consequential failure, action/output, authority boundary, and verification evidence. Timing, scaffolding, common capability criteria, and evidence burden remain equivalent.

## The three kinds of feedback

Every learner receives:

- **mechanical feedback:** completeness, schema, calculation, citation, run, or policy checks;
- **judgment feedback:** rubric-bound coaching that cites the learner's submitted evidence and does not issue the final high-stakes score;
- **human/peer observation:** one bounded attack, review, or defence focused on behavior and reasoning, with a trained human retaining scoring authority.

Feedback must arrive soon enough to permit an in-session repair. Celebration follows a corrected consequential behavior—not a click, word count, or tool use.

## Anti-gaming and ownership

A released session must include all of the following:

- prediction captured before assistance;
- demonstration input different from assessed input;
- one hidden or changed-requirement fixture;
- a repair receipt showing before/after evidence;
- a clean-session transfer or bounded defence;
- provenance for sources, models, templates, synthetic data, and human edits;
- no grade benefit from paid tools, coding fluency, visual polish, company access, follower count, or external-user access.

## Cold-student experience gate

Score each dimension from 0–2 using `docs/reviews/cold-student-experience-rubric.md`. A session is internally releasable only when:

- no dimension scores 0;
- Hook, Agency, Consequence, Feedback, Learning, and Proof each score 2;
- total score is at least 22/26;
- all learning-asset validation blockers and majors are remediated;
- the supported route fits 120 minutes in a timed tabletop rehearsal.

## Release evidence versus dependencies

Source completeness does not claim that the LMS is implemented, institutional policy is approved, facilitators are staffed, or pilots have passed. Every asset therefore carries one of these evidence states:

- **Authored:** complete source content exists and links resolve.
- **Validated:** independent document audit passes with no blocker or major.
- **Piloted:** representative learners/facilitators completed it within time and comprehension thresholds.
- **Loaded:** version-bound content and fixtures are present in the LMS.
- **Rehearsed:** the real section stack, room, accounts, accessibility routes, and outage path passed.

The repository may reach Authored/Validated in this production run. Pilot, Loaded, Rehearsed, governance, staffing, and MU approval gates must remain explicit rather than being inferred from polished prose.
