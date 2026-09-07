# Sessions 3–5 Railway release runbook

**Status:** authored; not executed  
**Last verified:** 30 July 2026  
**Production project:** `praxel-lms-forge`  
**Safety posture:** all Sessions 3–5 gates stay locked until the relevant classroom-readiness receipt is signed.

## Current blockers

1. The Railway project has production services but no persistent `staging` environment.
2. A historical Clerk development secret appeared in repository history. The working-tree value is redacted, but the credential owner must rotate it, prove the prior value is rejected, and provide a real sign-in/webhook smoke receipt. Deployment verification does not substitute for that incident action.
3. The new additive migration, loaders, queue canaries, privacy probes, and classroom receipts must pass before production promotion.
4. Historical generated-object references created before exact S3 `VersionId` tracking need an inventory and reconciliation receipt. A user/team with an unresolved key-only file, audio, screenshot, preview, or analogous generated artifact is not eligible for automated erasure; do not substitute an unversioned delete.
5. The forward migration intentionally enforces stricter DPDP/object-write invariants than the previous images understand. Until an explicit previous-image compatibility canary proves otherwise, rollback must place admin DPDP erasure and retention deletion in a declared outage state rather than running old cleanup code against the forward schema.
6. Exact quiz keys, expected workflow results, evaluator bundles, and instructor reveals are deliberately absent from Git and Docker. Restore them only on a secure release workstation, run `pnpm check:evaluator-boundary:release`, and execute the one-off loader from that workstation. A build or deployment that contains any protected source file is a release failure.
7. Completed DPDP receipts currently use receipt-salted SHA-256 identity digests. The salt is stored with the receipt, so low-entropy names or enumerable institutional addresses remain dictionary-recoverable. Production promotion requires privacy/legal approval of that residual data or a reviewed keyed-HMAC design with documented key rotation and recovery.
8. Session 4 deliberately promises a frozen core-journey vertical slice, not unverified parity with every mature Liinks behavior. A human product owner must sign the 18-test acceptance receipt and the learner-facing wording before promotion.
9. Sessions 3–5 are authored and technically validated, but remain unpiloted and unrehearsed. One synthetic staging rehearsal and one representative learner/instructor pilot must be signed before any cohort gate opens.

Do not duplicate production into staging before the credential rotation. Railway's duplicate-environment flow copies services, variables, and configuration; create an empty isolated staging environment or rotate/sanitize first.

## Authoritative Railway behavior

- Persistent environments isolate service configuration; a duplicated environment copies services, variables, and configuration and stages them for review before deployment.
- Docker builds receive Railway variables only when the Dockerfile declares the required `ARG`.
- GitHub-triggered deployments expose `RAILWAY_GIT_COMMIT_SHA`; the image must bake it into `BUILD_SOURCE_SHA` during build, not trust a mutable runtime release label.
- Each environment receives isolated bucket credentials when Railway buckets are used.

Sources: [Railway environments](https://docs.railway.com/environments), [Railway CLI environments](https://docs.railway.com/cli/environment), [Dockerfiles and build variables](https://docs.railway.com/builds/dockerfiles), [Railway variables reference](https://docs.railway.com/variables/reference), [storage buckets](https://docs.railway.com/storage-buckets).

## 1. Pre-release evidence

- [ ] Exact source commit reviewed and cleanly reproducible.
- [ ] Full test, typecheck, lint, build, grading evaluation, loader-order, browser, privacy, and migration suites pass.
- [ ] `DATABASE_URL` points to an explicitly disposable migrated Postgres database and `CONFIRM_DISPOSABLE_POSTGRES=1 pnpm test:release:postgres` passes with no skipped live suite. Never source the production `.env` for this command; the wrapper refuses to fall back to it.
- [ ] Independent correctness, security, data-migration, reliability, and API-contract reviews have no unresolved P1/P2 finding.
- [ ] Clerk incident-closure receipt is complete; neither current tree nor reachable history contains a usable credential.
- [ ] Production Postgres snapshot/backup is current and restorable.
- [ ] Private course objects are content-addressed and their local/uploaded SHA-256 values match.
- [ ] `pnpm check:evaluator-boundary` passes in the reviewed checkout; `pnpm check:evaluator-boundary:release` passes only on the secure loader workstation. Protected files are absent from Git history for this release and from every Docker layer.
- [ ] Every historical generated-object key has either one reconciled immutable `VersionId` receipt or an explicit legal/operational hold; the unresolved count is zero for any DPDP-eligible subject.
- [ ] Every owned S3–S5 assignment has zero unbound legacy submissions. If any exist, archive or migrate its historical schema/rubric explicitly; the reconciler must stop before uploading objects.
- [ ] All governed S3–S5 parent, material, assessment, assignment, exception, and grant states are audited; no unintended opening exists.

## 2. Create isolated staging

Preferred: create an **empty** persistent `staging` environment, then sync only reviewed service configuration. Provision a separate Postgres and private bucket. Use non-production Clerk, provider, LiveKit, S3, and webhook credentials with synthetic users/data.

Example operator command after approval:

```sh
railway environment new staging
```

Do not paste secrets into shell history, the runbook, CI logs, or receipts. Configure them through Railway's variable UI/approved secret channel. Keep production domains and buckets out of staging references.

## 3. Deploy staging from one commit

1. Build web, worker, and agent from the exact reviewed commit.
2. Confirm each Dockerfile bakes `RAILWAY_GIT_COMMIT_SHA` into the artifact as `BUILD_SOURCE_SHA`.
3. Enter a declared generated-object maintenance window. Stop the previous web, worker, and agent images before migration so no previous screenshot, preview, interview recording, TTS, student-audio, or analogous writer can touch the forward schema. Keep learner gates locked and these write paths visibly unavailable.
   Before migrating, run the following from the release connection and save the result. Expected: no web/worker/agent client, no active non-operator transaction, and only explicitly approved Railway monitoring/operator rows. An unexplained row is a stop condition.

   ```sql
   SELECT pid, usename, application_name, client_addr, state,
          wait_event_type, wait_event, xact_start, query_start
   FROM pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND backend_type = 'client backend'
   ORDER BY application_name, pid;

   SELECT COUNT(*) AS active_non_operator_transactions
   FROM pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND backend_type = 'client backend'
     AND state IS DISTINCT FROM 'idle';
   ```
4. Scale the new staging web to one replica. Its production entrypoint is the only migration owner and runs `prisma migrate deploy` once.
5. Run the post-migration SQL below and capture its complete result set. Then deploy/scale the new worker and agent from the same reviewed commit. Do not restart any previous image against the forward schema.
6. From the secure release workstation, run `pnpm check:evaluator-boundary:release`, then run the Sessions 3–5 loader as an explicit one-off. Run the relevant slice twice, then run narrowed Session 2 setup in both orders. It must not alter learner records, published versions, or existing gate state. Never copy evaluator-only source files into a Railway image or repository checkout.
7. Upload/register private dataset files by content-addressed key; compare object metadata/checksum without exposing contents.

### Post-migration SQL receipt

Run these read-only checks with the release database role. Attach the rows and counts to the signed release record. Any unexpected row is a stop condition.

```sql
-- Expected: one row named pgcrypto.
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';

-- Expected: 0. Every new NOT VALID constraint must have been validated.
SELECT COUNT(*) AS unvalidated_public_constraints
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND NOT c.convalidated;

-- Review the distribution. Diagnostic rows must have isDiagnostic=true;
-- only finalised summative rows may count toward best-of.
SELECT classification, "isDiagnostic", "countsTowardBestOf",
       ("classifiedBy" IS NOT NULL) AS finalised, COUNT(*)
FROM "Quiz"
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;

-- Expected: 0 for owned Sessions 3-5 rows after reconciliation.
SELECT COUNT(*) AS unbound_sessions_3_5_submissions
FROM "Submission" s
JOIN "Assignment" a ON a.id = s."assignmentId"
WHERE a."sessionNo" IN (3, 4, 5)
  AND (s."assessmentVersionId" IS NULL OR s."ownerKind" IS NULL OR s."ownerId" IS NULL);

-- Expected before opening a cohort: 0 rows. Every S3-S5 target is locked.
SELECT g."targetType", g."targetId", g."sectionId", g.state
FROM "Gate" g
WHERE g.state <> 'locked'
  AND (
    (g."targetType" = 'session' AND EXISTS (
      SELECT 1 FROM "SessionPage" p
      WHERE p.id = g."targetId" AND p."sessionNo" IN (3, 4, 5)
    ))
    OR (g."targetType" = 'material' AND EXISTS (
      SELECT 1 FROM "Material" m
      WHERE m.id = g."targetId" AND m."sessionNo" IN (3, 4, 5)
    ))
    OR (g."targetType" = 'assignment' AND EXISTS (
      SELECT 1 FROM "Assignment" a
      WHERE a.id = g."targetId" AND a."sessionNo" IN (3, 4, 5)
    ))
    OR (g."targetType" = 'quiz' AND EXISTS (
      SELECT 1 FROM "Quiz" q
      WHERE q.id = g."targetId" AND q."sessionNo" IN (3, 4, 5)
    ))
  );

-- Expected before opening a cohort: 0 rows. No learner-specific bypass exists.
SELECT ge.*
FROM "GateException" ge
WHERE (ge."expiresAt" IS NULL OR ge."expiresAt" > now())
  AND (
    (ge."targetType" = 'session' AND EXISTS (
      SELECT 1 FROM "SessionPage" p
      WHERE p.id = ge."targetId" AND p."sessionNo" IN (3, 4, 5)
    ))
    OR (ge."targetType" = 'material' AND EXISTS (
      SELECT 1 FROM "Material" m
      WHERE m.id = ge."targetId" AND m."sessionNo" IN (3, 4, 5)
    ))
    OR (ge."targetType" = 'assignment' AND EXISTS (
      SELECT 1 FROM "Assignment" a
      WHERE a.id = ge."targetId" AND a."sessionNo" IN (3, 4, 5)
    ))
    OR (ge."targetType" = 'quiz' AND EXISTS (
      SELECT 1 FROM "Quiz" q
      WHERE q.id = ge."targetId" AND q."sessionNo" IN (3, 4, 5)
    ))
  );

-- Expected before opening a cohort: 0 rows. Canaries must consume/revoke grants.
SELECT rg.id, rg."assignmentId", rg."ownerKind", rg."ownerId", rg.kind,
       rg."targetVersion", rg."targetAttempt", rg."expiresAt"
FROM "ResubmissionGrant" rg
JOIN "Assignment" a ON a.id = rg."assignmentId"
WHERE a."sessionNo" IN (3, 4, 5)
  AND rg."consumedAt" IS NULL
  AND rg."expiresAt" > now();

-- Expected: 69 on this migration head. Capture the full inventory too.
SELECT COUNT(*) AS public_noninternal_trigger_count
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

SELECT t.tgname, c.relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY 1, 2;

-- Expected: 0. Completed parent receipts retain only the minimal digest form.
SELECT COUNT(*) AS malformed_completed_dpdp_receipts
FROM "DeletionReceipt"
WHERE "targetType" = 'dpdp-user'
  AND "databaseVerifiedAt" IS NOT NULL
  AND (
    jsonb_typeof(details->'identityDigests') <> 'array'
    OR details ?| ARRAY['targetUserId','email','confirmedEmail','clerkUserId','name','avatarUrl']
  );

-- Expected: 0. Raw prompts/responses were scrubbed and new writes are allowlisted.
SELECT COUNT(*) AS grade_prompt_metadata_with_forbidden_keys
FROM "Grade"
WHERE "promptLog" IS NOT NULL
  AND "promptLog"::text ~* '"(promptLog|providerResult|auditContext|system|userPrompt|prompt|response|raw)"[[:space:]]*:';

SELECT COUNT(*) AS audit_payloads_with_forbidden_top_level_keys
FROM "AuditLog"
WHERE (
    jsonb_typeof("before") = 'object'
    AND "before" ?| ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
  ) OR (
    jsonb_typeof("after") = 'object'
    AND "after" ?| ARRAY['promptLog', 'providerResult', 'auditContext', 'system', 'userPrompt', 'prompt', 'response', 'raw']
  );
```

Required runtime configuration before worker/agent scale-up:

- Web: secret `READINESS_TOKEN`; `/api/health` remains unauthenticated liveness and `/api/readiness` accepts only `Authorization: Bearer <token>`.
- Worker: `WORKER_HEARTBEAT_INTERVAL_SECONDS`, `RETENTION_CLEANUP_CRON`, and `RETENTION_CLEANUP_INTERVAL_SECONDS`. The image installs Debian's English Tesseract packages at build time; production startup fails when English OCR or the retention cadence is absent. Never download OCR language data at runtime.
- Agent: matching `AGENT_INTERNAL_TOKEN` on web and agent plus `AGENT_HEARTBEAT_INTERVAL_SECONDS`.
- Railway supplies deployment, snapshot, and replica IDs. Do not replace those or the baked SHA with a manually configured `RELEASE_SHA`.

The worker writes its heartbeat directly to Postgres. The agent has no database
access and uses the token-guarded internal endpoint. The scheduled retention
job writes a separate heartbeat with only aggregate counts; any unverified
deletion keeps readiness red and pg-boss retries the job. The worker heartbeat
also proves that local English OCR passed its startup probe; a fresh worker
without that capability keeps readiness red.

The retention worker's bucket role additionally needs `s3:ListBucketVersions`
on the private bucket and `s3:DeleteObjectVersion` on its object ARN. Bucket
versioning must be enabled. Do not grant public read or broad unversioned
delete as a substitute; cleanup resolves, persists, deletes, and verifies one
exact `VersionId`.

Submission reservations use a signed conditional PUT (`If-None-Match: *`) so
one presign cannot create extra object versions. The bucket must be a general-
purpose S3 bucket (not S3 Express/directory or Outposts), and its CORS policy
must allow `If-None-Match`, `Content-Type`, and the web origin. Enforce the
conditional header for the `submissions/` prefix in bucket policy as defense in
depth. The staging storage canary must prove first PUT = 2xx and an exact replay
of the same signed request = 409/412. Before production promotion, list legacy
submission keys once and quarantine/delete any non-receipted versions under the
normal exact-version retention receipt process.

Before the non-transactional object deletion, cleanup writes an incomplete
deletion-intent receipt while holding the same target/submission advisory locks
used by the legal-hold trigger. Completion updates that receipt only after S3
and database verification. A held zero-version reservation remains a reported
`held` aggregate; it must not disappear from retention observability.

## 4. Staging gates

### Identity/readiness

- [ ] Liveness is reachable and discloses no secret/configuration.
- [ ] Token-gated readiness proves Postgres connectivity and exact schema head.
- [ ] Web, worker, and agent report one source-SHA/deployment-image family.
- [ ] Worker/agent/retention durable heartbeats are newer than two configured intervals and contain zero error count.
- [ ] Every fresh worker heartbeat proves baked local English OCR availability; test one bounded PNG preflight without a network/language-pack download.
- [ ] Production test-login path is disabled.

### Functional/privacy

- [ ] Isolated non-scoring S3 deterministic/subjective canary completes once and creates no duplicate result/grade/cost row.
- [ ] S4 checkpoint → V1 receipt → automatic ten-day grant → one V2 path passes.
- [ ] S5 flowchart → formative feedback → revision → final evidence path passes, including the outage bypass.
- [ ] Learner/API/DPDP/Praxy/gallery deep scans contain no private TrustMRR rows, evaluator keys, raw logs/blueprints, grades, confidence, prompts, PII, or matched detector strings.
- [ ] A versioned-user DPDP canary honors user/submission/object legal holds, deletes and verifies only recorded S3 `VersionId` values, preserves immutable team work under a same-team survivor, and leaves a complete non-reusable audit receipt.
- [ ] Pausing an erasure between durable intent and exact external deletion fences new submission, evidence, screenshot, preview, interview-audio, TTS and analogous generated-object writes for that user/team; resume completes without orphaning or deleting a replacement version.
- [ ] Missing/unsafe Make scenario link withholds only clone action; PNG and redacted output remain eligible when consent/curation are active.
- [ ] Screenshot fetch denies private/link-local/metadata destinations and validates redirects/subresources.

### Reliability/load

- [ ] 480 synthetic jobs drain within 30 minutes with zero duplicates, dead letters, or rows stuck beyond ten minutes.
- [ ] 30 approved-provider jobs drain within 15 minutes, retry rate is below 5%, and cost is below the configured ceiling.
- [ ] Retention job deletes only eligible staging object versions, honors holds, emits verified receipts, and surfaces failures without object contents.
- [ ] A reservation presign accepts one conditional PUT and rejects a replay; the bucket CORS and policy require `If-None-Match` on `submissions/`.
- [ ] Only the new application family writes against the forward-migrated staging database. The rollback drill proves every generated-object writer plus DPDP/retention mutation is disabled and visibly reports maintenance while any previous image serves safe reads.

## 5. Production promotion

1. Freeze every generated-object, submission, grading, DPDP, retention, interview-audio, screenshot, preview, TTS, and student-audio writer; drain and stop all previous web/worker/agent images; record operator and timestamp.
2. Reconfirm the Postgres snapshot and every S3–S5 gate/override is closed.
3. Scale web to one replica; deploy the reviewed image and verify migration head.
4. Deploy worker and agent from the same commit/image family; wait for fresh durable heartbeats.
5. Load private releases and versioned content explicitly with gates locked; rerun idempotency/privacy probes.
6. Run one isolated staff canary that cannot enter cohort grades, review percentiles, portfolio, galleries, or Praxy.
7. Restore intended service scale only after readiness, queue, auth, S3, build identity, and privacy checks pass.
8. Do not open a session from deployment health alone. A signed Session 03/04/05 readiness receipt authorises only that section's parent/start-material gates; timed gates follow the lesson schedule.

### First 24 hours after promotion

Keep every learner gate locked throughout this observation window. Record one signed snapshot at **+15 minutes, +1 hour, +4 hours, and +24 hours**. At every checkpoint verify:

- `/api/health` and token-gated `/api/readiness`, exact schema head, build SHA, deployment identity, and fresh web/worker/agent/retention heartbeats;
- pg-boss queue depth/age, jobs stuck over ten minutes, retries, dead letters, duplicate assessment-result identities, and any provider-pending claim beyond its lease;
- web/worker/agent error rate and latency, Postgres CPU/connections/locks/storage, bucket failures, exact-version cleanup failures, and conditional-PUT replay behavior;
- provider request count, retry rate, token/cost totals, configured spend ceiling, and zero provider calls originating from request handlers;
- zero newly open S3–S5 gates/exceptions/grants, zero privacy/evaluator-boundary alerts, zero raw prompt keys, and zero incomplete DPDP/retention receipts beyond the documented retry window.

Any red readiness result, dead letter, unexplained writer, privacy/evaluator alert, spend breach, or destructive-operation mismatch is a no-go: keep gates locked, stop affected jobs, preserve receipts, and follow rollback/forward-fix guidance. The +24-hour receipt is necessary but does not replace the classroom pilot and rehearsal receipts.

## 6. Rollback

The database migration is forward-only. Roll back application images, not the schema.

- Keep gates locked.
- Do not restart previous worker or agent images against the forward schema. A previous web image may serve only routes proven read-only while every generated-object, submission, grading, interview-media, DPDP, and retention mutation path is disabled and visibly reports maintenance.
- Prefer forward-fixing and returning the reviewed image family. Re-enable mutation paths only after that family passes readiness and storage canaries.
- Stop new grading/load jobs if correctness or privacy is uncertain; preserve immutable submissions and queue evidence.
- Quarantine unsafe objects and revoke gallery actions immediately.
- Record incident scope, build/deployment identity, failed check, learner impact, recovery owner, and next decision. Never record exposed values.

## Release record

| Field | Value |
| --- | --- |
| Source commit | __________ |
| Web / worker / agent deployment IDs | __________ |
| Image digests | __________ |
| Schema head | __________ |
| Loader manifest hashes | __________ |
| Private dataset release/hash | __________ |
| Queue/load receipt | __________ |
| Clerk incident-closure receipt | __________ |
| Session readiness receipts authorised | __________ |
| Production operator + timestamp | __________ |
