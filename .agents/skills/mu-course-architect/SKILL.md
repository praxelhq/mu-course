---
name: mu-course-architect
description: Shape and maintain the Masters' Union Applied AI for Business Course 1 story, scope, student transformation, course arc, evidence model, assessment alignment, and portfolio promise. Use for course-level redesigns, outcome changes, session-arc changes, or decisions about what students see, do, submit, and carry into Praxy.
---

# MU Course Architect

Maintain a coherent, build-first Course 1 for 480 PGP students across eight sections. Optimize for judgment, craft, radar, and trustworthy proof of work.

## Resolve current authority first

1. Read `lms/docs/build/SOURCE_OF_TRUTH.md`.
2. Read the controlling brief for the affected sessions. For Sessions 3-5, read `lms/docs/build/10_sessions_3_5_redesign_brief.md`.
3. Read `lms/docs/build/04_course_outline_COT_v3.md`; it is the frozen macro course contract.
4. Read `lms/docs/build/01_scoring_methodology.md` for assessment and `lms/docs/DECISIONS.md` for later implementation decisions.
5. Use root `docs/` only when the source-of-truth file explicitly retains an idea. Do not silently restore the superseded Role-Ready Operator arc.
6. Label every claim Directed, Authored, Validated, Piloted, Loaded, Deployed, or Rehearsed. Never collapse these states.

A current explicit user instruction may supersede a repository brief. Record the replacement in the controlling brief and append-only decision log before propagating it.

## Preserve the current course contract

- 20 live hours: ten 120-minute sessions.
- Eight sections, 50-60 students each, 480 total.
- Eight teams per section; one unique industry per team across the cohort.
- Longitudinal spine: industry map, real-company process, useful automation, individual artifacts, and a trustworthy Praxy-bound profile.
- Three pillars: Judgment, Craft, Radar.
- Shared method: frame, decompose, match capability, choose a tool with a reason, execute/iterate, verify.
- Seven grade components from the scoring methodology; grades stay inside the LMS.
- Current Sessions 3-5 progression: analyze data with escalating methods, build and publish a Lovable app, then design and run a Make.com revenue-supporting workflow.

Treat named tools as dated, approved teaching choices. Preserve the capability and provide a viable fallback, but do not abstract Lovable or Make.com out of lessons whose approved outcome depends on them.

## Shape course decisions

For each affected session make these layers explicit:

- **Promise:** the useful change students should feel.
- **See:** the instructor proof or reveal.
- **Do:** the consequential decision or build.
- **Ship:** the exact LMS evidence.
- **Prove:** how correctness, ownership, and verification are observed.
- **Carry:** how the work strengthens the industry track or Praxy profile.

Pressure-test every decision against mixed technical confidence, free-plan access, 120 minutes, eight-section consistency, assessment fairness, public/private data boundaries, intellectual-property risk, and recruiter legibility.

The course runs before students choose a career stream. Audit whether the course as a whole creates evidence for all nine streams; do not manufacture nine cosmetic variants for every session. Invoke `$mu-map-career-streams` when the course-wide evidence map or a role-specific brief changes.

## Output

Update the smallest authoritative set:

- course structure changes: COT v3 plus the source-of-truth/decision record;
- session replacements: the active session brief and course context;
- assessment changes: scoring methodology and gradebook implementation contract;
- learning outcomes: stable outcome/evidence crosswalk;
- LMS requirements: implementation delta, not a greenfield fantasy;
- open risks and assumptions, including current tool limits and data rights.

Hand approved session outcomes to `$mu-plan-lessons`, LMS deltas to `$mu-design-lms`, and the completed package to `$mu-validate-learning-assets`.
