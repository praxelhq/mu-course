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

## Known risks / what to check first

1. **`lms.praxel.in` TLS certificate.** DNS is correct at the authoritative nameserver, but
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
