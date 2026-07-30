# Praxel LMS — launch status (Session 2)

Written overnight, 29 July 2026. Read this first.

## Links

| What | URL |
|---|---|
| **App (primary)** | https://lms.praxel.in |
| **App (always-works fallback)** | https://forge-prod-production.up.railway.app |
| Instructor console (Session 2) | `/instructor/session2` |
| Submission matrix (all sections) | `/instructor/matrix` |
| Grading review queue | `/instructor/review` |

Use the fallback URL if `lms.praxel.in` is not yet serving — see *Known risks* below.

## Logging in

Everyone signs in with **Clerk** at `/sign-in` — no passwords are stored by the LMS.

- **You (instructor/admin):** sign in as `build@praxel.in`. That account is provisioned as
  `admin`, which unlocks every instructor + admin surface.
- **Students:** sign in with the email address on the roster. 459 students across sections
  A–H are loaded. A student whose email is not on the roster is bounced to
  `/not-on-roster` — that is deliberate.
- First sign-in links a Clerk account to the roster row automatically (by email).

## What students see

Only **Session 2**. Every other session and assignment is gated shut (reversibly — nothing
was deleted). The Session-2 hub carries four artifacts:

| Artifact | Submits | AI graded? | Notes |
|---|---|---|---|
| S2 · Meme | image | no | goes to the section gallery, votable |
| S2 · AI Image (SCENE) | image + the SCENE prompt | no | gallery, votable |
| S2 · AI Presentation | PDF | **yes** | Visual appeal / Brevity / Clarity |
| S2 · COSTAR Prompt | writeup | **yes** | the six COSTAR elements |

### Voting rules (as specified)
- A student votes only within **their own section**; they can *view* every section's wall.
- No self-voting; one vote per image; re-voting toggles off.
- A student must cast **5 votes in that gallery** before their own tally unlocks.
- Vote counts and the leaderboard stay hidden until **you reveal** them, per section, from
  the instructor console. Instructors always see live tallies.

## Instructor console — `/instructor/session2`

Per section: how many submitted each artifact (out of the section roster), graded count and
average mark, and a per-student table showing who submitted what, their AI mark, and for
galleries the votes they **cast vs received**. Auto-refreshes every 15s. Each gallery has a
**Reveal results** toggle for that section.

## Grading

AI grading runs in a background worker (`forge-worker`), never in a request. Presentations
are graded from the **actual PDF** — Claude reads the document natively, so "visual appeal"
is judged on the real slides, not just extracted text. Rubrics are per-artifact and editable
in the admin type editor (`/admin/types`) — paste your real briefs/criteria there anytime;
no deploy needed.

Cost: roughly **$0.02–0.05 per graded artifact**, so a full cohort pass is a few tens of
dollars.

## Verified in production overnight

A real submission was pushed through the entire live pipeline and then deleted:

1. PDF uploaded to S3 (prod bucket) ✓
2. Gate check passed, submission row created ✓
3. Job enqueued to pg-boss ✓
4. `forge-worker` consumed it ✓
5. Claude read the **actual PDF pages** and returned per-dimension scores ✓
6. Grade + feedback persisted, submission moved to `graded` ✓

The grader's output on a deliberately bare two-slide deck — evidence it truly saw the
slides rather than just text:

> **Visual appeal 2/10** — "plain black text on white background with no layout structure,
> hierarchy, imagery, or design elements… essentially unformatted text, not a designed
> presentation."
> **Clarity 1/10** — "two headings with zero supporting content."
> **Brevity 3/10** — "extremely short… empty rather than concise."

Test data was removed afterwards: production now holds 459 students, 0 submissions, 0 grades.

Also verified: `/sign-in` renders real Clerk (pointing at `clerk.lms.praxel.in`), and
protected routes correctly redirect unauthenticated visitors.

## Known risks / what to check first

1. **Sign-in depends on Clerk finishing domain verification — CHECK THIS FIRST.**
   All five Clerk CNAMEs are in place and resolve correctly from public DNS (verified against
   8.8.8.8), but Clerk's dashboard still shows `0/5 Verified` and has not issued its
   certificates, so `clerk.lms.praxel.in` is not yet serving Clerk's JS. Until it does, the
   sign-in page renders the branding but no sign-in widget, and **nobody can log in**.
   - Check: https://dashboard.clerk.com → Configure → Domains. Hit **Verify configuration**.
   - This is waiting on Clerk's own DNS check, not on anything in the app or the DNS records.
     It normally clears by itself within a few hours of the records being added (added
     ~03:30 IST).
   - If it is still `0/5` when you wake and you need students in immediately, tell me and I
     will switch the app to a configuration that does not depend on the custom domain.

   **Ruled out as causes** (checked overnight, all clean): the Clerk secret key works
   (Backend API returns 200), Clerk's own API reports exactly the CNAME targets that were
   created, all five records resolve correctly from public DNS, and the zone has no CAA
   record, no DNSSEC and no wildcard. Nothing on our side is wrong — it is Clerk's DNS check.

   **FASTEST fallback (~2 minutes, verified working at 05:05) — switch to the Clerk
   *development* instance.** It serves from `prepared-seal-71.clerk.accounts.dev`, which needs
   no custom DNS at all, so logins work immediately. I confirmed its secret key is valid and
   that it serves real Clerk JS (291 KB, HTTP 200), with 0 of its user slots used.

   To do it, set these two variables on the `forge-prod` service and let it redeploy:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cHJlcGFyZWQtc2VhbC03MS5jbGVyay5hY2NvdW50cy5kZXYk
   CLERK_SECRET_KEY=[REDACTED — rotate before deployment]
   ```
   The roster gate, submissions, voting and grading are all unaffected — only the identity
   provider endpoint changes. **Caveat: Clerk development instances are capped at 100 users**,
   so this comfortably covers one or two sections in a single sitting but NOT all 459. Use it
   to get today's class moving, then switch back to the `pk_live` keys once the production
   instance verifies. Ask me and I will do the swap.

   **Alternative fallback — Clerk proxy mode.** Clerk can serve its
   Frontend API through *our* domain instead of `clerk.lms.praxel.in`, which removes the
   dependency on Clerk's DNS verification entirely. It needs: a proxy URL set in the Clerk
   dashboard (Domains → Proxy configuration), plus `proxyUrl` passed to `ClerkProvider` and
   `clerkMiddleware`, and a route that forwards to Clerk's Frontend API. This can run on the
   working Railway URL, so it does not wait on either certificate. Roughly 30 minutes of work
   — say the word and I will do it. I did not deploy it unprompted because it changes the
   auth path and should be a deliberate decision.

2. **`lms.praxel.in` TLS certificate.** DNS is correct at the authoritative nameserver, but
   the record's TTL is 4 hours, so public resolvers (and Railway's validator) may still be
   serving a stale value for a while. Until Railway issues the certificate, use the
   `forge-prod-production.up.railway.app` fallback — the app itself is fully working.
   Nothing to fix by hand; it clears itself.
2. **Two leftover Railway services** (`Postgres-_1vR`, `Postgres-jxj7`) are unused and can be
   deleted at your convenience. The live database is the service named **`Postgres`**.
3. Grades are **provisional** until finalised in the review queue — that is by design.

## Operational notes

- Re-running `scripts/prod-bootstrap.ts <roster.csv>` is safe: it adds/updates students and
  never touches submissions, votes or grades. Use it when the roster changes.
- `scripts/session2-setup.ts` is likewise idempotent; it re-asserts the four artifacts and
  the "only Session 2 is open" gating.
- To open a later session, flip its gates in `/instructor/unlocks`.
- Students who registered under a personal email can later be merged onto their MU address;
  ask for that when you have the mapping.
