# Instructor runbook — Ninety Days at Bharat Bites

**App** https://bharat-bites-web-production.up.railway.app
**Your console** `/instructor` · key **`AMI361Qa9jxU`**
**The wall** `/wall?key=AMI361Qa9jxU&section=D` — change `section` to yours

Join codes, one per section: `bharat-a` … `bharat-h`. Students type the code and a name. No accounts, no passwords, nothing to install.

---

## Five minutes before class

1. Open `/instructor` on your laptop, enter the key, pick your section.
2. Open the wall link on the projector. **Press F11 for full screen.** It shows the join code in huge type on its own — you don't need to write it anywhere.
3. Check the roster says 0. If it doesn't, hit **Reset section**.
4. Decide your pacing (below). Fully self-paced is the default.

That's it. Nothing else to prepare.

---

## The one decision: how the room moves

| | What it does | Use when |
|---|---|---|
| **Fully self-paced** *(default)* | No ceiling at all — they run the whole thing at their own speed | Most deliveries. The room sorts itself out and you coach the tail. |
| **You set a ceiling** | Students move freely up to where you are | You want the room held roughly together, or you are driving from the front. |

Either way, **four stages still pull everyone together**: the pitches, the ballot, the debrief, the close. Advancing never yanks a student mid-sentence — they get a dismissible "the room has moved on" line and finish what they're doing.

**Watch the spread panel**, not the phase. It shows how many are on each screen. Call the room on when the tail has caught up, not when the front-runners get bored.

---

## The fourteen stages · 108 minutes

| # | Stage | Min | What you do |
|---:|---|---:|---|
| 0 | Doors | 3 | Code on the wall. Wait. |
| 1 | The offer | 3 | Company hero, then Cutesh's note. **Don't narrate it** — he does the briefing. |
| 2 | Walk it | 8 | "Open all seven and read what's actually happening. Look at Arun's tile." |
| 3 | Decide | 10 | Four changes max. Everyone picks a reason and names a person. |
| 4 | **The brain** | 10 | **The centrepiece. Do not rush this.** Everyone asks all five questions. |
| 5 | The plan | 7 | Three minutes with a neighbour: find one thing in theirs with nobody checking it. |
| 6 | It changed | 6 | Constraint cards land. Neighbours get different ones on purpose. |
| 7 | **It broke** | 8 | **Hands up before the wall reveals the split.** See below — this is now a five-step drill. |
| 8 | Mariga | 5 | The consultant arrives for anyone in trouble. Two minutes, then move on. |
| 9 | Sign it | 8 | They lock. After this nothing changes. |
| 10 | Pitch | 10 | Mark four on the console. 75 seconds each. Challenge one. |
| 11 | Fund one | 4 | Ballot opens. Nobody funds themselves. |
| 12 | Debrief | 6 | Walk the wall. Two lines to sit on (below). |
| 13 | Close | 20 | **Protected. Let nothing above eat into this.** |

---

## Stage 7 in detail — the failure drill

Nobody types anything. Each student gets a different fault and works it in five steps, each appearing only once the last is answered:

1. **The trace.** The wall of evidence: what was asked, what the system answered, which document it cited, what it cost. Read in silence. This is the part that lands.
2. **What actually went wrong** — four options, one right. Wrong picks say why they're wrong rather than just going red.
3. **The response drill** — six steps to drag into order: stop, contain, diagnose, fix, verify, restore. Getting it wrong is the point: restoring before containing tells them the cost in plain words.
4. **What stops it recurring** — the control.
5. **What runs while it's down** — the fallback. Most people forget there has to be one.

Then it reveals which of *their own* choices would have prevented it.

**Ask the room after step 3:** "Who put 'tell people it's back' before 'check that it's right'?" Usually a third of the room.

---

## Stage 8 — Mariga Economova

Anyone whose plan is genuinely in trouble — over budget, an assistant built on an uncleaned library, a brain that would repeat a salary, everything bet on AI — meets a turnaround consultant who names each problem, says what it costs, and says what to do instead. Everyone else gets two hard questions about their own plan; nobody gets a pat on the head.

It's a self-correcting stage. You don't need to identify who's struggling — the app already has.

---

## If you're behind

Cut in this order. Never cut the last two.

1. Pitches from four to two — saves 5 min
2. "Open three problems, not seven" — saves 4 min
3. Skip the neighbour red-team at stage 5 — saves 3 min

**Never rush the brain.** Every strong realisation in the session is in those ten minutes.

---

## The two lines that make the debrief land

Both are on the wall at stage 11. Read the number, then ask the question.

**"Forty-one of you named a human. Thirteen didn't."**
→ *"Those of you who named someone — could that person actually do it on a Tuesday when you're not there?"*

**"Nine of you built a brain that would tell a store manager what a colleague earns."**
→ *"Nobody set out to do that. You indexed a folder."*

If a third is worth having: ask who chose "stop producing four reports nobody reads." It costs nothing, lands in week one, and most people scroll straight past it.

---

## If something goes wrong

| | |
|---|---|
| **A student can't get in** | Check the code matches their section. A name already taken gives a clear message — they add an initial. |
| **Wifi dies** | Nothing happens. The game runs entirely in their browser and syncs when it returns. The header says "Saved on this laptop". |
| **Your console dies** | Students keep playing. Reopen `/instructor`, everything is still there. |
| **A student closed their laptop** | Same link, same name, same code. Their work comes back. |
| **Somebody locked too early** | **Unlock** next to their name on the roster. |
| **The projector won't full-screen** | F11. Or just leave it windowed — the layout copes. |
| **Total failure** | `operation-upgrade/pack/` — six printable sheets that carry the whole exercise on paper. Deal constraints by seat number, read the fault cards aloud. |

**Do not put the facilitator key on the projector.** It's the only secret here.

---

## After class

- **Export nothing** — student work stays in the room. Nothing to collect.
- **Reset the section** before the next one uses the same code.
- Rotate the key when all eight sections are done:
  `railway variables --service bharat-bites-web --set "FACILITATOR_KEY=..."`

---

## Verified

60 students joining simultaneously, playing, locking and voting at once: 1,302 requests, zero failures. Join p95 1.3s under a full-class thundering herd, everything else under half a second. Rerun any time with
`pnpm simulate <url> <section> <key> 60`.
