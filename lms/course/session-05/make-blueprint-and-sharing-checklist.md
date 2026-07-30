# Make blueprint, sharing, and evidence checklist

**Verified:** 30 July 2026  
**Recheck:** T-7  
**Official sources:** https://help.make.com/blueprints and https://help.make.com/scenario-sharing

## Know which artifact you are producing

| | Blueprint JSON | Public scenario page |
|---|---|---|
| Nature | point-in-time exported/copied JSON | dynamic link to latest **saved** scenario version |
| Recipient action | import file or paste blueprint | view without account; sign in to create a copy |
| Included | modules, module settings, mapped values | modules, settings/mapped values, metadata, notes |
| Connections | not carried over; importer recreates | not included; copier recreates |
| Dependencies | may still require external structures/apps | subscenarios, agents, data stores, and data structures may be empty/omitted; custom/community apps may not display |
| Size | imported blueprint must be below 2 MB | not the blueprint-import route |
| Update behavior | does not update after download | changes when the author saves the shared scenario |
| Classroom use | assessed portability artifact | gallery “Clone in Make” when safe |

## Before export

- [ ] Scenario name and module labels describe business intent.
- [ ] Scheduling is off.
- [ ] Normal, duplicate, malformed, timeout, and approval cases have expected/actual evidence.
- [ ] No live Send, Publish, Delete, Refund, payment, production write, or customer-state action is enabled.
- [ ] Every waiting/terminal state records trace, state, owner, and reason.
- [ ] Any retry is bounded and appropriate only for a temporary failure.
- [ ] Fallback/unknown input has an explicit route.
- [ ] Notes explain prerequisites without including secrets or private endpoints.
- [ ] Static sample content uses `.test` identities and synthetic IDs.

## Export and parse

- [ ] Save the scenario.
- [ ] Use the current Make menu to export the blueprint JSON.
- [ ] Record export time and scenario version in the submission note.
- [ ] Confirm the file parses as JSON.
- [ ] Confirm file size is strictly below 2 MB.
- [ ] Search the raw JSON for likely secret/PII markers: `token`, `secret`, `key`, `bearer`, `authorization`, `webhook`, `@`, phone patterns, customer/company names.
- [ ] Inspect every URL for query-string credentials or private webhook paths.
- [ ] Inspect module notes, static values, mapped sample values, prompts, filenames, and headers.
- [ ] Remove/replace any real identity with a synthetic equivalent; rotate any credential that was ever exposed.

## Import test

- [ ] Create a new blank scenario before importing. Unsaved work in another scenario can be lost on import.
- [ ] Import the exported JSON.
- [ ] Verify modules, settings, and mapped values appear as expected.
- [ ] Create fresh demo connections; do not assume a connection travelled.
- [ ] Recreate missing data structures/data stores/subscenarios and document them.
- [ ] Run normal and duplicate fixtures in the imported copy.
- [ ] Compare final states, action counts, and output references with the original.
- [ ] Keep scheduling off.

## Public scenario page

- [ ] Save and scrub before enabling sharing.
- [ ] Set a plain title (current documented maximum 40 characters; recheck T-7).
- [ ] Add a concise result description (current documented maximum 260 characters; recheck T-7).
- [ ] Use additional information for prerequisites, connection recreation, omitted dependencies, fixture instructions, and limitations—never credentials.
- [ ] Confirm the thumbnail shows the intended saved version; update it after material changes.
- [ ] Open the link logged out and inspect every visible module, setting, mapped value, note, author name/avatar, and dependency warning.
- [ ] Sign in with a separate test account, copy the scenario, recreate connections, and run normal + duplicate.
- [ ] Remember: later saved edits appear at the same public link. Re-run this checklist after every saved change.
- [ ] For a durable gallery link, prefer an instructor-controlled, connectionless copy. Withdraw a student-owned link after any post-review save until it is reviewed again.
- [ ] If the page cannot be made safe, do not submit a public URL. Withhold **Clone in Make**; the assessed blueprint stays owner/instructor-only and the card offers only redacted sample output.

## Run-log evidence

- [ ] Include fixture ID, trace ID, start/end, final/waiting state, attempt, action count, owner, and redacted output reference.
- [ ] Do not upload raw Make history if it contains payload PII or credentials.
- [ ] Export/copy only the minimum rows needed and redact before LMS upload.
- [ ] Distinguish simulated timeout replay from a live timeout.
- [ ] Record unresolved/incomplete status honestly; do not edit a failed run into a success claim.

## Final package

- [ ] `revised-flowchart`
- [ ] `blueprint.json` (<2 MB)
- [ ] `redacted-run-log.jsonl|csv|txt`
- [ ] `sample-output.json|jsonl|csv|txt` (add a text/table equivalent if the source evidence was visual)
- [ ] `workflow.png`
- [ ] optional safe public scenario URL
- [ ] usefulness case, ownership note, verification note, limitation/change note
- [ ] privacy attestation
