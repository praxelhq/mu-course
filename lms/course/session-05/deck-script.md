# Session 05 deck script · Revenue systems with Make

**Format:** source script only; no PPTX in this package  
**Slides:** 27  
**Runtime:** 120 minutes including builds  
**Visual system:** Parchment `#FBF8F3`, Ink `#1F1A14`, Pine `#1E3A35`, one Ochre `#C4581A` accent, Sand rules, zero radius, no gradients or shadows. Fraunces display; Geist body; Geist Mono labels/numbers.  
**Pacing:** low-density instruction. Build timers occupy the full canvas. Failure reveals use one new fact per slide.

**Surprise-quiz alternate:** when S5-SQ-v1 is activated, do not show slides 02–04 at the start. Run the quiz 00:00–00:07, then use slides 03–04 as a compressed hook from 00:07–00:12 and resume slide 05. The title may remain visible before the quiz without revealing its content.

## 01 · A workflow is a promise

**Time:** 00:00–00:02  
**On screen:**

> Revenue systems with Make  
> A workflow is a promise about what happens next.

**Visual:** one horizontal path from event to verified outcome; no app logos.  
**Speaker note:** “Today is not a tour of Make. You will design, break, repair, and package one operating system for the product you built last session.”

## 02 · Put these in order

**Time:** 00:02–00:05  
**On screen:** five movable-looking text blocks:

- approval requested
- lead received
- follow-up drafted
- duplicate found
- input validated

Footer: **Which event must never happen twice?**  
**Speaker note:** students order individually. Take two answers, no correction yet.

## 03 · One lead, two promises

**Time:** 00:05–00:08  
**On screen:**

> Same webhook. Same email. Two CRM rows. Two drafts.

**Visual:** two identical event IDs branching to duplicated outputs.  
**Speaker note:** run the deliberately flawed scenario twice using the normal fixture.

## 04 · What failed?

**Time:** 00:08–00:12  
**On screen:**

1. Make
2. The modules
3. The design

Ochre underline under **The design** only after the vote.  
**Speaker note:** reveal that retried or repeated webhooks are normal. The design made “send/create” possible before a duplicate check.

## 05 · Automation is state, not spaghetti

**Time:** 00:12–00:14  
**On screen:**

> If you cannot name the states, you cannot control the system.

Below: `RECEIVED → VALIDATED → QUEUED → APPROVED → COMPLETED`  
Side states: `DUPLICATE · QUARANTINED · RETRYING · REJECTED`  
**Speaker note:** define a state as the business truth after an event, not the icon currently lit in Make.

## 06 · The six-box contract

**Time:** 00:14–00:18  
**On screen:**

| 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| Trigger | Contract | State | Decision | Action | Evidence |

**Speaker note:** one sentence each. Use the lead example: webhook; required fields; new/duplicate; route; draft/queue; audit row and output.

## 07 · Put the brake before the cliff

**Time:** 00:18–00:20  
**On screen:**

> Before money, messages, deletion, publishing, or customer status changes:

`VALIDATE → DEDUPE → APPROVE → ACT`  
**Speaker note:** approval can be a recorded state transition, not merely a notification. Drafting is safer than sending in class.

## 08 · Choose one operating problem

**Time:** 00:20–00:22  
**On screen:**

- GTM · route a lead without duplicates
- Operations · contain and escalate an exception
- Revenue · reconcile expected and actual money

Footer: **One pack. One owner. One measurable result.**  
**Speaker note:** default the room to GTM if time or confidence is low. Teams may choose another pack only after stating the success metric.

## 09 · Draw before you automate

**Time:** 00:22–00:30  
**On screen:** full-canvas build timer `08:00` and the required nodes:

`START · VALIDATE · DEDUPE · DECIDE · ACT/QUEUE · RECORD · END`  
**Speaker note:** release the initial template. Do not answer “which Make module?” questions yet; redirect to business state and contract.

## 10 · Every path must land

**Time:** 00:30–00:35  
**On screen:**

| Case | Must end as |
|---|---|
| normal | completed or safely queued |
| duplicate | no second irreversible action |
| malformed | quarantined with reason |
| timeout | retrying/incomplete, then resolved or manual |
| approval | pending; no action yet |

**Speaker note:** students add a terminal label and owner for all five.

## 11 · Gate 1

**Time:** 00:35–00:37  
**On screen:**

> Submit the problem frame + initial flowchart.

`S5.1 · FORMATIVE · VERSIONED · 02:00`  
**Speaker note:** clarify that a feedback score is diagnostic and never enters the grade.

## 12 · Read feedback like an operator

**Time:** 00:37–00:42  
**On screen:**

1. Find the cited node.
2. Decide whether the risk is real.
3. Accept, adapt, or reject.
4. Record why.

**Speaker note:** show one good AI finding and one overreach. The model advises; the student owns the design.

## 13 · Repair the smallest dangerous gap

**Time:** 00:42–00:47  
**On screen:** full-canvas timer `05:00`  
Corner prompt: **What could create money, message a human, or corrupt a record twice?**  
**Speaker note:** prioritise blocker repair over prettier diagrams.

## 14 · Change log

**Time:** 00:47–00:52  
**On screen:**

| Advice | Decision | Evidence |
|---|---|---|
| Add duplicate state | Accepted | before queue/write |
| Retry malformed data | Rejected | retry cannot repair input |

**Speaker note:** every student records at least one accepted/adapted and one rejected/not-applicable suggestion where evidence supports it.

## 15 · Build only the spine

**Time:** 00:52–00:54  
**On screen:**

`Webhook → Normalize → Search key → Router → Queue/Draft → Audit`

Footer: **Scheduling stays off.**  
**Speaker note:** describe connections as classroom substitutes, not production architecture.

## 16 · Normal is the first test, not the last

**Time:** 00:54–01:02  
**On screen:** trace card:

`trace_id: trc_s5_normal_001`  
`route: warm · final state: drafted`  
`outbound sends: 0`  
**Speaker note:** build and run the normal fixture. Pause after each module to map it to a flowchart node. Show the audit row and draft/queue artifact.

## 17 · Checkpoint A · contract

**Time:** 01:02–01:10  
**On screen:** timer `08:00`

- trigger accepts fixture
- required fields mapped
- `trace_id` retained
- scheduling off

**Speaker note:** supported teams use the starter map; extensions wait.

## 18 · Checkpoint B · control

**Time:** 01:10–01:18  
**On screen:** timer `08:00`

- idempotency key computed
- existing key searched before write/action
- fallback route exists
- owner named

**Speaker note:** verify route filters are mutually legible; remember Make router routes execute sequentially, but do not rely on route order as dedupe.

## 19 · Checkpoint C · evidence

**Time:** 01:18–01:27  
**On screen:** timer `09:00`

- normal case passes
- audit row/output created
- run trace visible
- screenshot not yet taken

**Speaker note:** refuse “green bubbles only” as proof; students must identify the resulting business state.

## 20 · The gauntlet

**Time:** 01:27–01:30  
**On screen:**

> Predict → Run → Observe → Repair once

`DUPLICATE · MALFORMED · TIMEOUT · APPROVAL`  
**Speaker note:** expected results remain hidden until predictions are submitted.

## 21 · Four ways to be wrong

**Time:** 01:30–01:41  
**On screen:** four-quadrant timer with one question per fixture:

- Duplicate: **Was a second action possible?**
- Malformed: **Did it stop safely with a reason?**
- Timeout: **Was state retained for retry/manual recovery?**
- Approval: **Could anything irreversible happen while pending?**

**Speaker note:** release one fixture every 2–3 minutes. Students may use replay if live services are slow.

## 22 · Two ways to copy

**Time:** 01:41–01:44  
**On screen:**

| Blueprint JSON | Public scenario link |
|---|---|
| point-in-time file | latest saved version |
| import into scenario | view; sign in to copy |
| under 2 MB | dynamic link |
| connections recreated | connections recreated |

**Speaker note:** both can reveal static settings, mapped values, notes, and URLs. No connection does not mean no secret.

## 23 · The evidence bundle

**Time:** 01:44–01:48  
**On screen:**

1. revised flowchart
2. blueprint JSON
3. redacted run log
4. sample output
5. workflow PNG
6. limitation + change note

Optional: safe public scenario link  
**Speaker note:** explain why each artifact answers a different trust question.

## 24 · Scrub before you share

**Time:** 01:48–01:51  
**On screen:**

> Search the blueprint, log, notes, URLs, PNG, and output for:

`@ · token · key · secret · webhook · bearer · customer · phone`  
**Speaker note:** patterns are prompts, not complete detection. Use demo identities and `.test` domains. Delete/rotate any credential exposed during practice.

## 25 · A gallery card is not a grade card

**Time:** 01:51–01:54  
**On screen:** wireframe:

`[WORKFLOW PNG]`  
`Lead triage with duplicate protection`  
`[Clone in Make] [View sample output]`  

Footer: **No grades · confidence · prompts · credentials · private data**  
**Speaker note:** if no safe, controlled share URL exists, withhold the clone action. The private blueprint remains roster-gated assessment evidence. Instructor approval controls gallery exposure.

## 26 · Gate 2

**Time:** 01:54–01:57  
**On screen:**

> Submit. Preview. Attest. Keep scheduling off.

`S5.3 BUILD EVIDENCE → S5.4 PRIVACY-CLEARED GALLERY`  
**Speaker note:** one repair submission is allowed after provisional feedback. Company sign-off remains pending until it is real.

## 27 · Refuse to automate this

**Time:** 01:57–02:00  
**On screen:**

> What would make you refuse to switch this on for a real company?

Below: **One refusal condition. One next test.**  
**Speaker note:** collect responses. Bridge to company process mapping, real sign-off, and the later AI interview defence.
