---
name: mu-design-lms
description: Design or extend the Masters' Union Course 1 Forge LMS for session hubs, gated materials, schema-driven submissions, mixed assessments, provisional AI grading, review/finalisation, versioned evidence, galleries, portfolios, facilitator controls, telemetry, and Railway delivery. Use before or during implementation of learning-product changes.
---

# MU LMS Designer

Extend the deployed Forge; do not redesign a hypothetical Mission Room when the current product already supplies the platform shell.

## Resolve implementation truth

Read, in order:

1. `lms/docs/build/SOURCE_OF_TRUTH.md` and the active brief;
2. `lms/AGENTS.md`, `lms/CLAUDE.md`, and relevant local Next.js 16 documentation;
3. `lms/docs/DECISIONS.md`, Prisma schema, migrations, setup/seed scripts, affected routes/components/libs/workers and tests;
4. COT v3, scoring methodology and brand reference.

Start with an implementation-delta audit: what already exists, what is stale, what is coupled, and the smallest safe extension. Keep non-obvious decisions in the append-only LMS decision log.

## Preserve current invariants

- Next.js App Router + TypeScript, Prisma v6/Postgres, pg-boss, Clerk, private S3 and Railway services.
- Forward-only migrations.
- Artifact kinds, rubrics and forms are data-defined `AssignmentType` records; reuse the generic submission form first.
- AI providers live behind `lib/ai/`; grading runs in workers, never request handlers.
- AI grades are immediate and provisional. Low-confidence, flagged, outlier or appealed work enters human review; instructors override/finalise with an audit trail.
- User-controlled URLs use `lib/net/safe-fetch`.
- Browser-to-S3 uploads/downloads use presigned URLs; the app tier does not proxy student file bytes.
- Availability resolves only through `lib/gates`.
- Galleries and Praxy exports contain no grades, confidence, prompt logs, credentials or private company data.
- Diagnostic isolation and roster/role/ownership checks remain structural.
- Praxel brand: Parchment, Pine, Ochre, zero radius, no gradients/shadow hierarchy.

## Design the learning loop in the product

Connect context/retrieval, prediction, gated input, build, failure/reveal, repair, evidence submission, rubric feedback, revision, gallery/portfolio capture, and instructor finalisation.

Specify:

- learner/instructor/admin journeys and empty/loading/error/locked/closed states;
- entities, cardinality, immutable version binding and actor permissions;
- legal and illegal transitions, idempotency and audit events;
- deterministic validators versus model-assisted evaluation;
- hidden keys/reveals and private/public evidence boundaries;
- section isolation, absence/late routes and accessibility fallback;
- failure recovery for network, model, queue, storage, connector and external-site outages;
- telemetry tied to learning/operations, not prompt volume or time-on-task;
- seed/setup/loading path, rollback/recovery path and Railway release checks.

For Sessions 3-5, explicitly address mixed data-question types, dataset manifests/checksums, controlled app V1/V2 resubmission, source-product/acceptance-test evidence, flowchart-first workflow feedback, Make blueprint/log parsing, workflow PNG vision, clone/sample-output gallery actions, and hard-coded gradebook/portfolio slug or rubric-key coupling.

## Implementation handoff

Produce an implementation-ready delta with requirement IDs, affected files, migration/data-loading plan, tests, grading-eval fixtures, browser checks, rollout/rollback, and deployment verification. Use `compound-engineering:ce-work` for code changes and its review/shipping tail. Do not claim Loaded or Deployed until the exact Railway environment is verified.

Hand genuine simulator behavior to `$mu-design-simulators`, item content to `$mu-create-quizzes`, and the finished learning-product change to `$mu-validate-learning-assets`.
