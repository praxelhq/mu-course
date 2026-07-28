# PRAXEL · MU COURSE 1 · LMS SCORING & ASSESSMENT METHODOLOGY

*v1.0 · July 2026 · Internal build spec for the Praxel LMS, feeding Praxy · Not for student distribution*

## Who this is for

This document is written for whoever builds the LMS (the learning platform Pushpak is building for this course) and whoever configures its grading logic. It turns the seven assessment components named in COT v3.0 into specific, buildable rules: what gets collected, when, from whom, and the exact formula that turns it into a number. Every number and band below is a proposed default, not a fixed requirement; where I've made a judgment call the founders didn't specify, I've said so plainly rather than pretend it was handed to me.

**One instruction that applies everywhere below and matters for what does or doesn't reach students:** grades, scores, and rubric bands stay inside the LMS, visible only to the student themselves and to faculty. The Praxy profile that goes public shows artifacts, links, and validation (endorsements, sign-offs, peer and external ratings), never a raw grade or percentage. Nobody's Praxy profile should ever say "62% on their AI interview." It should say "AI interview completed, industry command validated" or similar, with the number staying in the LMS.

**Where MU's existing digital fluency workshop data would sharpen this:** Session 2 is built as the equivalent of that workshop's first session, and the artifact-quality rubric below and the AI interview question bank in particular would benefit from whatever rubrics or sample outputs already exist from prior digital fluency runs. I don't have that material. Wherever it exists, drop it in to replace or calibrate the defaults below rather than starting from scratch.

---

## 1. Value chain map (15% of final grade, team-scored)

**Collected:** one submission per team, at two checkpoints: Session 6 (checkpoint, formative feedback only, not scored) and the capstone (Sessions 9–10, scored). The Session 6 checkpoint exists so teams get real feedback with time to fix gaps before the score that counts.

**Scoring, out of 100, four dimensions at 25 points each:**

| Dimension | What it's checking | 0–6 (Emerging) | 7–15 (Developing) | 16–21 (Proficient) | 22–25 (Strong) |
| --- | --- | --- | --- | --- | --- |
| **Depth** | How many of the eight required layers (players, value chain stages, economics, policy, funding/environment, public sentiment, hiring and jobs, global outlook) are researched with real, sourced data, not filler | 0–2 layers covered | 3–4 layers, thin | 5–7 layers, solid | All 8, each with sourced specifics |
| **Breadth** | Whether the map covers the real landscape, incumbents and startups both, not just the one anchor company | Anchor company only | Anchor plus 1–2 others | A genuine set of players mapped | The competitive landscape is legible on its own |
| **Presentation** | Whether a stranger could understand the map without the team explaining it live | Requires the team to narrate it | Followable with effort | Clear on a first read | Clear enough to hand to a recruiter cold |
| **Visual quality** | Whether it's an actual visual map or diagram, not a text document with headers | Plain text/bullets only | Basic charts, no real layout | A built visual map, functional | A visual map good enough to be the artifact itself |

**This score is a team score.** Every team member's individual grade on this component equals the team score, multiplied by that individual's Peer Contribution Index (defined in section 5). This is where free-riding on the map specifically gets caught.

---

## 2. Artifact quality (15% of final grade, mixed individual and team)

**What counts as an artifact here:** the Session 2 skill family, the Session 3 data memo, the Session 4 app, the Session 5 automation (the individually-owned piece), and the team media artifacts (jingle, ad, poster, skill repo). Each submitted artifact gets scored on the same four-dimension rubric, out of 10 each:

| Dimension | What it's checking |
| --- | --- |
| **Functionality** | Does it actually work? Does the app run, does the automation execute, does the memo's numbers check out? |
| **Craft** | Is the execution good, not just present? Clean formula, clean UI, clean copy. |
| **Relevance** | Is it built for the team's real company or industry, or is it generic practice that happens to exist? |
| **Verification evidence** | Can the student show they checked their own work? A one-line note on what was verified and how counts. |

**A student's artifact quality score is the average across every artifact they individually submitted**, on a 0–40 scale (4 dimensions × 10), scaled to the 15% weight. Team-built media artifacts score once at the team level and that score applies to every team member equally, since individual authorship inside those isn't separable the way the personal automation or the app is.

---

## 3. Workflow relevance and usefulness (15% of final grade, team-scored with an individual ownership check)

This is the component built around the requirement that a team's automation must be shown to their real company contact and receive an actual thumbs-up before it counts as complete.

**Scoring, out of 100, four parts:**

| Part | Points | How it's scored |
| --- | --- | --- |
| **Company sign-off** | 40 | 0 if no contact was made with the company at all. 15 if contact was made and the process was mapped, but no sign-off was obtained by the deadline. 40 if the company contact gave a documented thumbs-up (a short written or recorded confirmation, uploaded to the LMS, is the evidence). |
| **Usefulness argument** | 30 | Does the team's writeup make a specific, credible case for what the automation saves (time, errors, a repeated task removed), rather than a vague claim that it's "helpful"? |
| **Execution quality** | 20 | Does the automation actually run without manual patching, end to end? |
| **Individual ownership clarity** | 10 | Cross-checked against the AI interview (section 4): can the specific student who claims ownership of a piece of the automation actually explain and defend it? |

**Why sign-off is worth 40 of the 100 points and not scaled down:** a beautifully built automation the company never approved has not cleared the actual bar this component exists to test. This mirrors how the automation task was framed to students from day one: the real business's approval is the point, not a stand-in for it.

Individual grade on this component: the team's 100-point score, times that individual's Peer Contribution Index, with the individual-ownership sub-score (the 10 points) applied to that specific student only rather than pooled across the team, since it's already an individual measure.

---

## 4. AI interview (15% of final grade, fully individual)

**Format:** a one-on-one, AI-conducted voice interview per student, roughly 10 to 12 minutes, run through the LMS in the window after Session 8 and before Session 9. Every student gets their own session; nothing here is a group activity.

**Question bank, four categories, drawn on adaptively rather than fixed per student:**

1. **Industry command.** Questions grounded in the student's own team's value chain map: "Explain the economics of your industry in under a minute." "Who are the three biggest players, and what actually differentiates them?"
2. **Defence of own submissions.** Questions that require the student to explain their specific artifacts: "Walk me through the automation you built. What would break it?" "Why did you pick this particular repetitive task to automate, out of everything the company does?"
3. **Operator's Loop reasoning.** Direct probes on tool choice and verification, e.g. "Why did you use this tool over an obvious alternative?" "What's one number in your data memo you personally checked, and how?"
4. **Transfer.** One question that applies the student's industry knowledge to a scenario they haven't seen before, testing whether they actually understand the space or memorized their own slides.

**Scoring, out of 100, one category at 25 points each,** using the same four-band shape as the other rubrics (Emerging / Developing / Proficient / Strong), scored by the grading AI against a rubric, not free-form.

**Human escalation, required, not optional:** any interview where the AI's confidence is low, or where a student's answers are inconsistent with what they actually submitted, gets flagged for a human instructor to review the transcript before the score is finalised. This component is worth too much, and touches academic integrity too directly, to run fully unsupervised in its first year. Build the flagging and review queue as a first-class feature, not an afterthought.

**If the voice interview system isn't ready in time:** fall back to a short human oral check-in per team (5 minutes per student, one instructor or TA per team) rather than skip the component. The rubric above still applies; only the interviewer changes.

---

## 5. Peer contribution scoring (10% of final grade, standalone, plus a multiplier applied elsewhere)

Peer scoring does two jobs in this course, and the LMS needs to support both.

**Job one: catching free-riders inside team-scored components.** At two checkpoints, after Session 6 and after Session 10, every student privately allocates 100 points across their teammates (never themselves), reflecting relative contribution to the team's shared work over that period.

For each student, compute a **Peer Contribution Index (PCI):**

```
PCI = (points received from teammates ÷ (100 × (team size − 1))) × team size
```

A student who receives an exactly equal share of every teammate's 100 points scores a PCI of 1.0. Someone who's consistently rated below their equal share scores below 1.0; someone consistently rated above scores above 1.0. **Clip the PCI to a band of 0.70 to 1.20** before applying it, so one grudge or one halo effect can't swing a grade wildly on its own.

Apply the final PCI (averaging the two checkpoints, weighted 40/60 toward the later one since it reflects the fuller picture) as a multiplier to each individual's share of the three team-scored components: the value chain map (section 1), workflow relevance (section 3), and the team-level portion of artifact quality (section 2). This is the actual free-rider control mechanism.

**Job two: the standalone 10% grade.** In the same peer survey, alongside the point allocation, collect a short set of qualitative ratings on a 1–5 scale: reliability, communication, and generosity in helping teammates. Average these across both checkpoints and across all raters into a 0–10 score. This is the direct 10% line item.

**A safeguard worth building in from day one:** flag, for instructor review, any team where every member rated every other member identically or near-identically. That pattern can mean a genuinely equal-effort team, or it can mean a quiet agreement to protect each other. Don't auto-resolve either way; surface it.

---

## 6. Continuous evaluation: surprise quizzes (5% of final grade, individual)

**Cadence:** roughly one short quiz every one to two sessions, run at the instructor's discretion, unannounced. Each quiz is five to eight multiple-choice questions, tied to that session's pre-read or the prior session's content, delivered through the LMS at a moment the instructor chooses within the class, and auto-graded on submission.

**Best-of-three logic:** across every surprise quiz a student sits for in the term, their top three scores by percentage are averaged and that average becomes their 5% grade. Every quiz attempt beyond the top three is still visible to the student as feedback (a score, correct answers shown), explicitly labelled as not counting toward the grade, so the formative value isn't lost once a student's top three are locked in.

**The Session 1 DPDP quiz is the one exception, and it needs to be built as a genuinely separate data object, not just excluded by a scoring rule.** Students are not told this quiz doesn't count; it's presented and administered identically to every other surprise quiz. For the mechanism to hold up, the LMS must:

- Write the Session 1 DPDP quiz result to a distinct field, something like `diagnostic_quiz_dpdp`, entirely separate from the `surprise_quiz` records that feed the best-of-three calculation.
- Never surface that field in any student-facing quiz history, running tally, or "your best scores so far" view, in any form that would let a student notice a quiz they took is simply absent from their record.
- Use it only as an instructor-facing diagnostic: how much of the room actually did the Session 1 pre-read.

This is the one piece of this entire methodology that should never appear in anything student-facing, including any future FAQ, support macro, or help-centre article the LMS team writes.

---

## 7. The Praxy-bound portfolio (25% of final grade, individual, the largest single component)

This is deliberately scoring something different from every other component. Sections 1 through 4 already score whether the underlying work is good. This section scores whether the finished, packaged, public-facing portfolio is something a stranger, someone with zero classroom context, could look at and trust without asking a follow-up question. A student with excellent underlying work and a sloppy, incomplete, or unvalidated profile should score well on sections 1–4 and poorly here; that gap is intentional.

**Scoring, out of 100, five parts:**

| Part | Points | What it checks |
| --- | --- | --- |
| **Completeness** | 20 | Every required artifact is present and linked: skill family, data memo, app plus GitHub, automation, media pieces, value chain map, company engagement writeup. |
| **Clarity and narrative** | 25 | Can a stranger understand, in under a minute of looking at the profile, what industry this student worked in, what they built, and why it matters? |
| **External validation** | 25 | Endorsements or ratings from people outside the course: the company point of contact, a guest practitioner, an alumni mentor, anyone credible who isn't a classmate or instructor. Scored on both count and substance; a one-line generic "great job" endorsement counts for less than a specific one. |
| **Peer validation** | 15 | Ratings on the finished profile itself, collected from peers (can include but is not limited to teammates), distinct from the team-contribution peer score in section 5. This is peers reacting to the packaged output, not to how hard someone worked. |
| **Evidence integrity** | 15 | An automated live-check: does every link actually resolve, does the app actually load, does the video actually play. Broken links fail this sub-score directly regardless of how good the underlying work was. |

**Build note:** the evidence integrity check should run as an automated crawl the LMS performs itself close to the grading deadline, not something an instructor manually clicks through hundreds of times.

---

## 8. The final formula

```
Final Grade =
 0.15 × (Value chain map score × individual PCI)
 + 0.15 × (Artifact quality score, individually averaged)
 + 0.15 × (Workflow relevance score × individual PCI, with the ownership sub-score applied individually)
 + 0.15 × (AI interview score)
 + 0.10 × (Peer contribution rating, standalone)
 + 0.05 × (Best-of-three surprise quiz average)
 + 0.25 × (Portfolio score)
```

All seven components are on a 0–100 scale before their weight is applied, so the formula sums to a 0–100 final grade directly. Every component's raw score, its weighted contribution, and the PCI applied to it should be visible to the student in their own LMS dashboard, broken out line by line. Grading only feels fair when a student can see exactly where each point came from.

---

## 9. Data flow: LMS to Praxy

| What | When it moves | What Praxy shows |
| --- | --- | --- |
| Artifacts (app links, GitHub, media files, the map, the data memo) | As each ships, session by session | The artifact itself, live |
| Company sign-off confirmation | On upload | A validated badge or similar, not the raw score |
| External and peer validation | As collected | The endorsement or rating itself, attributed where the endorser agreed to be named |
| Grades, rubric scores, PCI values, quiz results | Never | Nothing; these stay inside the LMS, visible only to the student and faculty |

This separation is what makes the Praxy profile trustworthy as a public artifact: it shows what was built and who vouches for it, not a percentage a stranger has no context to interpret anyway.
