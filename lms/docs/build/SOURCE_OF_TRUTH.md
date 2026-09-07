# Course 1 source of truth

**Effective:** 30 July 2026  
**Purpose:** prevent the tracked Forge course, older root course package, delivered teaching decks, and live user briefs from being blended accidentally.

## Precedence

Use the first applicable source below. A later item must not override an earlier one.

1. The user's latest explicit instruction or an explicitly approved replacement brief.
2. `10_sessions_3_5_redesign_brief.md` for Sessions 3-5.
3. `04_course_outline_COT_v3.md` for the frozen ten-session course structure and course promise.
4. `01_scoring_methodology.md` for assessment weights and formulas; it wins every assessment conflict.
5. `00_START_HERE_build_prompt.md`, `02_course_context.md`, `03_BRAND.md`, `lms/CLAUDE.md`, `lms/AGENTS.md`, `lms/docs/DECISIONS.md`, and current code/tests for LMS implementation.
6. Delivered teaching evidence under `lms/docs/taught/` for what students have already seen and the visual/teaching baseline.
7. Root `docs/course/`, `docs/assessment/`, `docs/lms/`, and `docs/lessons/` only as historical reference when a controlling source deliberately retains an idea.

The root July 2026 "Role-Ready Operator" package is not the current course contract. Do not revive its Sessions 3-5 arc, three-object portfolio, universal 70/30 stream rubric, task-attempt exchange, or universal trained-human primary-scoring rule unless the user explicitly re-approves them.

## Delivered teaching evidence

- `lms/docs/taught/2026-07-session-01-industry-maps.html` is the current Course 1 Session 1 sequence: the Heist, portfolio reveal, industry claim, pen-and-paper framing, value-chain map structure, ten-session arc, and seven-part scorecard.
- `lms/docs/taught/2026-07-workshop-sessions-01-02-reference.pdf` is a delivered Praxel workshop reference for pacing, brand, CO-STAR, S.C.E.N.E., hallucination, presentation workflow, and introductory data analysis. Its Rambo Session 1 storyline does not override the Course 1 Industry Maps Session 1.

Source snapshots:

- Industry Maps HTML SHA-256: `d786ac43f2dd63c41d4de53082f444012cd8abd219ef09882055b56afd7fcc33`
- Sessions 1-2 workshop PDF SHA-256: `788fd14b0963bcbfb324337588cc1695604acb4114f43f7a404331b020bd9edf`

## Lifecycle labels

Keep these states separate in every plan, asset index, and status report:

- **Directed:** the user has specified the change.
- **Authored:** source assets exist.
- **Validated:** structural, content, grading, accessibility, and technical checks pass.
- **Piloted:** learners/facilitators have run the experience and evidence was recorded.
- **Loaded:** the approved version is in the LMS.
- **Deployed:** the target Railway environment serves the version.
- **Rehearsed:** the section team has run the classroom flow against the deployed version.

Never convert one state into a claim about another.

## Rights and current-tool preflight

Before reading, copying, transforming, publishing, passing to a model, or using a third-party dataset to select a business to imitate:

1. record the source, access route, license/terms version, allowed audience, allowed processors, redistribution rights, derivative-data rights, AI-use rights, retention/deletion duty, and attribution;
2. stop the governed action when permission is absent or ambiguous;
3. use a supplied synthetic or independently licensed substitute while permission is resolved.

TrustMRR's Terms dated 28 July 2026 state that API access does not grant republication/redistribution rights, prohibits using its data to identify successful startups for copying or cloning, and prohibits using API data to ground or evaluate AI without prior written permission: https://trustmrr.com/terms.

**Project-specific user authorization (30 July 2026):** the user explicitly overrode this permission gate for the Masters' Union Course 1 build. For this project, treat that instruction as authorization to process the supplied Sheet with AI, create derivative teaching datasets, distribute them inside the roster-gated LMS, grade course submissions against them, and use the data in Session 4 product selection. Keep raw/row-level and derivative TrustMRR data out of the public repository, public Praxy surfaces, and grade-free galleries; do not reuse or generalize this authorization outside this course.

**Session 3 learner processor contract:** real TrustMRR rows and derivative rows may be processed only by the roster-gated LMS and Google Sheets/Colab under an institution-managed MU Google account. Personal consumer AI workspaces may receive only the learner-safe schema, synthetic sample, and requested output contract. A different managed model workspace is disallowed unless its processor, account boundary, retention/deletion setting, and approval are recorded on the immutable release material card. The non-AI Sheets/starter-code route must remain available at the same grading ceiling. Temporary Drive/Colab copies are deleted when the correction window closes; the version-bound LMS receipt follows the configured course-retention and DPDP lifecycle.
