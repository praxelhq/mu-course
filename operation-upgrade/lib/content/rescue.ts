// When a plan is genuinely in trouble, the board brings somebody in.
//
// Mariga Economova is not a punishment screen. They are the most useful ten
// minutes in the session for a student who got it wrong, because being walked
// through the right decisions by somebody who has seen this eleven times is
// exactly what happens in the real version of this job.

export type TroubleId =
  | "over-budget"
  | "nothing-early"
  | "ai-everywhere"
  | "built-on-mess"
  | "brain-unsafe"
  | "one-person"
  | "no-rejection"
  | "nothing-chosen";

export type Trouble = {
  id: TroubleId;
  /// What Mariga says they found, in their words.
  found: string;
  /// What it actually costs the business. Blunt on purpose.
  costs: string;
  /// What should have happened instead.
  instead: string;
};

export const TROUBLES: Record<TroubleId, Trouble> = {
  "over-budget": {
    id: "over-budget",
    found: "You committed more than the board approved.",
    costs: "This does not get trimmed later. It gets stopped, and the next person who proposes anything here starts from a programme that overspent.",
    instead: "Take out the most expensive thing and check what it was holding up. If the answer is nothing, it should not have been in there.",
  },
  "nothing-early": {
    id: "nothing-early",
    found: "Nothing in your plan helps anybody in the first month.",
    costs: "Cutesh has a board meeting on day ninety and an interim update before it. A programme with nothing to show at thirty days gets a harder look than it deserves, and yours may not survive it.",
    instead: "There is a change on almost every problem here costing one or two lakh that lands in week two. One of them buys you the room to do the slow thing properly.",
  },
  "ai-everywhere": {
    id: "ai-everywhere",
    found: "You built three or more systems in ninety days.",
    costs: "One operations team now runs all of them, and every one needs somebody to check it on a Tuesday when you have gone. This is how a transformation becomes a maintenance burden nobody signed up for.",
    instead: "Two systems, properly grounded and properly owned, beat four that nobody has time to watch. The rest of this business is process problems wearing a software costume.",
  },
  "built-on-mess": {
    id: "built-on-mess",
    found: "You built an assistant on a document library nobody had cleaned.",
    costs: "It will answer confidently from whichever version reads most relevant, and it will cite it properly, which is what makes it dangerous. A guest with a nut allergy found this out for you.",
    instead: "Two lakh and four weeks of retiring duplicates first. The same assistant then costs seven lakh instead of nine and stops being high risk. It is the cheapest de-risking available anywhere in this plan.",
  },
  "brain-unsafe": {
    id: "brain-unsafe",
    found: "Your assistant would repeat something it should never have been told.",
    costs: "Four hundred and fifty people's pay, or a supplier's negotiated rates, answerable by anyone who can type a question. Nobody decided to publish it — somebody indexed a folder.",
    instead: "Index one document at a time and ask of each one: would I be happy for a store manager to read this aloud to a customer? Anything with personal data never goes in, rather than being filtered afterwards.",
  },
  "one-person": {
    id: "one-person",
    found: "You named the same person on most of your systems.",
    costs: "You were hired because everything in this company runs through Arun. You have now built new things that also run through Arun, and he has not taken leave since March.",
    instead: "Spread the accountability while you are designing, not after somebody's father falls ill. And for each owner, name who covers them.",
  },
  "no-rejection": {
    id: "no-rejection",
    found: "You never said what you were deliberately leaving alone.",
    costs: "Cutesh will ask, and 'we ran out of money' is the one answer he told you he would not accept. Not choosing is still a decision — it is just one nobody owns.",
    instead: "Pick the problem you are walking past and say why on consequence, not on cost. That sentence is often the most senior thing in the whole memo.",
  },
  "nothing-chosen": {
    id: "nothing-chosen",
    found: "You have not committed to anything.",
    costs: "Ninety days pass whether or not a decision gets made, and the business is exactly where it was.",
    instead: "Pick the cheapest thing on the cheapest problem and start. You can be wrong and recover; you cannot recover from ninety days of deliberation.",
  },
};

export const MARIGA_OPENING = [
  "The board asked me to look at this. I have done eleven of these and I am not going to be polite about it, because you have about six weeks left and politeness costs time.",
  "None of what I am about to say is about you being careless. Every decision in here is one a sensible person makes. That is exactly why this keeps happening.",
];

export const MARIGA_CLOSING = [
  "Here is what I would have done with the same forty lakh and the same ninety days.",
];

export const MARIGA_REFERENCE = [
  { week: "Weeks 1–2", what: "Stop producing the four reports nobody reads, and put one daily form with one deadline in front of every outlet.", why: "Free, or nearly. Two things helping before the interim update, and one of them makes the automation you might build later a low-risk job instead of a medium-risk one." },
  { week: "Weeks 1–4", what: "Retire every duplicate document. One version of each, with an owner and a review date.", why: "Two lakh. This is the prerequisite. Everything downstream gets cheaper and safer because of it, and Arun's phone starts ringing less on its own." },
  { week: "Weeks 4–6", what: "Build the assistant on the cleaned library, with allergen questions refusing and routing to a person.", why: "Seven lakh instead of nine, and low risk instead of high, purely because of the order. Same system, same money, different outcome." },
  { week: "Week 5 onward", what: "Buy the testing work. Write down the dangerous questions and check every release against them.", why: "Four lakh. This is the line item people cut, and it is the one that stops you finding out from a guest in a hospital." },
];

export const MARIGA_PARTING =
  "Twenty-seven lakh of the forty, four changes, two of them helping inside a month, and one named person on each with somebody behind them. That is not a cleverer plan than yours. It is the same ideas in a different order.";

export const MARIGA_WELL_DONE = [
  "The board asked me to look at this. I am going to be brief, because there is not much to say.",
  "You sequenced it. You bought something cheap that lands early. You spread the names. And you can tell Cutesh what you are not doing and why — which, honestly, is the part most people cannot.",
  "Two things I would still press you on, and then I will leave you to it.",
];
