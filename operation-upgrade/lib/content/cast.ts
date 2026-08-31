// The people of Bharat Bites. All invented for the session.

export type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  /// One line of who they are, used wherever their name appears.
  note: string;
  /// How many systems this person can realistically be accountable for before
  /// the plan has simply rebuilt the problem it was hired to solve.
  comfortableLoad: number;
};

export const CAST: readonly Person[] = [
  {
    id: "meera",
    name: "Meera Iyer",
    initials: "MI",
    role: "Founder and Managing Director",
    note: "Started the business with one counter in Coimbatore in 2011. Reads four of the eleven reports.",
    comfortableLoad: 1,
  },
  {
    id: "arun",
    name: "Arun Kulkarni",
    initials: "AK",
    role: "Head of Operations",
    note: "Fourteen years here, knows everything, has not taken leave since March. Twenty-two calls a day.",
    comfortableLoad: 1,
  },
  {
    id: "priya",
    name: "Priya Nair",
    initials: "PN",
    role: "Store manager, Indiranagar",
    note: "Three years. Calls Arun about things that are written down somewhere she cannot find.",
    comfortableLoad: 2,
  },
  {
    id: "sunita",
    name: "Sunita Menon",
    initials: "SM",
    role: "Central operations",
    note: "Spends three hours a day turning twenty-five spreadsheets into one.",
    comfortableLoad: 2,
  },
  {
    id: "rahul",
    name: "Rahul Desai",
    initials: "RD",
    role: "People and hiring",
    note: "One of two recruiters carrying sixty open roles across five cities.",
    comfortableLoad: 2,
  },
  {
    id: "sneha",
    name: "Sneha Varma",
    initials: "SV",
    role: "Brand and marketing",
    note: "One of the two people who hold the brand in their heads.",
    comfortableLoad: 2,
  },
];

export const PERSON = new Map(CAST.map((p) => [p.id, p]));

export const COMPANY = {
  name: "Bharat Bites",
  founded: "Coimbatore, 2011",
  outlets: 25,
  cities: 5,
  people: 450,
  budgetLakh: 40,
  days: 90,
} as const;

/// Meera's note, sent at 6:48 on a Tuesday morning. This is the first thing a
/// student reads, and it has to do all the briefing work on its own.
export const OPENING_LETTER: readonly string[] = [
  "I started this business with one counter and a pressure cooker. We are now twenty-five outlets across five cities and four hundred and fifty people, and I will be honest with you: we have got slower as we have got bigger.",
  "My operations head, Arun, has been here fourteen years and knows everything. That is the problem. Twenty-two times a day somebody calls him to ask something that is written down somewhere, in a document nobody can find, in a version nobody can vouch for. If Arun takes a holiday, five cities hold their breath.",
  "The board has approved forty lakh a year for you to change how this company works, and ninety days to show me something real. I do not want a strategy document. I want fewer phone calls to Arun, and I want to know who I am calling when your clever new system says something wrong.",
  "Go and look at the seven places where we hurt. Then come back and tell me what you are going to fix, what you are deliberately leaving broken, and why.",
];

export type Rule = { n: number; text: string; tone: "human" | "flow" | "ai" | "plain" | "gold" };

export const MEERA_RULES: readonly Rule[] = [
  { n: 1, text: "Whatever you build, one person's name is on it. I want to know who I am calling when it is wrong.", tone: "human" },
  { n: 2, text: "Nobody loses their job because of this. If your plan needs that, bring me a different plan.", tone: "flow" },
  { n: 3, text: "Our customers' details and our people's details never go into anything public. That one is not a discussion.", tone: "ai" },
  { n: 4, text: "The till system and the payroll system stay exactly where they are. We are not replacing those this year.", tone: "plain" },
  { n: 5, text: "You will not fix everything. Tell me what you are choosing not to fix, and be able to defend it.", tone: "gold" },
];
