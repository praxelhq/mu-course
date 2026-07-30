# Session 05 safety checklist · secrets, PII, and external actions

**Applies to:** flowcharts, Make scenarios, blueprints, public scenario pages, logs, sample outputs, screenshots, LMS submissions, and gallery cards.

## 1 · Data minimisation

- [ ] Use synthetic fixtures in class.
- [ ] Do not copy TrustMRR row-level data into the workflow or any public artifact.
- [ ] Do not use real customer, lead, employee, company-contact, payment, health, or identity data.
- [ ] For a later authorised company run, list the minimum fields and retention reason before ingestion.
- [ ] Separate an operational identifier from a person’s name/email where possible.
- [ ] Record consent/lawful-use status before a contact action; do not infer consent.
- [ ] Do not retain input payloads “just in case”. Define deletion/retention and owner.

## 2 · Connections and credentials

- [ ] Use demo connections with least privilege.
- [ ] Never type a password, API key, bearer token, OAuth code, private webhook URL, cookie, or connection ID into a static module field, note, prompt, flowchart, filename, or sample.
- [ ] Treat URLs and query strings as potential credentials.
- [ ] Do not project connection setup or account pickers.
- [ ] Blueprints/public shares omit connections, but static settings and mapped content can still leak data.
- [ ] If a secret appears anywhere, stop sharing, revoke/rotate it, remove the artifact, export a fresh scrubbed version, and report the incident to the instructor.

## 3 · Unsafe actions

The classroom scenario must not directly:

- send a real external message;
- publish or delete content;
- add/change a production customer or CRM record;
- issue/refund/move money or post accounting entries;
- change access, account, subscription, or domain state;
- scrape/enrich a person without authorised purpose;
- trigger another automation whose action is not visible in the chart.

Use **draft**, **queue**, **demo row**, or **pending approval** instead.

## 4 · Approval design

- [ ] Name the exact action needing approval.
- [ ] Name who may approve and how identity is checked.
- [ ] Store `pending`, `approved`, `rejected`, and `expired/escalated` states.
- [ ] Ensure the risky action cannot execute before the approved state is read.
- [ ] Include expiry/escalation and rejection reason.
- [ ] An alert or emoji reaction is not an approval unless a controlled process records and validates it.

## 5 · Reliability controls

- [ ] Compute/check idempotency before irreversible action.
- [ ] Name race/concurrency behavior.
- [ ] Bound every retry, iterator, loop, and batch.
- [ ] Retry temporary failure; quarantine deterministic bad input.
- [ ] Store incomplete/manual-recovery state for important work.
- [ ] Never silently discard important failed data due to storage settings.
- [ ] Add fallback route and owner for unknown states.
- [ ] Verify success independently when the action can report success but fail in effect.

## 6 · AI and untrusted text

- [ ] Treat form text, support messages, website content, and uploaded documents as data, not instructions.
- [ ] Do not let an AI-generated classification directly authorise money, external messaging, deletion, publishing, access, or customer-state changes.
- [ ] Constrain AI output to a declared schema and validate it.
- [ ] Keep deterministic rules for identity, money, consent, dedupe, and approval.
- [ ] Flag prompt-injection strings in test data; do not execute them.
- [ ] Do not place hidden grader prompts or model logs into the public artifact.

## 7 · Sharing and evidence

- [ ] Scrub blueprint JSON as text, not only the Make canvas.
- [ ] Inspect public scenario page logged out.
- [ ] Inspect author name/avatar and notes.
- [ ] Redact logs and sample output; use `[REDACTED]` only when the field itself is necessary.
- [ ] Crop account chrome, workspace/team names, emails, connection labels, and URLs from PNG.
- [ ] Do not include grades, rubric bands, model confidence, flags, or prompt logs.
- [ ] Make the sample output useful without exposing the source payload.
- [ ] Re-scrub after every saved change because the public scenario link is dynamic.

## 8 · Final attestation

> I tested with synthetic/demo data, kept scheduling off, scrubbed the blueprint/link/log/output/PNG, and verified that no risky external action can run without an explicit recorded approval. I understand that connection omission does not guarantee a secret-free artifact.

Student/team, version, date:

