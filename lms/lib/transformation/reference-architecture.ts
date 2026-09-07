// Session 10 instructor reveal — the reference architecture shown at 1:34.
//
// DELIBERATELY A SEPARATE MODULE from `./case.ts`. This is the model answer.
// The student canvas imports `case.ts` and must never import this file, so the
// reveal cannot reach a student bundle before the instructor shows it
// (plan R23; guarded by `tests/session10-live.test.ts`). Only the instructor
// console, the projector and the pack asset routes read it.

export type ReferencePhase = {
  order: number;
  title: string;
  intent: string;
  moves: readonly string[];
};

export const REFERENCE_ARCHITECTURE: readonly ReferencePhase[] = [
  {
    order: 1,
    title: "Knowledge and control",
    intent: "Nothing downstream is trustworthy until the documents are.",
    moves: [
      "Audit and version the SOP and policy corpus. Establish an owner and an effective date for each document.",
      "Retire the conflicting copies rather than indexing all of them.",
      "Build a small company brain with citations, an explicit refusal, and an escalation path to a named person.",
      "Write a test set of common questions and the risky ones — allergens, refunds, pricing.",
    ],
  },
  {
    order: 2,
    title: "Reusable work and operations",
    intent: "Take the repetitive work off the two people who currently are the system.",
    moves: [
      "Build approved skills for review replies, local marketing and recurring internal documents.",
      "Standardise store reporting intake and automate the consolidation.",
      "Keep exception review with an operations manager. The automation prepares; the human decides.",
    ],
  },
  {
    order: 3,
    title: "Controlled customer interaction",
    intent: "Point the agent at customers only after the knowledge behind it is reliable.",
    moves: [
      "Add the inbound voice agent after the company brain passes its test set, not before.",
      "Limit it to answering approved questions, collecting lead details and routing calls.",
      "Route allergens, refunds, complaints and anything unusual to a person, always.",
    ],
  },
];

export const REFERENCE_GOVERNANCE = {
  title: "Parallel governance layer",
  intent: "Runs across all three phases from day one, not after something goes wrong.",
  moves: [
    "Website changes move through issues and pull requests with a named approver.",
    "Pricing and publishing need a human approval before they go live.",
    "Secrets stay out of the repository, and a check enforces it.",
    "Log errors, review sampled outputs weekly, and train staff on permitted data use.",
  ],
} as const;

export const REFERENCE_NOTE =
  "There is no single correct answer. What this plan demonstrates is sequencing: knowledge before agents, gates before scale, and evaluation bought at the start rather than added after an incident. Clay-assisted recruitment is a later pilot here, not a first move — using every fashionable capability was never the goal.";
