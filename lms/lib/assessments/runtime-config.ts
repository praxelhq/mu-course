import { parseRubric } from "@/lib/ai/grading";
import type { AssessmentRubricDimension } from "@/lib/ai/assessment-grading";
import {
  parseAssessmentAnchorPack,
  type AssessmentAnchorPack,
} from "./assessment-anchors";
import type { ObjectiveAnswerSpec } from "./types";

export type AssessmentRuntimeConfig = {
  answerSpecs: Record<string, ObjectiveAnswerSpec>;
  judgmentFieldIds: string[];
  trustedAggregateSummaries: { id: string; text: string }[];
  /** `none` is an explicit, immutable guarantee that evidence stays local. */
  providerMode: "auto" | "none";
  approvedProcessor: string | null;
  approvedFlags: string[];
  citationsPerDimension: number;
  objectiveConsistencyRules: ObjectiveConsistencyRule[];
  rubric: AssessmentRubricDimension[];
  anchors: AssessmentAnchorPack | null;
};

export type ObjectiveConsistencyRule = {
  id: string;
  kind: "percentage_from_count";
  countField: string;
  denominatorField: string;
  percentageField: string;
  tolerancePercentagePoints: number;
  dimension: string;
  cap: number;
};

export class AssessmentRuntimeConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssessmentRuntimeConfigError";
    this.code = code;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function policyIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function parseObjectiveConsistencyRules(args: {
  raw: unknown;
  answerSpecs: Record<string, ObjectiveAnswerSpec>;
  rubric: AssessmentRubricDimension[];
}): ObjectiveConsistencyRule[] {
  if (args.raw === undefined) return [];
  if (!Array.isArray(args.raw)) {
    throw new AssessmentRuntimeConfigError(
      "objective-consistency-policy-invalid",
      "Objective consistency rules must be an array",
    );
  }
  const rules = args.raw.map((value, index): ObjectiveConsistencyRule => {
    const item = record(value);
    if (
      !item ||
      !policyIdentifier(item.id) ||
      item.kind !== "percentage_from_count" ||
      !policyIdentifier(item.countField) ||
      !policyIdentifier(item.denominatorField) ||
      !policyIdentifier(item.percentageField) ||
      !policyIdentifier(item.dimension) ||
      !finiteNumber(item.tolerancePercentagePoints) ||
      item.tolerancePercentagePoints < 0 ||
      item.tolerancePercentagePoints > 100 ||
      !finiteNumber(item.cap) ||
      item.cap < 0
    ) {
      throw new AssessmentRuntimeConfigError(
        "objective-consistency-policy-invalid",
        `Objective consistency rule ${index + 1} is malformed`,
      );
    }
    for (const fieldId of [item.countField, item.denominatorField, item.percentageField]) {
      if (args.answerSpecs[fieldId]?.kind !== "number") {
        throw new AssessmentRuntimeConfigError(
          "objective-consistency-policy-invalid",
          `Objective consistency rule ${item.id} references a non-numeric field`,
        );
      }
    }
    const dimension = args.rubric.find((candidate) => candidate.key === item.dimension);
    if (!dimension || item.cap > dimension.max) {
      throw new AssessmentRuntimeConfigError(
        "objective-consistency-policy-invalid",
        `Objective consistency rule ${item.id} has an invalid dimension cap`,
      );
    }
    return {
      id: item.id,
      kind: item.kind,
      countField: item.countField,
      denominatorField: item.denominatorField,
      percentageField: item.percentageField,
      tolerancePercentagePoints: item.tolerancePercentagePoints,
      dimension: item.dimension,
      cap: item.cap,
    };
  });
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw new AssessmentRuntimeConfigError(
      "objective-consistency-policy-invalid",
      "Objective consistency rule IDs must be unique",
    );
  }
  return rules;
}

function explicitWeight(item: Record<string, unknown>): { weight?: number } | null {
  if (!("weight" in item)) return {};
  if (!finiteNumber(item.weight) || item.weight <= 0 || item.weight > 100) return null;
  return { weight: item.weight };
}

function explicitSpec(value: unknown): ObjectiveAnswerSpec | null {
  const item = record(value);
  if (!item) return null;
  const weighted = explicitWeight(item);
  if (!weighted) return null;
  if (item.kind === "number") {
    if (!finiteNumber(item.expected)) return null;
    if (item.mode !== "exact" && item.mode !== "tolerance" && item.mode !== "rounded") {
      return null;
    }
    const spec: ObjectiveAnswerSpec = {
      kind: "number",
      ...weighted,
      mode: item.mode,
      expected: item.expected,
      ...(finiteNumber(item.tolerance) ? { tolerance: item.tolerance } : {}),
      ...(Number.isInteger(item.decimals) ? { decimals: item.decimals as number } : {}),
      ...(typeof item.integer === "boolean" ? { integer: item.integer } : {}),
      ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
      ...(record(item.acceptedUnits)
        ? {
            acceptedUnits: Object.fromEntries(
              Object.entries(record(item.acceptedUnits)!).filter(
                (entry): entry is [string, number] => finiteNumber(entry[1]),
              ),
            ),
          }
        : {}),
    };
    return spec;
  }
  if (item.kind === "string" && typeof item.expected === "string") {
    return {
      kind: "string",
      ...weighted,
      expected: item.expected,
      ...(Array.isArray(item.alternatives)
        ? { alternatives: stringArray(item.alternatives) }
        : {}),
      ...(typeof item.trim === "boolean" ? { trim: item.trim } : {}),
      ...(typeof item.caseInsensitive === "boolean"
        ? { caseInsensitive: item.caseInsensitive }
        : {}),
    };
  }
  if (item.kind === "set" && Array.isArray(item.expected)) {
    const expected = stringArray(item.expected);
    if (expected.length !== item.expected.length) return null;
    return {
      kind: "set",
      ...weighted,
      expected,
      ...(Array.isArray(item.allowed) ? { allowed: stringArray(item.allowed) } : {}),
      ...(typeof item.trim === "boolean" ? { trim: item.trim } : {}),
      ...(typeof item.caseInsensitive === "boolean"
        ? { caseInsensitive: item.caseInsensitive }
        : {}),
    };
  }
  return null;
}

function adapterSpec(itemId: string, value: unknown): ObjectiveAnswerSpec | null {
  const item = record(value);
  const contract = record(item?.contract);
  if (!item || !contract || contract.evaluation !== "deterministic") return null;
  const privateKey = record(item.private_key);
  if (!privateKey || !("expected" in privateKey)) {
    throw new AssessmentRuntimeConfigError(
      "deterministic-key-missing",
      `Deterministic evaluator item ${itemId} has no private expected value`,
    );
  }

  const acceptance = record(contract.acceptance) ?? {};
  const responseSchema =
    typeof contract.response_schema === "string" ? contract.response_schema.toLowerCase() : "";
  const expected = privateKey.expected;

  if (finiteNumber(expected)) {
    const tolerance = [
      acceptance.absolute_tolerance_percentage_points,
      acceptance.absolute_tolerance,
      acceptance.tolerance,
    ].find(finiteNumber);
    const decimals = [acceptance.decimal_places, acceptance.round_decimals].find((entry) =>
      Number.isInteger(entry),
    ) as number | undefined;
    const declaredMode = acceptance.mode;
    const mode =
      tolerance !== undefined
        ? "tolerance"
        : decimals !== undefined || declaredMode === "rounded"
          ? "rounded"
          : "exact";
    return {
      kind: "number",
      mode,
      expected,
      ...(tolerance !== undefined ? { tolerance } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      ...(responseSchema.includes("integer") ? { integer: true } : {}),
      ...(typeof acceptance.unit === "string" ? { unit: acceptance.unit } : {}),
    };
  }
  if (typeof expected === "string") {
    return {
      kind: "string",
      expected,
      alternatives: stringArray(privateKey.alternatives),
      trim: acceptance.trim !== false,
      caseInsensitive: acceptance.case_insensitive === true,
    };
  }
  if (Array.isArray(expected) && expected.every((entry) => typeof entry === "string")) {
    return {
      kind: "set",
      expected,
      allowed: stringArray(privateKey.allowed).length > 0
        ? stringArray(privateKey.allowed)
        : expected,
      trim: acceptance.trim !== false,
      caseInsensitive: acceptance.case_insensitive === true,
    };
  }

  throw new AssessmentRuntimeConfigError(
    "deterministic-key-unsupported",
    `Deterministic evaluator item ${itemId} uses an unsupported expected-value type`,
  );
}

function normalizeAnswerSpecs(answerKey: unknown): {
  answerSpecs: Record<string, ObjectiveAnswerSpec>;
  judgmentItemIds: string[];
} {
  const root = record(answerKey) ?? {};
  const source = record(root.specs) ?? record(root.items) ?? root;
  const answerSpecs: Record<string, ObjectiveAnswerSpec> = {};
  const judgmentItemIds: string[] = [];

  for (const [itemId, value] of Object.entries(source)) {
    const direct = explicitSpec(value);
    if (direct) {
      answerSpecs[itemId] = direct;
      continue;
    }
    const item = record(value);
    const contract = record(item?.contract);
    if (contract && contract.evaluation !== "deterministic") {
      judgmentItemIds.push(itemId);
      continue;
    }
    const adapted = adapterSpec(itemId, value);
    if (adapted) answerSpecs[itemId] = adapted;
  }
  return { answerSpecs, judgmentItemIds };
}

export function parseAssessmentRuntimeConfig(input: {
  rubric: unknown;
  evaluatorConfig: unknown;
  answerKey: unknown;
  anchors?: unknown;
}): AssessmentRuntimeConfig {
  const evaluatorConfig = record(input.evaluatorConfig) ?? {};
  const providerModeValue = evaluatorConfig.providerMode ?? "auto";
  if (providerModeValue !== "auto" && providerModeValue !== "none") {
    throw new AssessmentRuntimeConfigError(
      "provider-mode-invalid",
      "Assessment provider mode must be auto or none",
    );
  }
  const providerMode = providerModeValue;
  const normalized = normalizeAnswerSpecs(input.answerKey);
  const configuredJudgmentIds = stringArray(evaluatorConfig.judgmentFieldIds);
  const judgmentFieldIds = [...new Set([...configuredJudgmentIds, ...normalized.judgmentItemIds])];

  const summaries = Array.isArray(evaluatorConfig.trustedAggregateSummaries)
    ? evaluatorConfig.trustedAggregateSummaries.flatMap((value) => {
        const summary = record(value);
        return summary?.safeForProcessor === true &&
          typeof summary.id === "string" &&
          typeof summary.text === "string"
          ? [{ id: summary.id, text: summary.text }]
          : [];
      })
    : [];

  const rawApprovedProcessor = evaluatorConfig.approvedProcessor;
  if (
    rawApprovedProcessor !== undefined &&
    (typeof rawApprovedProcessor !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(rawApprovedProcessor))
  ) {
    throw new AssessmentRuntimeConfigError(
      "approved-processor-invalid",
      "The assessment processor must be one normalized frozen identifier",
    );
  }
  const approvedProcessor = rawApprovedProcessor ?? null;
  if (
    providerMode === "auto" &&
    approvedProcessor === null &&
    (judgmentFieldIds.length > 0 || summaries.length > 0)
  ) {
    throw new AssessmentRuntimeConfigError(
      "approved-processor-invalid",
      "Processor-bound assessment evidence requires a frozen processor identifier",
    );
  }
  if (
    providerMode === "none" &&
    (approvedProcessor !== null || judgmentFieldIds.length > 0 || summaries.length > 0)
  ) {
    throw new AssessmentRuntimeConfigError(
      "provider-mode-conflict",
      "A no-provider assessment cannot configure processor-bound judgment evidence",
    );
  }
  const rawFlags = evaluatorConfig.approvedFlags;
  if (rawFlags !== undefined && !Array.isArray(rawFlags)) {
    throw new AssessmentRuntimeConfigError(
      "approved-flags-invalid",
      "Approved assessment flags must be a unique array of policy codes",
    );
  }
  const approvedFlags = (rawFlags ?? []) as unknown[];
  if (
    approvedFlags.some(
      (flag) =>
        typeof flag !== "string" ||
        !/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(flag),
    ) ||
    new Set(approvedFlags).size !== approvedFlags.length
  ) {
    throw new AssessmentRuntimeConfigError(
      "approved-flags-invalid",
      "Approved assessment flags must be unique, normalized policy codes",
    );
  }
  const rawCitationCount = evaluatorConfig.citationsPerDimension;
  const citationsPerDimension = rawCitationCount ?? 1;
  if (
    !Number.isInteger(citationsPerDimension) ||
    (citationsPerDimension as number) < 1 ||
    (citationsPerDimension as number) > 10
  ) {
    throw new AssessmentRuntimeConfigError(
      "citation-policy-invalid",
      "Citations per dimension must be an integer from 1 to 10",
    );
  }

  const rubric = parseRubric(input.rubric);
  if (judgmentFieldIds.length === 0 && input.anchors !== undefined && input.anchors !== null) {
    throw new AssessmentRuntimeConfigError(
      "anchor-policy-conflict",
      "An evaluator without judgment fields cannot bind an unused anchor pack",
    );
  }
  const anchors = judgmentFieldIds.length > 0
    ? parseAssessmentAnchorPack({
        value: input.anchors,
        rubric,
        approvedFlags: approvedFlags as string[],
        answerKey: normalized.answerSpecs,
        publicContext: evaluatorConfig,
      })
    : null;
  const objectiveConsistencyRules = parseObjectiveConsistencyRules({
    raw: evaluatorConfig.objectiveConsistencyRules,
    answerSpecs: normalized.answerSpecs,
    rubric,
  });

  return {
    answerSpecs: normalized.answerSpecs,
    judgmentFieldIds,
    trustedAggregateSummaries: summaries,
    providerMode,
    approvedProcessor,
    approvedFlags: approvedFlags as string[],
    citationsPerDimension: citationsPerDimension as number,
    objectiveConsistencyRules,
    rubric,
    anchors,
  };
}

export function assertApprovedAssessmentProcessor(input: {
  configuredProcessor: string | null;
  approvedProcessors: string[];
  providerWorkRequired: boolean;
}): void {
  if (!input.providerWorkRequired) return;
  if (!input.configuredProcessor) {
    throw new AssessmentRuntimeConfigError(
      "processor-not-configured",
      "The bound evaluator does not name an approved processor",
    );
  }
  const approved = new Set(input.approvedProcessors.map((value) => value.toLowerCase()));
  if (!approved.has(input.configuredProcessor.toLowerCase())) {
    throw new AssessmentRuntimeConfigError(
      "processor-not-approved",
      `Processor ${input.configuredProcessor} is not approved by the bound assessment release`,
    );
  }
}
