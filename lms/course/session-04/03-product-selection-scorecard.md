# Product selection scorecard · instructor decision

**Decision:** Freeze **Liinks** as the instructor build candidate; classroom feasibility remains release-gated.  
**Decision date:** 30 July 2026  
**Evidence confidence:** High for current revenue direction and public feature surface. The one-hour/credit scores are provisional until the golden run and learner dry run below; exact public metrics remain volatile and require T-7 recheck.

## Selection question

Which proven product gives a mixed-skill management cohort the best chance of shipping a genuinely usable, end-to-end product pattern in one hour on Lovable Free while still exposing meaningful product judgment?

Revenue matters, but it is a credibility filter—not the build brief. A high-revenue product that requires proprietary data, regulated decisions, complex integrations, real-time infrastructure, or mobile-native APIs is a poor classroom target.

## Weighted score

| Criterion | Weight | Liinks | HabitKit | QR Code AI |
| --- | ---: | ---: | ---: | ---: |
| Public revenue credibility | 20 | 19 | 18 | 17 |
| One-hour vertical-slice feasibility | 25 | 24† | 22 | 14 |
| End-to-end teachability: builder → user → evidence | 20 | 20 | 16 | 18 |
| Lovable Free / credit fit | 15 | 14† | 14 | 9 |
| Low dependence on external integrations | 10 | 9 | 10 | 5 |
| Clear, observable acceptance tests | 10 | 10 | 9 | 8 |
| **Total** | **100** | **96† provisional** | **89** | **71** |

`†` Author estimate, not learner evidence. It may be presented as “Liinks leads the scorecard,” but not as validated classroom feasibility until both release checks pass.

## Candidate evidence and judgment

### 1. Liinks · selected

- **Revenue:** TrustMRR’s public page showed about $30.8K MRR and 5.3K active subscriptions when checked on 30 July 2026; the founder separately describes the business as $30K+ MRR.
- **Official product surface:** profile header and socials, block-based content, live preview, page design, sharing, email collection and analytics are documented by Liinks.
- **Why it teaches well:** students can experience three roles in one build: creator/admin, public visitor, and operator reading analytics.
- **Why it fits an hour:** the core behavior is stateful CRUD, preview, routing, event counts, responsive UI and publication. External boundaries can be isolated and labelled.
- **Primary risk:** “link in bio” can look trivial if reduced to buttons. The golden scope prevents this by requiring editing, ordering, multiple block types, persistence, public mode, analytics and failure states.

Sources: [TrustMRR](https://trustmrr.com/startup/liinks), [founder site](https://charlieclark.co/), [Liinks create-page guide](https://www.liinks.co/help/article/create-a-page), [block catalogue](https://www.liinks.co/help/article/block-types), [analytics guide](https://www.liinks.co/help/article/how-do-i-see-how-my-page-is-performing).

### 2. HabitKit · credible fallback

- **Revenue:** TrustMRR’s public page showed about $30.7K MRR, verified with RevenueCat.
- **Official product surface:** habit creation, a tile-grid dashboard, completion history, schedules/streaks and reminders are described in the store listing.
- **Strength:** excellent low-integration, acceptance-testable CRUD and visualization task.
- **Why it loses:** it is mobile-native; a Lovable web build either changes the product context or pretends to reproduce OS reminders/widgets. It also exposes fewer business-side surfaces in one hour.
- **Use if:** Liinks changes materially or becomes unavailable and the instructor accepts a responsive-web reinterpretation.

Sources: [TrustMRR](https://trustmrr.com/startup/habitkit), [Google Play](https://play.google.com/store/apps/details?id=com.roehl.habitkit).

### 3. QR Code AI · strong business, wrong one-hour promise

- **Revenue:** TrustMRR’s public page showed about $14.3K MRR, verified with Stripe.
- **Official product surface:** multiple content types, static/dynamic codes, branded styling, AI art, downloads, scan checking and analytics.
- **Strength:** visually dramatic, marketing-relevant and easy to demonstrate at a superficial level.
- **Why it loses:** true parity requires scannability, secure redirects, file generation, event tracking, anti-abuse protections and an AI-image boundary. A decorative square is not a QR product.
- **Use if:** the class has provisioned backend/API credits and a narrower “static URL QR generator” contract is explicitly accepted.

Sources: [TrustMRR](https://trustmrr.com/startup/qr-code-ai), [official product site](https://qrcode-ai.com/).

## Instructor reveal

Ask teams to score the three candidates before showing the total. Debrief with:

1. Which revenue evidence is direct, independently checkable, and current?
2. Which capability creates the most hidden technical debt?
3. What can be mocked without deceiving the user?
4. Which product gives the cleanest proof that the app works?

The decision is not “copy the highest earner.” It is “choose a valuable behavior whose truth can be built and verified within the real constraints.”

## Predeclared Liinks release gate

Liinks remains the authored/frozen instructor target. Before teaching it as a 60-minute build, run both checks on the same frozen S4-SP-1/AT-01–18 contract:

### A. Fresh Lovable Free golden run

- one genuinely fresh Free workspace with no paid credits or pre-existing generated app;
- no more than 5 displayed build credits total, including the single Plan message;
- AT-01–AT-15 pass and a public incognito AT-16 pass within the 60-minute ship clock;
- AT-17/18 evidence completes within the full 120-minute session;
- no external service, secret, real email or private dataset row is required.

### B. Mixed-confidence learner dry run

- at least 4 learners spanning self-described low, medium and high technical confidence;
- at least 3 of 4 publish a safe V1 that passes 12/15 core tests plus AT-16 within 60 minutes;
- all four complete the checkpoint, truthful test log and evidence submission within 120 minutes (an honestly failed app test is allowed; a tool-access failure is logged separately);
- no learner buys credits, creates an alternate account or exceeds the day’s available 5-credit Free allocation.

If either check fails because the frozen core itself cannot fit the hour/credit boundary, mark Liinks infeasible for this delivery, document the failing AT/credit path and re-score HabitKit before release. Do not silently lower acceptance tests after students begin. If the failure is only vendor outage or a verified monthly cap, use the documented exception route and rerun the gate on a clean workspace.
