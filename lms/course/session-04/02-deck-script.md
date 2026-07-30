# Session 04 deck script · A $30K clue is not a build brief

**Format:** 21 slides, low-density, build-first  
**Visual system:** Parchment `#FBF8F3`, Pine `#1E3A35`, Ochre `#C4581A`, Sand `#EDE5D8`; Fraunces headlines, Geist body, Geist Mono labels; 0 px radius; no gradients or drop shadows  
**Lifecycle:** Source authored; no PPTX/PDF export in this package  
**Source check:** 30 July 2026; all tool/revenue slides require T-7 review

Speaker notes must be included in the final deck export. Do not put evaluator keys or the first-prompt strong anchor into a student-downloadable deck before checkpoint submission.

---

## Slide 01 · 00:00–00:02

**Title:** A $30K clue is not a build brief

**On-slide:**

> Evidence → contract → prompt → working app → proof

**Visual:** One large revenue clue on the left; a thin arrow to a phone-size public app on the right. Keep the number labelled “about” and date-stamped.

**Speaker notes:** “Today we will ship. The revenue clue establishes that a customer problem may be valuable. Our job is to decide which behavior we can make true in one hour.”

---

## Slide 02 · 00:02–00:04

**Title:** By 116 minutes, submit this

**On-slide:**

- product + sources
- feature contract + first prompt
- public V1 URL
- acceptance-test evidence

**Visual:** Four numbered fields styled like a field guide, not form controls.

**Speaker notes:** V2 comes later; do not lead with the extra-credit feeling. “A truthful failed test is evidence. A pretty URL without tests is not.”

---

## Slide 03 · 00:04–00:10

**Title:** What should win?

**On-slide:**

1. Highest revenue
2. Easiest interface
3. Strongest one-hour proof

**Visual:** Three full-height columns with no correct-state styling yet.

**Student action:** Vote, then write one reason.

**Speaker notes:** Hold the answer. Connect to Session 3: method/evidence beats a confident output.

---

## Slide 04 · 00:10–00:13

**Title:** Three credible products

**On-slide:**

| Liinks | HabitKit | QR Code AI |
| --- | --- | --- |
| ≈$30K MRR | ≈$30K MRR | ≈$14K MRR |
| creator page builder | habit tracker | branded QR platform |

`PUBLIC SOURCE CHECK · 30 JUL 2026 · METRICS MOVE`

**Visual:** Original text cards only. Do not reproduce product logos or screenshots.

**Speaker notes:** Values are rounded, current snapshots. TrustMRR public pages describe provider verification; metrics drift. Founder site independently supports Liinks’ $30K+ scale.

**Sources:** [Liinks](https://trustmrr.com/startup/liinks), [HabitKit](https://trustmrr.com/startup/habitkit), [QR Code AI](https://trustmrr.com/startup/qr-code-ai), [Charlie Clark](https://charlieclark.co/).

---

## Slide 05 · 00:13–00:17

**Title:** Liinks leads: 96† / 100

**On-slide:** Revenue 19 · feasibility 24† · teachability 20 · free-credit fit 14† · integration fit 9 · testability 10

`† CLASSROOM FEASIBILITY RELEASE-GATED BY THE GOLDEN RUN`

**Visual:** Horizontal score strip, Ochre only on the selected total. HabitKit 89 and QR Code AI 71 in small comparison rows.

**Speaker notes:** “Revenue is 20 of 100. A product can be successful and still be a poor classroom build.” Liinks is the frozen instructor candidate, while the one-hour and credit-fit scores remain provisional until a fresh Free golden run and mixed-confidence learner dry run pass. Reveal mobile-native and QR scannability/infrastructure risks.

---

## Slide 06 · 00:17–00:20

**Title:** One app. Three roles.

**On-slide:**

```text
CREATOR → PUBLIC VISITOR → OPERATOR
edit        click             learn
```

**Visual:** Simple left-to-right flow with three human silhouettes or abstract role icons.

**Speaker notes:** This is why the pattern is rich enough: CRUD/state, public consumption and behavioral evidence.

---

## Slide 07 · 00:20–00:24

**Title:** Study behavior. Do not borrow identity.

**On-slide:**

**Functional benchmark:** yes  
**Name, logo, copy, assets, code, customer data, trade dress:** no  
**Unlabelled fake integration:** no

**Visual:** Pine authority block with three hard boundaries.

**Speaker notes:** Read the non-affiliation statement. “Complete” means the classroom contract, not mature commercial parity.

---

## Slide 08 · 00:24–00:27

**Title:** The commercial surface is larger than one hour

**On-slide:**

Blocks · media · forms · audience · analytics · domains · profiles · API

**Visual:** Eight capabilities around a central “creator page”; core six in Pine outline, external boundaries in Sand.

**Speaker notes:** Liinks’ current docs show a broad block catalogue, richer analytics, domains and API. We will select a vertical slice and name omissions honestly.

**Sources:** [block types](https://www.liinks.co/help/article/block-types), [analytics](https://www.liinks.co/help/article/how-do-i-see-how-my-page-is-performing), [API](https://www.liinks.co/help/article/public-api).

---

## Slide 09 · 00:27–00:30

**Title:** Scope is a promise

**On-slide:**

> Build an original creator page builder whose agreed core works end to end.

Identity · six blocks · ordering · design · share · demo analytics · failures

**Visual:** Contract page with one signature line, not a checklist wall.

**Speaker notes:** Explain core, mocked and out-of-scope labels. Every team must adapt the fictional persona, message hierarchy and one core use case to its industry or anchor company using public evidence only; an unchanged generic fixture is capped at 6/10 for Relevance.

---

## Slide 10 · 00:30–00:32

**Title:** Proof comes before polish

**On-slide:**

18 tests  
15 core · 3 publish/access

**Visual:** Large `18` in Geist Mono; tiny examples: invalid URL, hide block, refresh, incognito, keyboard.

**Speaker notes:** “Tests tell Lovable what ‘done’ means and tell us when to stop.” Release checkpoint.

---

## Slide 11 · 00:32–00:35 · instructor-only reveal after checkpoint

**Title:** A first prompt is an operating contract

**On-slide:**

User · job · state · interactions · failures · boundaries · access · tests

**Visual:** Eight labels connected to one prompt page.

**Speaker notes:** Contrast with “Clone Liinks exactly.” Do not distribute this slide before the first-prompt checkpoint closes.

---

## Slide 12 · 00:35–00:37

**Title:** 60-minute ship clock starts now

**On-slide:** `60:00`

**Visual:** Full-bleed Pine timer with Cream numerals; one Ochre progress tick. Keep timer visible in a corner on build slides.

**Speaker notes:** “No new features after minute 49. The last eleven minutes belong to truth and publication.”

---

## Slide 13 · 00:37–00:40

**Title:** Plan once. Edit directly. Approve.

**On-slide:**

Plan mode: 1 credit / message  
Code changes: none until approval

**Visual:** Plan page → pencil → approve arrow.

**Speaker notes:** Current Lovable docs say every Plan message costs one credit and Plan mode does not modify code. A formal plan can be edited before approval when it appears, but Plan mode can instead ask a clarification. If no usable formal plan appears, log `NO_FORMAL_PLAN`, release the instructor fallback after checkpoint, let the student edit it, then switch to one bounded Build request—no second exploratory Plan credit.

**Source:** [Plan mode](https://docs.lovable.dev/features/plan-mode).

---

## Slide 14 · 00:40–00:45

**Title:** The six plan questions

**On-slide:**

1. Truth?
2. All ATs?
3. State explicit?
4. Failures named?
5. Keyboard path?
6. Core first?

**Visual:** One numbered column, large spacing.

**Speaker notes:** Edit the plan directly. Remove auth/payment/integration scope. Approve.

---

## Slide 15 · 00:45–00:84

**Title:** Build the vertical slice

**On-slide:**

```text
ROUTES → STATE → BLOCK LOOP → DESIGN → FAILURES → SHARE
```

**Visual:** Progress rail that the instructor advances at minutes 53, 67, 77 and 84.

**Speaker notes:** Leave this slide visible while building. Narrate “contract / evidence / smallest next change.” Stop class-wide only for shared failures.

---

## Slide 16 · 00:84–00:90

**Title:** A mock must say what it is

**On-slide:**

`Demo import — no Instagram connection`  
`Demo signup — stored only in this browser`  
`Demo analytics · this browser only`  
`Build agent ≠ AI feature inside the live app`

**Visual:** Three exact UI labels with Sand borders.

**Speaker notes:** No fake geographic audience, API success, emails sent or DNS connection. Lovable’s build agent changes the project; a model call inside the published app is a separate product capability with AI/run-credit, data and evaluation implications. SignalShelf does not need one in the core.

**Source:** [Lovable credits and usage](https://docs.lovable.dev/introduction/credits-and-usage).

---

## Slide 17 · 00:90–00:95

**Title:** Publish is not “ask the chat”

**On-slide:**

Publish dialog → security scan → URL → incognito

**Footer fact:** Publish dialog currently costs 0 build credits.

**Visual:** Four-step path.

**Speaker notes:** Free/Pro public apps are accessible to anyone with the link. Use dummy data. Asking the agent to publish consumes standard chat usage; the dialog is currently free.

**Source:** [Publish](https://docs.lovable.dev/features/publish).

---

## Slide 18 · 00:95–00:106

**Title:** Swap laptops. Break the claim.

**On-slide:**

Incognito · 390 px · keyboard · one invalid input

**Visual:** Two devices facing each other; no score graphics.

**Student action:** Reviewer runs tests before giving design opinions.

**Speaker notes:** Reviewer initials the log; builder owns fixes.

---

## Slide 19 · 00:106–00:112

**Title:** Repair a failed test, not your feelings

**On-slide:**

> AT-07 + AT-10 fail because disabled state is not persisted. Fix only that path; preserve passing behavior; verify both.

**Visual:** One repair prompt in a code-style block.

**Speaker notes:** Broad aesthetic prompts at this point are scope failure.

---

## Slide 20 · 00:112–00:119

**Title:** V1 is evidence. V2 is controlled learning.

**On-slide:**

Day 0: V1  
Days 1–8: choose + repair  
Day 9: regress  
Day 10: publish changes + submit V2

**Footer fact:** Free is 5/day, up to 30/month; daily grants do not roll over.

**Visual:** Ten-day line with only four active moments, not fifty credit icons.

**Speaker notes:** Latest eligible version is graded; V1 remains in history. Publishing is free; Build cost varies. Distinguish “daily grant exhausted below the monthly cap” from “30-credit monthly cap reached”: the second may not reset tomorrow and uses a tested starter or a personal deadline through the workspace’s displayed cap reset. No one must buy credits.

**Sources:** [pricing](https://lovable.dev/pricing), [credits](https://docs.lovable.dev/introduction/credits-and-usage).

---

## Slide 21 · 00:119–00:120

**Title:** Your app now needs a system

**On-slide:**

> Which event could acquire, serve, retain—or recover—a user?

**Visual:** App event on left; empty workflow node on right, leading into Session 5.

**Speaker notes:** Take three spoken examples: signup, high-intent click, failed follow-up. “Next session, submit the flowchart before the automation.”
