# Build brief · Make a workflow another operator can trust

**Time in class:** 87 minutes of design, build, test, and packaging  
**Outcome IDs:** S5-O1 to S5-O5  
**Submission:** staged; first flowchart before build, then final evidence

## Your mission

Build the **GTM lead-routing** workflow for the product you shipped in Session 4. This is the common assessed in-class route, so every learner receives the same starter, fixtures, live demo and evidence contract:

> Turn a qualified inquiry into a safely queued next step without duplicates.

Operations exception handling and revenue reconciliation remain follow-up extensions. You may submit one only after pre-class instructor approval confirms that you have the matching starter, five-fixture expected-results pack and equivalent evidence fields. Choosing an extension does not change the rubric or deadline.

Your workflow must be understandable without you standing beside it.

You may coach a partner, but every learner submits a separately owned scenario, blueprint, test trace, and design decision. If you start from the same scaffold, change and defend at least one contract, route, idempotency, error, approval, or observability control; copied evidence does not prove ownership.

## Before Make

In the 15-minute first gate, submit a one-page flowchart containing:

- business result and named owner;
- trigger, required fields and stable event identity;
- one success plus duplicate, invalid and approval terminal/waiting outcomes;
- duplicate strategy;
- approval before any risky action; and
- one audit record with trace ID and owner.

During revision, add bounded timeout/retry/manual recovery, the complete five-case prediction table, concurrency limitation and one health signal. These revision controls are not required in the first 15-minute sketch.

Read the AI feedback as advice. For each material suggestion, mark **accept**, **adapt**, **reject**, or **not applicable**, then explain why in one sentence. Submit the revised chart before opening the final-build gate.

## Build constraints

- Scheduling stays off during class.
- Design for Make Free. As verified on 30 July 2026, Free currently lists 1,000 credits/month, up to two active scenarios, a 15-minute minimum scheduled interval, a five-minute maximum run, and a 5 MB file-processing limit. Recheck the official pricing page at T-7: https://www.make.com/en/pricing.
- Use no more than 60 classroom credits for the five-case suite and one repair run. Record actual usage; stop accidental loops immediately.
- Use supplied synthetic fixtures only.
- Do not send a real email/message, publish content, delete data, change customer state, issue/refund money, or write to a production system.
- Draft, queue, or write to a demo audit sheet instead.
- Compute and check an idempotency key before any action that must not happen twice.
- Every branch must reach a named terminal or waiting state.
- Retries are only for temporary failures and must be bounded.
- Malformed input is quarantined with a reason; it is not “fixed” by invented values.
- Approval is a recorded state transition, not a Slack/email notification.

## Five acceptance tests

| Fixture | Pass condition |
|---|---|
| Normal | one safe intended result, stable trace, final state and owner recorded |
| Duplicate | no second irreversible/outbound action; duplicate reason visible |
| Malformed | quarantined; clear reason; no retry or outbound action |
| Timeout | retry/incomplete state retained; bounded recovery; manual owner after exhaustion |
| Approval required | pending approval with owner/deadline; zero risky action before decision |

Use the version-bound GTM suite in `fixtures/inputs/`. An instructor-approved extension uses its own immutable pack ID and expected-results hash. You may use a live scenario run or the supplied outage replay. Your evidence must say which route you used.

## Final evidence bundle

Submit:

1. revised flowchart;
2. Make blueprint JSON;
3. redacted run log showing all five fixture results;
4. redacted sample-output artifact;
5. final wide PNG of the readable scenario;
6. optional safe public scenario-sharing URL;
7. usefulness case: current work, proposed change, frequency, owner, and credible time/error/revenue effect;
8. limitation/change note;
9. ownership note: the design/build decision you personally made and can defend;
10. privacy attestation.

## Blueprint versus public scenario link

- A blueprint is a point-in-time JSON export. It must be below 2 MB to import. The importer recreates connections.
- Flowchart uploads must be below 10 MB. A PDF must contain selectable text; submit PNG when the flowchart is image-only.
- Run-log and sample-output text files must each be 2 MB or less so the complete artifact can be screened locally without truncation.
- A public scenario link shows the latest saved version. Anyone with the link can view it; a signed-in Make user can copy it. Connections are not included.
- Both can reveal static module settings, mapped values, notes, URLs, and sample content. Scrub both.

See `make-blueprint-and-sharing-checklist.md` before submission.

## Gallery card

The PNG is the thumbnail. The card must have:

- a plain-language title;
- one-sentence result;
- product/industry tag;
- **Clone in Make** only when a safe, controlled public scenario link exists; otherwise no clone action is shown;
- **View sample output**;
- a limitation label where needed.

Do not include grades, model confidence, prompt logs, private company data, customer data, credentials, or private webhook URLs.

## What strong work looks like

Strong work is not the scenario with the most modules. It has a specific business case, a complete state model, safe failure behavior, reproducible tests, a readable artifact, and an owner who can explain why each control exists.
