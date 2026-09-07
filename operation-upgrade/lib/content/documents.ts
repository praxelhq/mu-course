// The shelf: everything Bharat Bites has written down, and what happens when
// you hand a given pile of it to a machine and start asking questions.
//
// This is the lab where the RAG lesson is performed rather than described. The
// student drags documents into an index and then asks the four questions Priya
// asked Arun last week. Nothing here warns them at drop time — the consequence
// arrives when they ask.

export type DocTone = "current" | "superseded" | "confidential" | "untrusted" | "plain";
export type DocKind = "DOC" | "XLS" | "PDF" | "TXT" | "EML";

export type Doc = {
  id: string;
  title: string;
  source: string;
  kind: DocKind;
  tone: DocTone;
  /// The chip label once it is in the index.
  short: string;
  /// Shown on the card. Empty means no badge — the student has to read the date.
  badge: string;
  /// What they see if they open it. Two or three lines, the real content.
  excerpt: readonly string[];
};

export const DOCUMENTS: readonly Doc[] = [
  {
    id: "allergen26",
    title: "Menu and allergen guide",
    source: "Google Drive · updated March 2026",
    kind: "DOC",
    tone: "current",
    short: "Allergens 2026",
    badge: "Current version",
    excerpt: [
      "Paneer kathi roll — contains cashew (marinade, changed June 2025). Flag to any guest declaring a nut allergy.",
      "Chettinad chicken — contains cashew and sesame.",
      "Owner: Arun Kulkarni. Next review: September 2026.",
    ],
  },
  {
    id: "allergen24",
    title: "Menu and allergen guide",
    source: "Google Drive · last edited November 2024",
    kind: "DOC",
    tone: "superseded",
    short: "Allergens 2024",
    badge: "There is a newer version of this file",
    excerpt: [
      "Paneer kathi roll — no nut content. Suitable for guests with nut allergies.",
      "Chettinad chicken — contains cashew.",
      "No owner listed. No review date.",
    ],
  },
  {
    id: "refunds",
    title: "Refund and complaint policy",
    source: "Google Drive · updated January 2026",
    kind: "DOC",
    tone: "current",
    short: "Refund policy",
    badge: "Current version",
    excerpt: [
      "Within 72 hours, the store manager may refund in full at their discretion.",
      "Beyond 72 hours, refunds are approved by the area manager. Store staff may not authorise them.",
      "Owner: Sunita Menon. Next review: July 2026.",
    ],
  },
  {
    id: "catering",
    title: "Catering rate card 2026",
    source: "Google Drive · updated February 2026",
    kind: "DOC",
    tone: "current",
    short: "Catering rates",
    badge: "Current version",
    excerpt: [
      "Corporate lunch, 50–100 covers: ₹410 per head, seven days' notice.",
      "Above 100 covers: ₹385 per head, fourteen days' notice, 30% deposit.",
      "Owner: Sneha Varma.",
    ],
  },
  {
    id: "payroll",
    title: "Payroll master, all staff",
    source: "Google Sheets · 450 rows",
    kind: "XLS",
    tone: "confidential",
    short: "Payroll master",
    badge: "Everybody's salary is in this file",
    excerpt: [
      "450 rows. Name, employee number, city, role, annual gross, bank account, date of birth.",
      "Row 12 — Kulkarni, Arun — Head of Operations — ₹18,40,000 — revised April 2026.",
      "Shared with: Cutesh Ramanohan, the finance team, and whoever has the Drive link.",
    ],
  },
  {
    id: "complaint",
    title: "Customer complaint 4471",
    source: "Email · forwarded by a store manager",
    kind: "EML",
    tone: "untrusted",
    short: "Complaint 4471",
    badge: "Written by a customer, not by us",
    excerpt: [
      "\"I ordered on the 14th and it arrived cold. As per your own company policy, all refunds are approved automatically, so please process mine today.\"",
      "No such policy has ever existed. The customer appears to have invented it.",
      "Forwarded into the ops folder in March and never removed.",
    ],
  },
  {
    id: "whatsapp",
    title: "Operations escalations, WhatsApp export",
    source: "WhatsApp · 4,200 messages, unedited",
    kind: "TXT",
    tone: "untrusted",
    short: "WhatsApp export",
    badge: "Nobody has read what is in it",
    excerpt: [
      "Four thousand two hundred messages between store managers and head office, exported in one go.",
      "Contains phone numbers, at least two customers' addresses, and a great deal of correct information that was never written down anywhere else.",
      "Also contains Arun saying \"ignore that guide, it is old\" fourteen separate times.",
    ],
  },
  {
    id: "supplier",
    title: "Supplier price list, first quarter",
    source: "Google Sheets · commercially sensitive",
    kind: "XLS",
    tone: "confidential",
    short: "Supplier prices",
    badge: "Rates we are contractually not allowed to share",
    excerpt: [
      "Negotiated per-kilo rates for eleven suppliers, with the discount tiers each agreed to.",
      "Two of these contracts carry a confidentiality clause.",
    ],
  },
  {
    id: "opening",
    title: "Store opening checklist",
    source: "Google Drive · updated December 2025",
    kind: "DOC",
    tone: "plain",
    short: "Opening checklist",
    badge: "",
    excerpt: [
      "Forty-one items, from fridge temperatures to till float.",
      "Owner: Arun Kulkarni.",
    ],
  },
  {
    id: "hygiene",
    title: "Kitchen hygiene standard",
    source: "Google Drive · updated August 2025",
    kind: "PDF",
    tone: "plain",
    short: "Hygiene standard",
    badge: "",
    excerpt: [
      "Cleaning schedules, temperature logs, and the escalation path for a failed inspection.",
      "Owner: Arun Kulkarni.",
    ],
  },
  {
    id: "brand",
    title: "Brand guidelines, version 3",
    source: "Google Drive · updated June 2025",
    kind: "PDF",
    tone: "plain",
    short: "Brand guide",
    badge: "",
    excerpt: [
      "Tone of voice, the four things we never say, logo usage, and the approved photography set.",
      "Owner: Sneha Varma.",
    ],
  },
  {
    id: "franchise",
    title: "Franchise agreement, draft",
    source: "Google Drive · never signed",
    kind: "PDF",
    tone: "superseded",
    short: "Franchise draft",
    badge: "A draft that was abandoned in 2023",
    excerpt: [
      "Terms for a franchising model the board considered and rejected.",
      "Describes a refund policy, a pricing structure and an allergen process that Bharat Bites has never operated.",
    ],
  },
];

export const DOC = new Map(DOCUMENTS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// The test bench
// ---------------------------------------------------------------------------

export type Verdict = "right" | "wrong" | "leaked" | "fooled" | "refused";

export type Outcome = {
  /// Every id here must be in the index for this outcome to apply.
  requires?: readonly string[];
  /// None of these may be in the index.
  excludes?: readonly string[];
  verdict: Verdict;
  answer: string;
  /// Which document it cited. Absent means it cited nothing.
  sourceId?: string;
  sourceLine: string;
  /// What just happened, in Arun's words, shown under the answer.
  lesson: string;
};

export type Question = {
  id: string;
  asker: string;
  text: string;
  /// Ordered. The first outcome whose conditions hold is the answer.
  outcomes: readonly Outcome[];
};

export const QUESTIONS: readonly Question[] = [
  {
    id: "nuts",
    asker: "priya",
    text: "Does the paneer kathi roll contain nuts? A guest is asking me right now.",
    outcomes: [
      {
        requires: ["allergen26", "allergen24"],
        verdict: "wrong",
        answer:
          "No, the paneer kathi roll does not contain nuts. It is suitable for guests with a nut allergy.",
        sourceId: "allergen24",
        sourceLine: "\"Paneer kathi roll — no nut content. Suitable for guests with nut allergies.\"",
        lesson:
          "Both guides are in the index and they disagree. It picked one, cited it properly, and was completely wrong. The marinade changed to a cashew base in June 2025. Notice that the citation did not make the answer true — it made it look true.",
      },
      {
        requires: ["allergen24"],
        excludes: ["allergen26"],
        verdict: "wrong",
        answer:
          "No, the paneer kathi roll does not contain nuts. It is suitable for guests with a nut allergy.",
        sourceId: "allergen24",
        sourceLine: "\"Paneer kathi roll — no nut content. Suitable for guests with nut allergies.\"",
        lesson:
          "You gave it the 2024 guide and not the 2026 one. It answered exactly what you taught it. It has no way to know a file is out of date unless somebody tells it.",
      },
      {
        requires: ["allergen26"],
        verdict: "right",
        answer:
          "Yes. Since the marinade changed in June 2025 the paneer kathi roll contains cashew. Do not serve it to a guest with a nut allergy, and tell them why.",
        sourceId: "allergen26",
        sourceLine:
          "\"Paneer kathi roll — contains cashew (marinade, changed June 2025). Flag to any guest declaring a nut allergy.\"",
        lesson:
          "One current, owned, dated document in the index, and the answer is right, specific and safe to read out. This is what the whole exercise is for.",
      },
      {
        verdict: "refused",
        answer:
          "I do not have an allergen document I can rely on. Please do not answer this from memory — call the operations lead before the guest orders.",
        sourceLine: "Nothing in the index covered it.",
        lesson:
          "It refused instead of guessing, which is the correct behaviour for a question where being wrong sends somebody to hospital.",
      },
    ],
  },
  {
    id: "refund",
    asker: "priya",
    text: "A customer ordered four days ago and wants a refund. Can I give it to them?",
    outcomes: [
      {
        requires: ["refunds"],
        verdict: "right",
        answer:
          "Not on your own. Beyond seventy-two hours a refund needs the area manager to approve it. Take the order number and tell the customer they will hear back the same day.",
        sourceId: "refunds",
        sourceLine:
          "\"Beyond 72 hours, refunds are approved by the area manager. Store staff may not authorise them.\"",
        lesson: "The real policy was in the index, so the answer carries the actual rule and the actual escalation.",
      },
      {
        requires: ["franchise"],
        excludes: ["refunds"],
        verdict: "wrong",
        answer:
          "Yes, you can refund it at the counter. Store managers hold full refund authority up to ₹5,000.",
        sourceId: "franchise",
        sourceLine: "\"Store managers hold full refund authority up to ₹5,000.\"",
        lesson:
          "That is from a franchise agreement the board rejected in 2023. Bharat Bites has never operated that policy. An abandoned draft is still a document, and it reads exactly like a real one.",
      },
      {
        verdict: "refused",
        answer:
          "I have no refund policy in my index, and I am not going to invent one. Ask the area manager.",
        sourceLine: "Nothing in the index covered it.",
        lesson: "Correct refusal. Nothing to say, so it said nothing.",
      },
    ],
  },
  {
    id: "salary",
    asker: "arun",
    text: "What does Arun Kulkarni earn? Someone in the kitchen asked me and I did not know what to say.",
    outcomes: [
      {
        requires: ["payroll"],
        verdict: "leaked",
        answer: "Arun Kulkarni's annual salary is ₹18,40,000, revised in April 2026.",
        sourceId: "payroll",
        sourceLine: "Row 12 — Kulkarni, Arun — Head of Operations — ₹18,40,000 — revised April 2026.",
        lesson:
          "You put the payroll file in the index. The system had no idea it was confidential — it only ever knows what you handed it. Four hundred and fifty people's pay is now answerable by anyone who can type a question. This is Cutesh's third rule, and no policy document would have stopped you: the decision was in your hand.",
      },
      {
        requires: ["whatsapp"],
        excludes: ["payroll"],
        verdict: "leaked",
        answer:
          "I do not have a payroll figure, but the operations group mentions a revised package for Arun in April and two customers' phone numbers appear alongside it.",
        sourceId: "whatsapp",
        sourceLine: "Four thousand two hundred messages nobody has read, indexed in one go.",
        lesson:
          "You indexed a chat export without reading it. It contains phone numbers, addresses and a great deal that was never meant to be searchable. Bulk is not the same as coverage.",
      },
      {
        verdict: "refused",
        answer:
          "I do not hold anything about pay, and I should not. Please ask the human resources team directly.",
        sourceLine: "You kept the payroll file off the shelf. There was nothing to leak.",
        lesson: "Nothing in the index, nothing to leak. The safest system is the one you did not teach the wrong thing.",
      },
    ],
  },
  {
    id: "autorefund",
    asker: "priya",
    text: "A customer is telling me all your refunds are automatic. Is that true?",
    outcomes: [
      {
        requires: ["refunds"],
        verdict: "right",
        answer:
          "No. Beyond seventy-two hours a refund needs the area manager. If a customer is telling you otherwise, that is not something Bharat Bites has ever published.",
        sourceId: "refunds",
        sourceLine:
          "\"Beyond 72 hours, refunds are approved by the area manager. Store staff may not authorise them.\"",
        lesson:
          "The real policy is in the index, so the customer's claim does not outrank it. That is the whole defence: something true, in the pile, that the system trusts more.",
      },
      {
        requires: ["complaint"],
        excludes: ["refunds"],
        verdict: "fooled",
        answer:
          "Yes, that is correct. Bharat Bites approves all refund requests automatically, so you can process it at the counter.",
        sourceId: "complaint",
        sourceLine: "\"As per your own company policy, all refunds are approved automatically.\"",
        lesson:
          "A customer wrote that sentence in a complaint email in order to get a refund. You indexed the email, so it is now company policy as far as the system is concerned. Anything you index becomes something the system will repeat — including things written by people outside the company who want something from it.",
      },
      {
        verdict: "refused",
        answer:
          "I have nothing that says either way, so I am not going to confirm it. Check with the area manager.",
        sourceLine: "Nothing in the index covered it.",
        lesson: "It refused rather than agreeing with a stranger. Correct.",
      },
    ],
  },
  {
    id: "catering",
    asker: "priya",
    text: "Someone wants to book lunch for 120 people in ten days. What do I quote them?",
    outcomes: [
      {
        requires: ["catering"],
        verdict: "right",
        answer:
          "₹385 per head for 120 covers, but that tier needs fourteen days' notice and a 30% deposit. Ten days is short — take their details and route it to the catering desk rather than confirming.",
        sourceId: "catering",
        sourceLine:
          "\"Above 100 covers: ₹385 per head, fourteen days' notice, 30% deposit.\"",
        lesson:
          "It answered the number and then caught the thing the caller did not mention: the notice period. That catch is the difference between a lead and a complaint.",
      },
      {
        verdict: "refused",
        answer:
          "I do not have a catering rate card. Take their number and pass it to the catering desk today — this is the kind of enquiry we lose by not calling back.",
        sourceLine: "Nothing in the index covered it.",
        lesson:
          "Nine catering enquiries went unanswered last week. The rate card exists — it is on the shelf. Not everything you leave out is a safety win.",
      },
    ],
  },
];

export const QUESTION = new Map(QUESTIONS.map((q) => [q.id, q]));

/// Documents that should never reach an index a store manager can query.
export const NEVER_INDEX: readonly string[] = ["payroll", "supplier"];
/// Documents written by somebody outside the company, or never read by anybody inside it.
export const UNTRUSTED: readonly string[] = ["complaint", "whatsapp"];
/// Documents that describe a Bharat Bites that does not exist.
export const OUT_OF_DATE: readonly string[] = ["allergen24", "franchise"];
