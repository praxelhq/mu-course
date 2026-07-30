# Session 04 source ledger

**Verified:** 30 July 2026  
**Recheck:** T-7 before every delivery  
**Rule:** if a volatile claim changes, update the lesson, deck, handout, LMS copy, and quiz key together.

## Revenue and product selection

| Claim used in the package | Primary/current evidence | Secondary check | Classroom treatment |
| --- | --- | --- | --- |
| Liinks has credible, material revenue | [TrustMRR public Liinks profile](https://trustmrr.com/startup/liinks) displayed about **$30.8K MRR**, **$36.5K last-30-day revenue**, and **5.3K active subscriptions** when checked; the page says revenue is verified through a Stripe API key and was updated 29 July 2026 | [Founder Charlie Clark’s site](https://charlieclark.co/) describes Liinks as bootstrapped solo to **$30K+ MRR** | Use rounded “about $30K MRR” in teaching. Show the live page for the latest value. Never imply the number is fixed. |
| HabitKit is a credible alternate | [TrustMRR public HabitKit profile](https://trustmrr.com/startup/habitkit) displayed about **$30.7K MRR**, RevenueCat-verified, updated 29 July 2026 | [Google Play listing](https://play.google.com/store/apps/details?id=com.roehl.habitkit) identifies the maker and describes the tiled grid, habit creation, streak and reminder behavior | Use only for the selection comparison, not the live build. |
| QR Code AI is a credible alternate | [TrustMRR public QR Code AI profile](https://trustmrr.com/startup/qr-code-ai) displayed about **$14.3K MRR**, Stripe-verified | [QR Code AI’s official site](https://qrcode-ai.com/) documents content types, customization, downloads, dynamic codes and analytics | Use only for the selection comparison; the scannability/AI-art surface makes one-hour parity riskier. |

The user-authorised private TrustMRR Sheet was used to shortlist candidates. This repository contains only independently public aggregates and public source links, not the supplied row-level Sheet data.

## Liinks feature contract

| Product behavior | Official source | Scope decision |
| --- | --- | --- |
| A creator edits header, socials and blocks with a live preview; blocks can be reordered; design controls include templates, fonts, colors, backgrounds and block styles | [Create a page](https://www.liinks.co/help/article/create-a-page) | Core vertical slice |
| Current block catalogue includes links, dividers, media, text, Instagram, email collection, folders, FAQ, forms, resume, testimonials and social icons | [Block types](https://www.liinks.co/help/article/block-types) | Six representative types functional; the rest appear in a labelled parity map, not as fake buttons |
| Analytics includes visitors, views, clicks, CTR, top link, time series and audience breakdowns | [Analytics](https://www.liinks.co/help/article/how-do-i-see-how-my-page-is-performing) | Core demo analytics are browser-local and explicitly labelled “demo”; no fabricated visitor geography |
| Starter and Pro pricing, plus trial terms, are plan-dependent | [Plans](https://www.liinks.co/help/article/what-plans-are-available) | No copied pricing or billing flow in the golden build |
| Custom domains require a paid product capability and real DNS ownership | [Connecting an existing domain](https://www.liinks.co/help/article/connecting-an-existing-domain) | Out of scope; never fake DNS verification |
| The public API manages profiles, blocks, styles, form submissions, subscribers and screenshots | [Public API](https://www.liinks.co/help/article/public-api) | Out of scope; show an honest “future integration” note only |

## Lovable operating facts

| Claim | Official source | Package implication |
| --- | --- | --- |
| Free includes 5 daily build credits, capped at 30 per month; unused daily grants expire | [Lovable pricing](https://lovable.dev/pricing) and [Credits and usage](https://docs.lovable.dev/introduction/credits-and-usage) | Never promise 50 credits over ten days. Plan a small V2 backlog. |
| Plan mode does not modify code and costs one credit per message; it may ask clarifying questions and does not always produce a formal plan | [Plan mode](https://docs.lovable.dev/features/plan-mode) | Use one Plan message. Edit/approve a formal plan when present; otherwise record `NO_FORMAL_PLAN`, release the post-checkpoint fallback and avoid a second exploratory Plan credit. |
| Build-mode cost varies with work and complexity | [Credits and usage](https://docs.lovable.dev/introduction/credits-and-usage) | The budget is a guardrail, not a guaranteed per-prompt tariff. |
| AI features inside a deployed app use AI-gateway/run credits and are separate from the Lovable agent used to build | [Credits and usage](https://docs.lovable.dev/introduction/credits-and-usage) | Teach the distinction; the golden app does not add an AI feature without a user need, evaluation and run-cost plan. |
| Publishing from the Publish dialog costs no build credit; publishing via chat consumes a standard chat message | [Publish](https://docs.lovable.dev/features/publish) | Use the dialog in class. Capture the live URL. |
| Free/Pro published apps are public to anyone with the link; changes do not go live until republished | [Publish](https://docs.lovable.dev/features/publish) | Use dummy data, run an incognito check, and republish Version 2. |
| A workspace owner can connect a project to a learner-owned GitHub account/repository for export and ongoing sync; the repository path must remain stable | [Connect your project to GitHub](https://docs.lovable.dev/integrations/github) | GitHub is a required V2/portfolio artifact, not an in-class V1 gate. Use a learner-owned public repository and scan it for secrets/private data before submission. |

## Rights and attribution

- The project-specific TrustMRR authorisation is recorded in [`lms/docs/build/SOURCE_OF_TRUTH.md`](../../docs/build/SOURCE_OF_TRUTH.md).
- The classroom project uses public product behavior as a benchmark. It does not copy Liinks source code, private data, logo, product name, marketing copy, screenshots, icons, or distinctive visual trade dress.
- “SignalShelf” is a classroom working title, not a representation of trademark clearance.
- Every student app must contain: “Independent educational build. Not affiliated with or endorsed by the benchmark product.”
- This package is instructional guidance, not legal advice.

## T-7 checklist

- [ ] Record access date and current Liinks TrustMRR MRR; round in slides.
- [ ] Confirm the founder site still supports the $30K+ statement.
- [ ] Recheck Liinks block types, analytics, plans, API and domain pages.
- [ ] Recheck Lovable Free daily/monthly credit wording, Plan cost and Publish-dialog cost.
- [ ] Recheck GitHub connection/export availability from a fresh Free personal workspace and run a logged-out repository check.
- [ ] Run the golden prompt in a fresh Free workspace and log observed credits.
- [ ] Exercise both Plan branches: formal editable plan and no-formal-plan recovery; validate the student-owned starter restore cost.
- [ ] Confirm the Liinks golden run and mixed-confidence dry-run thresholds in `03-product-selection-scorecard.md` still pass.
- [ ] Replace or remove any stale quiz distractor affected by product/tool changes.
