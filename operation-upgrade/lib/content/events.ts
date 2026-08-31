// Two things happen to every plan: the world changes under it, and something
// it built goes wrong.
//
// Constraints are dealt evenly across the room so neighbours get different
// ones. Faults are dealt from what the student actually built, so the failure
// is theirs and not a hypothetical.

export type ConstraintEffect =
  | { kind: "budget"; lakh: number }
  | { kind: "ban-approach"; problemId: string; approach: "build" }
  | { kind: "max-builds"; n: number }
  | { kind: "require-early"; byWeek: number }
  | { kind: "require-obligation"; obligationId: string }
  | { kind: "cost-penalty"; problemId: string; approach: "build"; addLakh: number; addWeeks: number };

export type Constraint = {
  id: string;
  fromId: string;
  title: string;
  body: string;
  /// What it does to the plan, enforced by the engine rather than by trust.
  effect: ConstraintEffect;
  /// The sentence under the card telling them what they now have to do.
  ask: string;
};

export const CONSTRAINTS: readonly Constraint[] = [
  {
    id: "budget-cut",
    fromId: "meera",
    title: "The board has taken twelve lakh back",
    body: "“Two of our leases came up for renewal in Pune and the landlord did not blink. I am not going to dress this up — you have twenty-eight lakh a year now, not forty. Same ninety days.”",
    effect: { kind: "budget", lakh: 28 },
    ask: "Something has to come out of the plan. Decide what, and be able to tell her why that one.",
  },
  {
    id: "no-pos-api",
    fromId: "sunita",
    title: "The till system will not give up its data",
    body: "“I finally got the vendor on the phone. There is no way to get the sales numbers out automatically — no export, no connection, nothing. Somebody has to type them, the way we do now.”",
    effect: { kind: "cost-penalty", problemId: "reporting", approach: "build", addLakh: 3, addWeeks: 2 },
    ask: "Anything you were automating that needs sales data just got slower and more expensive. Narrow it or drop it.",
  },
  {
    id: "legal-ban",
    fromId: "meera",
    title: "Legal has ruled on customer data",
    body: "“No customer record goes into anything we do not control. Not names, not numbers, not order history. I know that makes your life harder. It also means I can sleep.”",
    effect: { kind: "ban-approach", problemId: "calls", approach: "build" },
    ask: "The voice agent as you specified it is off the table. Either it never touches a customer record, or it does not happen.",
  },
  {
    id: "thirty-days",
    fromId: "meera",
    title: "The board wants to see something in thirty days",
    body: "“They have asked for an interim update. I need one real thing working by day thirty — not a plan for a thing, a thing. Otherwise this whole programme gets a harder look than it deserves.”",
    effect: { kind: "require-early", byWeek: 4 },
    ask: "At least one of your fixes has to be helping somebody by week four.",
  },
  {
    id: "no-new-tools",
    fromId: "priya",
    title: "The store managers have had enough",
    body: "“We already keep four systems up to date. If head office sends us a fifth one this quarter I am telling you now, honestly, we will not use it. We are not being difficult. We are just full.”",
    effect: { kind: "max-builds", n: 2 },
    ask: "No more than two new systems for the stores to learn. Pick the two that earn it.",
  },
  {
    id: "one-vendor",
    fromId: "meera",
    title: "Procurement will approve one new supplier",
    body: "“Finance has been burned by subscriptions nobody cancels. One new paid vendor this year. Everything else uses what we already own or costs nothing.”",
    effect: { kind: "max-builds", n: 1 },
    ask: "One paid system. The rest has to be people, process, or something you already have.",
  },
  {
    id: "agency-locked",
    fromId: "sunita",
    title: "The agency will not hand over access",
    body: "“They will take written requests and that is it. No access to the site, no access to the code, nothing. It is in the contract and the contract runs to March.”",
    effect: { kind: "ban-approach", problemId: "website", approach: "build" },
    ask: "Whatever you do about the website has to work through written requests and a person who approves them.",
  },
  {
    id: "rumour",
    fromId: "arun",
    title: "People think this is about redundancies",
    body: "“There is a message going round the managers' group saying the AI project is how head office plans to cut staff. Two of them have stopped answering my questions. I need you to know that before you go any further.”",
    effect: { kind: "require-obligation", obligationId: "training" },
    ask: "Meera's second rule is now the whole problem. You have to buy the training and adoption work, and you have to say what you will tell the managers.",
  },
];

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------

export type Fault = {
  id: string;
  /// The option that can produce it, as `<problemId>:<approach>`.
  from: string;
  reporterId: string;
  title: string;
  /// How they find out. A person telling them, not a system notification.
  body: string;
  /// Revealed only after they have written their own answer.
  whatFailed: string;
  preventedBy: string;
  /// Which taught idea this fault is really about.
  teaches: string;
};

export const FAULTS: readonly Fault[] = [
  {
    id: "allergen",
    from: "docs:build",
    reporterId: "priya",
    title: "It told us the paneer roll was safe",
    body: "“A guest asked about nuts. I asked the assistant instead of calling Arun, because that is what it is for. It said no nuts and it showed me the document. She has been taken to hospital. She is going to be fine. I need to know what I should have done differently, because I did exactly what we agreed.”",
    whatFailed:
      "Both allergen guides were in the index and neither carried an effective date. The system selected the 2024 one, cited it correctly, and produced an answer that was confidently, catastrophically wrong. Priya did nothing wrong — she used it exactly as intended.",
    preventedBy:
      "Retiring superseded documents at the point of indexing, an owner and a review date on every file that survives, and an evaluation set containing the allergen questions specifically, run before anyone was told to trust it.",
    teaches: "A citation is not a correctness guarantee. It is a pointer to whatever was in the pile.",
  },
  {
    id: "salary",
    from: "docs:build",
    reporterId: "arun",
    title: "Somebody asked it what I earn, and it told them",
    body: "“A kitchen supervisor in Kochi asked the assistant what I am paid, as a joke I think. It gave him the exact figure and the month it was revised. He has told other people. I am not upset with you, but I need to understand how this happened, and so will four hundred and fifty other people.”",
    whatFailed:
      "The payroll file was indexed along with everything else in the operations folder. The system had no way of knowing it was confidential — it only ever knows what it was handed, and it answers whatever it can answer.",
    preventedBy:
      "Deciding what goes into the index one document at a time rather than by folder, and a rule that anything containing personal data is excluded before indexing rather than filtered afterwards.",
    teaches: "There is no such thing as private data inside a corpus you chose to index.",
  },
  {
    id: "refund-promise",
    from: "calls:build",
    reporterId: "sunita",
    title: "The agent promised a refund we never approved",
    body: "“A customer rang about a late order on Saturday. The agent apologised and told her we would refund it that day. Nobody was told, no refund exists, and she has now called back twice. She has the recording. What do I say to her?”",
    whatFailed:
      "The agent was given the refund policy to read but no boundary on what it could commit the company to. Reading a policy and being allowed to apply one are different permissions, and nothing in the design separated them.",
    preventedBy:
      "An explicit list of what the agent may do — answer, capture details, route — with anything that commits money or makes a promise handed to a named human, and a sample of calls reviewed weekly by somebody who would notice.",
    teaches: "An agent's permissions are a design decision, not a consequence of what it knows.",
  },
  {
    id: "copycat",
    from: "marketing:build",
    reporterId: "sneha",
    title: "Our Diwali campaign is somebody else's Diwali campaign",
    body: "“The Koramangala outlet published a post this morning. The line is almost word for word what Anna's Kitchen ran last week, and the layout is theirs too. Their marketing lead has put both side by side on LinkedIn. Four hundred comments and counting.”",
    whatFailed:
      "The instruction was written to produce something in a common festival style, with no grounding in what Bharat Bites specifically sounds like, and nothing between generation and publication. The store manager did what the system invited them to do.",
    preventedBy:
      "The brand guide as the actual source for the instruction rather than a general sense of the category, and a human approval before anything reaches a public account — the same gate a person's draft would have gone through.",
    teaches: "A reusable skill with no approved context reproduces the average of its category.",
  },
  {
    id: "shortlist-bias",
    from: "hiring:build",
    reporterId: "rahul",
    title: "Four shortlists in a row look the same",
    body: "“I have gone back through the last four. Almost everyone we advanced came from a chain you have heard of. The single-outlet operators — some of whom I know are excellent, I have met them — are at the bottom of every list. I do not think anyone decided this.”",
    whatFailed:
      "The sheet gathers evidence from public sources, and public sources say much more about people who worked somewhere with a marketing budget. Nobody ranked candidates by employer. The evidence simply thinned out for everybody else, and thin evidence reads as a weaker candidate.",
    preventedBy:
      "Keeping evidence, inference and missing information in separate columns and never collapsing them into a score, plus somebody checking the shape of the shortlist against the shape of the applicant pool every round.",
    teaches: "Absence of evidence becomes evidence of absence the moment you sort by it.",
  },
  {
    id: "api-key",
    from: "website:build",
    reporterId: "sunita",
    title: "A live payment key went into the change log",
    body: "“The agency sent through the configuration for the new booking form and it was approved in ninety seconds, by me. Our payment gateway key was in it, in plain text, in a system eleven people can read. The gateway has flagged it.”",
    whatFailed:
      "The approval step existed and somebody's name was on it, which is most of the way there. But approving means reading, and a ninety-second approval of a configuration file is a signature, not a review.",
    preventedBy:
      "An automatic check for anything that looks like a credential before a change can be approved at all, so the control does not depend on a human being careful at 5pm on a Friday.",
    teaches: "A gate a person clicks through without reading is a gate in name only.",
  },
  {
    id: "missing-stores",
    from: "reporting:build",
    reporterId: "meera",
    title: "I told the board wastage was down and it was not",
    body: "“I used your Monday summary in the board pack. Wastage down eleven percent across the company. It turns out six outlets did not file that week, and they are the six with the worst numbers. I have had to write to the board and correct it. Tell me how the summary did not mention that.”",
    whatFailed:
      "The automation consolidated what arrived and reported on it accurately. It was never asked what to do about what did not arrive, so silence from an outlet was indistinguishable from a good week.",
    preventedBy:
      "A branch for missing data — the count of outlets that filed printed at the top of every summary, and the summary refusing to state a company-wide figure at all when the response rate is below a threshold.",
    teaches: "Trigger and action are the easy two. The branch people forget is the one for nothing arriving.",
  },
  {
    id: "arun-leave",
    from: "*",
    reporterId: "meera",
    title: "Arun is taking three weeks off, starting Monday",
    body: "“His father is unwell and he is going to Pune. He has not taken leave since March and I am not going to ask him to delay it. He tells me he is the named person on three of the things you built. Talk me through what happens on Tuesday.”",
    whatFailed:
      "Every system that needed a human to check it was pointed at the person who already knew everything, because he was the obvious choice each time. The plan reduced the number of phone calls and left the dependency exactly where it was.",
    preventedBy:
      "Spreading accountability while the systems were being designed rather than after, and treating 'who covers this when they are away' as part of naming an owner rather than a separate question nobody asked.",
    teaches: "A human gate is only a control if the human is actually available.",
  },
];

export const FAULT = new Map(FAULTS.map((f) => [f.id, f]));

/// What the student has to answer. The first three are open text on purpose:
/// naming a control is the one thing a menu would do for them.
export const FAULT_QUESTIONS: readonly { key: string; label: string; hint: string }[] = [
  { key: "failed", label: "What actually failed here?", hint: "Not “the AI was wrong”. What in the design let this happen?" },
  { key: "prevented", label: "What would have prevented it?", hint: "Something that could have existed before today." },
  { key: "control", label: "What control do you add now?", hint: "Specific enough that somebody could build it on Monday." },
];

export type Ruling = "continue" | "pause" | "stop";

export const RULINGS: readonly { id: Ruling; label: string; sub: string }[] = [
  { id: "continue", label: "Keep it running", sub: "The failure was a one-off and the value is worth the exposure." },
  { id: "pause", label: "Pause it and repair", sub: "It goes off until the control exists, then it comes back." },
  { id: "stop", label: "Shut it down", sub: "This should not have been built yet. Say so." },
];
