# Golden scope and acceptance tests

**Goal:** an end-to-end creator page builder that is complete against this one-hour contract.  
**Scored test IDs:** 18 (15 functional core + 3 publication/access evidence; AT-10 has five mandatory decoder cases)  
**Pass rule for functional completeness:** AT-01 through AT-15 pass; AT-16 through AT-18 are publication/accessibility evidence.  
**Test data:** fictional only.

## Seed fixture

Use this fixture so every section tests the same behaviors:

- creator: **Mira Sen** (fictional), `Product storyteller · Bengaluru`;
- slug: `mira-demo`;
- socials: LinkedIn, Instagram and YouTube placeholder URLs;
- links: `Portfolio`, `Book a 20-minute call`, `Latest field note`;
- text: one two-sentence introduction;
- media: one public sample YouTube URL or a labelled media preview fixture;
- folder: `Start here`, containing two links;
- email: use `learner@example.com` only;
- analytics seed/reset: zero by default, with an explicit `Load demo events` action if a chart needs a visible state.

## Core acceptance tests

| ID | Test action | Expected result | Evidence to submit |
| --- | --- | --- | --- |
| AT-01 | Open the app on a 390 px-wide viewport | No horizontal scroll; builder controls and public content remain usable | Mobile screenshot |
| AT-02 | Change Mira’s name and bio | Live preview updates without reload | Short test-log entry |
| AT-03 | Add/edit/remove a social link | Preview and public view show only valid configured socials | Test-log entry |
| AT-04 | Create each required block type: link, text, divider, media, email capture, folder | All six appear with distinct, meaningful rendering | Screenshot or recording frame |
| AT-05 | Edit a link’s title, description and URL | Public view reflects the saved values | Test-log entry |
| AT-06 | Move a block up and down using visible controls | Order changes in builder, preview and public view | Test-log entry |
| AT-07 | Disable one block | Disabled block remains editable in builder but disappears from public view | Test-log entry |
| AT-08 | Delete a block, first cancelling and then confirming | Cancel preserves it; confirm removes it | Negative-test entry |
| AT-09 | Choose another preset and change accent/type scale | Preview updates; text remains readable | Before/after screenshot |
| AT-10 | Refresh after edits, copy the S4-SP-1 public share URL, and run AT-10a–e below | State restores; the full `profile` fragment value is ≤8,192 bytes; only the frozen public schema is present; every invalid case fails closed without a partial render | Before/after note + redacted schema inventory + five-case recovery log |
| AT-11 | Enter `not-a-url` in a link | Save/open is blocked and a specific correction message appears | Error screenshot |
| AT-12 | Submit `wrong@`, a real-looking non-example address, then `learner@example.com` | Invalid/non-demo email is rejected; reserved-domain dummy email shows success and is stored only locally | Error + success note |
| AT-13 | Open an enabled valid link from the public view | Click counter increases once and the link opens safely | Analytics screenshot |
| AT-14 | Visit the public route, create two link clicks and one signup | Demo analytics show views, clicks, CTR, top link and signup count; all labelled browser-local | Analytics screenshot |
| AT-15 | Reset demo analytics | Counters return to zero without deleting the creator’s page | Test-log entry |

## Publish and accessibility evidence

| ID | Test action | Expected result | Evidence to submit |
| --- | --- | --- | --- |
| AT-16 | Open the generated S4-SP-1 fragment URL on the published Lovable app in an incognito window | Base app loads without editor access/sign-in and shows the edited fictional name plus enabled blocks only after version, schema, size and digest validation | URL + timestamp + visible edited field |
| AT-17 | Complete identity edit, block reorder, public navigation and email validation using keyboard only | Focus is visible; order is logical; every action is reachable; no drag-only control | Keyboard audit note |
| AT-18 | In desktop Chrome, run the built-in Lighthouse **Accessibility** audit against the published URL, then manually inspect headings, labels, alt text, focus and contrast. If DevTools/Lighthouse is unavailable, use the supplied no-install manual checklist with a peer and record browser/route. | No critical automated findings; manual checklist is complete or limitations are named. The manual equivalent has the same score ceiling. | Lighthouse summary or signed manual-equivalent note + limitation note |

### AT-10 decoder cases · all required for AT-10 PASS

Use fictional data and keep the fixed public disclosure in application code.

| Case | Input change | Expected result |
| --- | --- | --- |
| AT-10a malformed | Replace the base64url segment with characters that cannot decode to canonical UTF-8 JSON | No profile fields render; exact recovery message and creator-page link appear |
| AT-10b tampered | Decode the JSON, change one title, canonicalize/re-encode it, but retain the original digest | Digest mismatch; no partial profile; exact recovery state |
| AT-10c oversized | Supply a `profile` fragment value of 8,193 UTF-8 bytes | Reject before decoding; exact recovery state; UI remains responsive |
| AT-10d unsupported version | Change the envelope prefix to `v2` and set `schemaVersion` to `2` | Reject as unsupported; no silent downgrade or best-effort render |
| AT-10e invalid schema | Add an unknown key or a `javascript:` destination, or exceed a field/count limit, then recompute the digest so integrity passes | Reject the whole profile; do not strip one field and render the rest |

For the valid case, decode the canonical JSON for inspection and confirm it contains only `schemaVersion`, `creator`, `blocks` and `theme`; it must not contain analytics/events, signup entries, drafts, feedback, grades, tokens or account identifiers. Do not paste the full URL into a public gallery or analytics tool.

## Evidence log format

Students paste a compact test log into the LMS:

```text
App version: V1
Public URL: https://example.lovable.app
Tested at: 2026-08-__ __:__ IST
Browser / viewport: Chrome __ / 390 × 844 and desktop

AT-01 PASS — no horizontal scroll at 390 px; screenshot file mobile-v1.png
AT-02 PASS — name and bio update in preview before save
...
AT-11 PASS — "Enter a complete http(s) URL" shown for not-a-url
...
AT-18 PARTIAL — automated scan clear; folder disclosure needs a more specific accessible name

Known limitations:
- Analytics are browser-local demo data.
- Instagram and mailing-list integrations are not connected.
```

## Golden-scope order for the 60-minute build

| Build minute | Target | Stop condition |
| ---: | --- | --- |
| 00–08 | Approve edited plan; generate shell, fixture and routes | Builder and public route both render |
| 08–20 | Identity, socials, block model and seeded blocks | AT-02/03 and one block operation pass |
| 20–34 | Six block types; edit, order, hide, delete | AT-04 through AT-08 pass |
| 34–42 | Design controls and live preview | AT-09 passes |
| 42–49 | Persistence, validation and empty/failure states | AT-10 through AT-12 pass |
| 49–55 | Browser-local demo analytics | AT-13 through AT-15 pass |
| 55–60 | Publish dialog and incognito smoke test | AT-16 passes; no last-minute feature additions |

## Stop-the-line defects

Do not publish until these are fixed or visibly disabled:

- app fails to load or public route returns an error;
- editor exposes the browser to unsafe script/HTML input;
- invalid links navigate unpredictably;
- app shows real-looking analytics or integration success that did not happen;
- secrets, tokens, private data or TrustMRR rows are present;
- only mouse/drag users can reorder or publish;
- app uses benchmark branding or claims affiliation;
- mobile view obscures the primary task.

## Extension backlog · does not raise the core grade ceiling

- authentication and a real per-user database;
- server-side public slugs;
- true embedded media;
- real email provider integration with consent and deletion flow;
- drag-and-drop in addition to keyboard buttons;
- richer analytics with a documented event/data contract;
- image upload/storage;
- custom domain, API and multi-profile work only after a separate security/operations plan.
