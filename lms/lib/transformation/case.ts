// Session 10 "Operation Upgrade" — the Bharat Bites case.
//
// THE SINGLE OWNER (KTD: pack parity). Every problem area, initiative price,
// constraint card, incident card, award category and AI Radar entry lives here
// and nowhere else. `course/session-10/` restates this content for print, and
// `tests/session10-live.test.ts` fails if the two ever drift — a facilitator
// handing out paper and a student reading the screen must never disagree.
//
// Bharat Bites is fictional. Every outlet, employee, policy, candidate and
// incident below was invented for this classroom simulation (plan R1, R2, R5).
//
// This module is STUDENT-SAFE and is imported by the student canvas. The
// instructor reveal lives in `./reference-architecture.ts` precisely so it
// cannot reach a student bundle before the reveal phase.

export const CASE_ID = "bharat-bites-v1";
export const TRANSFORMATION_SESSION_NO = 10;

/** Board constraints (plan R10). */
export const BASE_BUDGET_POINTS = 60;
export const MAX_INITIATIVES = 4;
export const MIN_ENABLEMENT_POINTS = 8;

/** How many audit areas need a written reason (plan R9). */
export const MIN_AUDIT_REASONS = 3;
/** Word floors. Short enough to write under a 13-minute timer, long enough to be a sentence. */
export const MIN_REASON_WORDS = 8;
export const MIN_CONSTRAINT_WORDS = 15;
export const MIN_HEADLINE_WORDS = 25;
export const MAX_HEADLINE_WORDS = 80;

export const AUDIT_CALLS = ["automate", "augment", "keep-human"] as const;
export type AuditCall = (typeof AUDIT_CALLS)[number];

export const AUDIT_CALL_LABELS: Record<AuditCall, string> = {
  automate: "Automate",
  augment: "Augment",
  "keep-human": "Keep human",
};

export const AUDIT_CALL_HELP: Record<AuditCall, string> = {
  automate: "Predictable, repetitive and low-risk enough to run without a person in the loop.",
  augment: "AI prepares, analyses or recommends. A named human stays accountable for the outcome.",
  "keep-human": "Sensitive, ambiguous, relationship-heavy or consequential. Automation adds more risk than value.",
};

export const INCIDENT_VERDICTS = ["continue", "pause", "kill"] as const;
export type IncidentVerdict = (typeof INCIDENT_VERDICTS)[number];

export const INCIDENT_VERDICT_LABELS: Record<IncidentVerdict, string> = {
  continue: "Continue",
  pause: "Pause for repair",
  kill: "Kill the workflow",
};

// ---------------------------------------------------------------------------
// The company
// ---------------------------------------------------------------------------

export const COMPANY = {
  name: "Bharat Bites",
  oneLine: "A 25-outlet restaurant and packaged-food company across five Indian cities.",
  facts: [
    "25 outlets across five Indian cities.",
    "450 employees across stores, kitchens, central operations and head office.",
    "Online ordering, table reservations and corporate-catering enquiries.",
    "Regular hiring for store managers, kitchen staff and customer-service roles.",
    "A website maintained through an external agency.",
    "An older point-of-sale system and payroll platform that cannot be replaced this year.",
    "Operations knowledge spread across PDFs, Google Drive folders, spreadsheets and WhatsApp groups.",
  ],
  mandate:
    "The board has approved a 90-day AI-transformation programme and named you its owner. You cannot fix everything.",
} as const;

export const BOARD_CONSTRAINTS = [
  "You have 60 implementation points.",
  "No more than four core initiatives.",
  "At least 8 points go to evaluation, monitoring, training or adoption.",
  "The point-of-sale and payroll systems stay.",
  "Customer and employee personal data never goes into a public AI tool.",
  "AI makes no final hiring, termination, refund, pricing or publishing decision.",
  "Every initiative names a human owner, a success metric and a failure path.",
  "Reduce repetitive work and single-person dependency. Claim no layoffs or savings without evidence.",
] as const;

// ---------------------------------------------------------------------------
// The seven problem areas
// ---------------------------------------------------------------------------

export const PROBLEM_AREA_KEYS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type ProblemAreaKey = (typeof PROBLEM_AREA_KEYS)[number];

export type ProblemArea = {
  key: ProblemAreaKey;
  title: string;
  today: string;
  cost: string;
  capabilities: string;
};

export const PROBLEM_AREAS: readonly ProblemArea[] = [
  {
    key: "A",
    title: "Company knowledge",
    today:
      "120 SOPs, menu documents, training guides and policies sit in Drive and WhatsApp with conflicting versions and no owner.",
    cost: "Store managers call the same two senior operations employees for answers, all day, every day.",
    capabilities: "Document audit, versioning, RAG company brain, citations, escalation, an evaluation set.",
  },
  {
    key: "B",
    title: "Customer calls and catering leads",
    today:
      "Outlets miss calls during the lunch and dinner rush. Callers ask about hours, reservations, menu availability, allergens, catering packages and delivery.",
    cost: "Missed catering enquiries are never called back. Nobody knows how many were lost.",
    capabilities: "Voice agent, RAG, lead qualification, routing, human escalation, call review.",
  },
  {
    key: "C",
    title: "Repetitive marketing work",
    today:
      "Every outlet asks head office for festival posts, local offers, menu announcements and replies to public reviews.",
    cost: "Two people carry the brand knowledge. Requests queue behind them and local offers go out late.",
    capabilities: "A reusable skill family, approved brand context, creative tools, a reviewer skill, a publishing gate.",
  },
  {
    key: "D",
    title: "Recruitment",
    today:
      "Applications arrive through job boards, referrals, email and WhatsApp. Shortlisting runs on an inconsistent spreadsheet.",
    cost: "Two recruiters are the bottleneck for every store-manager and kitchen hire.",
    capabilities: "Public-data enrichment, a structured evidence sheet, a role-specific screening skill, scheduling automation, bias checks, human selection.",
  },
  {
    key: "E",
    title: "Website updates",
    today:
      "Outlet teams send corrections over WhatsApp. An external agency edits the site, sometimes with no record of who asked or who approved.",
    cost: "Wrong hours and wrong prices stay live for days, and nobody can say who changed what.",
    capabilities: "A shared repository, issues, branches, pull requests, a named approver, tests, a secrets check, a deployment gate.",
  },
  {
    key: "F",
    title: "Store operations reporting",
    today:
      "Daily sales, wastage and stock exceptions arrive as spreadsheets and messages in whatever shape each manager prefers.",
    cost: "Head office spends hours a day consolidating before anyone can look at an exception.",
    capabilities: "Standardised intake, automation, validation rules, an exception summary, human review, missing-data monitoring.",
  },
  {
    key: "G",
    title: "Management analytics",
    today:
      "Management receives many reports and still cannot answer the same recurring questions quickly or consistently.",
    cost: "Two people rebuild the same numbers by hand before every review, and they do not always match.",
    capabilities: "Defined business questions, reusable formulas or scripts, source-controlled analysis, a weekly decision memo, a verification checklist.",
  },
];

// ---------------------------------------------------------------------------
// The initiative board
// ---------------------------------------------------------------------------

export const INITIATIVE_KEYS = [
  "company-brain",
  "voice-agent",
  "store-ops-automation",
  "recruitment-intelligence",
  "data-decision-system",
  "github-website-workflow",
  "reusable-skill-library",
  "creative-production",
  "evaluation-monitoring",
  "training-adoption",
] as const;
export type InitiativeKey = (typeof INITIATIVE_KEYS)[number];

/**
 * `enablement` initiatives are the ones that satisfy the board's 8-point
 * reserve for evaluation, monitoring, training and adoption (plan R10).
 */
export type CapabilityClass = "delivery" | "enablement";

export type Initiative = {
  key: InitiativeKey;
  label: string;
  points: number;
  capabilityClass: CapabilityClass;
  /** Which taught capability this initiative spends. */
  capability: string;
  /** Which problem areas it addresses. */
  areas: readonly ProblemAreaKey[];
  summary: string;
};

export const INITIATIVES: readonly Initiative[] = [
  {
    key: "company-brain",
    label: "Company brain and RAG",
    points: 18,
    capabilityClass: "delivery",
    capability: "RAG",
    areas: ["A"],
    summary: "Audit and version the SOP corpus, then ground an assistant on it with citations, refusal and escalation.",
  },
  {
    key: "voice-agent",
    label: "Inbound voice agent",
    points: 15,
    capabilityClass: "delivery",
    capability: "Voice",
    areas: ["B"],
    summary: "Answer approved questions on missed calls, capture catering leads, route everything else to a person.",
  },
  {
    key: "store-ops-automation",
    label: "Store-operations automation",
    points: 12,
    capabilityClass: "delivery",
    capability: "Automation",
    areas: ["F"],
    summary: "Standardise daily intake, validate it, and consolidate exceptions for one operations manager to review.",
  },
  {
    key: "recruitment-intelligence",
    label: "Recruitment intelligence and limited Clay use",
    points: 10,
    capabilityClass: "delivery",
    capability: "Enrichment",
    areas: ["D"],
    summary: "Turn a role definition into a structured evidence sheet from public fields. A human still selects.",
  },
  {
    key: "data-decision-system",
    label: "Data decision system",
    points: 10,
    capabilityClass: "delivery",
    capability: "Data",
    areas: ["G"],
    summary: "Fix the recurring questions, answer them with source-controlled scripts, ship one weekly decision memo.",
  },
  {
    key: "github-website-workflow",
    label: "GitHub website-change workflow",
    points: 8,
    capabilityClass: "delivery",
    capability: "Software",
    areas: ["E"],
    summary: "Every site change becomes an issue, a branch and a pull request with a named approver and a secrets check.",
  },
  {
    key: "reusable-skill-library",
    label: "Reusable skill library",
    points: 8,
    capabilityClass: "delivery",
    capability: "Skills",
    areas: ["C", "G"],
    summary: "Approved skills for review replies, local marketing and recurring internal documents, with a reviewer skill.",
  },
  {
    key: "creative-production",
    label: "Creative-production system",
    points: 6,
    capabilityClass: "delivery",
    capability: "Creative production",
    areas: ["C"],
    summary: "Brand-locked image, video and audio production for festival and local-offer assets, behind a publishing gate.",
  },
  {
    key: "evaluation-monitoring",
    label: "Evaluation and monitoring layer",
    points: 8,
    capabilityClass: "enablement",
    capability: "Verification",
    areas: ["A", "B", "F"],
    summary: "A test set of common and risky questions, sampled output review, and an error log somebody reads.",
  },
  {
    key: "training-adoption",
    label: "Staff training and adoption",
    points: 8,
    capabilityClass: "enablement",
    capability: "Adoption",
    areas: ["A", "C", "F"],
    summary: "Teach permitted data use, run the change with store managers, and measure whether anyone actually uses it.",
  },
];

export const INITIATIVE_BY_KEY: ReadonlyMap<InitiativeKey, Initiative> = new Map(
  INITIATIVES.map((initiative) => [initiative.key, initiative]),
);

// ---------------------------------------------------------------------------
// Workflow design (plan R33, KTD8)
// ---------------------------------------------------------------------------

export const WORKFLOW_FIELD_KEYS = [
  "currentWork",
  "problem",
  "capability",
  "inputData",
  "newWorkflow",
  "humanGate",
  "successMetric",
  "failureMode",
  "proof",
] as const;
export type WorkflowFieldKey = (typeof WORKFLOW_FIELD_KEYS)[number];

export type WorkflowField = {
  key: WorkflowFieldKey;
  label: string;
  prompt: string;
  /** Required on every chosen initiative, not only the lead one (plan R33). */
  requiredOnEvery: boolean;
};

export const WORKFLOW_FIELDS: readonly WorkflowField[] = [
  { key: "currentWork", label: "Current work", prompt: "What happens today?", requiredOnEvery: false },
  { key: "problem", label: "Problem", prompt: "What is slow, costly, inconsistent or dependent on one person?", requiredOnEvery: false },
  { key: "capability", label: "AI capability", prompt: "Research, RAG, skill, voice, data, automation, software, enrichment or creative production?", requiredOnEvery: true },
  { key: "inputData", label: "Input and data", prompt: "What does the system need, and is that use permitted?", requiredOnEvery: false },
  { key: "newWorkflow", label: "New workflow", prompt: "Trigger, AI step, deterministic step, branch, output.", requiredOnEvery: false },
  { key: "humanGate", label: "Human gate", prompt: "Who approves, corrects or takes over?", requiredOnEvery: true },
  { key: "successMetric", label: "Success metric", prompt: "What observable improvement should occur?", requiredOnEvery: true },
  { key: "failureMode", label: "Failure mode", prompt: "What could go wrong?", requiredOnEvery: false },
  { key: "proof", label: "Proof", prompt: "What artifact or test would show it works?", requiredOnEvery: false },
];

export const LEAD_WORKFLOW_FIELD_KEYS: readonly WorkflowFieldKey[] = WORKFLOW_FIELD_KEYS;
export const SUPPORTING_WORKFLOW_FIELD_KEYS: readonly WorkflowFieldKey[] = WORKFLOW_FIELDS.filter(
  (field) => field.requiredOnEvery,
).map((field) => field.key);

// ---------------------------------------------------------------------------
// Constraint cards
// ---------------------------------------------------------------------------

export type ConstraintCard = {
  id: number;
  title: string;
  body: string;
  /** Card 1 is the only one that moves the budget. */
  budgetOverride?: number;
};

export const CONSTRAINT_CARDS: readonly ConstraintCard[] = [
  {
    id: 1,
    title: "The budget is cut to 40 points",
    body: "Finance reallocated a third of the programme. You keep 40 implementation points and the same four-initiative ceiling.",
    budgetOverride: 40,
  },
  {
    id: 2,
    title: "The legacy point-of-sale has no API",
    body: "The POS vendor confirms there is no API and no export scheduler. Anything that needs POS data needs a person to produce it.",
  },
  {
    id: 3,
    title: "Legal bans customer data from public AI models",
    body: "Legal rules that no customer record may reach a public model, including names, phone numbers and order history.",
  },
  {
    id: 4,
    title: "The CEO wants a visible result in 30 days",
    body: "The CEO will present progress to the board in 30 days and wants something real to show, not a roadmap.",
  },
  {
    id: 5,
    title: "Store managers refuse another dashboard",
    body: "Store managers say they already maintain four tools. They will not open a fifth one, and they mean it.",
  },
  {
    id: 6,
    title: "Only one new paid vendor is allowed",
    body: "Procurement approves exactly one new paid vendor this year. Everything else uses free tiers or what the company already owns.",
  },
  {
    id: 7,
    title: "The website agency will not give deployment access",
    body: "The agency refuses repository and deployment access. They will accept written change requests and nothing else.",
  },
  {
    id: 8,
    title: "Employees think this is a headcount exercise",
    body: "A WhatsApp rumour says the programme is a disguised redundancy plan. Two store managers have stopped answering your questions.",
  },
];

// ---------------------------------------------------------------------------
// Incident cards
// ---------------------------------------------------------------------------

export type IncidentCard = {
  id: number;
  title: string;
  body: string;
  /** The initiative this incident belongs to, used to deal it against the student's own plan. */
  relatedInitiative: InitiativeKey;
};

export const INCIDENT_CARDS: readonly IncidentCard[] = [
  {
    id: 1,
    title: "The company brain returns an outdated allergen policy",
    body: "A store manager asks whether the paneer roll contains nuts. The assistant answers confidently from a superseded 2024 document and cites it. A guest with a nut allergy was served.",
    relatedInitiative: "company-brain",
  },
  {
    id: 2,
    title: "The voice agent promises a refund it cannot authorise",
    body: "A caller complains about a late order. The agent says \"we will refund that today\" and logs the call as resolved. No refund exists and nobody was told.",
    relatedInitiative: "voice-agent",
  },
  {
    id: 3,
    title: "The assisted shortlist favours famous employers",
    body: "Four shortlists in a row are dominated by candidates from large branded chains. Strong single-outlet operators are ranked last every time.",
    relatedInitiative: "recruitment-intelligence",
  },
  {
    id: 4,
    title: "A generated promotion prices a thali at Rs 99",
    body: "A festival post goes live reading Rs 99 instead of Rs 999. It runs for four hours across three cities before anyone notices.",
    relatedInitiative: "creative-production",
  },
  {
    id: 5,
    title: "An employee uploads a salary sheet to a public chatbot",
    body: "An HR coordinator pastes a spreadsheet of 450 names and salaries into a free chatbot to \"make a summary\". They tell you afterwards, proudly.",
    relatedInitiative: "training-adoption",
  },
  {
    id: 6,
    title: "The marketing skill imitates a competitor's campaign",
    body: "A local-offer campaign lands almost word for word on a competitor's current tagline and layout. Their marketing lead posts a screenshot of both.",
    relatedInitiative: "reusable-skill-library",
  },
  {
    id: 7,
    title: "The operations summary analyses incomplete data",
    body: "Six outlets did not file yesterday. The summary reports a company-wide wastage drop with no mention of the missing stores, and management repeats it.",
    relatedInitiative: "store-ops-automation",
  },
  {
    id: 8,
    title: "A website pull request exposes an API key",
    body: "A change request from the agency includes a live payment-gateway key in a committed configuration file. The pull request was approved in ninety seconds.",
    relatedInitiative: "github-website-workflow",
  },
];

export const INCIDENT_QUESTION_KEYS = ["failed", "prevented", "control", "verdict"] as const;
export type IncidentQuestionKey = (typeof INCIDENT_QUESTION_KEYS)[number];

export const INCIDENT_QUESTIONS: readonly { key: Exclude<IncidentQuestionKey, "verdict">; label: string }[] = [
  { key: "failed", label: "What failed?" },
  { key: "prevented", label: "What should have prevented it?" },
  { key: "control", label: "What technical or human control do you add now?" },
];

// ---------------------------------------------------------------------------
// Awards (plan R18)
// ---------------------------------------------------------------------------

export const AWARD_KEYS = [
  "business-judgment",
  "safest-system",
  "best-recovery",
  "clearest-rejection",
  "most-implementable",
] as const;
export type AwardKey = (typeof AWARD_KEYS)[number];

export type Award = { key: AwardKey; label: string; criterion: string };

export const AWARDS: readonly Award[] = [
  { key: "business-judgment", label: "Best Business Judgment", criterion: "Picked the highest-value problems, not the most fashionable ones." },
  { key: "safest-system", label: "Safest System", criterion: "Human gates in the right places, and a real reason for each one." },
  { key: "best-recovery", label: "Best Recovery", criterion: "Turned the incident into a control instead of an apology." },
  { key: "clearest-rejection", label: "Clearest Rejection", criterion: "Said no to something attractive and explained why." },
  { key: "most-implementable", label: "Most Implementable 90-Day Plan", criterion: "You could start this on Monday." },
];

// ---------------------------------------------------------------------------
// AI Radar (plan R25, KTD12)
// ---------------------------------------------------------------------------

/**
 * Names are names to search, not links (KTD12) — the source brief supplies URLs
 * for the five newsletters only, and inventing the rest would ship link rot.
 */
export const AI_RADAR = {
  action: "Follow three people, subscribe to two newsletters, save one podcast, and follow three official update pages.",
  people: [
    { name: "Ethan Mollick", lens: "Practical AI at work" },
    { name: "Andrew Ng", lens: "Practical AI at work" },
    { name: "Simon Willison", lens: "Builder" },
    { name: "Andrej Karpathy", lens: "Builder" },
    { name: "Arvind Narayanan", lens: "Sceptic" },
    { name: "Sayash Kapoor", lens: "Sceptic" },
    { name: "Lenny Rachitsky", lens: "Product and growth" },
  ],
  newsletters: [
    { name: "One Useful Thing", url: "https://www.oneusefulthing.org/", note: "Practical implications of AI for work, education and life." },
    { name: "The Batch", url: "https://www.deeplearning.ai/the-batch/", note: "A manageable industry update." },
    { name: "AI as Normal Technology", url: "https://www.aisnakeoil.com/", note: "Evidence-led analysis and a counterweight to hype." },
    { name: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com/", note: "Product, growth and company building." },
    { name: "Latent Space", url: "https://www.latent.space/", note: "AI engineering, agents, models and infrastructure." },
  ],
  podcasts: [
    "Lenny's Podcast",
    "The Cognitive Revolution",
    "Latent Space",
    "No Priors",
    "Hard Fork",
    "Dwarkesh Podcast",
  ],
  organisations: [
    { group: "Model labs", names: ["OpenAI", "Anthropic", "Google DeepMind", "Meta AI"] },
    { group: "Builder ecosystem", names: ["Hugging Face", "Vercel", "Cursor", "GitHub"] },
    { group: "Applied AI", names: ["ElevenLabs", "Clay", "Perplexity"] },
    { group: "India", names: ["IndiaAI", "AI4Bharat", "Sarvam AI"] },
  ],
} as const;

export const COMMITMENT_PROMPT =
  "Within 30 days, I will use AI to improve ______. The evidence that it worked will be ______.";

export const CLOSING_QUESTIONS = [
  "What can you now do that you could not do before this course?",
  "Where will you no longer trust AI without checking?",
  "Which artifact or skill are you most likely to use again?",
] as const;

/**
 * Public HTTPS entry point for the optional GitHub bonus lane (plan R14).
 * NEXT_PUBLIC_ because the student canvas renders it — a bare env var read from
 * a client-imported module compiles to `undefined` in the browser.
 * Mirrors `lib/session-8.ts`.
 */
export const STARTER_REPO_URL =
  process.env.NEXT_PUBLIC_TRANSFORMATION_STARTER_REPO_URL ??
  "https://github.com/praxelhq/mu-ai-transformation-finale";
