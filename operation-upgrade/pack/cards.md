# Constraint and fault cards

> Print, cut, and deal one constraint per student by seat so neighbours differ. Deal a fault only from something the student actually built.

## Constraint cards

### 1. The board has taken twelve lakh back

*Cutesh Ramanohan:* “Two of our leases came up for renewal in Pune and the landlord did not blink. I am not going to dress this up — you have twenty-eight lakh a year now, not forty. Same ninety days.”

**What you must do:** Something has to come out of the plan. Decide what, and be able to tell her why that one.

---

### 2. The till system will not give up its data

*Sunita Menon:* “I finally got the vendor on the phone. There is no way to get the sales numbers out automatically — no export, no connection, nothing. Somebody has to type them, the way we do now.”

**What you must do:** Anything you were automating that needs sales data just got slower and more expensive. Narrow it or drop it.

---

### 3. Legal has ruled on customer data

*Cutesh Ramanohan:* “No customer record goes into anything we do not control. Not names, not numbers, not order history. I know that makes your life harder. It also means I can sleep.”

**What you must do:** The voice agent as you specified it is off the table. Either it never touches a customer record, or it does not happen.

---

### 4. The board wants to see something in thirty days

*Cutesh Ramanohan:* “They have asked for an interim update. I need one real thing working by day thirty — not a plan for a thing, a thing. Otherwise this whole programme gets a harder look than it deserves.”

**What you must do:** At least one of your fixes has to be helping somebody by week four.

---

### 5. The store managers have had enough

*Priya Nair:* “We already keep four systems up to date. If head office sends us a fifth one this quarter I am telling you now, honestly, we will not use it. We are not being difficult. We are just full.”

**What you must do:** No more than two new systems for the stores to learn. Pick the two that earn it.

---

### 6. Procurement will approve one new supplier

*Cutesh Ramanohan:* “Finance has been burned by subscriptions nobody cancels. One new paid vendor this year. Everything else uses what we already own or costs nothing.”

**What you must do:** One paid system. The rest has to be people, process, or something you already have.

---

### 7. The agency will not hand over access

*Sunita Menon:* “They will take written requests and that is it. No access to the site, no access to the code, nothing. It is in the contract and the contract runs to March.”

**What you must do:** Whatever you do about the website has to work through written requests and a person who approves them.

---

### 8. People think this is about redundancies

*Arun Kulkarni:* “There is a message going round the managers' group saying the AI project is how head office plans to cut staff. Two of them have stopped answering my questions. I need you to know that before you go any further.”

**What you must do:** Cutesh's second rule is now the whole problem. You have to buy the training and adoption work, and you have to say what you will tell the managers.

---

## Fault cards

### 1. It told us the paneer roll was safe

*Deal only to: docs:build*

*Priya Nair:* “A guest asked about nuts. I asked the assistant instead of calling Arun, because that is what it is for. It said no nuts and it showed me the document. She has been taken to hospital. She is going to be fine. I need to know what I should have done differently, because I did exactly what we agreed.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: Both allergen guides were in the index and neither carried an effective date. The system selected the 2024 one, cited it correctly, and produced an answer that was confidently, catastrophically wrong. Priya did nothing wrong — she used it exactly as intended.
- What would have prevented it: Retiring superseded documents at the point of indexing, an owner and a review date on every file that survives, and an evaluation set containing the allergen questions specifically, run before anyone was told to trust it.
- The point: A citation is not a correctness guarantee. It is a pointer to whatever was in the pile.

---

### 2. Somebody asked it what I earn, and it told them

*Deal only to: docs:build*

*Arun Kulkarni:* “A kitchen supervisor in Kochi asked the assistant what I am paid, as a joke I think. It gave him the exact figure and the month it was revised. He has told other people. I am not upset with you, but I need to understand how this happened, and so will four hundred and fifty other people.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The payroll file was indexed along with everything else in the operations folder. The system had no way of knowing it was confidential — it only ever knows what it was handed, and it answers whatever it can answer.
- What would have prevented it: Deciding what goes into the index one document at a time rather than by folder, and a rule that anything containing personal data is excluded before indexing rather than filtered afterwards.
- The point: There is no such thing as private data inside a corpus you chose to index.

---

### 3. The agent promised a refund we never approved

*Deal only to: calls:build*

*Sunita Menon:* “A customer rang about a late order on Saturday. The agent apologised and told her we would refund it that day. Nobody was told, no refund exists, and she has now called back twice. She has the recording. What do I say to her?”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The agent was given the refund policy to read but no boundary on what it could commit the company to. Reading a policy and being allowed to apply one are different permissions, and nothing in the design separated them.
- What would have prevented it: An explicit list of what the agent may do — answer, capture details, route — with anything that commits money or makes a promise handed to a named human, and a sample of calls reviewed weekly by somebody who would notice.
- The point: An agent's permissions are a design decision, not a consequence of what it knows.

---

### 4. Our Diwali campaign is somebody else's Diwali campaign

*Deal only to: marketing:build*

*Sneha Varma:* “The Koramangala outlet published a post this morning. The line is almost word for word what Anna's Kitchen ran last week, and the layout is theirs too. Their marketing lead has put both side by side on LinkedIn. Four hundred comments and counting.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The instruction was written to produce something in a common festival style, with no grounding in what Bharat Bites specifically sounds like, and nothing between generation and publication. The store manager did what the system invited them to do.
- What would have prevented it: The brand guide as the actual source for the instruction rather than a general sense of the category, and a human approval before anything reaches a public account — the same gate a person's draft would have gone through.
- The point: A reusable skill with no approved context reproduces the average of its category.

---

### 5. Four shortlists in a row look the same

*Deal only to: hiring:build*

*Rahul Desai:* “I have gone back through the last four. Almost everyone we advanced came from a chain you have heard of. The single-outlet operators — some of whom I know are excellent, I have met them — are at the bottom of every list. I do not think anyone decided this.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The sheet gathers evidence from public sources, and public sources say much more about people who worked somewhere with a marketing budget. Nobody ranked candidates by employer. The evidence simply thinned out for everybody else, and thin evidence reads as a weaker candidate.
- What would have prevented it: Keeping evidence, inference and missing information in separate columns and never collapsing them into a score, plus somebody checking the shape of the shortlist against the shape of the applicant pool every round.
- The point: Absence of evidence becomes evidence of absence the moment you sort by it.

---

### 6. A live payment key went into the change log

*Deal only to: website:build*

*Sunita Menon:* “The agency sent through the configuration for the new booking form and it was approved in ninety seconds, by me. Our payment gateway key was in it, in plain text, in a system eleven people can read. The gateway has flagged it.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The approval step existed and somebody's name was on it, which is most of the way there. But approving means reading, and a ninety-second approval of a configuration file is a signature, not a review.
- What would have prevented it: An automatic check for anything that looks like a credential before a change can be approved at all, so the control does not depend on a human being careful at 5pm on a Friday.
- The point: A gate a person clicks through without reading is a gate in name only.

---

### 7. I told the board wastage was down and it was not

*Deal only to: reporting:build*

*Cutesh Ramanohan:* “I used your Monday summary in the board pack. Wastage down eleven percent across the company. It turns out six outlets did not file that week, and they are the six with the worst numbers. I have had to write to the board and correct it. Tell me how the summary did not mention that.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: The automation consolidated what arrived and reported on it accurately. It was never asked what to do about what did not arrive, so silence from an outlet was indistinguishable from a good week.
- What would have prevented it: A branch for missing data — the count of outlets that filed printed at the top of every summary, and the summary refusing to state a company-wide figure at all when the response rate is below a threshold.
- The point: Trigger and action are the easy two. The branch people forget is the one for nothing arriving.

---

### 8. Arun is taking three weeks off, starting Monday

*Deal only to: any plan where one person is named too often*

*Cutesh Ramanohan:* “His father is unwell and he is going to Pune. He has not taken leave since March and I am not going to ask him to delay it. He tells me he is the named person on three of the things you built. Talk me through what happens on Tuesday.”

**Facilitator only — reveal after they have written their own answers.**

- What failed: Every system that needed a human to check it was pointed at the person who already knew everything, because he was the obvious choice each time. The plan reduced the number of phone calls and left the dependency exactly where it was.
- What would have prevented it: Spreading accountability while the systems were being designed rather than after, and treating 'who covers this when they are away' as part of naming an owner rather than a separate question nobody asked.
- The point: A human gate is only a control if the human is actually available.

---

