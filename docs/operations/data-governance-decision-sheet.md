# Course 1 Data Governance Decision Sheet

**Status:** required before student account provisioning or task exchange  
**Owners to name:** Masters' Union controller/academic owner; Praxel platform/processor owner; IT/security; privacy/legal; accessibility; incident lead

| Decision | Required production answer | Owner | Due gate | Current status |
| --- | --- | --- | --- | --- |
| Controller/processor roles | entity, purpose and instruction boundaries for MU, Praxel and every vendor | MU privacy/legal + Praxel | T-8 weeks | Open |
| Data inventory | roster, stream, accommodations, submissions, prompts/evidence, grades, telemetry, repository, voice/media/consent | privacy owner | T-8 weeks | Defined, not approved |
| Purpose and minimization | purpose and minimum fields for every data class/event | LMS product + privacy | T-6 weeks | Drafted in LMS concept |
| Vendors/regions | approved vendor, subprocessor, region, transfer basis, retention, training-use setting | IT/security + privacy | T-6 weeks | Open |
| Access control | learner, peer, scorer, moderator, program admin and support visibility | security owner | T-6 weeks | Drafted; RBAC unimplemented |
| Retention/deletion | duration and deletion trigger for raw prompts, evidence, grades, telemetry, media, consent and public portfolio | MU academic/privacy | T-6 weeks | Open |
| Student rights | access/export, correction, contest, consent withdrawal, deletion/unpublish route and SLA | MU + Praxel | T-4 weeks | Open |
| Incident/breach | severity, containment, notification, evidence preservation, contacts and student relief | IT/security | T-4 weeks | Open |
| Scraping allow-list | approved domains/sources, robots/terms/license/rate rules, snapshot/provenance requirements | legal + curriculum | T-4 weeks | Open |
| Identity/media | approved fictional/public-domain/consenting identities, recording, synthetic disclosure, withdrawal | privacy + academic | T-4 weeks | Doctrine drafted |
| Public portfolio | opt-in/opt-out, pseudonym path, non-affiliation, licensed/consented evidence, takedown | academic + careers + privacy | T-4 weeks | Open |
| Task exchange | pseudonyms, no personal sign-in/data, external processor disclosure, tracking prohibition, safe decline | privacy + LMS | T-3 weeks | Contract drafted; threat test pending |
| Accommodation privacy | capability flags, least disclosure, retention and parity reporting | accessibility + privacy | T-3 weeks | Drafted; test pending |
| Academic records | grade/evidence record, appeal history, retention and authorized exports | academic owner | T-3 weeks | Open |

## Non-negotiable defaults until approved

- public visibility is not permission to scrape, copy or republish;
- use only allow-listed sources and course-provided snapshots for assessed extraction;
- no confidential company data, employee records, personal credentials or unapproved PII;
- no living-person voice/likeness imitation without course-cleared consent;
- no personal sign-in, payment, contact import, broad connector or browser-extension requirement in peer tests;
- public portfolio publication is learner-controlled and never required for the grade;
- least-privilege access, versioned consent, audit trail and a no-penalty safe-decline path;
- any unresolved vendor/data boundary uses the offline/synthetic fallback.

Named MU and Praxel signatories must approve this sheet and linked vendor threat models before production release.
