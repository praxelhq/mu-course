# Session 04 instructor fallback plan · release only after checkpoint

**Audience:** Instructor; release to an affected learner only after their first-prompt checkpoint is submitted.  
**Use when:** Lovable’s first Plan-mode response asks a clarification or does not create a usable formal plan.  
**Status:** Authored; the exact Build-mode recovery path must pass the T-7 golden run.  
**Evidence marker:** `NO_FORMAL_PLAN`

This plan protects the same scope and assessment as the ordinary path. Before sending it in Build mode, the learner must replace every bracketed decision and record at least two owned edits in the LMS.

## Student-owned decisions

- Original product name: `[replace SignalShelf]`
- Team industry or anchor company: `[public context only]`
- Fictional primary persona: `[name, role, context]`
- Core use-case adaptation: `[one message/content priority that serves this context]`
- One risk to guard first: `[AT ID + reason]`
- One deliberate omission: `[feature + why it is not needed this hour]`

Do not use private company, employee, customer or TrustMRR row data.

## Route and component map

1. Published base route: creator editor, live preview and demo analytics tabs.
2. Public fragment mode: when a `#profile=` fragment exists, validate S4-SP-1 completely before rendering an enabled-block-only public page.
3. Components: identity/social editor; block list; type-specific block form; move/enable/delete controls; theme controls; mobile preview; public profile; demo signup; demo analytics; validation/recovery state; fixed disclosure footer.
4. No auth, backend, account picker, payments, DNS, API key, external mailing service or production analytics.

## Typed state and events

```text
EditorState
  creator: slug, name, bio, avatarUrl, socials[]
  blocks[]: id, type, enabled, order, type-specific public fields
  theme: preset, accent, typeScale
  ui: activeTab, editingBlockId, deleteCandidateId, validationErrors

DemoEventState — browser-local and never shared
  profileViews
  linkClicksByBlockId
  demoSignupCount
```

- Seed fictional content only.
- Derive preview from current editor state; do not maintain a second divergent preview copy.
- Save validated editor state to a namespaced/versioned localStorage key.
- Count a public view once per page load, a link click once per valid activation, and a demo signup only after reserved-domain validation.
- Compute CTR and top link from local event state. Reset events without deleting the profile.

## Frozen share boundary · S4-SP-1

- Canonical URL: published base origin plus `#profile=v1.<base64url-json>.sha256-<16-hex>`.
- Canonical JSON contains only `schemaVersion`, `creator`, `blocks`, and `theme`, with the key order, field types, enums, count/length limits and ID rules in `04-functional-clone-contract.md`.
- Hash exact canonical UTF-8 JSON bytes with SHA-256 and append the first 16 lower-case hexadecimal characters. Treat this as corruption detection, not authentication.
- Reject the complete `profile` fragment value above 8,192 UTF-8 bytes before decoding.
- Reject malformed encoding/JSON, unsupported version, checksum mismatch, unknown/disallowed fields, bad count/length/type/ID, and non-http(s) URL.
- Validate the whole payload before any public rendering. On failure show only: `This demo link is invalid or too large. Return to the creator page.` The return text links to the base origin.
- Render strings through framework escaping; never use `innerHTML`. Use `noopener,noreferrer` on external links.
- Exclude events/analytics, signup entries, drafts, feedback, grades, tokens, account identifiers and all editor-private state. Keep the disclosure in code.

## Validation and accessible failure behavior

- A saved link requires a complete `http:` or `https:` URL and an actionable inline error.
- The signup form rejects malformed email and any domain other than reserved `example.com`; success says `Demo signup — stored only in this browser`.
- Delete has cancel and confirm; initial/empty states explain the next action.
- All form fields have persistent labels and associated errors; focus moves to a useful location after add/delete/failure.
- Move-up/down controls are always available, have block-specific accessible names and visible focus. Dragging is optional, never exclusive.
- Respect reduced motion and WCAG AA text contrast; no information is color-only.

## Honest boundary table

| Capability | Treatment |
| --- | --- |
| Profile editing, block operations, local persistence, preview, validated public share | Working core |
| Views/clicks/signup counts | Browser-local demo; label `Demo analytics · this browser only` |
| Email capture | Accept reserved demo address locally; no send or sync |
| Instagram import, if shown | Fictional fixture only; label `Demo import — no Instagram connection` |
| Media | Safe labelled preview unless true embedding is verified |
| Auth, payments, DNS, custom domain, API, real mailing/analytics | Omit; do not show fake connected states |

## Sixty-minute implementation order

1. **00–08:** app shell, fictional seed, base/public-fragment modes, typed state.
2. **08–20:** identity, socials, first block operation and live preview.
3. **20–34:** six block types plus edit/move/enable/delete-confirm loop.
4. **34–42:** three original presets, accent/type-scale and responsive preview.
5. **42–49:** localStorage, S4-SP-1 encoder/decoder, validation and empty/recovery states.
6. **49–55:** clearly labelled local events, CTR/top-link and reset.
7. **55–60:** Publish dialog, incognito AT-16 smoke test; no new feature.

## Acceptance matrix

- AT-01–03: mobile identity/social edit.
- AT-04–08: six block types and complete block operation loop.
- AT-09: original readable design controls.
- AT-10/AT-10a–e: persistence and every frozen-envelope validation case.
- AT-11–12: URL and reserved-domain email failures/success.
- AT-13–15: local link/view/signup analytics and reset.
- AT-16: published incognito fragment.
- AT-17: equivalent keyboard path.
- AT-18: automated plus manual accessibility evidence.

## Risks and smallest recovery

| Risk | Smallest recovery |
| --- | --- |
| Nested route fails on published host | Use the frozen base-origin fragment; do not add a server. |
| Share value exceeds 8,192 bytes | Block copy and show a specific size error; do not truncate silently. |
| Web Crypto/digest path fails | Mark AT-10/16 failed and use the tested instructor starter; do not weaken the frozen decoder. |
| Six type-specific editors expand | Share a common shell and retain only contract fields; remove decorative controls. |
| Styling consumes time | Keep one preset usable, then add the other two as tokens; do not remove validation/access. |
| Credits end | Publish the best safe state through the dialog; enter the correct daily-vs-monthly exception branch. |

## Build-mode preface

After the student edits this plan, send it once in Build mode with:

```text
Implement this student-approved fallback plan. Preserve its 60-minute order and stop at the frozen core. Report AT IDs as PASS, FAIL, or NOT RUN; do not hide failures or connect external services.
```
