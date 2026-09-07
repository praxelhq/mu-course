import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../canonical-json";
import type { DimensionScore } from "./types";

export const SESSION_5_WORKFLOW_PACKS = [
  { value: "S5-WP-GTM-01", label: "GTM lead routing" },
  { value: "S5-WP-OPS-02", label: "Operations exception handling" },
  { value: "S5-WP-REV-03", label: "Revenue reconciliation" },
] as const;

export type Session5WorkflowPackId = (typeof SESSION_5_WORKFLOW_PACKS)[number]["value"];

const SHA256 = /^[0-9a-f]{64}$/;
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_.-]{0,199}$/;
const PACK_IDS = new Set<string>(SESSION_5_WORKFLOW_PACKS.map((pack) => pack.value));
const CASE_CATEGORIES = ["normal", "duplicate", "malformed", "timeout", "approval"] as const;

const exactCheckSchema = z.discriminatedUnion("operator", [
  z.object({ id: z.string().min(1).max(100), path: z.string().regex(FIELD_PATH), operator: z.literal("eq"), expected: z.unknown() }).strict(),
  z.object({ id: z.string().min(1).max(100), path: z.string().regex(FIELD_PATH), operator: z.literal("present") }).strict(),
  z.object({ id: z.string().min(1).max(100), path: z.string().regex(FIELD_PATH), operator: z.literal("gte"), expected: z.number().finite() }).strict(),
  z.object({ id: z.string().min(1).max(100), path: z.string().regex(FIELD_PATH), operator: z.literal("contains"), expected: z.unknown() }).strict(),
]);

const evaluatorBundleSchema = z
  .object({
    contractVersion: z.literal("s5-workflow-fixture-bundle-v1"),
    bundleId: z.literal("S5-WORKFLOW-EVALUATOR-v1"),
    authority: z
      .object({
        usefulnessMax: z.literal(30),
        executionMax: z.literal(20),
        ownershipMax: z.literal(10),
        usefulnessRubricKeys: z.tuple([z.literal("relevance")]),
        ownershipRubricKey: z.literal("verification-evidence"),
      })
      .strict(),
    packs: z
      .array(
        z
          .object({
            packId: z.enum(["S5-WP-GTM-01", "S5-WP-OPS-02", "S5-WP-REV-03"]),
            suiteId: z.string().min(1).max(100),
            ruleVersion: z.string().min(1).max(100),
            expectedResultsSha256: z.string().regex(SHA256),
            cases: z
              .array(
                z
                  .object({
                    category: z.enum(CASE_CATEGORIES),
                    fixtureId: z.string().min(1).max(100),
                    checks: z.array(exactCheckSchema).min(1).max(40),
                  })
                  .strict(),
              )
              .length(5),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .superRefine((bundle, context) => {
    const packIds = bundle.packs.map((pack) => pack.packId);
    if (new Set(packIds).size !== packIds.length) {
      context.addIssue({ code: "custom", path: ["packs"], message: "workflow pack IDs must be unique" });
    }
    for (const [packIndex, pack] of bundle.packs.entries()) {
      const fixtureIds = pack.cases.map((fixture) => fixture.fixtureId);
      const checkIds = pack.cases.flatMap((fixture) => fixture.checks.map((check) => check.id));
      if (new Set(fixtureIds).size !== fixtureIds.length) {
        context.addIssue({ code: "custom", path: ["packs", packIndex, "cases"], message: "fixture IDs must be unique" });
      }
      if (new Set(checkIds).size !== checkIds.length) {
        context.addIssue({ code: "custom", path: ["packs", packIndex, "cases"], message: "check IDs must be unique within one pack" });
      }
      if (pack.cases.some((fixture, index) => fixture.category !== CASE_CATEGORIES[index])) {
        context.addIssue({ code: "custom", path: ["packs", packIndex, "cases"], message: "fixtures must retain normal, duplicate, malformed, timeout, approval order" });
      }
    }
  });

const evaluatorAnswerKeySchema = z
  .object({
    contractVersion: z.literal("s5-workflow-fixture-answer-key-v1"),
    bundleObject: z
      .object({
        s3Key: z.string().min(1).max(1_024),
        sha256: z.string().regex(SHA256),
        sizeBytes: z.number().int().positive(),
      })
      .strict(),
    bundle: evaluatorBundleSchema,
  })
  .strict();

const workflowFixtureRuntimeConfigSchema = z
  .object({
    contractVersion: z.literal("s5-workflow-evaluation-v1"),
    packField: z.literal("workflowPack"),
    runLogRole: z.literal("runLogFile"),
    categories: z.tuple([
      z.literal("normal"),
      z.literal("duplicate"),
      z.literal("malformed"),
      z.literal("timeout"),
      z.literal("approval"),
    ]),
    deterministicDimension: z.literal("functionality"),
  })
  .strict();

type WorkflowEvaluatorBundle = z.infer<typeof evaluatorBundleSchema>;
type WorkflowExpectedCheck = z.infer<typeof exactCheckSchema>;

export type WorkflowEvaluationBinding = {
  submissionId: string;
  assessmentVersionId: string;
  ownerKind: "individual" | "team";
  ownerId: string;
  version: number;
  attempt: number;
  contentHash: string;
  assessmentSha256: string;
  evaluatorSha256: string;
  runLogEvidenceId: string;
  runLogS3VersionId: string;
  runLogSha256: string;
  runLogByteCount: number;
};

export type WorkflowFixtureEvaluation = {
  contractVersion: "s5-workflow-evaluation-v1";
  evaluationId: string;
  stage: "deterministic" | "provisional";
  submission: {
    id: string;
    assessmentVersionId: string;
    ownerKind: "individual" | "team";
    ownerId: string;
    version: number;
    attempt: number;
    contentHash: string;
  };
  bindings: {
    assessmentSha256: string;
    evaluatorSha256: string;
    packId: Session5WorkflowPackId;
    suiteId: string;
    ruleVersion: string;
    evaluatorBundleSha256: string;
    expectedResultsSha256: string;
    runLogEvidenceId: string;
    runLogS3VersionId: string;
    runLogSha256: string;
    runLogByteCount: number;
  };
  authority: WorkflowEvaluatorBundle["authority"];
  cases: Array<{
    category: (typeof CASE_CATEGORIES)[number];
    fixtureId: string;
    status: "passed" | "failed";
    checks: Array<{ id: string; status: "passed" | "failed"; actualSha256: string }>;
  }>;
  passedCaseCount: number;
  totalCaseCount: 5;
  artifactFunctionality0to10: number;
  execution0to20: number;
  componentScores: {
    usefulness0to30: number | null;
    execution0to20: number;
    ownership0to10: number | null;
  };
  evidenceCitations: Array<{ dimension: string; evidenceIds: string[] }>;
  confidence: number | null;
  flags: string[];
  provisional: true;
  receiptSha256: string;
};

export class WorkflowFixtureEvaluationError extends Error {
  readonly code: string;
  readonly disposition: "repair" | "retry";

  constructor(code: string, disposition: "repair" | "retry", message: string) {
    super(message);
    this.name = "WorkflowFixtureEvaluationError";
    this.code = code;
    this.disposition = disposition;
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function evaluationIdFor(value: Pick<WorkflowFixtureEvaluation, "submission" | "bindings">): string {
  return `wfe_${sha256(
    canonicalJson({ submission: value.submission, bindings: value.bindings }),
  ).slice(0, 32)}`;
}

function withReceiptSha256(
  value: Omit<WorkflowFixtureEvaluation, "receiptSha256">,
): WorkflowFixtureEvaluation {
  return { ...value, receiptSha256: sha256(canonicalJson(value)) };
}

/** Matches the loader's generated-object hash: canonical JSON plus one newline. */
export function workflowEvaluatorBundleSha256(value: unknown): string {
  return sha256(`${canonicalJson(value)}\n`);
}

export function workflowEvaluatorBundleSizeBytes(value: unknown): number {
  return new TextEncoder().encode(`${canonicalJson(value)}\n`).byteLength;
}

export function buildWorkflowEvaluatorAnswerKey(args: {
  bundle: unknown;
  s3Key: string;
}): z.infer<typeof evaluatorAnswerKeySchema> {
  const bundle = evaluatorBundleSchema.parse(args.bundle);
  return {
    contractVersion: "s5-workflow-fixture-answer-key-v1",
    bundleObject: {
      s3Key: args.s3Key,
      sha256: workflowEvaluatorBundleSha256(bundle),
      sizeBytes: workflowEvaluatorBundleSizeBytes(bundle),
    },
    bundle,
  };
}

export function workflowFixtureRuntimeConfig(
  evaluatorConfig: unknown,
): z.infer<typeof workflowFixtureRuntimeConfigSchema> | null {
  const config = evaluatorConfig && typeof evaluatorConfig === "object" && !Array.isArray(evaluatorConfig)
    ? (evaluatorConfig as Record<string, unknown>)
    : null;
  if (!config || config.fixtureEvaluation === undefined) return null;
  const parsed = workflowFixtureRuntimeConfigSchema.safeParse(config.fixtureEvaluation);
  if (!parsed.success) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-fixture-config-invalid",
      "retry",
      "The bound workflow fixture runtime contract is invalid.",
    );
  }
  return parsed.data;
}

export function parseWorkflowEvaluatorAnswerKey(value: unknown): z.infer<typeof evaluatorAnswerKeySchema> {
  const parsed = evaluatorAnswerKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-answer-key-invalid",
      "retry",
      "The bound workflow fixture answer key is invalid.",
    );
  }
  const digest = workflowEvaluatorBundleSha256(parsed.data.bundle);
  if (digest !== parsed.data.bundleObject.sha256) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-bundle-hash-stale",
      "retry",
      "The workflow fixture bundle does not match its immutable object hash.",
    );
  }
  const byteCount = workflowEvaluatorBundleSizeBytes(parsed.data.bundle);
  if (byteCount !== parsed.data.bundleObject.sizeBytes) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-bundle-size-stale",
      "retry",
      "The workflow fixture bundle does not match its immutable object size.",
    );
  }
  return parsed.data;
}

function parseCsvScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("unterminated CSV quote");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ""));
}

function recordsFromCsv(text: string): Record<string, unknown>[] {
  const rows = parseCsvRows(text);
  const [headers, ...data] = rows;
  if (!headers || headers.length === 0 || new Set(headers).size !== headers.length) {
    throw new Error("CSV header is missing or duplicated");
  }
  return data.map((row) => {
    if (row.length !== headers.length) throw new Error("CSV row width does not match the header");
    return Object.fromEntries(headers.map((header, index) => [header.trim(), parseCsvScalar(row[index] ?? "")]));
  });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRunLog(bytes: Uint8Array): Record<string, unknown>[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  } catch {
    throw new WorkflowFixtureEvaluationError(
      "fixture-log-unreadable",
      "repair",
      "The run log is not valid UTF-8 text.",
    );
  }
  if (!text) {
    throw new WorkflowFixtureEvaluationError("fixture-log-empty", "repair", "The run log is empty.");
  }

  const candidates: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) candidates.push(...parsed);
    else {
      const root = objectRecord(parsed);
      const nested = root && (root.records ?? root.results);
      if (Array.isArray(nested)) candidates.push(...nested);
      else candidates.push(parsed);
    }
  } catch {
    const lines = text.split(/\r?\n/u).filter((line) => line.trim());
    try {
      candidates.push(...lines.map((line) => JSON.parse(line) as unknown));
    } catch {
      try {
        candidates.push(...recordsFromCsv(text));
      } catch {
        throw new WorkflowFixtureEvaluationError(
          "fixture-log-invalid",
          "repair",
          "The run log must be JSON, JSONL, or a CSV table with one row per fixture.",
        );
      }
    }
  }

  const records = candidates.map(objectRecord);
  if (records.some((record) => record === null)) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-log-invalid",
      "repair",
      "Every run-log entry must be an object.",
    );
  }
  return records as Record<string, unknown>[];
}

function pathValue(record: Record<string, unknown>, path: string): { found: boolean; value: unknown } {
  let current: unknown = record;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false, value: null };
      current = current[index];
      continue;
    }
    const currentRecord = objectRecord(current);
    if (!currentRecord || !Object.hasOwn(currentRecord, segment)) return { found: false, value: null };
    current = currentRecord[segment];
  }
  return { found: true, value: current };
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function checkPasses(check: WorkflowExpectedCheck, actual: { found: boolean; value: unknown }): boolean {
  if (check.operator === "present") return actual.found && present(actual.value);
  if (!actual.found) return false;
  if (check.operator === "eq") return canonicalJson(actual.value) === canonicalJson(check.expected);
  if (check.operator === "gte") return typeof actual.value === "number" && actual.value >= check.expected;
  if (typeof actual.value === "string" && typeof check.expected === "string") {
    return actual.value.includes(check.expected);
  }
  return Array.isArray(actual.value) && actual.value.some((value) => canonicalJson(value) === canonicalJson(check.expected));
}

function validBinding(binding: WorkflowEvaluationBinding): boolean {
  return Boolean(
    binding.submissionId &&
      binding.assessmentVersionId &&
      binding.ownerId &&
      (binding.ownerKind === "individual" || binding.ownerKind === "team") &&
      Number.isInteger(binding.version) &&
      binding.version > 0 &&
      Number.isInteger(binding.attempt) &&
      binding.attempt > 0 &&
      SHA256.test(binding.contentHash) &&
      SHA256.test(binding.assessmentSha256) &&
      SHA256.test(binding.evaluatorSha256) &&
      binding.runLogEvidenceId.length > 0 &&
      binding.runLogS3VersionId.length > 0 &&
      SHA256.test(binding.runLogSha256) &&
      Number.isInteger(binding.runLogByteCount) &&
      binding.runLogByteCount > 0,
  );
}

export function evaluateSession5WorkflowFixtures(args: {
  packId: unknown;
  runLogBytes: Uint8Array;
  answerKey: unknown;
  binding: WorkflowEvaluationBinding;
}): WorkflowFixtureEvaluation {
  if (typeof args.packId !== "string" || !PACK_IDS.has(args.packId)) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-pack-invalid",
      "repair",
      "Choose one declared Session 5 workflow pack.",
    );
  }
  if (!validBinding(args.binding)) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-evaluation-binding-invalid",
      "retry",
      "The workflow evaluation is missing its exact immutable submission binding.",
    );
  }

  const answerKey = parseWorkflowEvaluatorAnswerKey(args.answerKey);
  const packId = args.packId as Session5WorkflowPackId;
  const pack = answerKey.bundle.packs.find((candidate) => candidate.packId === packId);
  if (!pack) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-pack-unconfigured",
      "retry",
      "The selected workflow pack has no bound evaluator suite.",
    );
  }

  const runLogSha256 = sha256(args.runLogBytes);
  if (
    runLogSha256 !== args.binding.runLogSha256 ||
    args.runLogBytes.byteLength !== args.binding.runLogByteCount
  ) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-log-receipt-mismatch",
      "retry",
      "The run-log bytes do not match their committed immutable evidence receipt.",
    );
  }
  const records = parseRunLog(args.runLogBytes);
  if (records.length !== 5) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-count-invalid",
      "repair",
      "The run log must contain exactly the five authored fixture cases.",
    );
  }
  if (records.some((record) => record.suite_id !== pack.suiteId)) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-suite-mismatch",
      "repair",
      "The run log belongs to a different workflow pack or fixture-suite version.",
    );
  }
  if (records.some((record, index) => record.fixture_id !== pack.cases[index]?.fixtureId)) {
    throw new WorkflowFixtureEvaluationError(
      "fixture-order-or-id-invalid",
      "repair",
      "Run and retain the exact normal, duplicate, malformed, timeout, and approval fixtures in order.",
    );
  }

  const cases = pack.cases.map((fixture, index) => {
    const record = records[index]!;
    const checks = fixture.checks.map((check) => {
      const actual = pathValue(record, check.path);
      return {
        id: check.id,
        status: checkPasses(check, actual) ? ("passed" as const) : ("failed" as const),
        actualSha256: sha256(canonicalJson(actual.found ? actual.value : null)),
      };
    });
    return {
      category: fixture.category,
      fixtureId: fixture.fixtureId,
      status: checks.every((check) => check.status === "passed")
        ? ("passed" as const)
        : ("failed" as const),
      checks,
    };
  });
  const passedCaseCount = cases.filter((fixture) => fixture.status === "passed").length;
  const base = {
    contractVersion: "s5-workflow-evaluation-v1" as const,
    stage: "deterministic" as const,
    submission: {
      id: args.binding.submissionId,
      assessmentVersionId: args.binding.assessmentVersionId,
      ownerKind: args.binding.ownerKind,
      ownerId: args.binding.ownerId,
      version: args.binding.version,
      attempt: args.binding.attempt,
      contentHash: args.binding.contentHash,
    },
    bindings: {
      assessmentSha256: args.binding.assessmentSha256,
      evaluatorSha256: args.binding.evaluatorSha256,
      packId,
      suiteId: pack.suiteId,
      ruleVersion: pack.ruleVersion,
      evaluatorBundleSha256: answerKey.bundleObject.sha256,
      expectedResultsSha256: pack.expectedResultsSha256,
      runLogEvidenceId: args.binding.runLogEvidenceId,
      runLogS3VersionId: args.binding.runLogS3VersionId,
      runLogSha256,
      runLogByteCount: args.binding.runLogByteCount,
    },
    authority: answerKey.bundle.authority,
    cases,
    passedCaseCount,
    totalCaseCount: 5 as const,
    artifactFunctionality0to10: passedCaseCount * 2,
    execution0to20: passedCaseCount * 4,
    componentScores: {
      usefulness0to30: null,
      execution0to20: passedCaseCount * 4,
      ownership0to10: null,
    },
    evidenceCitations: [],
    confidence: null,
    flags: passedCaseCount === 5 ? [] : ["fixture-failure"],
    provisional: true as const,
  };
  const evaluationId = evaluationIdFor(base);
  return withReceiptSha256({ ...base, evaluationId });
}

const workflowEvaluationSchema = z
  .object({
    contractVersion: z.literal("s5-workflow-evaluation-v1"),
    evaluationId: z.string().regex(/^wfe_[0-9a-f]{32}$/),
    stage: z.enum(["deterministic", "provisional"]),
    submission: z
      .object({
        id: z.string().min(1),
        assessmentVersionId: z.string().min(1),
        ownerKind: z.enum(["individual", "team"]),
        ownerId: z.string().min(1),
        version: z.number().int().positive(),
        attempt: z.number().int().positive(),
        contentHash: z.string().regex(SHA256),
      })
      .strict(),
    bindings: z
      .object({
        assessmentSha256: z.string().regex(SHA256),
        evaluatorSha256: z.string().regex(SHA256),
        packId: z.enum(["S5-WP-GTM-01", "S5-WP-OPS-02", "S5-WP-REV-03"]),
        suiteId: z.string().min(1),
        ruleVersion: z.string().min(1),
        evaluatorBundleSha256: z.string().regex(SHA256),
        expectedResultsSha256: z.string().regex(SHA256),
        runLogEvidenceId: z.string().min(1),
        runLogS3VersionId: z.string().min(1),
        runLogSha256: z.string().regex(SHA256),
        runLogByteCount: z.number().int().positive(),
      })
      .strict(),
    authority: evaluatorBundleSchema.shape.authority,
    cases: z
      .array(
        z
          .object({
            category: z.enum(CASE_CATEGORIES),
            fixtureId: z.string().min(1),
            status: z.enum(["passed", "failed"]),
            checks: z
              .array(
                z
                  .object({
                    id: z.string().min(1),
                    status: z.enum(["passed", "failed"]),
                    actualSha256: z.string().regex(SHA256),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .length(5),
    passedCaseCount: z.number().int().min(0).max(5),
    totalCaseCount: z.literal(5),
    artifactFunctionality0to10: z.number().int().min(0).max(10),
    execution0to20: z.number().int().min(0).max(20),
    componentScores: z
      .object({
        usefulness0to30: z.number().min(0).max(30).nullable(),
        execution0to20: z.number().min(0).max(20),
        ownership0to10: z.number().min(0).max(10).nullable(),
      })
      .strict(),
    evidenceCitations: z
      .array(
        z
          .object({
            dimension: z.string().min(1).max(100),
            evidenceIds: z.array(z.string().min(1).max(200)).max(10),
          })
          .strict(),
      )
      .max(10),
    confidence: z.number().min(0).max(1).nullable(),
    flags: z.array(z.string().min(1).max(64)).max(20),
    provisional: z.literal(true),
    receiptSha256: z.string().regex(SHA256),
  })
  .strict();

export function parseWorkflowFixtureEvaluation(value: unknown): WorkflowFixtureEvaluation | null {
  const parsed = workflowEvaluationSchema.safeParse(value);
  if (!parsed.success) return null;
  const { receiptSha256, ...receipt } = parsed.data;
  if (sha256(canonicalJson(receipt)) !== receiptSha256) return null;
  if (evaluationIdFor(receipt) !== receipt.evaluationId) return null;
  if (
    receipt.cases.some(
      (fixture, index) =>
        fixture.category !== CASE_CATEGORIES[index] ||
        fixture.status !==
          (fixture.checks.every((check) => check.status === "passed") ? "passed" : "failed"),
    )
  ) {
    return null;
  }
  const passedCaseCount = receipt.cases.filter((fixture) => fixture.status === "passed").length;
  const allowedCitationDimensions = new Set<string>([
    ...receipt.authority.usefulnessRubricKeys,
    receipt.authority.ownershipRubricKey,
  ]);
  const citationDimensions = receipt.evidenceCitations.map((citation) => citation.dimension);
  if (
    passedCaseCount !== receipt.passedCaseCount ||
    receipt.artifactFunctionality0to10 !== passedCaseCount * 2 ||
    receipt.execution0to20 !== passedCaseCount * 4 ||
    receipt.componentScores.execution0to20 !== receipt.execution0to20 ||
    new Set(receipt.flags).size !== receipt.flags.length ||
    new Set(citationDimensions).size !== citationDimensions.length ||
    receipt.evidenceCitations.some(
      (citation) =>
        !allowedCitationDimensions.has(citation.dimension) ||
        citation.evidenceIds.length === 0 ||
        new Set(citation.evidenceIds).size !== citation.evidenceIds.length,
    ) ||
    (receipt.stage === "deterministic" &&
      (receipt.componentScores.usefulness0to30 !== null ||
        receipt.componentScores.ownership0to10 !== null ||
        receipt.confidence !== null ||
        receipt.evidenceCitations.length > 0)) ||
    (receipt.stage === "provisional" &&
      (receipt.componentScores.usefulness0to30 === null ||
        receipt.componentScores.ownership0to10 === null ||
        receipt.confidence === null ||
        allowedCitationDimensions.size !== citationDimensions.length ||
        [...allowedCitationDimensions].some(
          (dimension) => !citationDimensions.includes(dimension),
        )))
  ) {
    return null;
  }
  return parsed.data as WorkflowFixtureEvaluation;
}

export type BoundWorkflowAssessmentResult = {
  submissionId: string;
  assessmentVersionId: string | null;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
  version: number;
  attempt: number;
  assessmentHash: string | null;
  evaluatorHash: string | null;
  structuredFeedback: unknown;
  submission: {
    id: string;
    assessmentVersionId: string | null;
    ownerKind: "individual" | "team" | null;
    ownerId: string | null;
    version: number;
    attempt: number;
    contentHash: string | null;
  };
};

/** Fail-closed parser used by team rollup for the exact selected/owned submission receipt. */
export function workflowEvaluationForExactResult(
  row: BoundWorkflowAssessmentResult | null,
): WorkflowFixtureEvaluation | null {
  if (!row) return null;
  const feedback = objectRecord(row.structuredFeedback);
  const evaluation = parseWorkflowFixtureEvaluation(feedback?.workflowEvaluation);
  if (!evaluation) return null;
  const submission = row.submission;
  if (
    row.submissionId !== submission.id ||
    !row.assessmentVersionId ||
    row.assessmentVersionId !== submission.assessmentVersionId ||
    row.assessmentVersionId !== evaluation.submission.assessmentVersionId ||
    !row.ownerKind ||
    row.ownerKind !== submission.ownerKind ||
    row.ownerKind !== evaluation.submission.ownerKind ||
    !row.ownerId ||
    row.ownerId !== submission.ownerId ||
    row.ownerId !== evaluation.submission.ownerId ||
    row.version !== submission.version ||
    row.version !== evaluation.submission.version ||
    row.attempt !== submission.attempt ||
    row.attempt !== evaluation.submission.attempt ||
    submission.id !== evaluation.submission.id ||
    !submission.contentHash ||
    submission.contentHash !== evaluation.submission.contentHash ||
    !row.assessmentHash ||
    row.assessmentHash !== evaluation.bindings.assessmentSha256 ||
    !row.evaluatorHash ||
    row.evaluatorHash !== evaluation.bindings.evaluatorSha256
  ) {
    return null;
  }
  return evaluation;
}

export function workflowFunctionalityDimension(
  evaluation: WorkflowFixtureEvaluation,
): DimensionScore {
  return {
    score: evaluation.artifactFunctionality0to10,
    rationale: `${evaluation.passedCaseCount} of 5 checksum-bound workflow fixtures passed; execution is ${evaluation.execution0to20} of 20.`,
  };
}

function rubricDimensionScore(rubricScores: unknown, key: string): number | null {
  const scores = objectRecord(rubricScores);
  const dimension = objectRecord(scores?.[key]);
  const score = dimension?.score;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.min(10, Math.max(0, score));
}

export function completeWorkflowFixtureEvaluation(args: {
  evaluation: WorkflowFixtureEvaluation;
  rubricScores: unknown;
  citations: Array<{ dimension: string; evidenceIds: string[] }>;
  confidence: number;
  flags: string[];
}): WorkflowFixtureEvaluation {
  const evaluation = parseWorkflowFixtureEvaluation(args.evaluation);
  if (!evaluation || evaluation.stage !== "deterministic") {
    throw new WorkflowFixtureEvaluationError(
      "workflow-evaluation-state-invalid",
      "retry",
      "Only a valid deterministic workflow receipt may enter provisional completion.",
    );
  }
  const usefulnessValues = evaluation.authority.usefulnessRubricKeys.map((key) =>
    rubricDimensionScore(args.rubricScores, key),
  );
  const ownership = rubricDimensionScore(
    args.rubricScores,
    evaluation.authority.ownershipRubricKey,
  );
  if (
    usefulnessValues.some((score) => score === null) ||
    ownership === null ||
    !Number.isFinite(args.confidence) ||
    args.confidence < 0 ||
    args.confidence > 1 ||
    new Set(args.flags).size !== args.flags.length
  ) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-provider-result-invalid",
      "retry",
      "Workflow judgment evidence cannot be normalized onto the authored 30/20/10 scale.",
    );
  }
  const usefulness0to30 =
    ((usefulnessValues as number[]).reduce((sum, score) => sum + score, 0) /
      usefulnessValues.length) *
    3;
  const allowedCitationDimensions = new Set<string>([
    ...evaluation.authority.usefulnessRubricKeys,
    evaluation.authority.ownershipRubricKey,
  ]);
  const evidenceCitations = args.citations
    .filter((citation) => allowedCitationDimensions.has(citation.dimension))
    .map((citation) => ({
      dimension: citation.dimension,
      evidenceIds: [...citation.evidenceIds],
    }));
  const { receiptSha256: _receiptSha256, ...withoutReceipt } = evaluation;
  void _receiptSha256;
  const completed = withReceiptSha256({
    ...withoutReceipt,
    stage: "provisional",
    componentScores: {
      usefulness0to30,
      execution0to20: evaluation.execution0to20,
      ownership0to10: ownership,
    },
    evidenceCitations,
    confidence: args.confidence,
    flags: [...new Set([...evaluation.flags, ...args.flags])],
  });
  const parsed = parseWorkflowFixtureEvaluation(completed);
  if (!parsed) {
    throw new WorkflowFixtureEvaluationError(
      "workflow-provider-result-invalid",
      "retry",
      "Workflow judgment evidence cannot be persisted as a valid bound receipt.",
    );
  }
  return parsed;
}

/**
 * The server owns the frozen 30/20/10 scale. The provider may supply bounded
 * rubric evidence for usefulness/ownership, but can never replace execution.
 */
export function authoritativeWorkflowParts(args: {
  selected: { evaluation: WorkflowFixtureEvaluation } | null;
  own: { evaluation: WorkflowFixtureEvaluation } | null;
}): { usefulness0to30: number | null; execution0to20: number | null; ownership0to10: number | null } {
  const selected = args.selected
    ? parseWorkflowFixtureEvaluation(args.selected.evaluation)
    : null;
  const own = args.own ? parseWorkflowFixtureEvaluation(args.own.evaluation) : null;
  return {
    usefulness0to30:
      selected?.stage === "provisional"
        ? selected.componentScores.usefulness0to30
        : null,
    execution0to20:
      selected?.stage === "provisional"
        ? selected.componentScores.execution0to20
        : null,
    ownership0to10:
      own?.stage === "provisional"
        ? own.componentScores.ownership0to10
        : null,
  };
}
