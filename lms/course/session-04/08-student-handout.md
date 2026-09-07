# Session 04 student handout · Ship a working product pattern

**Time:** 120 minutes in class + optional controlled V2 within 10 calendar days  
**What you submit today:** product/first-prompt checkpoint, public V1 URL, test evidence and limitations  
**What may follow:** one V2 URL and change note  
**Grade component:** Artifact quality

## Your challenge

Select a product with credible revenue evidence, study its public behavior, and ship an original-brand functional recreation of a small agreed contract in Lovable. “Working” means the acceptance tests pass. It does not mean the page looks similar to the benchmark.

The supported class build is a creator link-page builder called **SignalShelf** (working title) benchmarked against Liinks. An alternate product must be submitted and approved at least 24 hours before class; otherwise build SignalShelf for V1 and propose the alternate for V2.

## Non-negotiable truth rules

- Do not copy the benchmark’s name, logo, screenshots, copy, code, customer data or distinctive visual design.
- Do not publish private TrustMRR data or paste revenue rows into your app.
- Use fictional identities, emails, links, events and analytics.
- A simulated integration must say it is a demo. Never show a fake “connected” or “sent” state.
- Your public footer must say: `Independent educational build. Not affiliated with or endorsed by the benchmark product.`
- “Complete” means complete against your frozen classroom contract, not full commercial parity.

## Step 1 · Product checkpoint

Submit before you build:

1. selected product and category;
2. current public revenue source;
3. official product-feature source;
4. 80–120 word selection rationale;
5. how the build applies to your team’s industry or anchor company, using public evidence and fictional/demo content only;
6. core / mocked / out-of-scope feature contract;
7. your first prompt.

### Feasibility score

Score the candidate out of 100:

| Criterion | Weight |
| --- | ---: |
| Public revenue credibility | 20 |
| One-hour vertical-slice feasibility | 25 |
| End-to-end teachability | 20 |
| Lovable Free / credit fit | 15 |
| Low external-integration dependency | 10 |
| Clear acceptance tests | 10 |

An alternate product needs at least **85/100**, no more than 15 core tests, no unprovisioned external service in its core, and recorded pre-class approval. Do not spend the eight-minute class checkpoint researching a new alternate.

If approved, number your own 15 core tests AT-01 through AT-15. Keep AT-16 for public/incognito access, AT-17 for keyboard-equivalent operation, and AT-18 for automated/manual accessibility evidence so the LMS can evaluate every product consistently.

## Step 2 · Freeze the contract

Write one sentence:

> Build an original [product category] for [specific user] so they can [job], complete when [observable result].

Then classify every researched feature:

| Core this hour | Honest mock | Out of scope / later |
| --- | --- | --- |
|  |  |  |

The supported SignalShelf contract is in `04-functional-clone-contract.md`; tests are in `05-golden-scope-acceptance-tests.md`.

Adapt the fixture before building: change the persona, message hierarchy and one core use case so they make sense for your team’s industry or anchor company. This is not permission to use private company, employee or customer data. A generic unchanged fixture cannot earn above 6/10 for Relevance.

## Step 3 · Write your first prompt

Use this canvas. Do not replace decisions with “make it beautiful” or “clone exactly.”

```text
Plan an original educational [category] called [working title].

USER AND JOB
Primary user:
Job to be done:
Observable success:

GOLDEN SCOPE
Routes/screens:
Core state/data:
Required interactions:
Required failure/empty states:

REAL / MOCK / OUT
Real in V1:
Mocked and exact visible label:
Out of scope:

ACCESS AND SAFETY
Keyboard path:
Labels/focus/contrast:
Data/privacy rules:
Brand/non-affiliation rule:

ACCEPTANCE CONTRACT
List your test IDs and expected behavior.

PLAN OUTPUT
Ask for route/components, typed data model, state/persistence, event model, implementation order, risk recovery and test matrix. Tell Lovable not to edit code yet.
```

## Step 4 · Use Plan mode once

Current [Lovable Plan-mode documentation](https://docs.lovable.dev/features/plan-mode) says each Plan-mode message costs one credit and no code changes until you approve. Review the returned plan for:

- truthful mock boundaries;
- every acceptance test;
- explicit state and events;
- validation, failure and empty states;
- keyboard/accessibility path;
- core-first 60-minute order.

Edit the plan directly to correct it, then approve. Avoid spending a second Plan message on a vague review.

If Plan mode asks you a clarification or does not show a usable formal plan, save the response and mark `NO_FORMAL_PLAN`. Do not spend a second exploratory Plan credit. After your checkpoint is submitted, the instructor can release the fallback plan; replace its bracketed product/context decisions, record two edits you own, and use it once in Build mode.

## Step 5 · Build in contract order

| Minute | Target |
| ---: | --- |
| 00–08 | Shell, seed, routes/share state |
| 08–20 | Identity, socials, block model |
| 20–34 | Required block types and operations |
| 34–42 | Original design controls and preview |
| 42–49 | Persistence and input failures |
| 49–55 | Clearly labelled demo analytics |
| 55–60 | Publish and incognito smoke test |

If you fall behind, remove extras. Do not remove error handling, mock labels or verification.

Lovable’s build agent is not the same as an AI feature inside your published app. An in-app model call adds run-credit, data, failure and evaluation requirements. Do not add one unless it is necessary to the user job and included in the frozen contract.

## Step 6 · Verify with a peer

Your peer—not you—must open the published URL in incognito and run:

- 390 px mobile check;
- core public journey;
- one invalid input;
- keyboard-only navigation/reorder;
- non-affiliation and demo-label check.

Record PASS, FAIL or NOT RUN for each test. Do not hide a failure.

## Step 7 · Publish and submit V1

Use the **Publish dialog**. Current [Lovable Publish documentation](https://docs.lovable.dev/features/publish) says dialog publishing is free; asking the agent to publish consumes a normal chat message. Free/Pro published apps are public to anyone with the URL, so remove private data first.

Submit:

- public V1 URL;
- acceptance-test log;
- mobile + analytics/access evidence files;
- known limitations;
- original-brand/non-affiliation confirmation;
- gallery consent choice.

GitHub is not required for the in-class V1 receipt. It becomes a required V2/portfolio artifact so credit or OAuth friction cannot block today’s safe app submission.

## Version 2

Lovable Free currently grants 5 daily build credits up to 30 per month. Daily grants expire and do not roll over, so ten days do not guarantee fifty credits. Recheck [pricing](https://lovable.dev/pricing) and [credits and usage](https://docs.lovable.dev/introduction/credits-and-usage) if your workspace shows different terms.

Choose:

- one failed core test; and
- one craft/access problem.

Write the repair contract before spending a Build message. Regression-test the whole core, publish changes from the dialog, and submit V2 with a before/after change note. If you do not submit V2, V1 remains your grading candidate.

Before submitting V2, connect the learner-owned project to a learner-owned GitHub repository from Lovable’s GitHub integration and submit the public repository URL. Confirm that the repository opens logged out and contains the current code. Do not put credentials, private data, `.env` values, or copied benchmark assets in it. If the documented integration is unavailable despite a valid learner-owned GitHub account, record a `github-tool-access` exception; the instructor opens a short audited completion window, but V1 remains eligible.

## Submission self-check

- [ ] Sources open and support my claims.
- [ ] Product name, copy and visual system are original.
- [ ] Every mock is visibly labelled.
- [ ] No private/real demo data is public.
- [ ] Public URL opens in incognito.
- [ ] Test log includes negative tests and limitations.
- [ ] Keyboard path works and focus is visible.
- [ ] I can explain one state/data decision and one verification decision.
- [ ] For V2: my learner-owned GitHub repository opens logged out and matches the published version, or an audited tool-access exception is active.
- [ ] I have not claimed full parity or affiliation.

## Help without buying credits

First identify which limit you reached:

- **Daily credits exhausted but monthly total below 30, with a safe V1:** publish the best safe working state through the dialog; write one AT-specific next request; use the next daily grant and the controlled V2 window.
- **Daily credits exhausted and no safe V1 exists:** submit the completed plan and AT-01–18 contract now. Ask the instructor to record `daily-credit-no-safe-v1`; submit V1 within 24 hours of the first observed next daily grant, with no penalty. Your ten-day V2 window starts only when that V1 is received.
- **30-credit monthly cap reached:** a daily grant may not arrive tomorrow. Tell the instructor without sending billing screenshots. Use the tested course starter/equivalent plan-verifier route and a personal V1 exception through the first accessible build day after the workspace's displayed cap reset. Your one ten-day V2 grant begins when that V1 is actually received.

Do not create extra accounts, share credentials or purchase credits for this requirement.
