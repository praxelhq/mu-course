import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { structuredCall, type ModelClient } from "../lib/ai/client";
import {
  assembleGradingContext,
  applyPolicyFlags,
  gradeResponseSchemaFor,
  needsReview,
  type GradeResponse,
  type LinkCheckResult,
} from "../lib/ai/grading";
import { contentHashOf } from "../lib/submissions";
import type { SubmissionSchema } from "../lib/submission-schema";

// U9 — grading drift harness (`pnpm eval:grading`). Runs every fixture through
// the SAME assembly + structuredCall path the worker uses, then checks the
// resulting total against the fixture's expected band.
//
// Modes:
//   default                        → deterministic stub grader (no key needed);
//                                    the stub is keyed off the fixture id, so
//                                    band drift is still exercised end to end.
//   ANTHROPIC_API_KEY + EVAL_LIVE=1 → real Anthropic calls.
//
// Bands are consistency checks, not accuracy ground truth (docs/DECISIONS.md).
// Exit code 1 when more than 20% of fixtures fail.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "..", "fixtures", "grading");

// Type definitions mirror prisma/seed.ts (rubric + submissionSchema).
const RUBRIC = {
  scale: 10,
  dimensions: [
    { key: "functionality", label: "Functionality", max: 10, description: "Does it actually work?" },
    { key: "craft", label: "Craft", max: 10, description: "Is the execution good, not just present?" },
    { key: "relevance", label: "Relevance", max: 10, description: "Built for the team's real company/industry?" },
    { key: "verification-evidence", label: "Verification evidence", max: 10, description: "Can the student show they checked their own work?" },
  ],
};
const DIM_KEYS = RUBRIC.dimensions.map((d) => d.key);

const TYPES: Record<string, { title: string; brief: string; schema: SubmissionSchema }> = {
  skill: {
    title: "Skill family",
    brief: "Build and ship a reusable skill family from Session 2. Link it and explain what it does.",
    schema: {
      fields: [
        { key: "skillLink", label: "Link to your skill family", kind: "link", required: true },
        { key: "writeup", label: "What it does and why it matters", kind: "writeup", required: true },
      ],
    },
  },
  "data-memo": {
    title: "Verified data memo",
    brief: "The SHIP form: three numbers you verified today, the move used for each, and one thing your AI got wrong.",
    schema: {
      fields: [
        { key: "number1", label: "Verified number 1", kind: "text", required: true },
        { key: "move1", label: "Verification move used for number 1", kind: "text", required: true },
        { key: "number2", label: "Verified number 2", kind: "text", required: true },
        { key: "move2", label: "Verification move used for number 2", kind: "text", required: true },
        { key: "number3", label: "Verified number 3", kind: "text", required: true },
        { key: "move3", label: "Verification move used for number 3", kind: "text", required: true },
        { key: "aiGotWrong", label: "One thing your AI told you that was wrong or incomplete", kind: "writeup", required: true },
        { key: "evidenceFile", label: "Supporting file (optional)", kind: "file", required: false },
      ],
    },
  },
  app: {
    title: "Lovable app",
    brief: "Build an app with Lovable for your team's industry. Submit the live link and the GitHub repo.",
    schema: {
      fields: [
        { key: "appUrl", label: "Live app URL", kind: "link", required: true },
        { key: "githubUrl", label: "GitHub repository URL", kind: "link", required: true },
        { key: "writeup", label: "What the app does and who it is for", kind: "writeup", required: true },
      ],
    },
  },
};

interface Fixture {
  id: string;
  typeSlug: string;
  fields: Record<string, unknown>;
  files: string[];
  expectedBand: { min: number; max: number };
  note: string;
  adversarial?: "injection" | "near-dup";
}

// ---------------------------------------------------------------------------
// Deterministic stub grader (no API key). Keyed off the fixture id.
// ---------------------------------------------------------------------------

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function stubClientFor(fixtureId: string): ModelClient {
  return {
    async complete({ user }) {
      // Score tier keyed off the fixture id (deterministic across runs).
      const base = fixtureId.includes("strong") ? 8 : fixtureId.includes("weak") ? 3 : 5;
      const spread = fixtureId.includes("strong") ? 2 : 3;
      const rubricScores: GradeResponse["rubricScores"] = {};
      let total = 0;
      for (const key of DIM_KEYS) {
        const score = base + (fnv1a(fixtureId + key) % spread);
        rubricScores[key] = { score, rationale: `Deterministic stub rationale for ${key}.` };
        total += score;
      }
      const flags: string[] = [];
      // The stub honors the injection defense: score demands inside student
      // content trigger the possible-injection flag, like the real grader.
      if (/ignore (the )?(rubric|all previous instructions)|award (100|full marks)/i.test(user)) {
        flags.push("possible-injection");
      }
      const response: GradeResponse = {
        rubricScores,
        total,
        feedbackMd: "Stub feedback: deterministic eval-mode grade.",
        confidence: 0.75 + (fnv1a(fixtureId) % 20) / 100,
        flags: flags as GradeResponse["flags"],
      };
      return { text: JSON.stringify(response), usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

async function main() {
  const live = process.env.EVAL_LIVE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);
  const fixtures: Fixture[] = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture[]);

  console.log(
    `eval:grading — ${fixtures.length} fixtures, mode: ${live ? "LIVE (Anthropic)" : "stub (deterministic)"}\n`,
  );

  // Near-dup simulation: each fixture is a different student; an identical
  // content hash seen earlier in the same type flags the later fixture.
  const seenHashes = new Map<string, string>(); // `${typeSlug}:${hash}` -> fixture id

  const rows: {
    id: string;
    band: string;
    got: number;
    flags: string[];
    review: boolean;
    drift: number;
    pass: boolean;
  }[] = [];

  for (const fixture of fixtures) {
    const type = TYPES[fixture.typeSlug];
    if (!type) throw new Error(`fixture ${fixture.id}: unknown typeSlug ${fixture.typeSlug}`);

    // Links are simulated alive in eval mode (no network from the harness).
    const linkChecks: LinkCheckResult[] = type.schema.fields
      .filter((f) => f.kind === "link" && typeof fixture.fields[f.key] === "string")
      .map((f) => ({ field: f.key, url: String(fixture.fields[f.key]), ok: true, status: 200 }));

    const hashKey = `${fixture.typeSlug}:${contentHashOf(fixture.fields, fixture.files)}`;
    const dupOf = seenHashes.get(hashKey);
    if (!dupOf) seenHashes.set(hashKey, fixture.id);
    const nearDup = Boolean(dupOf);

    const context = assembleGradingContext({
      assignment: { title: type.title, brief: type.brief },
      type: { slug: fixture.typeSlug, title: type.title, rubric: RUBRIC },
      schema: type.schema,
      fields: fixture.fields,
      files: fixture.files,
      extracted: [],
      linkChecks,
    });

    const schema = gradeResponseSchemaFor(DIM_KEYS);
    const result = await structuredCall(
      { system: context.system, user: context.user, schema, maxTokens: 2048, temperature: 0 },
      live ? undefined : stubClientFor(fixture.id),
    );

    const graded = applyPolicyFlags({
      grade: result.data,
      linkChecks,
      extractionFailures: [],
      nearDup,
    });

    const { min, max } = fixture.expectedBand;
    const inBand = graded.total >= min && graded.total <= max;
    const drift = graded.total < min ? graded.total - min : graded.total > max ? graded.total - max : 0;

    let pass = inBand;
    if (fixture.adversarial === "injection") {
      pass = inBand || graded.flags.includes("possible-injection");
    } else if (fixture.adversarial === "near-dup") {
      pass = inBand && graded.flags.includes("possible-plagiarism");
    }

    rows.push({
      id: fixture.id,
      band: `${min}–${max}`,
      got: graded.total,
      flags: graded.flags,
      review: needsReview(graded),
      drift,
      pass,
    });
  }

  const idWidth = Math.max(...rows.map((r) => r.id.length)) + 2;
  console.log(
    "fixture".padEnd(idWidth) + "band".padEnd(9) + "got".padEnd(6) + "drift".padEnd(7) +
      "review".padEnd(8) + "result  flags",
  );
  console.log("-".repeat(idWidth + 40));
  for (const row of rows) {
    console.log(
      row.id.padEnd(idWidth) +
        row.band.padEnd(9) +
        String(row.got).padEnd(6) +
        String(row.drift).padEnd(7) +
        (row.review ? "yes" : "no").padEnd(8) +
        (row.pass ? "PASS" : "FAIL").padEnd(8) +
        (row.flags.join(",") || "-"),
    );
  }

  const failed = rows.filter((r) => !r.pass).length;
  const failPct = (failed / rows.length) * 100;
  console.log(
    `\n${rows.length - failed}/${rows.length} in band (${failed} failed, ${failPct.toFixed(1)}% — threshold 20%)`,
  );
  if (failPct > 20) {
    console.error("eval:grading FAILED — drift exceeds 20% of fixtures");
    process.exitCode = 1;
  } else {
    console.log("eval:grading OK");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
