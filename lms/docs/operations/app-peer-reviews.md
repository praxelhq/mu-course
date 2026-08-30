# Lovable app peer reviews

Status: authored and locally tested; not deployed or populated with real student data.

## Student contract

- `/app-reviews` assigns five distinct other authors and app URLs, within the student's own section. Students without a submission still review five apps. Assignment is stable across reloads/concurrent starts; least-assigned apps are selected first.
- Three integer scores from 1 to 5: visual bar, functionality, overall (complexity + working). The page gives explicit 1/3/5 anchors and permits 2/4 between anchors.
- Each review requires a comment containing at least 20 whitespace-separated words with letters/numbers, maximum 5,000 characters. Scores/comments are final on submission; an identical network retry is safe.
- The instruction says: “You must complete all 5 peer reviews to receive your own app grade.” This release does **not** gate grade visibility, change the existing app rubric, apply a score weight, or modify teammate-contribution reviews.
- Access reports do not count as completed reviews. Instructors can replace a reported, unfinished target with an unused app; the original report remains stored.

## Privacy and evidence

The student HTML, RSC props and API expose only an opaque assigned-review ID, local slot number, app URL, and the student's own scores/comment/status. No creator name, email, internal entry ID, source reference, private brief, or other reviewer's score is exposed. The header still identifies the signed-in student themselves.

External apps open in a new no-referrer tab and are never fetched or embedded by the LMS. Their own branding/content may reveal an author; this cannot be removed by hiding LMS identities. Students are instructed not to identify creators, coordinate scores, pay, connect accounts, disclose personal data, or make real transactions.

`AppReviewRound` binds `asg_s4_app` to `lovable-peer-v1`. `AppReviewEntry` freezes the owner, section and normalized URL. `AppReview` stores reviewer, slot, scores, comment, assignment/completion times, access report and retirement time. This freezes the submitted **URL**, not the mutable contents of an externally hosted app. Completed receipts and entry snapshots have database immutability triggers. New tables join the DPDP write fence and cascade on user erasure; the access bundle includes only reviews given by that user, not reviews received.

Faculty-only completion, per-app mean scores/counts and raw-evidence CSVs are available at `/instructor/app-reviews`. Summary rows explicitly say no grade weight is applied. Unequal/low received-review counts need consideration before a later grading policy is chosen.

## Prepare and activate

1. Deploy the additive migrations and application together using the existing Railway release process. Keep all review gates locked/closed initially. Never run the demo seed on an existing database.
2. Export the supplied Sheet's **Artifacts** tab (gid `1321808381`) to CSV. The importer recognizes its Email ID, Section and Hosted Web App Link headers, including quoted multiline headers. Alternatively supply `email,section,appUrl`.
3. Select the intended final app for every repeated student and correct document/editor/private links before importing. On 31 August 2026, a read-only source check found 412 rows and 386 distinct normalized email values; this is not a validated roster count. No “latest wins” rule was assumed. No source student rows are committed in this repository.
4. Upload and **Validate import**. Matching uses existing canonical student emails and verified aliases plus section; the importer does not enroll or move students. Names and briefs are ignored. HTTPS public DNS hosts are supported, including non-Lovable app hosts. Credentials, ports, IP/private-network addresses, known document/editor links, meaningful query parameters and URL fragments are rejected. Only known tracking parameters are removed. Invalid entries require correction, not silent URL rewriting.
5. Resolve every validation error, then **Import validated apps**. A batch is all-or-nothing; repeating the same import is idempotent; a different URL cannot overwrite an existing snapshot. For a genuinely incorrect already-imported snapshot, keep the window closed and escalate for a separately reviewed correction migration; do not delete review evidence.
6. Open one section first. The gate checks that every active rostered student can receive five distinct other apps. Confirm actual app access/privacy with a test learner account, then open remaining sections. At least six distinct apps are normally required when submitters are reviewers.
7. Monitor **Every student**, including students who have not started or have not submitted an app. Verify access reports before replacing targets. Resolve roster changes before opening; imported section snapshots do not move automatically with a roster change. Student/instructor completion uses the same eligibility filter. A later roster move or privacy fence appears as **Blocked / Needs instructor action**, not a successful no-op or an incorrect completion. Resolve the roster correction or finish the existing privacy workflow; never bypass a privacy fence to retire evidence. DPDP erasure can remove app-linked reviews; reopen an affected student if they need a replacement after erasure.

The existing faculty-only `/api/gates/exception` endpoint also accepts `targetType: "app_review"` with this round ID, canonical student email and optional expiry for a single-student reopen. Normal whole-section controls remain on the App Reviews page.

The CSV record references identify the logical CSV record (header is record 1), not a physical line when quoted values span lines. The import UI's validation-error record number excludes the header.

## Post-Deploy Monitoring & Validation

Owner: course instructor plus LMS release operator. Window: first section pilot, first full class, then daily until reviews close.

- Search logs for `/api/app-reviews`, `/api/instructor/app-reviews`, `Invalid app review ownership or section`, and transaction timeouts. Audit actions: `app-review.import`, `app-review.replace`, and `gate.set` with target type `gate:app_review`.
- Healthy: students see either zero assignments before starting or five stable distinct targets; foreign/student-to-faculty API requests return 403/404; 19-word comments are rejected; valid completion persists after reload; Grade and existing PeerReview rows are unchanged.
- Watch completion counts, reviews received per app, unresolved access reports, API 5xx rate and database lock latency. A round-wide transaction lock serializes allocation/import/replacement/submission/gate changes; use small section pilots before whole-cohort activation.
- If identities leak, writes error repeatedly, counts exceed five, or grade behavior changes: close affected review windows immediately, preserve evidence, and roll back the application build. Leave additive tables/migrations in place; do not drop collected data. Reopen only after a scoped fix and learner/instructor smoke test.

Read-only verification:

```sql
SELECT "reviewerId", count(*)
FROM "AppReview" WHERE "retiredAt" IS NULL
GROUP BY "reviewerId" HAVING count(*) > 5;

SELECT count(*) AS invalid_self_reviews
FROM "AppReview" r JOIN "AppReviewEntry" e ON e.id = r."entryId"
WHERE r."reviewerId" = e."authorId";

SELECT count(*) AS invalid_completed_reviews
FROM "AppReview"
WHERE "completedAt" IS NOT NULL
AND ("visual" IS NULL OR "functionality" IS NULL OR "overall" IS NULL
  OR cardinality(regexp_split_to_array(trim("comment"), '\s+')) < 20);
```

The first query should return no rows; the other two counts should be zero. SQL's whitespace check is weaker than the API's Unicode letter/number word check; the API is the authoritative submission validator.

## Local validation

Final 31 August 2026 results: full suite **696 passed, 219 environment-dependent skipped**; dedicated app-review PostgreSQL suite **9 passed**, including the one-connection regression; pure/rendered app-review tests **6 passed**; full lint and optimized production build passed. Standard PostgreSQL release command: **49 passed, 1 pre-existing loader failure**, described below. These are local checks, not deployment verification.

Use an explicitly supplied disposable PostgreSQL URL for `tests/app-reviews.pg.test.ts`, with both `RUN_APP_REVIEW_PG_TESTS=1` and `CONFIRM_DISPOSABLE_POSTGRES=1`. The standard `pnpm test:release:postgres` runner includes this suite. Tests use unique `ar-*` fixtures, reset this round and clean up afterward. Never point them at a production or shared development database. The local run used `127.0.0.1:55439`, including a successful `connection_limit=1` regression run; all gate reads inside writes use the existing transaction connection.

The local database required fixture-only handling of the pre-existing `20260730143000_section_f_email_aliases_and_fg_rosters` migration because its F/G roster assertions require historical production rows. The new peer-review migrations were applied unchanged. This is not a claim that the entire repository migration history bootstraps an empty database without historical fixtures.

Browser QA used only synthetic students on localhost:3219, not live learners. Verified stable five-card assignment, rubric, 19/20-word boundary, saved immutable scores after reload, and a 390px layout with no horizontal overflow.

Instructor browser checks verified completion reporting, insufficient-pool rejection and gate closure. Local test-login cookies were set only for localhost:3219; the created tab and dev server were closed afterward. The later blocked-state UI is covered by a rendered-component regression test, and its server state by real PostgreSQL tests. Pasted Unicode whitespace is normalized before persistence, so the browser/API and database word checks agree. Blank CSV records retain their original logical record ordinals.

The full PostgreSQL release command currently also exposes a pre-existing loader fixture failure: `sessions3-5-loader.test.ts` attempts to create an `AssessmentVersion` whose `supersedesId` parent is missing. This is outside the app-review path and remains a release blocker; do not describe the complete release gate as green merely because the app-review suite passes.

## Review record

CE review run `20260831-014900-appreview` completed with ten local persona passes run sequentially (not independent reviewers), plus a read-only independent Claude review. Its three primary findings were addressed:

1. The PostgreSQL release runner now explicitly runs the app-review suite with its enable flag; fixture IDs avoid existing course records and are cleaned up.
2. Roster/privacy gaps have an explicit blocked state, consistent student/faculty counts and a non-success API response. Automatic retirement of privacy-fenced or completed evidence was rejected because the existing immutability/privacy rules prohibit it.
3. Gate reads within review writes reuse the transaction connection. A one-connection pool reproduced the old timeout; all nine PostgreSQL tests pass after the fix on the same one-connection configuration.

Additional fixes cover per-student reopen compatibility, canonical Unicode whitespace, preserved blank-record ordinals, bounded transaction waits, CSV read serialization and fragment rejection. Reuse/quality/efficiency passes retained the shared auth, gate, CSV-export and DPDP helpers; no dependencies or grading abstractions were added.

No separate independent validator agent ran because this repository maps agent work to sequential main-thread work. The CE receipt records degraded independent validation rather than claiming extra reviewer agreement. Caller-owned regression tests validate the fixes. Remaining release checks: the existing loader fixture failure, live Clerk/Railway smoke, a real CSV dry-run, external-app safety/access spot checks, and a section pilot before full-cohort load.
