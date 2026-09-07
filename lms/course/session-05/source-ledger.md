# Session 05 source ledger

**Verified:** 30 July 2026  
**Recheck:** T-7 before every delivery  
**Rule:** official Make Help Center pages are the controlling sources for volatile product behavior.

| Claim used in the package | Official source | Stale-content flag |
|---|---|---|
| A scenario blueprint is reusable JSON containing modules, module settings, and mapped values. Connections are not carried over; the importer creates their own connections. An imported blueprint must be below 2 MB. | https://help.make.com/blueprints | T-7 |
| A public scenario page is viewable by anyone with the link; a signed-in Make user can create a copy. It is dynamic and shows the latest **saved** version. It includes module settings and mapped values but not connections. | https://help.make.com/scenario-sharing | T-7 |
| Shared links can omit or empty subscenarios, AI agents, data stores, and data structures; custom/community apps may not be displayed. The author should explain reconstruction steps. | https://help.make.com/scenario-sharing | T-7 |
| Routers branch a scenario, routes run sequentially in their configured order, and a fallback route catches data that matches no earlier route. | https://help.make.com/router | T-7 |
| Make has Skip, Retry, Resume, Commit, and Rollback error handlers. Retry stores the failed bundle as an incomplete execution; high-impact errors should not be silently skipped. | https://help.make.com/overview-of-error-handling | T-7 |
| Store incomplete executions, process data in order, confidential-data retention, commit behavior, and consecutive-error settings change operational behavior. | https://help.make.com/scenario-settings | T-7 |
| Instant webhooks run immediately and are processed in parallel by default; `process data in order` serialises them. Webhook queues and responses have failure conditions. | https://help.make.com/webhooks | T-7 |
| Scenario history exposes run status, duration, operations, transferred data, and module bundles; retention and full-text search depend on plan. | https://help.make.com/scenario-history | T-7 |
| Temporary connection, rate-limit, and timeout failures can be retried from incomplete executions; manual resolution is appropriate for configuration/data errors. | https://help.make.com/manage-incomplete-executions | T-7 |
| The current Free plan lists 1,000 credits/month, up to two active scenarios, a 15-minute minimum scheduled interval, a five-minute maximum scenario execution, and a 5 MB file-processing limit. Most module actions consume credits; routers and error-handler modules are documented exceptions. | https://www.make.com/en/pricing | T-7 |

## Interpretive notes

- **Blueprint export is a snapshot.** Later edits do not update an already downloaded JSON file.
- **Scenario sharing is a live pointer.** Viewers see the latest saved version, so a student must save, test, and re-scrub before final submission.
- **Privacy approval can drift.** Prefer an instructor-controlled, connectionless gallery copy. A student-owned shared URL must be withdrawn and re-reviewed after any saved change.
- **No connection does not mean no secret.** Static values, prompts, mapped sample content, notes, URLs, and webhook paths can still expose sensitive information even though connection credentials are omitted.
- **A copy is not a runnable production system.** The copier must recreate connections and any omitted dependencies, verify mappings, and run the supplied fixtures before enabling scheduling.
- **A screenshot is not execution proof.** The graded package requires a blueprint, a redacted run log, and a deterministic sample output in addition to the PNG.
- **Free-tier design is part of the task.** Keep the classroom scenario inactive, use manual/webhook fixture runs, budget module actions, and do not depend on sub-minute schedules, more than two active scenarios, or paid-only features.

## Product-context sources

Session 4’s independently verified product contract and revenue sources belong in the Session 4 package. Session 5 consumes only the agreed feature/business context; it does not republish TrustMRR row data or use the TrustMRR sheet as public evidence.
