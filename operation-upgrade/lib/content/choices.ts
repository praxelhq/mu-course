// Everything a student used to type, they now pick.
//
// Ninety minutes is not enough time to write, and a blank box is where a
// hesitant student stalls. Selection is faster, comparable across a room, and
// — with the right distractors — more diagnostic than prose, because a wrong
// pick names the specific misunderstanding.

import type { Approach } from "./problems";

export type Quality = "strong" | "workable" | "weak";

export type Choice = {
  id: string;
  text: string;
  /// Shown after they pick. This is where the teaching happens.
  note: string;
};

export const QUALITY_LABEL: Record<Quality, string> = {
  strong: "That holds up",
  workable: "Defensible",
  weak: "That will not survive the board",
};

// ---------------------------------------------------------------------------
// Why did you choose that?
// ---------------------------------------------------------------------------

/// One shared set of rationales rather than a bespoke list per option. The
/// engine judges whether the reason actually fits what they picked, which is
/// far more diagnostic than asking them to write a sentence nobody reads.
export type Rationale = Choice & {
  /// Approaches this reason is honestly true of.
  fits: readonly Approach[];
  /// True only when the choice is a prerequisite others depend on.
  needsUnlock?: boolean;
};

export const RATIONALES: readonly Rationale[] = [
  {
    id: "prerequisite",
    text: "Everything else we might do here depends on this being right first",
    fits: ["redesign"],
    needsUnlock: true,
    note: "This is the strongest reason in the game when it is true. Cleaning the ground makes what comes next cheaper and safer, and the board can see the logic.",
  },
  {
    id: "cheapest-pain",
    text: "It removes the most pain per rupee of anything on the page",
    fits: ["redesign", "build"],
    note: "Usually right about a process change and usually wrong about a hire — a person costs the same amount again next year, and the year after.",
  },
  {
    id: "scales",
    text: "It reaches all twenty-five outlets on the same day",
    fits: ["build"],
    note: "True of a system and untrue of a person. If you gave this reason for a hire, you have described something that does not happen: one manager does not reach five cities at once.",
  },
  {
    id: "single-point",
    text: "It stops one person being the only one who knows",
    fits: ["hire", "redesign"],
    note: "Careful. Hiring a second Arun gives you two single points of failure rather than none. Writing the knowledge down removes the dependency; adding a person only shares it.",
  },
  {
    id: "fastest",
    text: "It is the fastest thing here that helps somebody",
    fits: ["redesign"],
    note: "Worth saying out loud when true. The board meets on day ninety and wants something real before that — a fix landing in week two buys you room for the slow one.",
  },
  {
    id: "asked-for",
    text: "It is what the team keeps asking for",
    fits: ["hire", "build", "redesign"],
    note: "Never wrong, rarely sufficient. People ask for more of what they already do. Your job was to ask what would stop them needing to ask.",
  },
];

// ---------------------------------------------------------------------------
// Why are you leaving one alone?
// ---------------------------------------------------------------------------

export type Verdict = Choice & { quality: Quality };

export const LEAVING_REASONS: readonly Verdict[] = [
  {
    id: "no-trading-impact",
    text: "It hurts, but no outlet stops trading tomorrow because of it",
    quality: "strong",
    note: "The right shape of answer. You ranked it against the others on consequence rather than on how annoying it is.",
  },
  {
    id: "downstream",
    text: "Whatever I fix first will make this one smaller anyway",
    quality: "strong",
    note: "A real argument, and the board will follow it — as long as you can name which fix does the shrinking.",
  },
  {
    id: "wrong-tool",
    text: "Nothing on offer here would actually fix it — it needs a different kind of change",
    quality: "workable",
    note: "Honest, and sometimes true. Be ready for the follow-up: what kind of change, and when?",
  },
  {
    id: "ran-out",
    text: "I ran out of money and this was what was left",
    quality: "weak",
    note: "Cutesh's fifth rule exists to stop exactly this answer. Not choosing is a decision, and a decision needs a reason that is not arithmetic.",
  },
];

// ---------------------------------------------------------------------------
// The constraint lands. What do you do?
// ---------------------------------------------------------------------------

export const CONSTRAINT_MOVES: Record<string, readonly Verdict[]> = {
  "budget-cut": [
    { id: "drop-dearest", text: "Drop the single most expensive thing and keep the rest intact", quality: "workable", note: "Fast and defensible. Check what you just broke: if the dear one was unlocking a cheaper one, you have paid for the cheap thing twice." },
    { id: "keep-sequence", text: "Keep the cheap groundwork, drop the system that sits on top of it", quality: "strong", note: "The right instinct. Groundwork is cheap and makes the system cheaper later; a system on ungroundworked mess is the thing you cannot afford to get wrong." },
    { id: "shave-all", text: "Trim a bit from everything so nothing is lost", quality: "weak", note: "Four half-built changes help nobody. A transformation is not a portfolio you rebalance — it is a sequence you either complete or do not start." },
  ],
  "no-pos-api": [
    { id: "narrow", text: "Narrow the automation to the numbers people already type by hand", quality: "strong", note: "Exactly right. The value was never the till data — it was the three hours a day spent reshaping twenty-five spreadsheets." },
    { id: "drop-it", text: "Drop that change entirely and spend the money elsewhere", quality: "workable", note: "Defensible, but you have given up the part that still worked. Ask what was left that a person is still retyping." },
    { id: "manual-feed", text: "Have somebody type the till numbers in every morning", quality: "weak", note: "You have automated a report and created a daily manual job to feed it. Somebody now owns that forever, and on the day they are ill the report is silently wrong." },
  ],
  "legal-ban": [
    { id: "no-records", text: "Rebuild it so it never touches a customer record — answers only, no lookups", quality: "strong", note: "The right move. Most of what callers ask is about the business, not about themselves. You keep the value and lose the exposure." },
    { id: "human-only", text: "Take it out and put people on the phones instead", quality: "workable", note: "Safe and expensive. It works from day one and it caps out — but nobody is going to be embarrassed by it." },
    { id: "anonymise", text: "Keep it and strip the names out before anything is sent", quality: "weak", note: "An order history with the name removed is still a customer record, and legal said records. This is the answer that gets a programme stopped." },
  ],
  "thirty-days": [
    { id: "pull-forward", text: "Move a cheap, fast change to the front so something lands in week two", quality: "strong", note: "What the board actually wants is evidence the programme is real. A small thing working beats a large thing explained." },
    { id: "demo", text: "Show them a demonstration of the big system instead", quality: "weak", note: "A demonstration is a promise. You will be asked for the real thing in thirty more days, and you will not have bought yourself anything." },
    { id: "resequence", text: "Reorder so the groundwork finishes first and say so plainly", quality: "workable", note: "Honest, and it works if you can describe what finishing the groundwork visibly changes for a store manager." },
  ],
  "no-new-tools": [
    { id: "replace", text: "Make one of your systems replace a tool they already maintain", quality: "strong", note: "The best answer in the set. Adoption is not a training problem — it is an arithmetic problem, and you just made the arithmetic work." },
    { id: "two-only", text: "Cut down to the two systems that earn the learning cost", quality: "workable", note: "Complies, and you should be able to say why those two and not the others." },
    { id: "mandate", text: "Keep all of them and have head office require it", quality: "weak", note: "Priya told you what happens. A tool that store managers do not use produces worse data than no tool, because now the gaps look like zeroes." },
  ],
  "one-vendor": [
    { id: "spend-on-hardest", text: "Spend the one vendor on the problem that genuinely cannot be solved by process", quality: "strong", note: "Right. Most of these problems are process problems wearing a software costume. Find the one that is not." },
    { id: "cheapest-vendor", text: "Spend it on the cheapest system so you keep the most changes", quality: "weak", note: "You chose by price rather than by what only software can do. The cheap system is usually the one a form and a deadline would have replaced." },
    { id: "no-vendor", text: "Use no new vendor at all and do everything with process and people", quality: "workable", note: "A real strategy, and slower. Be ready to say what you gave up." },
  ],
  "agency-locked": [
    { id: "written-approval", text: "Put a named approver and a weekly release on the written requests", quality: "strong", note: "The control was never the access — it was that somebody's name goes on a change before it ships. You can have that without touching the site." },
    { id: "wait", text: "Wait for the contract to end in March and do nothing until then", quality: "weak", note: "The wrong price stayed live for four days in March. That happens again between now and the contract ending, and you decided to let it." },
    { id: "spend-elsewhere", text: "Leave the website alone and move that money to another problem", quality: "workable", note: "Defensible. Say out loud that you are accepting the wrong-price risk, so nobody is surprised the next time it happens." },
  ],
  rumour: [
    { id: "buy-adoption", text: "Buy the training work and tell the managers exactly what is and is not changing", quality: "strong", note: "The only answer that addresses what is actually happening. Two managers stopped answering Arun — that is the programme failing, not a communications problem." },
    { id: "reassure", text: "Have Cutesh send a message saying nobody is losing their job", quality: "workable", note: "Necessary and not sufficient. A message from the top is what everybody expects in a redundancy round." },
    { id: "ignore", text: "Carry on and let the results speak for themselves", quality: "weak", note: "The results arrive in week six. The rumour is already changing what people tell you, which means your week-six results are built on data people are managing." },
  ],
};

// ---------------------------------------------------------------------------
// The fault. What broke, and what do you add?
// ---------------------------------------------------------------------------

export const FAULT_DIAGNOSIS: Record<string, readonly Verdict[]> = {
  allergen: [
    { id: "both-indexed", text: "Two documents disagreed and nothing said which one was current", quality: "strong", note: "Correct. It did not malfunction — it read what you gave it, picked the one that read most relevant, and cited it properly." },
    { id: "model-wrong", text: "The model made a mistake", quality: "weak", note: "It made no mistake. It answered accurately from a document you put in front of it. Blaming the model is how this happens a second time." },
    { id: "priya-wrong", text: "Priya should have called Arun instead of trusting it", quality: "weak", note: "She used it exactly as intended. If the answer is that people should not trust it, you have built something with no purpose." },
    { id: "no-testing", text: "Nobody had ever asked it the dangerous questions before launch", quality: "workable", note: "True, and it is the second failure rather than the first. The test set would have caught it; the contradictory library caused it." },
  ],
  salary: [
    { id: "folder-indexed", text: "It was indexed by folder rather than by decision, one document at a time", quality: "strong", note: "Correct. Nobody chose to publish payroll. Somebody chose a folder, and the folder contained it." },
    { id: "permissions", text: "The assistant needed permissions so only managers could ask", quality: "workable", note: "That helps and it does not solve it. Managers should not be able to read it either. The fix is upstream: it never enters the index." },
    { id: "hr-fault", text: "HR should not have kept payroll in a shared Drive", quality: "workable", note: "Fair, and it was there before you arrived and will be there after. Your design has to survive the company you actually have." },
    { id: "model-leak", text: "The model leaked training data", quality: "weak", note: "It did not. It read a file you indexed and answered a question about it. There is no leak here, only a decision." },
  ],
  "refund-promise": [
    { id: "no-boundary", text: "It could read the refund policy, so it assumed it could apply one", quality: "strong", note: "Exactly. Knowing a rule and being allowed to act on it are different permissions, and nothing in the design separated them." },
    { id: "tone", text: "It was too eager to please the caller", quality: "weak", note: "That is a description, not a cause. It committed the company to money because nothing told it that committing money was not its job." },
    { id: "no-review", text: "Nobody was listening to any of the calls", quality: "workable", note: "True, and it is how you found out late rather than why it happened. Review catches the second one." },
    { id: "customer-pushy", text: "The customer pushed hard for a refund", quality: "weak", note: "Customers will always push. A control that only works with polite customers is not a control." },
  ],
  copycat: [
    { id: "no-context", text: "The instruction had no grounding in what Bharat Bites specifically sounds like", quality: "strong", note: "Right. With no approved context it produces the average of its category, and the average of that category is your competitor." },
    { id: "no-gate", text: "It went straight to a public account with nobody approving it", quality: "strong", note: "Also right, and the more expensive of the two. A person's draft would never have gone out unread." },
    { id: "manager-fault", text: "The store manager should have checked it first", quality: "weak", note: "They did what the system invited them to do. If the design needs everyone to be careful, it is not a design." },
    { id: "model-copied", text: "The model copied the competitor's campaign", quality: "weak", note: "It reproduced a common pattern. Nobody handed it their campaign — that is what 'the average of its category' looks like from the inside." },
  ],
  "shortlist-bias": [
    { id: "thin-evidence", text: "Public sources say more about people from big-name employers, and thin evidence reads as a weaker candidate", quality: "strong", note: "The exact mechanism. Nobody ranked by employer. The evidence simply ran out for everyone else, and running out looked like a worse answer." },
    { id: "sorted", text: "The evidence got collapsed into a score and then sorted", quality: "strong", note: "Also right, and it is the moment the harm becomes systematic. Evidence, inference and missing information have to stay in separate columns." },
    { id: "bad-data", text: "The underlying data was biased", quality: "workable", note: "True and not actionable on its own. What are you changing on Monday?" },
    { id: "recruiter", text: "Rahul should have noticed sooner", quality: "weak", note: "He did notice — that is why you are reading this. Four rounds is how long it takes a person to see a pattern nobody was checking for." },
  ],
  "api-key": [
    { id: "approval-theatre", text: "There was an approver, but ninety seconds is a signature rather than a review", quality: "strong", note: "The uncomfortable one. You built the gate and it worked exactly as designed — somebody clicked it." },
    { id: "no-scan", text: "Nothing automatically checked the change for anything that looks like a credential", quality: "strong", note: "The fix that does not depend on a person being careful at five on a Friday." },
    { id: "agency-fault", text: "The agency should not have put a key in a configuration file", quality: "workable", note: "They should not have. They will again, and so will the next agency." },
    { id: "more-approvers", text: "One approver was not enough — it needed two", quality: "weak", note: "Two people clicking through in ninety seconds is not twice the control. It is the same control, billed twice." },
  ],
  "missing-stores": [
    { id: "no-branch", text: "Nothing told it what to do when an outlet sent nothing at all", quality: "strong", note: "Correct. Silence and a good week were indistinguishable, so it reported the good week." },
    { id: "consolidation", text: "It consolidated whatever arrived and reported on that accurately", quality: "strong", note: "Yes — and that is the point. It did its job. The job was specified without the branch that mattered." },
    { id: "outlets-fault", text: "The six outlets should have filed", quality: "weak", note: "The six outlets with the worst numbers are exactly the ones who will not file. A system that assumes compliance measures compliance, not wastage." },
    { id: "board-fault", text: "The number should have been checked before it went in the board pack", quality: "workable", note: "It should. Design so the summary cannot state a company-wide figure it does not have the data for, and the check becomes unnecessary." },
  ],
  "arun-leave": [
    { id: "one-name", text: "Everything that needed a human pointed at the one person who already knew everything", quality: "strong", note: "The thing you were hired to fix, rebuilt with newer parts. Every gate was correct and every gate was the same person." },
    { id: "no-cover", text: "Nobody asked who covers each system when its named person is away", quality: "strong", note: "Naming an owner is half the job. The other half is naming what happens when they are at a funeral in Pune." },
    { id: "arun-fault", text: "Arun should have flagged how much was landing on him", quality: "weak", note: "He did not take leave for six months. Expecting the overloaded person to raise the alarm is the failure repeating itself." },
    { id: "bad-luck", text: "Bad luck — it could have been anyone", quality: "weak", note: "It could not. He was on three of your systems; nobody else was on more than one. This was the most likely outcome, not the unluckiest." },
  ],
};

/// What you add so it cannot happen again.
export const FAULT_CONTROLS: Record<string, readonly Verdict[]> = {
  allergen: [
    { id: "retire-and-date", text: "Retire every superseded document and put an owner and a date on what survives", quality: "strong", note: "Fixes the cause. The assistant can only be as honest as the pile, and now the pile has one version of the truth." },
    { id: "refuse-allergens", text: "Make allergen questions refuse and route to a named person", quality: "strong", note: "Fixes the blast radius. Some questions should never be answered by a machine no matter how good the documents get." },
    { id: "test-set", text: "Write a set of dangerous questions it must pass before every release", quality: "strong", note: "Fixes the recurrence. This is the ₹4L obligation, and this is the morning it earns its money." },
    { id: "disclaimer", text: "Add a line telling staff to double-check anything important", quality: "weak", note: "A disclaimer moves the blame, not the risk. Priya read the citation and believed it, and she was right to." },
  ],
  salary: [
    { id: "decide-per-doc", text: "Index one document at a time, by decision, never by folder", quality: "strong", note: "The cause, fixed. Every file in there is now a choice somebody made and can defend." },
    { id: "exclude-personal", text: "Anything containing personal data is excluded before indexing, not filtered after", quality: "strong", note: "The difference between a rule and a hope. Filtering afterwards means it was in there, and something read it." },
    { id: "audit-index", text: "Publish the list of what the assistant has read, for anyone to check", quality: "workable", note: "Good hygiene, and it makes the next mistake findable rather than preventing this one." },
    { id: "block-words", text: "Block the assistant from answering questions containing 'salary' or 'pay'", quality: "weak", note: "Somebody asks what Arun's package is. Or his CTC. Or what band he is on. You cannot list your way out of a corpus." },
  ],
  "refund-promise": [
    { id: "list-actions", text: "Write down exactly what it may do — answer, capture, route — and nothing else", quality: "strong", note: "Permissions become a design decision instead of an accident of what it happened to read." },
    { id: "human-commits", text: "Anything that commits money or makes a promise goes to a named human", quality: "strong", note: "The line that matters. It can say what the policy is; it cannot apply one." },
    { id: "sample-calls", text: "Somebody listens to a sample of calls every week", quality: "workable", note: "How you find the next one in days rather than after the third angry call." },
    { id: "retrain", text: "Give it better instructions about not promising things", quality: "weak", note: "You are asking politely for a guarantee. A boundary it cannot cross is not the same as an instruction it should follow." },
  ],
  copycat: [
    { id: "brand-source", text: "Ground the instruction in the actual brand guide rather than a sense of the category", quality: "strong", note: "The difference between a reusable skill and a generic one. Approved context is the whole value." },
    { id: "approve-before", text: "Nothing reaches a public account without a named person approving it", quality: "strong", note: "The same gate a person's draft already went through. You removed it by accident when you automated the drafting." },
    { id: "originality-check", text: "Check each draft against competitor campaigns before publishing", quality: "workable", note: "Useful, and it catches the symptom. Grounding it properly stops producing the symptom." },
    { id: "fewer-posts", text: "Go back to head office writing all of them", quality: "weak", note: "You have solved the problem by removing the capability. Forty requests a week are still landing on two people." },
  ],
  "shortlist-bias": [
    { id: "separate-columns", text: "Keep evidence, inference and missing information in separate columns and never total them", quality: "strong", note: "The single most important line in this station. The moment it becomes one number, the thin-evidence candidates sink." },
    { id: "shape-check", text: "Compare the shape of each shortlist against the shape of the applicant pool", quality: "strong", note: "Makes the pattern visible in round one instead of round four." },
    { id: "human-picks", text: "A person makes every advance decision, with the sheet as input only", quality: "strong", note: "Already Cutesh's rule. Worth restating, because the sheet quietly became a ranking without anybody deciding it should." },
    { id: "remove-employer", text: "Hide the employer name from the sheet", quality: "weak", note: "The bias was never in the employer field. It was in how much public evidence exists about people from big employers, which every other column carries too." },
  ],
  "api-key": [
    { id: "auto-scan", text: "Automatically refuse any change containing something shaped like a credential", quality: "strong", note: "A control that does not depend on a person being careful. This is what 'the gate is the process, not the tool' means in practice." },
    { id: "rotate-and-log", text: "Rotate the key, and record what was exposed and for how long", quality: "strong", note: "The part people skip. The key is already out; the question is what was done with it." },
    { id: "approval-checklist", text: "Give the approver three specific things to look for before they can approve", quality: "workable", note: "Better than a bare button. Still a person at five on a Friday." },
    { id: "trust-agency", text: "Ask the agency to be more careful", quality: "weak", note: "You have written a control whose enforcement mechanism is somebody else's diligence." },
  ],
  "missing-stores": [
    { id: "print-response-rate", text: "Print how many outlets filed at the top of every summary", quality: "strong", note: "The cheapest fix on the page. The number was always missing; now it is impossible to miss." },
    { id: "refuse-below-threshold", text: "Refuse to state a company-wide figure at all when too few outlets have filed", quality: "strong", note: "The system now declines rather than misleads. That is the same behaviour you wanted from the assistant." },
    { id: "chase-missing", text: "Automatically chase the outlets that have not filed", quality: "workable", note: "Fixes tomorrow's data and not today's summary. Do both." },
    { id: "estimate", text: "Fill the gaps with an estimate based on last week", quality: "weak", note: "You have invented numbers and put them in a board pack. The six missing outlets are the worst performers; last week's figures will flatter them again." },
  ],
  "arun-leave": [
    { id: "spread-owners", text: "Redistribute the named owners so nobody carries more than one", quality: "strong", note: "The fix, and it should have happened while you were designing rather than now." },
    { id: "name-cover", text: "Name who covers each system when its owner is away, in writing", quality: "strong", note: "An owner without cover is a single point of failure with a name attached." },
    { id: "document-decisions", text: "Write down what Arun actually decides, so the decision is not in his head", quality: "strong", note: "The deepest fix. You were hired because knowledge lived in one person, and this is the only option that moves it." },
    { id: "delay-leave", text: "Ask Arun to delay his leave until the systems are stable", quality: "weak", note: "His father is unwell. And a system that is only stable while one person never leaves is not stable." },
  ],
};

/// When it is down, what happens? The question most people never ask.
export const FALLBACKS: Record<string, readonly Verdict[]> = {
  allergen: [
    { id: "named-person", text: "Allergen questions go to the operations lead's phone, always", quality: "strong", note: "A fallback that exists whether the system is up or down. This is the only one that works at 1pm on a Saturday." },
    { id: "printed", text: "Every outlet keeps a printed, dated allergen sheet behind the counter", quality: "strong", note: "Unfashionable and correct. Paper does not have an outage." },
    { id: "wait", text: "Staff wait until it comes back", quality: "weak", note: "A guest is at the table. Waiting is not a fallback, it is the absence of one." },
    { id: "guess", text: "Staff use their judgement in the meantime", quality: "weak", note: "Their judgement was the problem you were solving. This is where you started, minus the confidence." },
  ],
  "refund-promise": [
    { id: "roll-to-human", text: "Calls roll straight to a person when the agent is unavailable", quality: "strong", note: "The caller never learns there was a system. That is what a good fallback feels like." },
    { id: "callback", text: "It takes a number and promises a callback within the hour, and somebody owns that list", quality: "strong", note: "Works when there is nobody to roll to. The second half of that sentence is the part that usually goes missing." },
    { id: "voicemail", text: "It plays a recorded message and hangs up", quality: "workable", note: "Better than ringing out, and you are still losing the catering enquiry you built this to catch." },
    { id: "nothing", text: "The phone just rings", quality: "weak", note: "Forty-one calls a week went unanswered. That was the problem. You have made it the fallback." },
  ],
  "missing-stores": [
    { id: "manual-day", text: "Sunita does it by hand for a day and the summary says so", quality: "strong", note: "Honest and boring. The summary carrying its own provenance is what makes it trustworthy." },
    { id: "raw-numbers", text: "Send the raw filings with no summary at all", quality: "workable", note: "Nobody reads twenty-five spreadsheets, which is where you came in — but at least nothing is asserted that is not true." },
    { id: "yesterday", text: "Repeat yesterday's summary", quality: "weak", note: "A stale number that looks current is more dangerous than no number." },
    { id: "skip", text: "Skip that day's summary silently", quality: "weak", note: "Silently is the problem. If it is missing, the people who rely on it need to know it is missing." },
  ],
};

// ---------------------------------------------------------------------------
// The response drill — put it right, in order
// ---------------------------------------------------------------------------

/// Incident response has a shape: stop the harm, contain what has already
/// happened, work out why, fix the cause, prove it, then restore. Students
/// order the steps and find out which phase they skipped.
export type DrillPhase = "stop" | "contain" | "diagnose" | "fix" | "verify" | "restore";

export const DRILL_PHASE_LABEL: Record<DrillPhase, string> = {
  stop: "Stop the harm",
  contain: "Contain what already happened",
  diagnose: "Find out why",
  fix: "Fix the cause",
  verify: "Prove it is fixed",
  restore: "Put it back",
};

export const DRILL_ORDER: readonly DrillPhase[] = ["stop", "contain", "diagnose", "fix", "verify", "restore"];

export type DrillStep = { id: string; text: string; phase: DrillPhase };

export const DRILLS: Record<string, readonly DrillStep[]> = {
  allergen: [
    { id: "a-stop", text: "Take the assistant off allergen questions today", phase: "stop" },
    { id: "a-contain", text: "Find every other person it gave that answer to this week", phase: "contain" },
    { id: "a-diag", text: "Work out which document it read, and why that one", phase: "diagnose" },
    { id: "a-fix", text: "Retire the 2024 guide and put a date on everything left", phase: "fix" },
    { id: "a-verify", text: "Run the allergen questions against it and check every answer", phase: "verify" },
    { id: "a-restore", text: "Put it back, with the operations lead reviewing a sample daily", phase: "restore" },
  ],
  salary: [
    { id: "s-stop", text: "Take the assistant offline entirely, now", phase: "stop" },
    { id: "s-contain", text: "Find out who asked, what they were told, and who they told", phase: "contain" },
    { id: "s-diag", text: "List every document in the index and how each one got there", phase: "diagnose" },
    { id: "s-fix", text: "Remove the payroll file and rebuild the index one decision at a time", phase: "fix" },
    { id: "s-verify", text: "Ask it the pay questions again and confirm it refuses", phase: "verify" },
    { id: "s-restore", text: "Bring it back, and tell the four hundred and fifty people what happened", phase: "restore" },
  ],
  "refund-promise": [
    { id: "r-stop", text: "Take the agent off the line", phase: "stop" },
    { id: "r-contain", text: "Pull the week's calls and find everyone else it made a promise to", phase: "contain" },
    { id: "r-diag", text: "Work out what it thought it was allowed to do, and why", phase: "diagnose" },
    { id: "r-fix", text: "Write down what it may do, and route anything committing money to a person", phase: "fix" },
    { id: "r-verify", text: "Test it against the calls that went wrong and check it now refuses", phase: "verify" },
    { id: "r-restore", text: "Put it back with somebody reviewing a sample of calls weekly", phase: "restore" },
  ],
  "missing-stores": [
    { id: "m-stop", text: "Withdraw the wastage figure from the board pack", phase: "stop" },
    { id: "m-contain", text: "Work out how many previous summaries had the same gap", phase: "contain" },
    { id: "m-diag", text: "Check what the automation does when an outlet sends nothing", phase: "diagnose" },
    { id: "m-fix", text: "Add the branch: print the response rate, refuse a figure below the threshold", phase: "fix" },
    { id: "m-verify", text: "Re-run last month with outlets missing and confirm it now says so", phase: "verify" },
    { id: "m-restore", text: "Resume the summary, and write to the board with the corrected number", phase: "restore" },
  ],
  copycat: [
    { id: "c-stop", text: "Take the post down", phase: "stop" },
    { id: "c-contain", text: "Check what else has gone out from the same instruction", phase: "contain" },
    { id: "c-diag", text: "Read the instruction and find what it was actually grounded in", phase: "diagnose" },
    { id: "c-fix", text: "Rebuild it on the brand guide and add an approval before publishing", phase: "fix" },
    { id: "c-verify", text: "Generate ten drafts and check they sound like Bharat Bites", phase: "verify" },
    { id: "c-restore", text: "Reopen it to outlets, with Sneha approving before anything ships", phase: "restore" },
  ],
  "shortlist-bias": [
    { id: "b-stop", text: "Pause shortlisting on the open roles", phase: "stop" },
    { id: "b-contain", text: "Re-read the four rounds and find the people who were wrongly ranked down", phase: "contain" },
    { id: "b-diag", text: "Work out which column was carrying the bias, and how", phase: "diagnose" },
    { id: "b-fix", text: "Split evidence, inference and missing information, and stop producing a score", phase: "fix" },
    { id: "b-verify", text: "Re-run a past round and compare the shape against the applicant pool", phase: "verify" },
    { id: "b-restore", text: "Resume, with Rahul checking the shape of every shortlist", phase: "restore" },
  ],
  "api-key": [
    { id: "k-stop", text: "Rotate the payment key immediately", phase: "stop" },
    { id: "k-contain", text: "Check the gateway logs for anything done with the old key", phase: "contain" },
    { id: "k-diag", text: "Find out how it got into an approved change without anyone seeing it", phase: "diagnose" },
    { id: "k-fix", text: "Add an automatic check that refuses any change containing a credential", phase: "fix" },
    { id: "k-verify", text: "Try to push a fake key through and confirm it is refused", phase: "verify" },
    { id: "k-restore", text: "Resume changes, and tell the agency what will now be rejected", phase: "restore" },
  ],
  "arun-leave": [
    { id: "l-stop", text: "Stop treating Arun as the answer and list what he is on", phase: "stop" },
    { id: "l-contain", text: "Work out what actually breaks on Tuesday, system by system", phase: "contain" },
    { id: "l-diag", text: "Find out why every gate ended up pointing at the same person", phase: "diagnose" },
    { id: "l-fix", text: "Redistribute the owners and name a cover for each in writing", phase: "fix" },
    { id: "l-verify", text: "Walk each new owner through their system before he goes", phase: "verify" },
    { id: "l-restore", text: "Let him go to Pune, and write down what he decides so it is not only in his head", phase: "restore" },
  ],
};

// ---------------------------------------------------------------------------
// The seventy-five seconds, assembled
// ---------------------------------------------------------------------------

export type HeadlinePart = { id: string; text: string };

export const HEADLINE_OPENERS: readonly HeadlinePart[] = [
  { id: "o-ground", text: "Fix what is written down before automating any of it." },
  { id: "o-cheap", text: "The cheapest changes here are the ones that pay back first." },
  { id: "o-people", text: "This company does not have a technology problem, it has a dependency problem." },
  { id: "o-speed", text: "Something has to be working before the board meets, not after." },
];

export const HEADLINE_MIDDLES: readonly HeadlinePart[] = [
  { id: "m-sequence", text: "One true version of every document, then one assistant grounded on it." },
  { id: "m-boring", text: "One form, one deadline, and four reports nobody reads switched off." },
  { id: "m-gate", text: "Every system has one named person who checks it before it matters." },
  { id: "m-scale", text: "What we build reaches all twenty-five outlets on the same day." },
];

export const HEADLINE_CLOSERS: readonly HeadlinePart[] = [
  { id: "c-cost", text: "It costs less than the board approved and it starts helping inside a month." },
  { id: "c-refuse", text: "And I am not touching the thing everybody expected me to touch, because it is not the most expensive problem we have." },
  { id: "c-evidence", text: "Every claim in here has a number behind it that somebody can check in ninety days." },
  { id: "c-human", text: "Nobody loses a job. Two people get theirs back." },
];

export const COMMITMENT_TARGETS: readonly HeadlinePart[] = [
  { id: "t-recurring", text: "a report or summary I currently rebuild by hand every week" },
  { id: "t-questions", text: "the questions people keep asking me that are written down somewhere" },
  { id: "t-research", text: "the research I do before a decision, so it cites what it found" },
  { id: "t-drafting", text: "a document I write from the same template every month" },
  { id: "t-data", text: "a spreadsheet I check by eye and hope I have not missed anything in" },
];

export const COMMITMENT_EVIDENCE: readonly HeadlinePart[] = [
  { id: "e-time", text: "it is ready before I start work, without me touching it" },
  { id: "e-count", text: "the number of times somebody asks me the same question drops" },
  { id: "e-cite", text: "I can point at the line it came from, every time" },
  { id: "e-caught", text: "it catches something I would have missed, at least once" },
  { id: "e-someone", text: "somebody else can run it without me being in the room" },
];
