// The seven places Bharat Bites hurts, and the three honest ways to fix each.
//
// Every problem can be answered by hiring a person, building an AI system, or
// changing the way the work happens — or left alone, which is sometimes the
// right call and always a defensible one.

export type Approach = "hire" | "build" | "redesign";
export type Risk = "low" | "medium" | "high";

export type Option = {
  id: Approach;
  /// What the student is buying, in the words a colleague would use.
  title: string;
  body: string;
  costLakh: number;
  /// The week this starts being useful to somebody. Not the week it is "done".
  liveWeek: number;
  risk: Risk;
  /// Shown once chosen: what actually happens.
  what: string;
  noteHead: string;
  noteBody: string;
  /// Choosing a redesign somewhere can make an AI build cheaper and safer.
  discount?: {
    /// `<problemId>:<approach>` that has to already be chosen.
    requires: string;
    costLakh: number;
    risk: Risk;
    note: string;
  };
  /// Faults this option can be dealt. Empty means this option cannot fail.
  faultIds: readonly string[];
};

export type Problem = {
  id: string;
  /// A–G, kept from the original case so the printed pack and the app agree.
  area: string;
  title: string;
  pain: string;
  /// Whose problem it is, by cast id.
  ownerId: string;
  severity: "costing" | "slowing" | "coping";
  /// The taught capability this problem exercises, for the debrief.
  teaches: string;
  facts: readonly { value: string; text: string; alarming: boolean }[];
  /// A real thread from the company, so the evidence comes from the mess.
  thread: readonly { who: string; text: string; at: string }[];
  options: readonly [Option, Option, Option];
};

const leaveNote =
  "Nothing changes here. That is a legitimate answer if something else matters more — Meera's fifth rule is that you have to be able to say why.";

export const LEAVE_ALONE = { id: "none" as const, label: "Leave it", note: leaveNote };

export const PROBLEMS: readonly Problem[] = [
  {
    id: "docs",
    area: "A",
    title: "The documents nobody trusts",
    pain: "A hundred and twenty files, three versions of the allergen guide, no owner on any of them.",
    ownerId: "arun",
    severity: "costing",
    teaches: "Retrieval only works on a corpus somebody has curated.",
    facts: [
      { value: "22", text: "calls a day to Arun asking what is already written down somewhere", alarming: true },
      { value: "3", text: "different versions of the allergen guide, none of them carrying a date", alarming: true },
      { value: "₹0", text: "spent on this so far, because nobody thought of it as a project", alarming: false },
    ],
    thread: [
      { who: "priya", text: "Arun bhai, quick one — does the paneer roll have nuts? Guest is waiting.", at: "1:12 pm" },
      { who: "arun", text: "Cashew in the marinade since last June. Do not serve it to her.", at: "1:26 pm" },
      { who: "priya", text: "The guide in Drive says no nuts. Which one do I follow?", at: "1:27 pm" },
      { who: "arun", text: "That one is old. Ignore it. I will fix it when I get a minute.", at: "2:04 pm" },
    ],
    options: [
      {
        id: "hire",
        title: "A second operations manager",
        body: "Somebody else who knows the answers, so Arun is not the only one holding five cities together.",
        costLakh: 14, liveWeek: 10, risk: "low",
        what: "You recruit and train a second operations manager to share the load. The calls still come, but they get answered by somebody who genuinely knows the business.",
        noteHead: "What Meera will say",
        noteBody: "Fourteen lakh a year, every year, and in ten weeks you will have two people holding the knowledge in their heads instead of one. It is the safest thing you can do and it does not fix the underlying problem: the documents are still wrong.",
        faultIds: [],
      },
      {
        id: "build",
        title: "A company brain that reads your own documents",
        body: "Ask it a question in plain language, it finds the answer in your files and shows you the line it came from.",
        costLakh: 9, liveWeek: 6, risk: "high",
        what: "You index the company's documents so anyone can ask a question and get an answer with a citation. Fast to stand up, and it reaches all twenty-five outlets on the same day.",
        noteHead: "Read this before you commit",
        noteBody: "Right now three versions of the allergen guide disagree with each other and nothing carries a date. The brain cannot tell which is true, so it will answer confidently from whichever one reads most relevant.",
        discount: {
          requires: "docs:redesign",
          costLakh: 7, risk: "low",
          note: "You cleaned the library first, so there is one version of each document and every one has an owner. The brain now has something true to read, and it costs less because there is a tenth as much to index.",
        },
        faultIds: ["allergen", "salary"],
      },
      {
        id: "redesign",
        title: "One source of truth, with an owner and a date",
        body: "Retire the duplicates. Everything that survives has one owner and a review date written on it.",
        costLakh: 2, liveWeek: 4, risk: "low",
        what: "You go through the hundred and twenty files, keep one version of each, delete the rest, and put a named owner and a review date on everything that survives.",
        noteHead: "What this unlocks",
        noteBody: "On its own it only cuts the calls by about a third, because people still have to go and find the file. But it is the prerequisite for everything else here, and it makes the company brain both cheaper and safe to build.",
        faultIds: [],
      },
    ],
  },
  {
    id: "calls",
    area: "B",
    title: "The calls nobody answers",
    pain: "Forty-one calls went unanswered last week during the lunch rush. Nine of them were catering enquiries.",
    ownerId: "priya",
    severity: "costing",
    teaches: "A voice agent is a mouth on a knowledge base and inherits its errors out loud.",
    facts: [
      { value: "41", text: "calls unanswered last week, across the five busiest outlets", alarming: true },
      { value: "9", text: "of those were catering enquiries, which nobody ever called back", alarming: true },
      { value: "₹1.8L", text: "the average catering booking the company does not know it lost", alarming: false },
    ],
    thread: [
      { who: "priya", text: "Phone rang eleven times between 1 and 2. We had a queue to the door.", at: "3:40 pm" },
      { who: "sunita", text: "Any of them catering?", at: "3:52 pm" },
      { who: "priya", text: "No idea. We do not have a way of knowing who called.", at: "3:53 pm" },
    ],
    options: [
      {
        id: "hire",
        title: "Two people on a shared phone line",
        body: "One number for all twenty-five outlets, answered by humans through the two rush hours.",
        costLakh: 9, liveWeek: 6, risk: "low",
        what: "Calls that outlets cannot pick up roll to a small central desk. A person takes the catering details properly and routes anything unusual to the right store.",
        noteHead: "What Meera will say",
        noteBody: "This works from the first day and it never says anything stupid to a customer. It also caps out — two people cannot cover five cities at dinner, and you are paying for it every year.",
        faultIds: [],
      },
      {
        id: "build",
        title: "A voice agent for the questions people always ask",
        body: "It answers hours, menu, allergens and catering rates, takes lead details, and hands everything else to a person.",
        costLakh: 11, liveWeek: 8, risk: "high",
        what: "Unanswered calls reach an agent that can answer the twenty questions people actually ask, capture a catering enquiry properly, and route the rest to a named human.",
        noteHead: "The thing to worry about",
        noteBody: "It will be asked about allergens on its first day, by somebody whose guest is already at the table. It can only be as accurate as whatever it is reading, and it will say the wrong answer in a confident, pleasant voice.",
        discount: {
          requires: "docs:redesign",
          costLakh: 9, risk: "medium",
          note: "The document library is clean, so the agent has one allergen guide to read instead of three. It is still talking to customers unsupervised, which is why this is medium and not low.",
        },
        faultIds: ["refund-promise"],
      },
      {
        id: "redesign",
        title: "Publish the answers so the questions stop",
        body: "Hours, full menu, allergen list and catering rates, on the website and on every listing, kept current.",
        costLakh: 1, liveWeek: 3, risk: "low",
        what: "The five questions that make up most of the calls get answered before anybody picks up a phone. The calls that remain are the ones worth a human.",
        noteHead: "The cheapest thing on this page",
        noteBody: "It cuts perhaps a quarter of the volume for a lakh a year and it lands in week three. It will not catch a single catering lead on its own — but it makes whatever you build next carry less traffic.",
        faultIds: [],
      },
    ],
  },
  {
    id: "marketing",
    area: "C",
    title: "Forty marketing requests a week",
    pain: "Every outlet asks head office for festival posts, local offers and replies to public reviews.",
    ownerId: "sneha",
    severity: "slowing",
    teaches: "A reusable skill with approved context beats forty good one-off prompts.",
    facts: [
      { value: "40", text: "requests a week reaching two people who also have day jobs", alarming: true },
      { value: "6 days", text: "average wait for a local offer, by which point the weekend has gone", alarming: true },
      { value: "2", text: "people who hold what the brand is allowed to say", alarming: false },
    ],
    thread: [
      { who: "sneha", text: "I have nineteen post requests open and Diwali is in three weeks.", at: "10:15 am" },
      { who: "meera", text: "Which ones actually need you?", at: "10:31 am" },
      { who: "sneha", text: "Honestly? Four. The rest are the same three formats with a different city name.", at: "10:33 am" },
    ],
    options: [
      {
        id: "hire",
        title: "A junior brand executive",
        body: "A third pair of hands so the queue moves, reporting to Sneha.",
        costLakh: 7, liveWeek: 8, risk: "low",
        what: "Somebody junior takes the routine requests and Sneha keeps the ones that need judgement. The queue clears in about a day instead of six.",
        noteHead: "What Meera will say",
        noteBody: "It works, and in eighteen months you will have three people holding the brand instead of two, with the same bottleneck one level up.",
        faultIds: [],
      },
      {
        id: "build",
        title: "Approved templates the outlets run themselves",
        body: "A small set of instructions with the brand rules built in, so a store manager can produce a local offer that is already on-brand.",
        costLakh: 5, liveWeek: 5, risk: "medium",
        what: "Sneha writes the brand rules down once, into a handful of reusable instructions. Outlets generate their own posts and review replies; Sneha approves before anything is published.",
        noteHead: "Where this goes wrong",
        noteBody: "Written casually, these produce something that reads like every other restaurant on the internet — or worse, like the restaurant across the road. The approval step is not optional decoration.",
        faultIds: ["copycat"],
      },
      {
        id: "redesign",
        title: "A calendar published a month ahead",
        body: "Festivals, offers and menu changes planned in advance, so outlets stop asking and start planning.",
        costLakh: 1, liveWeek: 2, risk: "low",
        what: "Sneha publishes what is coming a month out, with the assets already made. The ad-hoc requests drop to the genuinely local ones.",
        noteHead: "Unglamorous and effective",
        noteBody: "Most of those forty requests are predictable a month in advance. This is the kind of fix that makes people ask what you actually did.",
        faultIds: [],
      },
    ],
  },
  {
    id: "hiring",
    area: "D",
    title: "Shortlisting on a spreadsheet",
    pain: "Applications arrive four different ways and nobody agrees what a good store manager looks like.",
    ownerId: "rahul",
    severity: "slowing",
    teaches: "Enrichment supplies evidence. Judgement stays a person's job.",
    facts: [
      { value: "60", text: "open roles across five cities, carried by two recruiters", alarming: true },
      { value: "31 days", text: "average time to fill a store manager role, against a target of fourteen", alarming: true },
      { value: "4", text: "different places an application can arrive, none of them connected", alarming: false },
    ],
    thread: [
      { who: "rahul", text: "I have 140 CVs for Whitefield and no way to compare them.", at: "9:02 am" },
      { who: "meera", text: "What are you actually looking for?", at: "9:20 am" },
      { who: "rahul", text: "Someone who has run more than one outlet. It is not on most CVs in a way I can search.", at: "9:24 am" },
    ],
    options: [
      {
        id: "hire",
        title: "A third recruiter",
        body: "More capacity against the same process.",
        costLakh: 8, liveWeek: 9, risk: "low",
        what: "A third person joins the team and the backlog moves. Nothing about how a shortlist gets made changes.",
        noteHead: "What Meera will say",
        noteBody: "Eight lakh a year to do more of something that is not consistent. If two recruiters disagree about what good looks like, three will disagree more.",
        faultIds: [],
      },
      {
        id: "build",
        title: "Evidence sheets built from public information",
        body: "For each candidate, the specific things you asked about — multi-outlet experience, food service, opening a site — with a source next to each.",
        costLakh: 6, liveWeek: 7, risk: "medium",
        what: "You define what the role actually needs, then assemble a structured sheet per candidate from public professional information. Evidence, inference and missing information stay in separate columns. A human still picks.",
        noteHead: "The line this must not cross",
        noteBody: "It is a research assistant, not a ranking. The moment somebody treats the sheet as a score, it will start quietly preferring people from employers it has heard of.",
        faultIds: ["shortlist-bias"],
      },
      {
        id: "redesign",
        title: "One form, one scorecard, one weekly meeting",
        body: "Every application arrives the same way, gets scored against the same four things, and is decided in one meeting a week.",
        costLakh: 1, liveWeek: 3, risk: "low",
        what: "You collapse four intake routes into one form, agree the four things that actually predict a good store manager, and make shortlisting a scheduled decision rather than a background task.",
        noteHead: "Do this first, whatever else you do",
        noteBody: "Without an agreed definition of good, nothing downstream can help you. This is the cheapest way to find out that Rahul and Meera are looking for different people.",
        faultIds: [],
      },
    ],
  },
  {
    id: "website",
    area: "E",
    title: "Website changes over WhatsApp",
    pain: "The agency edits the site from messages. Wrong prices stayed live for four days in March.",
    ownerId: "sunita",
    severity: "slowing",
    teaches: "The approval gate is the control, not the tool.",
    facts: [
      { value: "4 days", text: "a wrong price for the family thali stayed live in March", alarming: true },
      { value: "0", text: "record of who asked for that change or who approved it", alarming: true },
      { value: "₹42k", text: "honoured at the wrong price before anyone noticed", alarming: false },
    ],
    thread: [
      { who: "sunita", text: "Who told the agency to change the thali price?", at: "11:40 am" },
      { who: "priya", text: "Not me. It was wrong on our menu board too so someone must have.", at: "11:58 am" },
      { who: "sunita", text: "There is no message anywhere asking for it. It just happened.", at: "12:14 pm" },
    ],
    options: [
      {
        id: "hire",
        title: "Bring the website in-house",
        body: "Stop paying the agency and put the work with somebody who sits in the building.",
        costLakh: 11, liveWeek: 12, risk: "low",
        what: "You end the agency retainer and hire someone to own the site. Changes get made by a person you can walk over to.",
        noteHead: "What Meera will say",
        noteBody: "Eleven lakh a year and twelve weeks, to fix a problem that is not really about who holds the keyboard. Nobody wrote down who approved that price either way.",
        faultIds: [],
      },
      {
        id: "build",
        title: "A change log every request goes through",
        body: "Every website change becomes a written request with a named approver, and nothing ships without one.",
        costLakh: 3, liveWeek: 5, risk: "low",
        what: "Requests stop being WhatsApp messages and become tracked items: who asked, what changed, who approved, when it went live. The agency works from the list.",
        noteHead: "Session nine, in a real business",
        noteBody: "This is a pull request with the jargon removed. The value is not the tool — it is that approval becomes a thing somebody does on purpose, with their name on it.",
        faultIds: ["api-key"],
      },
      {
        id: "redesign",
        title: "One named approver and a weekly release",
        body: "Changes are collected during the week and go live on Thursday, approved by one person.",
        costLakh: 1, liveWeek: 2, risk: "low",
        what: "Sunita owns the site. Requests reach her, she approves or refuses, and everything ships together once a week.",
        noteHead: "Half a lakh, two weeks",
        noteBody: "It removes the four-day wrong price without any new software at all. It does not scale past about twenty changes a week, which is roughly where you are.",
        faultIds: [],
      },
    ],
  },
  {
    id: "reporting",
    area: "F",
    title: "Reports retyped by hand",
    pain: "Head office spends three hours a day turning twenty-five spreadsheets into one.",
    ownerId: "sunita",
    severity: "costing",
    teaches: "Trigger, action, branch — and the branch people forget is missing data.",
    facts: [
      { value: "3 hrs", text: "a day spent consolidating, before anybody looks at an exception", alarming: true },
      { value: "25", text: "different spreadsheet shapes, one per outlet, because nobody agreed a format", alarming: true },
      { value: "4pm", text: "when yesterday's wastage number is finally ready to act on", alarming: false },
    ],
    thread: [
      { who: "sunita", text: "Six outlets have not filed again. I cannot close the numbers.", at: "2:30 pm" },
      { who: "arun", text: "Just do it without them, we can catch up tomorrow.", at: "2:44 pm" },
      { who: "sunita", text: "Then the wastage number looks better than it is. Every time.", at: "2:46 pm" },
    ],
    options: [
      {
        id: "hire",
        title: "An operations analyst",
        body: "Somebody whose actual job is the consolidation, so Sunita gets her mornings back.",
        costLakh: 6, liveWeek: 7, risk: "low",
        what: "A person does the retyping properly and on time, and starts noticing patterns because they see it every day.",
        noteHead: "What Meera will say",
        noteBody: "Six lakh a year to keep doing the thing by hand, faster. The six outlets that do not file still will not file.",
        faultIds: [],
      },
      {
        id: "build",
        title: "Automatic intake and consolidation",
        body: "Outlets file into one form, it validates and consolidates itself, and an exception list lands at 8am.",
        costLakh: 7, liveWeek: 6, risk: "medium",
        what: "The daily numbers arrive in one shape, get checked as they come in, and produce a short exception list that a human reads before acting.",
        noteHead: "The branch people forget",
        noteBody: "It will happily consolidate whatever it receives. If six outlets do not file, it will report a company-wide improvement and say nothing at all about the six.",
        discount: {
          requires: "reporting:redesign",
          costLakh: 5, risk: "low",
          note: "Everyone already files the same form on the same deadline, so the automation has one shape to handle and can tell the difference between a zero and a silence.",
        },
        faultIds: ["missing-stores"],
      },
      {
        id: "redesign",
        title: "One form, one deadline, one format",
        body: "Every outlet files the same eight numbers by 9pm. No spreadsheets, no messages.",
        costLakh: 1, liveWeek: 2, risk: "low",
        what: "You agree the eight numbers that matter, put them in one form, and set one deadline. Consolidation becomes an hour instead of three.",
        noteHead: "The move that makes the next move cheap",
        noteBody: "This is boring and it lands in week two. It also turns the automation above from a medium-risk build into a low-risk one, because there is finally one shape to automate.",
        faultIds: [],
      },
    ],
  },
  {
    id: "analytics",
    area: "G",
    title: "Eleven reports, no answers",
    pain: "Management gets more paper every month and still cannot answer the same six questions.",
    ownerId: "meera",
    severity: "coping",
    teaches: "Define the question before you reach for a tool. Sometimes the answer is subtraction.",
    facts: [
      { value: "11", text: "recurring reports produced every month", alarming: false },
      { value: "4", text: "of them that Meera actually reads", alarming: true },
      { value: "6", text: "questions the board asks every quarter that still take a week to answer", alarming: true },
    ],
    thread: [
      { who: "meera", text: "Why does the city margin number differ between two of these reports?", at: "4:10 pm" },
      { who: "sunita", text: "Different definitions of margin. Both are correct.", at: "4:31 pm" },
      { who: "meera", text: "Then neither is useful. Which one do I take to the board?", at: "4:33 pm" },
    ],
    options: [
      {
        id: "hire",
        title: "A business analyst",
        body: "Somebody senior enough to be trusted with the numbers and the definitions.",
        costLakh: 10, liveWeek: 8, risk: "low",
        what: "A person owns the numbers, agrees the definitions, and answers management questions properly.",
        noteHead: "What Meera will say",
        noteBody: "Ten lakh a year is the most expensive option on this page for the problem that is hurting us least. Is this really where the money goes?",
        faultIds: [],
      },
      {
        id: "build",
        title: "Six questions, answered the same way every week",
        body: "The six recurring questions get one agreed definition each and a script that answers them from the same source.",
        costLakh: 5, liveWeek: 6, risk: "medium",
        what: "You settle what margin means, write it once, and produce one short decision memo a week rather than eleven reports a month.",
        noteHead: "Where the value actually is",
        noteBody: "The scripting is the easy half. The hard half is getting three people to agree what a number means, and that meeting has to happen whichever option you pick.",
        faultIds: [],
      },
      {
        id: "redesign",
        title: "Stop producing four reports nobody reads",
        body: "Kill the four with no reader. Keep the rest. Cost: nothing.",
        costLakh: 0, liveWeek: 1, risk: "low",
        what: "You find out who reads each report, discover four have no reader at all, and stop making them. Three hours a month come back immediately.",
        noteHead: "Free, and live in week one",
        noteBody: "Not every improvement is something you add. This is the cheapest, fastest item in the whole simulation, and it is the one most people scroll straight past.",
        faultIds: [],
      },
    ],
  },
];

export const PROBLEM = new Map(PROBLEMS.map((p) => [p.id, p]));

/// Two things Meera insists on once the plan reaches a certain shape. They are
/// not options — they are consequences of what the student has already chosen.
export type Obligation = {
  id: string;
  title: string;
  costLakh: number;
  liveWeek: number;
  triggerText: string;
  dormantText: string;
  activeText: string;
};

export const OBLIGATIONS: readonly Obligation[] = [
  {
    id: "checking",
    title: "Somebody tests what these systems say",
    costLakh: 4,
    liveWeek: 5,
    triggerText: "Two or more AI systems",
    dormantText:
      "This becomes compulsory the moment you build a second AI system. One is a pilot somebody is watching. Two is a habit, and habits need checking.",
    activeText:
      "You are building more than one AI system, so somebody writes down the hard questions — allergens, refunds, prices — and checks every release against them before anyone is told to trust it.",
  },
  {
    id: "training",
    title: "Teach the team what they can and cannot put in",
    costLakh: 4,
    liveWeek: 4,
    triggerText: "Anything touching customer or candidate details",
    dormantText:
      "This becomes compulsory as soon as anything you build touches a customer's or a candidate's details.",
    activeText:
      "Something you have chosen will handle personal details. Meera's third rule does not enforce itself — somebody has to sit with the store managers and explain, with examples, what must never be pasted into a public tool.",
  },
];

/// A problem may take more than one change: cleaning the document library and
/// then building on it is two changes against one problem, and is the strongest
/// play in the game.
export type Picks = Record<string, readonly Approach[]>;

export function chose(picks: Picks, problemId: string, approach: Approach): boolean {
  return (picks[problemId] ?? []).includes(approach);
}

export function obligationTriggered(id: string, picks: Picks): boolean {
  const builds = Object.values(picks).flat().filter((v) => v === "build").length;
  if (id === "checking") return builds >= 2;
  if (id === "training") return chose(picks, "calls", "build") || chose(picks, "hiring", "build");
  return false;
}
