// Deterministic demo-world seed for the Praxel LMS ("The Forge").
//
// - Deterministic: seeded PRNG (mulberry32), fixed dates, explicit ids.
//   Running twice produces identical row counts and identical content.
// - Idempotent: wipe-and-recreate inside one transaction, deletes in
//   FK-safe order (children before parents).
// - Also writes fixtures/roster.csv (name,email,section) for the admin
//   roster import flow.
//
// Exported `main()` is used by tests/seed.test.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { allocatePoints, mulberry32, partitionTeams } from "../lib/seed-utils";

// ---------------------------------------------------------------------------
// Fixed inputs
// ---------------------------------------------------------------------------

const SECTION_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
type SectionCode = (typeof SECTION_CODES)[number];

// 09_sector_board_80.md — CORE families 1–8, one column per section.
const SECTOR_BOARD: Record<SectionCode, string[]> = {
  A: ["Frontier AI labs", "Passenger EVs", "D2C Gen-Z fashion", "Digital lending", "Telemedicine", "Quick commerce", "Specialty chemicals", "Creator economy"],
  B: ["Semiconductors & chip design", "Electric two-wheelers", "Gen-Z / lab-grown jewellery", "Wealthtech", "Diagnostics & lab chains", "Logistics & supply-chain tech", "Auto components", "EdTech & upskilling"],
  C: ["Space tech & launch", "EV charging infra", "D2C beauty & personal care", "InsurTech", "Health insurance", "Warehousing & dark stores", "Textiles & apparel mfg", "Proptech & real estate"],
  D: ["Defence tech", "Battery cell manufacturing", "D2C nutrition & supplements", "Neobanking & SME banking", "Medical devices", "Last-mile delivery", "Pharma manufacturing & CDMO", "Travel & hospitality tech"],
  E: ["Quantum computing", "Solar energy", "Better-for-you snacking", "Payments & UPI", "E-pharmacy", "Freight & trucking tech", "Agri-inputs & agritech", "Legal tech"],
  F: ["Humanoid robotics", "Green hydrogen", "Premium coffee & café", "Cross-border payments", "Mental health apps", "Cold chain", "Food processing", "HR tech & staffing"],
  G: ["Drones & UAVs", "Grid-scale storage", "Pet care & pet food", "RegTech", "Connected fitness", "Supply-chain visibility", "Building materials & cement", "Restaurant & food-service tech"],
  H: ["AR/VR & spatial computing", "Small modular nuclear", "Smart home appliances", "Co-lending & NBFC tech", "Elder care", "Returns & reverse logistics", "Industrial automation", "Ride-hailing & urban mobility"],
};

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Rohan", "Aryan", "Kabir", "Ananya", "Diya", "Aadhya", "Siya",
  "Pari", "Anika", "Navya", "Riya", "Ira", "Myra", "Sara", "Aarohi",
  "Anaya", "Kiara", "Amaira", "Zara", "Ishita", "Tanvi", "Meera", "Nisha",
  "Rahul", "Priya", "Sneha", "Karan", "Pooja", "Vikram", "Neha", "Amit",
  "Divya", "Rajat", "Shreya", "Manish", "Kavya", "Nikhil", "Tanya", "Harsh",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Mehta", "Iyer", "Nair", "Reddy", "Rao",
  "Patel", "Shah", "Khanna", "Kapoor", "Malhotra", "Chopra", "Joshi", "Desai",
  "Kulkarni", "Menon", "Pillai", "Banerjee", "Chatterjee", "Mukherjee", "Singh", "Agarwal",
];

const STUDENTS_PER_SECTION = 60;
const TEAMS_PER_SECTION = 8;
const TOTAL_STUDENTS = SECTION_CODES.length * STUDENTS_PER_SECTION;

// Fixed timeline anchors (mid-course: sessions 1–3 done, 4–10 ahead).
const T = {
  s1: new Date("2026-07-06T04:30:00Z"),
  s2: new Date("2026-07-13T04:30:00Z"),
  s3: new Date("2026-07-20T04:30:00Z"),
  now: new Date("2026-07-27T09:00:00Z"), // fixed "seeded at" moment
  dueS2: new Date("2026-08-04T18:29:00Z"),
  dueS3: new Date("2026-08-11T18:29:00Z"),
  dueS4: new Date("2026-08-18T18:29:00Z"),
  dueS5: new Date("2026-08-25T18:29:00Z"),
  dueS6: new Date("2026-09-01T18:29:00Z"),
  dueMedia: new Date("2026-09-08T18:29:00Z"),
  dueFinal: new Date("2026-09-22T18:29:00Z"),
  ivOpens: new Date("2026-09-10T04:30:00Z"),
  ivCloses: new Date("2026-09-17T18:29:00Z"),
};

const pad3 = (n: number) => String(n).padStart(3, "0");
const studentEmail = (i: number) => `student${pad3(i + 1)}@mastersunion.org`;
const studentName = (i: number) =>
  `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]}`;
const studentId = (i: number) => `user_s${pad3(i + 1)}`;
const sectionIdOf = (code: string) => `sec_${code}`;
const teamIdOf = (code: string, t: number) => `team_${code}${t + 1}`;

const RUBRIC_4DIM = {
  scale: 10,
  dimensions: [
    { key: "functionality", label: "Functionality", max: 10, description: "Does it actually work?" },
    { key: "craft", label: "Craft", max: 10, description: "Is the execution good, not just present?" },
    { key: "relevance", label: "Relevance", max: 10, description: "Built for the team's real company/industry?" },
    { key: "verification-evidence", label: "Verification evidence", max: 10, description: "Can the student show they checked their own work?" },
  ],
};

function field(key: string, label: string, kind: string, required = true) {
  return { key, label, kind, required };
}

const ASSIGNMENT_TYPES = [
  {
    id: "atype_skill",
    slug: "skill",
    title: "Skill family",
    description: "Session 2 individual artifact: a reusable AI skill family with a link and a writeup.",
    teamBased: false,
    galleryEligible: false,
    submissionSchema: {
      fields: [
        field("skillLink", "Link to your skill family", "link"),
        field("writeup", "What it does and why it matters", "writeup"),
      ],
    },
  },
  {
    id: "atype_data_memo",
    slug: "data-memo",
    title: "Verified data memo",
    description: "Session 3 SHIP form: three verified numbers, the move used for each, and one thing the AI got wrong.",
    teamBased: false,
    galleryEligible: false,
    submissionSchema: {
      fields: [
        field("number1", "Verified number 1", "text"),
        field("move1", "Verification move used for number 1", "text"),
        field("number2", "Verified number 2", "text"),
        field("move2", "Verification move used for number 2", "text"),
        field("number3", "Verified number 3", "text"),
        field("move3", "Verification move used for number 3", "text"),
        field("aiGotWrong", "One thing your AI told you that was wrong or incomplete", "writeup"),
        field("evidenceFile", "Supporting file (optional)", "file", false),
      ],
    },
  },
  {
    id: "atype_app",
    slug: "app",
    title: "Lovable app",
    description: "Session 4 individual artifact: a working app plus its GitHub repository.",
    teamBased: false,
    galleryEligible: true,
    submissionSchema: {
      fields: [
        field("appUrl", "Live app URL", "link"),
        field("githubUrl", "GitHub repository URL", "link"),
        field("writeup", "What the app does and who it is for", "writeup"),
      ],
    },
  },
  {
    id: "atype_workflow",
    slug: "workflow",
    title: "Company automation workflow",
    description: "Session 5 team artifact: a Make.com automation (blueprint JSON + screen recording) with a usefulness argument.",
    teamBased: true,
    galleryEligible: true,
    submissionSchema: {
      fields: [
        field("blueprintFile", "Blueprint JSON export", "file"),
        field("recordingFile", "Screen recording of the workflow running", "file"),
        field("usefulness", "Usefulness argument — what does this save, specifically?", "writeup"),
      ],
    },
  },
  {
    id: "atype_media",
    slug: "media",
    title: "Team media pieces",
    description: "Team media artifacts (jingle / ad / poster) with a caption.",
    teamBased: true,
    galleryEligible: false,
    submissionSchema: {
      fields: [
        field("mediaFiles", "Media files", "files"),
        field("caption", "Caption", "text"),
      ],
    },
  },
  {
    id: "atype_value_chain_map",
    slug: "value-chain-map",
    title: "Value chain map",
    description: "Team artifact: the industry value chain map (checkpoint at Session 6, final at capstone).",
    teamBased: true,
    galleryEligible: true,
    submissionSchema: {
      fields: [
        field("mapFiles", "Map file(s)", "files"),
        field("summary", "Summary — what the map shows and its strongest insight", "writeup"),
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Seed body
// ---------------------------------------------------------------------------

/**
 * Exhaustive application-table reset list. Keep `_prisma_migrations` out: a
 * demo reset must never rewrite migration history. One TRUNCATE statement can
 * safely handle cycles/self-relations without weakening immutable-row triggers.
 * `tests/seed.test.ts` compares this list with Prisma's generated data model so
 * a future model addition fails closed until its reset behavior is reviewed.
 */
export const DEMO_SEED_TABLES = [
  "User",
  "Section",
  "Team",
  "AssignmentType",
  "Assignment",
  "Submission",
  "Grade",
  "Interview",
  "InterviewTurn",
  "InterviewRetake",
  "InterviewWindow",
  "Quiz",
  "QuizAttempt",
  "PeerReview",
  "GalleryItem",
  "Vote",
  "Material",
  "SessionPage",
  "Gate",
  "GateException",
  "AuditLog",
  "Notification",
  "CostLog",
  "SignOff",
  "RetentionPolicy",
  "RetentionHold",
  "DeletionReceipt",
  "DatasetRelease",
  "DatasetReleaseFile",
  "AssessmentVersion",
  "AssessmentEvaluatorConfig",
  "AssessmentResult",
  "UploadReservation",
  "GeneratedObjectReservation",
  "SubmissionEvidence",
  "ResubmissionGrant",
  "GradeAppeal",
  "GradeHold",
  "AssessmentCohortFreeze",
  "PublicationDecision",
  "TeamWorkflowSelection",
  "TeamWorkflowNomination",
  "ServiceHeartbeat",
  "PortfolioEntry",
  "ConfigKV",
] as const;

export function assertDemoSeedResetAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (
    env.NODE_ENV === "production" ||
    Object.keys(env).some((key) => key.startsWith("RAILWAY_"))
  ) {
    throw new Error("Demo seed reset is disabled in production and Railway environments.");
  }
  const rawUrl = env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required for the demo seed reset.");
  let hostname: string;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error();
    hostname = url.hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for the demo seed reset.");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!loopback.has(hostname) && env.ALLOW_DEMO_SEED_RESET !== "true") {
    throw new Error(
      "Refusing to reset a non-loopback database without ALLOW_DEMO_SEED_RESET=true.",
    );
  }
}

export async function main(): Promise<void> {
  assertDemoSeedResetAllowed();
  const started = Date.now();
  const prisma = new PrismaClient();
  try {
    const allSectionIds = SECTION_CODES.map(sectionIdOf);

    // --- Sections, teams, users -------------------------------------------
    const sections = SECTION_CODES.map((code) => ({
      id: sectionIdOf(code),
      code,
      name: `Section ${code}`,
    }));

    const teamSizes = partitionTeams(STUDENTS_PER_SECTION, TEAMS_PER_SECTION);
    const teams: { id: string; sectionId: string; name: string; sectorName: string }[] = [];
    const teamMembers = new Map<string, string[]>(); // teamId -> student user ids
    const studentTeam = new Map<number, string>(); // student index -> teamId

    SECTION_CODES.forEach((code, s) => {
      let cursor = s * STUDENTS_PER_SECTION;
      for (let t = 0; t < TEAMS_PER_SECTION; t++) {
        const id = teamIdOf(code, t);
        teams.push({
          id,
          sectionId: sectionIdOf(code),
          name: `Team ${code}${t + 1}`,
          sectorName: SECTOR_BOARD[code][t],
        });
        const members: string[] = [];
        for (let m = 0; m < teamSizes[t]; m++) {
          members.push(studentId(cursor));
          studentTeam.set(cursor, id);
          cursor += 1;
        }
        teamMembers.set(id, members);
      }
    });

    const students = Array.from({ length: TOTAL_STUDENTS }, (_, i) => ({
      id: studentId(i),
      email: studentEmail(i),
      name: studentName(i),
      role: "student" as const,
      sectionId: sectionIdOf(SECTION_CODES[Math.floor(i / STUDENTS_PER_SECTION)]),
      teamId: studentTeam.get(i)!,
      createdAt: T.s1,
    }));

    const staff = [
      { id: "user_instructor", email: "instructor@praxel.in", name: "Praxel Instructor", role: "instructor" as const, createdAt: T.s1 },
      { id: "user_admin_pushpak", email: "pushpak@praxel.in", name: "Pushpak Teja", role: "admin" as const, createdAt: T.s1 },
      { id: "user_admin_ashwin", email: "ashwin@praxel.in", name: "Ashwin Prasad", role: "admin" as const, createdAt: T.s1 },
    ];

    // --- fixtures/roster.csv ----------------------------------------------
    const rosterPath = fileURLToPath(new URL("../fixtures/roster.csv", import.meta.url));
    mkdirSync(dirname(rosterPath), { recursive: true });
    const rosterCsv =
      "name,email,section\n" +
      students
        .map((st, i) => `${st.name},${st.email},${SECTION_CODES[Math.floor(i / STUDENTS_PER_SECTION)]}`)
        .join("\n") +
      "\n";
    writeFileSync(rosterPath, rosterCsv, "utf8");

    // --- Assignments -------------------------------------------------------
    const assignments = [
      { id: "asg_s2_skill", assignmentTypeId: "atype_skill", title: "S2 · Skill family", brief: "Build and ship a reusable skill family from Session 2. Link it and explain what it does.", sessionNo: 2, dueAt: T.dueS2, weightBucket: "artifact-quality", sectionIds: allSectionIds },
      { id: "asg_s3_datamemo", assignmentTypeId: "atype_data_memo", title: "S3 · Verified data memo", brief: "The SHIP form: three numbers you verified today, the move used for each, and one thing your AI got wrong.", sessionNo: 3, dueAt: T.dueS3, weightBucket: "artifact-quality", sectionIds: allSectionIds },
      { id: "asg_s4_app", assignmentTypeId: "atype_app", title: "S4 · Lovable app", brief: "Build an app with Lovable for your team's industry. Submit the live link and the GitHub repo.", sessionNo: 4, dueAt: T.dueS4, weightBucket: "artifact-quality", sectionIds: allSectionIds },
      { id: "asg_s5_workflow", assignmentTypeId: "atype_workflow", title: "S5 · Company automation", brief: "One automation per member, one team submission: blueprint JSON, a screen recording, and the usefulness case.", sessionNo: 5, dueAt: T.dueS5, weightBucket: "workflow-usefulness", sectionIds: allSectionIds },
      { id: "asg_s6_map", assignmentTypeId: "atype_value_chain_map", title: "S6 · Value chain map — checkpoint", brief: "Mid-course checkpoint of your industry map. Formative feedback only; not scored.", sessionNo: 6, dueAt: T.dueS6, weightBucket: "value-chain-map", sectionIds: allSectionIds },
      { id: "asg_media", assignmentTypeId: "atype_media", title: "Team media pieces", brief: "Jingle, ad, or poster for your sector. One team submission with all files.", sessionNo: 6, dueAt: T.dueMedia, weightBucket: "artifact-quality", sectionIds: allSectionIds },
      { id: "asg_final_map", assignmentTypeId: "atype_value_chain_map", title: "S9/10 · Value chain map — final", brief: "The capstone map. All eight layers, sourced, presentable to a stranger.", sessionNo: 9, dueAt: T.dueFinal, weightBucket: "value-chain-map", sectionIds: allSectionIds },
    ];

    // --- Quizzes -----------------------------------------------------------
    const quizzes = [
      {
        id: "quiz_dpdp",
        sessionNo: 1,
        title: "Surprise quiz · Data privacy (DPDP)",
        isDiagnostic: true,
        sectionIds: allSectionIds,
        questions: [
          { q: "What does India's DPDP Act, 2023 primarily regulate?", options: ["Cryptocurrency exchanges", "How digital personal data is collected, used, and protected", "Cross-border e-commerce tariffs", "Social media content moderation"], correctIndex: 1 },
          { q: "Under the DPDP Act, an organisation that decides why and how personal data is processed is called a…", options: ["Data Principal", "Data Processor", "Data Fiduciary", "Data Auditor"], correctIndex: 2 },
          { q: "When were the DPDP implementing Rules notified, making the law operational?", options: ["They are still in draft", "November 2025", "January 2023", "March 2024"], correctIndex: 1 },
          { q: "Which principle does the DPDP Act require when collecting personal data?", options: ["Collect as much as possible for future use", "Minimal collection with consent for a stated purpose", "Collection is unrestricted for Indian companies", "Only paper records are regulated"], correctIndex: 1 },
          { q: "Before recording a user interview, DPDP-compliant practice requires…", options: ["Nothing, recordings are exempt", "Informed consent, with the purpose stated", "A police permit", "Storing the audio outside India"], correctIndex: 1 },
        ],
      },
      {
        id: "quiz_s2",
        sessionNo: 2,
        title: "Surprise quiz · AI basics",
        isDiagnostic: false,
        sectionIds: allSectionIds,
        questions: [
          { q: "In the CO-STAR prompting framework, the letters stand for…", options: ["Context, Objective, Style, Tone, Audience, Response", "Code, Output, Syntax, Test, Assert, Run", "Concept, Order, Structure, Theme, Aim, Result", "Context, Output, Speed, Tokens, Accuracy, Reasoning"], correctIndex: 0 },
          { q: "A token in an LLM is best described as…", options: ["One full sentence", "A unit of text (roughly a word piece) the model processes", "A password for the API", "One pixel of an image"], correctIndex: 1 },
          { q: "The LMSYS Chatbot Arena leaderboard ranks models by…", options: ["Parameter count", "Training cost", "Head-to-head human preference votes", "Release date"], correctIndex: 2 },
          { q: "Roughly how many characters of English text is one token?", options: ["1", "4", "40", "400"], correctIndex: 1 },
          { q: "When comparing models for a task, the most reliable first step is…", options: ["Pick the newest model", "Run the same prompt on candidates and compare outputs", "Pick the one with the biggest context window", "Ask one model which model is best"], correctIndex: 1 },
          { q: "An image-generation prompt improves most when you specify…", options: ["Only the subject", "Subject, style, and constraints", "The model's temperature", "Nothing — shorter is always better"], correctIndex: 1 },
        ],
      },
      {
        id: "quiz_s3",
        sessionNo: 3,
        title: "Surprise quiz · Working with data",
        isDiagnostic: false,
        sectionIds: allSectionIds,
        questions: [
          { q: "A model's context window is…", options: ["Its training dataset", "The maximum text it can consider at once", "Its output speed", "The UI panel showing history"], correctIndex: 1 },
          { q: "When an AI tool 'runs code' against your CSV (code interpreter style), it is…", options: ["Reading every row as prose", "Writing and executing a program on the file and returning results", "Guessing from the filename", "Sending the file to a human analyst"], correctIndex: 1 },
          { q: "SQL is…", options: ["A spreadsheet brand", "A language for querying structured data in databases", "A neural network architecture", "A file compression format"], correctIndex: 1 },
          { q: "The average P/E of the S&P 500 and the median P/E differ because…", options: ["They never differ", "Outliers pull the average; the median resists them", "Medians ignore half the data", "Averages are always lower"], correctIndex: 1 },
          { q: "Why hand a schema card + 100 sample rows to an AI instead of a 29 MB file?", options: ["Big files are illegal to upload", "The full file exceeds practical token limits; the card + sample carry the structure", "Sample rows are more accurate than real rows", "Schema cards run faster on GPUs"], correctIndex: 1 },
          { q: "A first hygiene scan on a sales CSV should look for…", options: ["Only spelling mistakes", "Duplicates, impossible values, missing fields, inconsistent labels, non-sale rows", "The prettiest chart", "The largest transaction only"], correctIndex: 1 },
        ],
      },
    ];

    // --- Materials ---------------------------------------------------------
    type Mat = {
      id: string; sessionNo: number; title: string; kind: string;
      s3Key?: string; externalUrl?: string; sizeBytes?: number; instructorOnly?: boolean;
    };
    const link = (id: string, sessionNo: number, title: string, url: string): Mat =>
      ({ id, sessionNo, title, kind: "link", externalUrl: url });

    const materials: Mat[] = [
      // S1 external launchers + pre-reads
      link("mat_s1_heist", 1, "The Heist — simulation launcher", "https://heist.praxel.in/launch"),
      link("mat_s1_tracker", 1, "Praxel MU Sector Tracker (claim your sector here)", "https://docs.google.com/spreadsheets/d/praxel-mu-sector-tracker"),
      link("mat_s1_dpdp_wiki", 1, "Pre-read · DPDP Act, 2023 — plain-English overview (Wikipedia)", "https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Act,_2023"),
      link("mat_s1_dpdp_rules", 1, "Pre-read · India's DPDP Rules 2025 practical guide (Scrut.io)", "https://www.scrut.io/post/dpdp-rules"),
      link("mat_s1_dpdp_pib", 1, "Optional · Government notifies DPDP Rules, 2025 (PIB)", "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2"),
      // S2 pre-reads
      link("mat_s2_costar", 2, "Pre-read · CO-STAR Framework for Prompt Structuring", "https://medium.com/@thomasczerny/co-star-framework-for-prompt-structuring-7f9a8c221224"),
      link("mat_s2_tokens", 2, "Pre-read · What are Tokens in LLMs? A Beginner's Guide", "https://itsfoss.com/llm-token/"),
      link("mat_s2_lmsys", 2, "Pre-read · LMSYS Arena: Guide to the Chatbot Arena Leaderboard", "https://www.promptt.dev/blog/lmsys-arena-the-complete-guide-to-the-chatbot-arena-leaderboard-2025"),
      link("mat_s2_image", 2, "Pre-read · Write Prompts for Image Generation", "https://pulsegeek.com/articles/how-to-write-prompts-for-image-generation-subjects-styles-and-constraints/"),
      // S3 pre-reads
      link("mat_s3_tokens", 3, "Pre-read · Tokens guide (re-read with data in mind)", "https://itsfoss.com/llm-token/"),
      link("mat_s3_context", 3, "Pre-read · Context Windows Explained", "https://www.dataannotation.tech/blog/llm-context-window"),
      link("mat_s3_codeint", 3, "Pre-read · ChatGPT Code Interpreter: What It Is, How It Works", "https://365datascience.com/trending/chatgpt-code-interpreter-what-it-is-and-how-it-works/"),
      link("mat_s3_sql", 3, "Pre-read · What is SQL? (AWS)", "https://aws.amazon.com/what-is/sql/"),
      link("mat_s3_tokenizer", 3, "Optional hands-on · OpenAI tokenizer", "https://platform.openai.com/tokenizer"),
      link("mat_s3_lmarena", 3, "Optional hands-on · LMArena", "https://lmarena.ai"),
      // S3 datasets + schema pack + lab sheet (08_DATA_README)
      { id: "mat_s3_moxie", sessionNo: 3, title: "moxie_retail_oct2025.csv — Moxie October transactions", kind: "dataset", s3Key: "seed/session3/moxie_retail_oct2025.csv", sizeBytes: 2_400_000 },
      { id: "mat_s3_stocks12", sessionNo: 3, title: "stocks_lab_12.csv — 12 US stocks, 2013–2018 daily", kind: "dataset", s3Key: "seed/session3/stocks_lab_12.csv", sizeBytes: 750_000 },
      { id: "mat_s3_sp500", sessionNo: 3, title: "sp500_financials.csv — S&P 500 valuation snapshot", kind: "dataset", s3Key: "seed/session3/sp500_financials.csv", sizeBytes: 95_000 },
      { id: "mat_s3_schema_stocks", sessionNo: 3, title: "schema_stocks.txt — schema card, full stocks file (SEALED)", kind: "schema-pack", s3Key: "seed/session3/schema_stocks.txt", sizeBytes: 1_024 },
      { id: "mat_s3_stocks_sample", sessionNo: 3, title: "stocks_sample_100.csv — first 100 rows of the full file (SEALED)", kind: "schema-pack", s3Key: "seed/session3/stocks_sample_100.csv", sizeBytes: 5_120 },
      { id: "mat_s3_moxie_fy", sessionNo: 3, title: "moxie_retail_fy2025_26.csv.gz — Moxie full FY (wall demo)", kind: "dataset", s3Key: "seed/session3/moxie_retail_fy2025_26.csv.gz", sizeBytes: 4_200_000, instructorOnly: true },
      { id: "mat_s3_allstocks", sessionNo: 3, title: "all_stocks_5yr.csv.gz — all 505 S&P stocks, 5 years (wall demo)", kind: "dataset", s3Key: "seed/session3/all_stocks_5yr.csv.gz", sizeBytes: 10_000_000, instructorOnly: true },
      { id: "mat_s3_schema_moxie", sessionNo: 3, title: "schema_moxie_fy.txt — schema card, Moxie FY", kind: "schema-pack", s3Key: "seed/session3/schema_moxie_fy.txt", sizeBytes: 1_024, instructorOnly: true },
      { id: "mat_s3_moxie_sample", sessionNo: 3, title: "moxie_sample_100.csv — first 100 rows of Moxie FY", kind: "schema-pack", s3Key: "seed/session3/moxie_sample_100.csv", sizeBytes: 7_168, instructorOnly: true },
      { id: "mat_s3_labsheet", sessionNo: 3, title: "Session 3 lab sheet — Working with data, using AI", kind: "lab-sheet", s3Key: "seed/session3/session3_lab_sheet.pdf", sizeBytes: 180_000 },
      // S4–S8 pre-reads
      link("mat_s4_vibe", 4, "Pre-read · Vibe Coding Apps: Tools for Beginners (Lovable)", "https://lovable.dev/guides/vibe-coding-apps-8-options-for-beginners"),
      link("mat_s4_lovable", 4, "Pre-read · Lovable Tutorial: Ultimate Step-by-Step Guide", "https://www.nocode.mba/articles/ultimate-guide-lovable"),
      link("mat_s5_make5min", 5, "Pre-read · Learn Make.com Basics in 5 Minutes", "https://growwstacks.com/blog/learn-make-com-basics-in-5-minutes"),
      link("mat_s5_maketut", 5, "Pre-read · Make.com Automation Tutorial for Beginners", "https://community.make.com/t/make-com-automation-tutorial-for-beginners-step-by-step-guide/55299"),
      link("mat_s6_aivideo", 6, "Optional · State of AI Video Tools 2026", "https://kingy.ai/blog/state-of-ai-video-tools-2026/"),
      link("mat_s7_rag", 7, "Pre-read · What is RAG? (AWS)", "https://aws.amazon.com/what-is/retrieval-augmented-generation/"),
      link("mat_s7_finetune", 7, "Pre-read · Fine Tuning AI Models: A Practical Guide for Beginners", "https://medium.com/@garethcull/fine-tuning-ai-models-a-practical-guide-for-beginners-dc313b2e0f76"),
      link("mat_s8_mcp", 8, "Pre-read · What is Model Context Protocol (MCP)? (IBM)", "https://www.ibm.com/think/topics/model-context-protocol"),
      link("mat_s8_evals", 8, "Pre-read · What Is an AI Evaluation? (Amplitude)", "https://amplitude.com/explore/analytics/what-is-an-ai-evaluation"),
    ];
    const materialRows = materials.map((m) => ({
      id: m.id,
      sessionNo: m.sessionNo,
      title: m.title,
      kind: m.kind,
      s3Key: m.s3Key ?? null,
      externalUrl: m.externalUrl ?? null,
      sectionIds: allSectionIds,
      sizeBytes: m.sizeBytes ?? null,
      instructorOnly: m.instructorOnly ?? false,
    }));
    const materialIdsForSession = (n: number) =>
      materials.filter((m) => m.sessionNo === n).map((m) => m.id);

    // --- Session pages (02_course_context.md table) ------------------------
    const sessionPages = [
      { n: 1, title: "Kickoff: The Heist, teams & sectors", summaryMd: "The Heist simulation, team formation, and the sector claim. A surprise quiz lands during class. Launchers and Day 1 pre-reads below.", assignments: [] as string[], quizzes: ["quiz_dpdp"] },
      { n: 2, title: "AI basics: prompting, skills & models", summaryMd: "Research with AI, CO-STAR prompting, the SCENE image framework, skills, projects, connectors, tokens, and model comparison. Ship your **skill family**.", assignments: ["asg_s2_skill"], quizzes: ["quiz_s2"] },
      { n: 3, title: "Working with data using AI", summaryMd: "Two datasets, five labs. Files open at session start; two more arrive mid-class — don't go looking. Ship the **verified data memo** before you leave.", assignments: ["asg_s3_datamemo"], quizzes: ["quiz_s3"] },
      { n: 4, title: "Build an app with Lovable", summaryMd: "Build and ship a working app for your team's industry. Submit the live link plus the GitHub repo; the best land on the app wall.", assignments: ["asg_s4_app"], quizzes: [] },
      { n: 5, title: "Automation with Make.com", summaryMd: "One automation per member, mapped to a real process at your company. Submit the blueprint JSON and a screen recording.", assignments: ["asg_s5_workflow"], quizzes: [] },
      { n: 6, title: "Multimedia + mid-course map checkpoint", summaryMd: "Guest lecture on multimedia, then checkpoint presentations of the value chain maps (formative, unscored). Peer review checkpoint 1 follows; 10-day break after.", assignments: ["asg_s6_map", "asg_media"], quizzes: [] },
      { n: 7, title: "RAG, custom models & keeping up", summaryMd: "Retrieval-augmented generation, fine-tuning, and how to keep up once the course ends. Progress submissions due.", assignments: [], quizzes: [] },
      { n: 8, title: "MCPs, AI evals & operating AI-first", summaryMd: "Model Context Protocol, evaluating AI systems, and operating AI-first. The AI voice interview window opens after this session.", assignments: [], quizzes: [] },
      { n: 9, title: "Capstone presentations · first half", summaryMd: "Half the teams present. Final value chain map and remaining artifacts due for presenting teams.", assignments: ["asg_final_map"], quizzes: [] },
      { n: 10, title: "Capstone presentations · conclusion", summaryMd: "Presentations conclude. Final submissions for the second half, peer review checkpoint 2, and the cohort atlas.", assignments: [], quizzes: [] },
    ].map((s) => ({
      id: `spage_${s.n}`,
      sessionNo: s.n,
      title: s.title,
      summaryMd: s.summaryMd,
      orderedMaterialIds: materialIdsForSession(s.n),
      linkedAssignmentIds: s.assignments,
      linkedQuizIds: s.quizzes,
    }));

    // --- Gates (mid-course realistic state) --------------------------------
    type GateRow = {
      id: string; targetType: "session" | "material" | "assignment" | "quiz";
      targetId: string; sectionId: string; state: "locked" | "open" | "closed";
      openedAt?: Date | null; closedAt?: Date | null; changedBy?: string | null;
    };
    const gates: GateRow[] = [];
    const gateAll = (
      targetType: GateRow["targetType"],
      targetId: string,
      state: GateRow["state"],
      openedAt?: Date,
      closedAt?: Date,
    ) => {
      for (const code of SECTION_CODES) {
        gates.push({
          id: `gate_${targetType}_${targetId}_${code}`,
          targetType,
          targetId,
          sectionId: sectionIdOf(code),
          state,
          openedAt: openedAt ?? null,
          closedAt: closedAt ?? null,
          changedBy: state === "locked" ? null : "user_instructor",
        });
      }
    };
    // Sessions 1–3 open, 4–10 locked.
    for (const p of sessionPages) {
      if (p.sessionNo <= 3) gateAll("session", p.id, "open", [T.s1, T.s2, T.s3][p.sessionNo - 1]);
      else gateAll("session", p.id, "locked");
    }
    // S3 datasets open at session start; schema pack + sample still sealed.
    gateAll("material", "mat_s3_moxie", "open", T.s3);
    gateAll("material", "mat_s3_stocks12", "open", T.s3);
    gateAll("material", "mat_s3_sp500", "open", T.s3);
    gateAll("material", "mat_s3_labsheet", "open", T.s3);
    gateAll("material", "mat_s3_schema_stocks", "locked");
    gateAll("material", "mat_s3_stocks_sample", "locked");
    // Link materials (launchers + pre-reads) of the open sessions 1–3 are
    // open with their session — a missing gate row would mean locked.
    for (const m of materials) {
      if (m.kind === "link" && m.sessionNo <= 3) {
        gateAll("material", m.id, "open", [T.s1, T.s2, T.s3][m.sessionNo - 1]);
      }
    }
    // Assignment gates: S2/S3 open, S4+ locked.
    gateAll("assignment", "asg_s2_skill", "open", T.s2);
    gateAll("assignment", "asg_s3_datamemo", "open", T.s3);
    for (const a of ["asg_s4_app", "asg_s5_workflow", "asg_s6_map", "asg_media", "asg_final_map"]) {
      gateAll("assignment", a, "locked");
    }
    // Quiz gates: all three already ran -> closed.
    gateAll("quiz", "quiz_dpdp", "closed", T.s1, new Date(T.s1.getTime() + 20 * 60_000));
    gateAll("quiz", "quiz_s2", "closed", T.s2, new Date(T.s2.getTime() + 20 * 60_000));
    gateAll("quiz", "quiz_s3", "closed", T.s3, new Date(T.s3.getTime() + 20 * 60_000));

    // --- Quiz attempts -----------------------------------------------------
    const rngQuiz = mulberry32(20260701);
    const quizAttempts: Prisma.QuizAttemptCreateManyInput[] = [];
    for (let i = 0; i < TOTAL_STUDENTS; i++) {
      // Every student sat the diagnostic.
      const score = 20 + Math.floor(rngQuiz() * 16) * 5; // 20..95 step 5
      quizAttempts.push({
        id: `qa_dpdp_${pad3(i + 1)}`,
        quizId: "quiz_dpdp",
        userId: studentId(i),
        answers: { choices: Array.from({ length: 5 }, () => Math.floor(rngQuiz() * 4)) },
        scorePct: score,
        submittedAt: new Date(T.s1.getTime() + 95 * 60_000),
      });
    }
    for (const quizId of ["quiz_s2", "quiz_s3"] as const) {
      const at = quizId === "quiz_s2" ? T.s2 : T.s3;
      for (let i = 0; i < TOTAL_STUDENTS; i++) {
        if (rngQuiz() >= 0.7) continue; // ~70% attempted
        quizAttempts.push({
          id: `qa_${quizId.slice(5)}_${pad3(i + 1)}`,
          quizId,
          userId: studentId(i),
          answers: { choices: Array.from({ length: 6 }, () => Math.floor(rngQuiz() * 4)) },
          scorePct: 30 + Math.floor(rngQuiz() * 15) * 5, // 30..100 step 5
          submittedAt: new Date(at.getTime() + 95 * 60_000),
        });
      }
    }

    // --- Submissions (~40, all five statuses) ------------------------------
    const STATUS_CYCLE = ["graded", "finalised", "submitted", "grading", "draft"] as const;
    type SubRow = {
      id: string; assignmentId: string; userId: string; teamId: string | null;
      status: (typeof STATUS_CYCLE)[number]; submittedAt: Date | null;
      fields: Prisma.InputJsonValue; files: string[]; version: number;
      contentHash: string; createdAt: Date;
    };
    const submissions: SubRow[] = [];

    const fieldsFor = (slug: string, subId: string, i: number): { fields: Record<string, unknown>; files: string[] } => {
      switch (slug) {
        case "skill": {
          return {
            fields: {
              skillLink: `https://skills.praxel.in/${subId}`,
              writeup: `A prompt skill family for weekly competitor digests: one master prompt, three variants, tested on real ${SECTOR_BOARD.A[i % 8]} sources.`,
            },
            files: [],
          };
        }
        case "data-memo": {
          const file = i % 3 === 0 ? `submissions/${subId}/pivot_screenshot.png` : "";
          return {
            fields: {
              number1: "₹41,20,650 clean October revenue (Moxie, after removing CN invoices and zero-price rows)",
              move1: "Recompute one number — rebuilt with a Sheets pivot",
              number2: "34,897 rows in moxie_retail_oct2025.csv",
              move2: "Reconcile the base — row count via two different prompts",
              number3: "NVDA best 5-year performer in stocks_lab_12.csv",
              move3: "Ask for the working — made the AI show its normalisation",
              aiGotWrong: "It counted GIFT WRAP as the most popular product; by revenue the answer is rings. It never told me it had chosen units over revenue.",
              ...(file ? { evidenceFile: file } : {}),
            },
            files: file ? [file] : [],
          };
        }
        case "app": {
          return {
            fields: {
              appUrl: `https://forge-${subId}.lovable.app`,
              githubUrl: `https://github.com/praxel-mu/${subId}`,
              writeup: "A price-comparison dashboard for our anchor company's category, with a lead-capture form wired to a sheet.",
            },
            files: [],
          };
        }
        case "workflow": {
          const files = [`submissions/${subId}/blueprint.json`, `submissions/${subId}/recording.mp4`];
          return {
            fields: {
              blueprintFile: files[0],
              recordingFile: files[1],
              usefulness: "Replaces the ops team's Monday copy-paste of order exceptions into WhatsApp: saves ~40 minutes a week and removes two manual error points.",
            },
            files,
          };
        }
        case "value-chain-map": {
          const files = [`submissions/${subId}/map_v1.pdf`];
          return {
            fields: {
              mapFiles: files,
              summary: "End-to-end map of the sector: players, stages, unit economics, policy and hiring layers. Strongest insight: margin concentrates at the distribution layer.",
            },
            files,
          };
        }
        case "media": {
          const files = [`submissions/${subId}/poster.png`, `submissions/${subId}/jingle.mp3`];
          return { fields: { mediaFiles: files, caption: "Launch poster + 20-second jingle for our sector campaign." }, files };
        }
        default:
          throw new Error(`fieldsFor: unknown slug ${slug}`);
      }
    };

    const pushSub = (
      idx: number,
      assignmentId: string,
      slug: string,
      userIdx: number,
      status: SubRow["status"],
      teamId: string | null,
      version = 1,
    ) => {
      const id = `sub_${pad3(idx)}${version > 1 ? `_v${version}` : ""}`;
      const { fields, files } = fieldsFor(slug, id, idx);
      const submitted = status !== "draft";
      submissions.push({
        id,
        assignmentId,
        userId: studentId(userIdx),
        teamId,
        status,
        submittedAt: submitted ? new Date(T.s3.getTime() + (idx % 72) * 3_600_000) : null,
        fields: fields as Prisma.InputJsonValue,
        files,
        version,
        contentHash: `seedhash_${id}`,
        createdAt: T.s3,
      });
      return id;
    };

    let subIdx = 1;
    const gradedSubIds: string[] = [];
    const galleryCandidates: string[] = [];

    // 14 skill submissions (students 0, 30, 60, … across all sections)
    for (let k = 0; k < 14; k++) {
      const status = STATUS_CYCLE[k % STATUS_CYCLE.length];
      const id = pushSub(subIdx++, "asg_s2_skill", "skill", k * 30, status, null);
      if (status === "graded" || status === "finalised") gradedSubIds.push(id);
    }
    // 12 data memos (students 5, 45, 85, …)
    for (let k = 0; k < 12; k++) {
      const status = STATUS_CYCLE[(k + 1) % STATUS_CYCLE.length];
      const id = pushSub(subIdx++, "asg_s3_datamemo", "data-memo", 5 + k * 40, status, null);
      if (status === "graded" || status === "finalised") gradedSubIds.push(id);
    }
    // 6 apps (graded-heavy so the gallery wall has content)
    const appStatuses: SubRow["status"][] = ["graded", "graded", "finalised", "graded", "submitted", "grading"];
    for (let k = 0; k < 6; k++) {
      const id = pushSub(subIdx++, "asg_s4_app", "app", 10 + k * 60, appStatuses[k], null);
      if (appStatuses[k] === "graded" || appStatuses[k] === "finalised") {
        gradedSubIds.push(id);
        galleryCandidates.push(id);
      }
    }
    // 4 team workflows
    const workflowTeams = ["team_A2", "team_B3", "team_C4", "team_D5"];
    const workflowStatuses: SubRow["status"][] = ["graded", "graded", "finalised", "submitted"];
    for (let k = 0; k < 4; k++) {
      const teamId = workflowTeams[k];
      const member = teamMembers.get(teamId)![0];
      const memberIdx = Number(member.slice(6)) - 1;
      const id = pushSub(subIdx++, "asg_s5_workflow", "workflow", memberIdx, workflowStatuses[k], teamId);
      if (workflowStatuses[k] === "graded" || workflowStatuses[k] === "finalised") {
        gradedSubIds.push(id);
        galleryCandidates.push(id);
      }
    }
    // 4 team map checkpoints
    const mapTeams = ["team_E1", "team_F2", "team_G3", "team_H4"];
    const mapStatuses: SubRow["status"][] = ["graded", "graded", "submitted", "draft"];
    for (let k = 0; k < 4; k++) {
      const teamId = mapTeams[k];
      const member = teamMembers.get(teamId)![0];
      const memberIdx = Number(member.slice(6)) - 1;
      const id = pushSub(subIdx++, "asg_s6_map", "value-chain-map", memberIdx, mapStatuses[k], teamId);
      if (mapStatuses[k] === "graded") {
        gradedSubIds.push(id);
        galleryCandidates.push(id);
      }
    }
    // Two resubmissions: students 0 and 150 already have graded version-1 skill
    // submissions above (sub_001 and sub_006, the history rows); add version 2.
    for (const userIdx of [0, 150]) {
      const id2 = pushSub(subIdx++, "asg_s2_skill", "skill", userIdx, "graded", null, 2);
      gradedSubIds.push(id2);
    }

    // --- Grades ------------------------------------------------------------
    const rngGrade = mulberry32(20260715);
    const grades: Prisma.GradeCreateManyInput[] = gradedSubIds.map((subId, k) => {
      const dims = ["functionality", "craft", "relevance", "verification-evidence"];
      const rationales: Record<string, string> = {
        functionality: "Runs end to end on a fresh load; core path verified.",
        craft: "Clean structure; a few rough edges in copy and layout.",
        relevance: "Clearly built for the team's claimed sector, not generic practice.",
        "verification-evidence": "Includes a note on what was checked and how; one claim unverified.",
      };
      const rubricScores: Record<string, { score: number; rationale: string }> = {};
      let total = 0;
      for (const d of dims) {
        const score = 5 + Math.floor(rngGrade() * 6); // 5..10
        rubricScores[d] = { score, rationale: rationales[d] };
        total += score;
      }
      // Confidence mostly high; indices 2 and 7 dip below the 0.7 review line.
      let confidence = Math.round((0.72 + rngGrade() * 0.26) * 100) / 100;
      if (k === 2) confidence = 0.62;
      if (k === 7) confidence = 0.55;
      const flags = k === 3 ? ["link-dead"] : k === 9 ? ["possible-plagiarism"] : [];
      return {
        id: `grade_${subId}`,
        submissionId: subId,
        rubricScores: rubricScores as Prisma.InputJsonValue,
        total,
        confidence,
        feedbackMd: `**Strong points:** the artifact works and maps to the sector.\n\n**To improve:** tighten the verification note — name the exact number you re-derived and show the working.\n\n_Total: ${total}/40._`,
        flags,
        gradedBy: "ai",
        provisional: true,
        promptLog: { seeded: true } as Prisma.InputJsonValue,
        createdAt: new Date(T.s3.getTime() + 24 * 3_600_000),
      };
    });

    // --- Interviews --------------------------------------------------------
    const interviews: Prisma.InterviewCreateManyInput[] = [
      {
        id: "iv_001",
        userId: studentId(3),
        status: "graded",
        transport: "livekit",
        rubricScores: { industry_command: 22, defence_of_submissions: 19, operators_loop: 21, transfer: 17, total: 79 } as Prisma.InputJsonValue,
        confidence: 0.87,
        attemptNumber: 1,
        costUsd: 0.83,
        createdAt: T.now,
        completedAt: T.now,
      },
      {
        id: "iv_002",
        userId: studentId(100),
        status: "escalated",
        transport: "livekit",
        rubricScores: { industry_command: 14, defence_of_submissions: 9, operators_loop: 12, transfer: 11, total: 46 } as Prisma.InputJsonValue,
        confidence: 0.58,
        escalationReason: "Low grading confidence (0.58); the automation described does not match the submitted blueprint. Transcript needs instructor review.",
        attemptNumber: 1,
        costUsd: 0.91,
        createdAt: T.now,
        completedAt: T.now,
      },
    ];
    const seededInterviewRecordings = ["iv_001", "iv_002"].map((interviewId) => ({
      reservationId: `seed_recording_${interviewId}`,
      interviewId,
      s3Key: `interviews/${interviewId}/audio.ogg`,
      s3VersionId: `seed-version-${interviewId}`,
    }));

    const iv1QA: [string, string][] = [
      ["Explain the economics of digital lending in under a minute.", "Lenders make the spread between cost of capital and the rate charged, minus defaults and acquisition cost. In India the co-lending model splits the book 80/20 with banks, so the fintech earns fees more than interest."],
      ["Who are the three biggest players in your sector, and what actually differentiates them?", "Bajaj Finance on distribution and cross-sell, KreditBee on speed to underwrite thin-file customers, and Navi on cost structure — they run almost fully digital origination."],
      ["Walk me through the automation you built. What would break it?", "It watches a shared inbox for loan-document emails, extracts the PAN and amount with an AI step, and writes to a sheet the ops lead reviews. It breaks if the email has the document as a link instead of an attachment."],
      ["Why did you pick that repetitive task, out of everything the company does?", "The ops lead spent about an hour daily re-typing fields from emails. It was the highest-frequency task with the clearest input format."],
      ["What's one number in your data memo you personally checked, and how?", "Clean October revenue for Moxie — I rebuilt it in a pivot excluding CN invoices and zero-price rows and matched the AI's figure within rounding."],
    ];
    const iv2QA: [string, string][] = [
      ["Explain the economics of diagnostics and lab chains in under a minute.", "Labs make money from tests. The bigger ones make more because they have more branches."],
      ["Who are the biggest players and what differentiates them?", "Dr Lal PathLabs and Metropolis. They are… bigger and more trusted, I think."],
      ["Walk me through the automation you built. What would break it?", "It sends WhatsApp messages automatically when a report is ready. I'm not sure what breaks it — it mostly works."],
      ["Your submitted blueprint shows a Google Sheets trigger, not WhatsApp. Which is it?", "Oh — the sheet one was an earlier version. My teammate changed it, I mainly did the testing part."],
      ["What's one number in your data memo you personally verified, and how?", "The row count. The AI said it and it looked right so I kept it."],
    ];
    const interviewTurns: Prisma.InterviewTurnCreateManyInput[] = [];
    ([["iv_001", iv1QA], ["iv_002", iv2QA]] as const).forEach(([ivId, qa]) => {
      let turnNo = 1;
      qa.forEach(([q, a], i) => {
        interviewTurns.push({
          id: `${ivId}_t${turnNo}`,
          interviewId: ivId,
          turnNo: turnNo++,
          speaker: "agent",
          text: q,
          startedAt: new Date(T.now.getTime() + i * 2 * 60_000),
        });
        interviewTurns.push({
          id: `${ivId}_t${turnNo}`,
          interviewId: ivId,
          turnNo: turnNo++,
          speaker: "student",
          text: a,
          startedAt: new Date(T.now.getTime() + i * 2 * 60_000 + 40_000),
        });
      });
    });

    const interviewWindows = SECTION_CODES.map((code) => ({
      id: `ivw_${code}`,
      sectionId: sectionIdOf(code),
      opensAt: T.ivOpens,
      closesAt: T.ivCloses,
      label: "AI voice interview · after Session 8",
    }));

    const costLogs: Prisma.CostLogCreateManyInput[] = ["iv_001", "iv_002"].flatMap((ivId, i) => [
      { id: `cost_${ivId}_stt`, feature: "interview", provider: "deepgram", model: "nova-3", tokensIn: null, tokensOut: null, costUsd: 0.11 + i * 0.02, refType: "interview", refId: ivId, createdAt: T.now },
      { id: `cost_${ivId}_dialog`, feature: "interview", provider: "gemini", model: "gemini-2.5-flash", tokensIn: 18_400 + i * 1_000, tokensOut: 2_300 + i * 150, costUsd: 0.34 + i * 0.03, refType: "interview", refId: ivId, createdAt: T.now },
      { id: `cost_${ivId}_tts`, feature: "interview", provider: "elevenlabs", model: "eleven-turbo-v2", tokensIn: null, tokensOut: null, costUsd: 0.38 + i * 0.03, refType: "interview", refId: ivId, createdAt: T.now },
    ]);

    // --- Peer review checkpoint 1 (~half the teams) ------------------------
    const rngPeer = mulberry32(20260710);
    const peerReviews: Prisma.PeerReviewCreateManyInput[] = [];
    teams.forEach((team, teamIdx) => {
      if (teamIdx % 2 !== 0) return; // every other team => 32 of 64
      const members = teamMembers.get(team.id)!;
      const nearIdentical = team.id === "team_A1"; // safeguard-flag fixture
      for (const reviewer of members) {
        const others = members.filter((m) => m !== reviewer);
        const points = allocatePoints(nearIdentical ? () => 0.5 : rngPeer, others.length);
        others.forEach((reviewee, j) => {
          const rating = () => (nearIdentical ? 4 : 2 + Math.floor(rngPeer() * 4)); // 2..5
          peerReviews.push({
            id: `pr1_${reviewer}_${reviewee}`,
            checkpoint: 1,
            reviewerId: reviewer,
            revieweeId: reviewee,
            pointsAllocated: points[j],
            ratings: {
              reliability: rating(),
              communication: rating(),
              helpfulness: rating(),
            } as Prisma.InputJsonValue,
          });
        });
      }
    });

    // --- Gallery, sign-offs, portfolios, config, notifications -------------
    const galleryItems: Prisma.GalleryItemCreateManyInput[] = galleryCandidates.map((subId, i) => ({
      id: `gal_${subId}`,
      submissionId: subId,
      featured: i === 0 || i === 4, // one app + one workflow featured
      caption: i < 4 ? "From the app wall — built with Lovable in Session 4." : "Cohort showcase — team artifact.",
      screenshotS3Key: `gallery/${subId}.png`,
      screenshotS3VersionId: `seed-version-gallery-${subId}`,
    }));
    const seededGalleryReservations = galleryItems.map((item) => ({
      reservationId: `seed_screenshot_${item.submissionId}`,
      submissionId: item.submissionId,
      targetId: item.id!,
      s3Key: item.screenshotS3Key!,
      s3VersionId: item.screenshotS3VersionId!,
    }));

    const signOffs: Prisma.SignOffCreateManyInput[] = [
      { id: "so_team_A2", teamId: "team_A2", assignmentId: "asg_s5_workflow", recordedBy: "user_instructor", status: "signed_off", evidenceS3Key: "signoffs/team_A2/confirmation.mp4", note: "Ops manager recorded a 40-second confirmation; automation in weekly use." },
      { id: "so_team_B3", teamId: "team_B3", assignmentId: "asg_s5_workflow", recordedBy: "user_instructor", status: "signed_off", evidenceS3Key: "signoffs/team_B3/email.pdf", note: "Written thumbs-up from the company contact, uploaded as PDF." },
      { id: "so_team_C4", teamId: "team_C4", assignmentId: "asg_s5_workflow", recordedBy: "user_instructor", status: "contacted", evidenceS3Key: null, note: "Process mapped with the contact; sign-off call scheduled." },
      { id: "so_team_D5", teamId: "team_D5", assignmentId: "asg_s5_workflow", recordedBy: "user_instructor", status: "contacted", evidenceS3Key: null, note: "First call done; awaiting demo slot." },
    ];

    const subsByUser = new Map<string, string[]>();
    for (const s of submissions) {
      const list = subsByUser.get(s.userId) ?? [];
      list.push(s.id);
      subsByUser.set(s.userId, list);
    }
    const portfolioEntries: Prisma.PortfolioEntryCreateManyInput[] = Array.from({ length: 20 }, (_, k) => {
      const idx = k * 24; // students 1, 25, 49, … spread across sections
      const uid = studentId(idx);
      return {
        id: `pf_${uid}`,
        userId: uid,
        narrative: `Working in ${SECTOR_BOARD[SECTION_CODES[Math.floor(idx / STUDENTS_PER_SECTION)]][0]}-adjacent territory this term: shipped a skill family, a verified data memo, and team artifacts en route to the capstone map.`,
        links: {
          submissions: subsByUser.get(uid) ?? [],
          external: [{ label: "GitHub", url: `https://github.com/praxel-mu/${uid}` }],
        } as Prisma.InputJsonValue,
        validations: [] as unknown as Prisma.InputJsonValue,
        lastCrawl: undefined,
      };
    });

    const configKVs: Prisma.ConfigKVCreateManyInput[] = [
      {
        key: "interview_script",
        value: {
          durationMinutes: 12,
          categories: [
            { key: "industry_command", title: "Industry command", points: 25, sampleQuestions: ["Explain the economics of your industry in under a minute.", "Who are the three biggest players, and what actually differentiates them?"] },
            { key: "defence_of_submissions", title: "Defence of own submissions", points: 25, sampleQuestions: ["Walk me through the automation you built. What would break it?", "Why did you pick this particular repetitive task to automate?"] },
            { key: "operators_loop", title: "Operator's Loop reasoning", points: 25, sampleQuestions: ["Why did you use this tool over an obvious alternative?", "What's one number in your data memo you personally checked, and how?"] },
            { key: "transfer", title: "Transfer", points: 25, sampleQuestions: ["Apply your industry knowledge to this scenario you haven't seen before."] },
          ],
          tone: {
            rules: [
              "Professional and warm; never condescending.",
              "Ask one question at a time; follow up once when an answer is vague.",
              "Never reveal rubric bands or scores during the interview.",
              "Escalate to a human when answers contradict the student's submitted artifacts.",
            ],
          },
        } as Prisma.InputJsonValue,
      },
      {
        key: "portfolio_rubric",
        value: {
          totalPoints: 100,
          parts: [
            { key: "completeness", label: "Completeness", points: 20 },
            { key: "clarity_narrative", label: "Clarity and narrative", points: 25 },
            { key: "external_validation", label: "External validation", points: 25 },
            { key: "peer_validation", label: "Peer validation", points: 15 },
            { key: "evidence_integrity", label: "Evidence integrity", points: 15 },
          ],
        } as Prisma.InputJsonValue,
      },
      {
        // U15 — which peer-review checkpoint is currently submittable (1, 2 or
        // null). cp2 active in the demo world while cp1 data already exists.
        key: "peer_checkpoint",
        value: { active: 2 } as Prisma.InputJsonValue,
      },
      {
        key: "grading_defaults",
        value: {
          provisional: true,
          confidenceReviewThreshold: 0.7,
          rubric: RUBRIC_4DIM,
          flagsRequiringReview: ["link-dead", "possible-plagiarism"],
        } as Prisma.InputJsonValue,
      },
    ];

    const notifications: Prisma.NotificationCreateManyInput[] = gradedSubIds.slice(0, 5).map((subId, i) => {
      const sub = submissions.find((s) => s.id === subId)!;
      return {
        id: `ntf_${pad3(i + 1)}`,
        userId: sub.userId,
        kind: "grade-ready",
        title: "Your grade is ready",
        body: `Feedback and a provisional grade are ready for one of your submissions. Open it from your dashboard.`,
        createdAt: new Date(T.s3.getTime() + 26 * 3_600_000),
      };
    });

    // --- Write everything in one transaction (wipe, then create) ----------
    await prisma.$transaction(
      async (tx) => {
        // Reset every application table in one reviewed statement. Listing all
        // related tables lets PostgreSQL handle cycles without CASCADE, and
        // TRUNCATE deliberately bypasses immutable-row triggers only for this
        // guarded demo/test reset path.
        const quotedTables = DEMO_SEED_TABLES.map(
          (table) => `"${table.replaceAll('"', '""')}"`,
        ).join(", ");
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY`);

        await tx.section.createMany({ data: sections });
        await tx.team.createMany({ data: teams });
        await tx.user.createMany({ data: [...students, ...staff] });
        await tx.assignmentType.createMany({
          data: ASSIGNMENT_TYPES.map((t) => ({
            id: t.id,
            slug: t.slug,
            title: t.title,
            description: t.description,
            submissionSchema: t.submissionSchema as Prisma.InputJsonValue,
            rubric: RUBRIC_4DIM as Prisma.InputJsonValue,
            galleryEligible: t.galleryEligible,
            teamBased: t.teamBased,
          })),
        });
        await tx.assignment.createMany({ data: assignments });
        await tx.quiz.createMany({
          data: quizzes.map((q) => ({
            id: q.id,
            sessionNo: q.sessionNo,
            title: q.title,
            questions: q.questions as Prisma.InputJsonValue,
            sectionIds: q.sectionIds,
            isDiagnostic: q.isDiagnostic,
          })),
        });
        await tx.material.createMany({ data: materialRows });
        await tx.sessionPage.createMany({ data: sessionPages });
        await tx.gate.createMany({ data: gates });
        await tx.quizAttempt.createMany({ data: quizAttempts });
        await tx.submission.createMany({ data: submissions });
        await tx.grade.createMany({ data: grades });
        await tx.interview.createMany({ data: interviews });
        for (const recording of seededInterviewRecordings) {
          await tx.generatedObjectReservation.create({
            data: {
              id: recording.reservationId,
              purpose: "interview_recording",
              interviewId: recording.interviewId,
              targetId: recording.interviewId,
              s3Key: recording.s3Key,
              expiresAt: new Date(T.now.getTime() + 30 * 60_000),
            },
          });
          await tx.generatedObjectReservation.update({
            where: { id: recording.reservationId },
            data: { s3VersionId: recording.s3VersionId },
          });
          await tx.generatedObjectReservation.update({
            where: { id: recording.reservationId },
            data: { consumedAt: T.now },
          });
          await tx.interview.update({
            where: { id: recording.interviewId },
            data: {
              audioS3Key: recording.s3Key,
              audioS3VersionId: recording.s3VersionId,
            },
          });
        }
        await tx.interviewTurn.createMany({ data: interviewTurns });
        await tx.interviewWindow.createMany({ data: interviewWindows });
        await tx.costLog.createMany({ data: costLogs });
        await tx.peerReview.createMany({ data: peerReviews });
        for (const screenshot of seededGalleryReservations) {
          await tx.generatedObjectReservation.create({
            data: {
              id: screenshot.reservationId,
              purpose: "gallery_screenshot",
              submissionId: screenshot.submissionId,
              targetId: screenshot.targetId,
              s3Key: screenshot.s3Key,
              expiresAt: new Date(T.now.getTime() + 30 * 60_000),
            },
          });
          await tx.generatedObjectReservation.update({
            where: { id: screenshot.reservationId },
            data: { s3VersionId: screenshot.s3VersionId },
          });
          await tx.generatedObjectReservation.update({
            where: { id: screenshot.reservationId },
            data: { consumedAt: T.now },
          });
        }
        await tx.galleryItem.createMany({ data: galleryItems });
        await tx.signOff.createMany({ data: signOffs });
        await tx.portfolioEntry.createMany({ data: portfolioEntries });
        await tx.configKV.createMany({ data: configKVs });
        await tx.notification.createMany({ data: notifications });
      },
      { maxWait: 15_000, timeout: 120_000 },
    );

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `Seeded demo world in ${secs}s: ${sections.length} sections, ${teams.length} teams, ` +
        `${students.length + staff.length} users, ${assignments.length} assignments, ` +
        `${quizzes.length} quizzes, ${quizAttempts.length} quiz attempts, ` +
        `${submissions.length} submissions, ${grades.length} grades, ` +
        `${peerReviews.length} peer reviews, ${gates.length} gates. ` +
        `Roster fixture: fixtures/roster.csv`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly via `pnpm seed` (tsx prisma/seed.ts); tests import main() instead.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
