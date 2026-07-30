import {
  buildAssessmentGradingContext,
  renderJudgmentFieldValue,
  validateAssessmentCitations,
  type AssessmentRubricDimension,
} from "@/lib/ai/assessment-grading";
import {
  assertAnchoredProviderScores,
  type AnchoredDimensionScore,
  type AssessmentAnchorPack,
} from "./assessment-anchors";
import {
  buildRedactedRepairFeedback,
  scanSensitiveText,
  type SensitiveFinding,
} from "@/lib/evidence/sensitive-data";
import { composeArtifactGrade, type ComposedArtifactGrade } from "./compose-grade";
import { evaluateObjectiveSet } from "./evaluate-objective";
import type { ObjectiveConsistencyRule } from "./runtime-config";
import type { DimensionScore, ObjectiveAnswerSpec, ObjectiveSetResult } from "./types";

export type AssessmentPurposeValue = "graded" | "formative";

export type AssessmentProviderAttachment =
  | { id: string; kind: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; dataBase64: string }
  | { id: string; kind: "pdf"; dataBase64: string };

export type AssessmentProviderResponse = {
  rubricScores: Record<string, AnchoredDimensionScore>;
  feedbackMd: string;
  confidence: number;
  flags: string[];
  citations: { dimension: string; evidenceIds: string[] }[];
  /** Deliberately ignored. The server always recomputes the total. */
  total?: number;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  raw: string;
};

export type PersistableAssessmentProviderResponse = Pick<
  AssessmentProviderResponse,
  "rubricScores" | "feedbackMd" | "confidence" | "flags" | "citations" | "usage" | "model"
>;

export type AssessmentProviderRequest = {
  system: string;
  user: string;
  rubric: AssessmentRubricDimension[];
  allowedCitationIds: string[];
  attachments: AssessmentProviderAttachment[];
  anchors: AssessmentAnchorPack;
};

export type AssessmentProviderCall = (
  request: AssessmentProviderRequest,
) => Promise<AssessmentProviderResponse>;

export type AssessmentEvaluationClaim =
  | { kind: "claimed"; claimToken: string }
  | { kind: "busy"; resultId: string }
  | { kind: "completed"; resultId: string };

export type PersistedAssessmentGrade = ComposedArtifactGrade & {
  confidence: number;
  feedbackMd: string;
  flags: string[];
};

export type AssessmentEvaluationPersistence = {
  claim(input: {
    evaluationKey: string;
    submissionId: string;
    purpose: AssessmentPurposeValue;
    hashes: AssessmentEvaluationInput["hashes"];
  }): Promise<AssessmentEvaluationClaim>;
  persistDeterministic(input: {
    evaluationKey: string;
    claimToken: string;
    objective: ObjectiveSetResult;
    deterministicDimensions: Record<string, DimensionScore>;
    hashes: AssessmentEvaluationInput["hashes"];
  }): Promise<void>;
  markProviderPending?(input: {
    evaluationKey: string;
    claimToken: string;
  }): Promise<void>;
  requireRepair(input: {
    evaluationKey: string;
    claimToken: string;
    errorCode: string;
    feedback: string;
    quarantinedEvidenceIds: string[];
  }): Promise<void>;
  complete(input: {
    evaluationKey: string;
    claimToken: string;
    purpose: AssessmentPurposeValue;
    objective: ObjectiveSetResult;
    provider: PersistableAssessmentProviderResponse | null;
    grade: PersistedAssessmentGrade | null;
    hashes: AssessmentEvaluationInput["hashes"];
  }): Promise<void>;
  fail(input: {
    evaluationKey: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void>;
};

export type AssessmentEvaluationInput = {
  evaluationKey: string;
  submissionId: string;
  assessmentTitle: string;
  purpose: AssessmentPurposeValue;
  fields: Record<string, unknown>;
  answerSpecs: Record<string, ObjectiveAnswerSpec>;
  judgmentFieldIds: string[];
  trustedAggregateSummaries: { id: string; text: string }[];
  /** Text roles that passed local integrity/sensitive-data preflight. */
  screenedTextEvidence?: { id: string; text: string }[];
  rubric: AssessmentRubricDimension[];
  hashes: { assessment: string; dataset: string | null; evaluator: string };
  /** Optional policy-computed authoritative dimensions. Functionality is derived when omitted. */
  deterministicDimensions?: Record<string, DimensionScore>;
  providerAttachments?: AssessmentProviderAttachment[];
  preflightFailure?: {
    errorCode: string;
    feedback: string;
    quarantinedEvidenceIds: string[];
  };
  /** Frozen provider policy. Any returned code outside this list fails the evaluation. */
  approvedFlags?: string[];
  /** Exact unique citation count required for each provider-judged dimension. */
  citationsPerDimension?: number;
  objectiveConsistencyRules?: ObjectiveConsistencyRule[];
  /** Exact checksum-covered authored criteria for every bound rubric dimension. */
  anchors?: AssessmentAnchorPack | null;
  /**
   * Deterministic, release-bound post-composition policy. It may only lower
   * scores/confidence and add approved flags; provider output remains intact.
   */
  gradePolicy?: (grade: PersistedAssessmentGrade) => PersistedAssessmentGrade;
};

export type AssessmentEvaluationOutcome =
  | { kind: "already-completed"; resultId: string }
  | { kind: "already-claimed"; resultId: string }
  | { kind: "repair-required"; objective: ObjectiveSetResult }
  | {
      kind: "completed";
      objective: ObjectiveSetResult;
      grade: PersistedAssessmentGrade | null;
      providerCalled: boolean;
    };

export class AssessmentEvaluationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssessmentEvaluationError";
    this.code = code;
  }
}

function functionalityFrom(objective: ObjectiveSetResult, max: number): DimensionScore | null {
  const total = objective.totalWeight ?? objective.totalCount;
  const correct = objective.correctWeight ?? objective.correctCount;
  if (total === 0) return null;
  const score =
    Math.round((correct / total) * max * 100) / 100;
  return {
    score,
    rationale: `${correct} of ${total} authored-item weight passed (${objective.correctCount} of ${objective.totalCount} field checks).`,
  };
}

export function applyObjectiveConsistencyRules(args: {
  objective: ObjectiveSetResult;
  dimensions: Record<string, DimensionScore>;
  rules: readonly ObjectiveConsistencyRule[];
}): Record<string, DimensionScore> {
  const dimensions = { ...args.dimensions };
  for (const rule of args.rules) {
    const count = args.objective.items[rule.countField]?.normalizedResponse;
    const denominator = args.objective.items[rule.denominatorField]?.normalizedResponse;
    const percentage = args.objective.items[rule.percentageField]?.normalizedResponse;
    if (
      typeof count !== "number" ||
      typeof denominator !== "number" ||
      typeof percentage !== "number"
    ) {
      continue;
    }
    const consistent =
      denominator > 0 &&
      Math.abs(percentage - (100 * count) / denominator) <=
        rule.tolerancePercentagePoints + 1e-12;
    const current = dimensions[rule.dimension];
    if (!consistent && current && current.score > rule.cap) {
      dimensions[rule.dimension] = {
        score: rule.cap,
        rationale: `${current.rationale} Capped at ${rule.cap} because ${rule.id} failed its submitted-value consistency check.`,
      };
    }
  }
  return dimensions;
}

function hasConfiguredProviderWork(input: AssessmentEvaluationInput): boolean {
  return (
    input.judgmentFieldIds.length > 0 ||
    (input.providerAttachments?.length ?? 0) > 0 ||
    (input.screenedTextEvidence?.length ?? 0) > 0
  );
}

function localPreflightFailure(
  input: AssessmentEvaluationInput,
): AssessmentEvaluationInput["preflightFailure"] {
  const findings: SensitiveFinding[] = [];
  for (const fieldId of new Set(input.judgmentFieldIds)) {
    const rendered = renderJudgmentFieldValue(input.fields[fieldId]);
    if (rendered === null) continue;
    findings.push(...scanSensitiveText(rendered, fieldId));
  }
  if (findings.length === 0) return input.preflightFailure;

  const judgmentFeedback = buildRedactedRepairFeedback(findings);
  if (!input.preflightFailure) {
    return {
      errorCode: "unsafe-evidence",
      feedback: judgmentFeedback,
      quarantinedEvidenceIds: [],
    };
  }
  return {
    errorCode: input.preflightFailure.errorCode,
    feedback: `${input.preflightFailure.feedback}\n${judgmentFeedback}`,
    quarantinedEvidenceIds: [...new Set(input.preflightFailure.quarantinedEvidenceIds)],
  };
}

function validateProviderEvidence(
  response: AssessmentProviderResponse,
  allowedCitationIds: string[],
  requiredDimensions: string[],
  citationsPerDimension: number,
): void {
  const validation = validateAssessmentCitations(
    response.citations,
    allowedCitationIds,
    requiredDimensions,
    citationsPerDimension,
  );
  if (!validation.ok) {
    throw new AssessmentEvaluationError("invalid-citations", validation.errors.join("; "));
  }
}

function validateProviderFlags(response: AssessmentProviderResponse, approvedFlags: string[]): void {
  const approved = new Set(approvedFlags);
  const unknown = [...new Set(response.flags.filter((flag) => !approved.has(flag)))];
  const hasDuplicates = new Set(response.flags).size !== response.flags.length;
  if (unknown.length > 0 || hasDuplicates) {
    throw new AssessmentEvaluationError(
      "invalid-flags",
      "Provider returned invalid assessment flag codes",
    );
  }
}

function validateProviderAnchors(args: {
  response: AssessmentProviderResponse;
  anchors: AssessmentAnchorPack;
  requiredDimensionKeys: string[];
}): void {
  try {
    assertAnchoredProviderScores({
      anchors: args.anchors,
      rubricScores: args.response.rubricScores,
      flags: args.response.flags,
      requiredDimensionKeys: args.requiredDimensionKeys,
    });
  } catch {
    throw new AssessmentEvaluationError(
      "anchor-policy-violation",
      "Provider scores do not satisfy the frozen authored anchor policy",
    );
  }
}

const MIN_SUBSTANTIAL_ANCHOR_TOKENS = 6;
const MAX_PROVIDER_TEXT_TOKENS = 4_096;

function normalizedOverlapTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function minimumTokenDistanceFromSubstring(pattern: string[], text: string[]): number {
  let previous = new Array<number>(text.length + 1).fill(0);
  for (let patternIndex = 1; patternIndex <= pattern.length; patternIndex += 1) {
    const current = new Array<number>(text.length + 1);
    current[0] = patternIndex;
    for (let textIndex = 1; textIndex <= text.length; textIndex += 1) {
      const substitutionCost =
        pattern[patternIndex - 1] === text[textIndex - 1] ? 0 : 1;
      current[textIndex] = Math.min(
        previous[textIndex]! + 1,
        current[textIndex - 1]! + 1,
        previous[textIndex - 1]! + substitutionCost,
      );
    }
    previous = current;
  }
  return Math.min(...previous);
}

function authoredAnchorText(anchors: AssessmentAnchorPack): string[] {
  return anchors.content.dimensions.flatMap((dimension) => [
    ...dimension.bands.flatMap((band) => band.criteria),
    ...dimension.caps.map((cap) => cap.rationale),
    ...dimension.safeExamples.map((example) => example.summary),
  ]);
}

function providerOutputText(response: AssessmentProviderResponse): string[] {
  return [
    response.feedbackMd,
    ...Object.values(response.rubricScores).map((dimension) => dimension.rationale),
    response.raw,
  ];
}

function validateProviderAnchorDisclosure(args: {
  response: AssessmentProviderResponse;
  anchors: AssessmentAnchorPack;
}): void {
  const privateTokenSets = [
    ...new Map(
      authoredAnchorText(args.anchors)
        .map(normalizedOverlapTokens)
        .filter((tokens) => tokens.length >= MIN_SUBSTANTIAL_ANCHOR_TOKENS)
        .flatMap((tokens) =>
          Array.from(
            { length: tokens.length - MIN_SUBSTANTIAL_ANCHOR_TOKENS + 1 },
            (_, index) =>
              tokens.slice(index, index + MIN_SUBSTANTIAL_ANCHOR_TOKENS),
          ),
        )
        .map((tokens) => [tokens.join(" "), tokens] as const),
    ).values(),
  ];
  for (const output of providerOutputText(args.response)) {
    const outputTokens = normalizedOverlapTokens(output);
    if (outputTokens.length > MAX_PROVIDER_TEXT_TOKENS) {
      throw new AssessmentEvaluationError(
        "evaluator-anchor-overlap",
        "Provider output could not be proven disjoint from frozen evaluator anchors",
      );
    }
    for (const privateTokens of privateTokenSets) {
      if (
        minimumTokenDistanceFromSubstring(privateTokens, outputTokens) <= 1
      ) {
        throw new AssessmentEvaluationError(
          "evaluator-anchor-overlap",
          "Provider output substantially overlaps frozen evaluator anchors",
        );
      }
    }
  }
}

function persistableProviderResponse(
  response: AssessmentProviderResponse,
): PersistableAssessmentProviderResponse {
  return {
    rubricScores: Object.fromEntries(
      Object.entries(response.rubricScores).map(([key, dimension]) => [
        key,
        {
          score: dimension.score,
          rationale: dimension.rationale,
          ...(dimension.anchorBand ? { anchorBand: dimension.anchorBand } : {}),
        },
      ]),
    ),
    feedbackMd: response.feedbackMd,
    confidence: response.confidence,
    flags: [...response.flags],
    citations: response.citations.map((citation) => ({
      dimension: citation.dimension,
      evidenceIds: [...citation.evidenceIds],
    })),
    usage: { ...response.usage },
    model: response.model,
  };
}

function safeFailure(error: unknown): AssessmentEvaluationError {
  if (error instanceof AssessmentEvaluationError) return error;
  return new AssessmentEvaluationError(
    "provider-failure",
    error instanceof Error ? error.message : "Assessment provider failed",
  );
}

function applyGradePolicy(
  grade: PersistedAssessmentGrade,
  input: AssessmentEvaluationInput,
): PersistedAssessmentGrade {
  if (!input.gradePolicy) return grade;
  const adjusted = input.gradePolicy({
    ...grade,
    rubricScores: Object.fromEntries(
      Object.entries(grade.rubricScores).map(([key, value]) => [key, { ...value }]),
    ),
    flags: [...grade.flags],
    conflicts: [...grade.conflicts],
  });
  const expectedKeys = input.rubric.map((dimension) => dimension.key).sort();
  const returnedKeys = Object.keys(adjusted.rubricScores).sort();
  const approvedFlags = new Set(input.approvedFlags ?? []);
  const adjustedFlags = new Set(adjusted.flags);
  if (
    JSON.stringify(expectedKeys) !== JSON.stringify(returnedKeys) ||
    !Number.isFinite(adjusted.confidence) ||
    adjusted.confidence < 0 ||
    adjusted.confidence > grade.confidence ||
    adjusted.flags.some((flag) => !approvedFlags.has(flag)) ||
    grade.flags.some((flag) => !adjustedFlags.has(flag)) ||
    adjusted.feedbackMd !== grade.feedbackMd ||
    JSON.stringify(adjusted.conflicts) !== JSON.stringify(grade.conflicts)
  ) {
    throw new AssessmentEvaluationError(
      "grade-policy-invalid",
      "Deterministic grade policy may only lower scores/confidence and add approved flags",
    );
  }
  for (const key of expectedKeys) {
    const before = grade.rubricScores[key];
    const after = adjusted.rubricScores[key];
    if (
      !before ||
      !after ||
      !Number.isFinite(after.score) ||
      after.score < 0 ||
      after.score > before.score
    ) {
      throw new AssessmentEvaluationError(
        "grade-policy-invalid",
        "Deterministic grade policy may only lower a bounded score",
      );
    }
  }
  const total = Object.values(adjusted.rubricScores).reduce(
    (sum, dimension) => sum + dimension.score,
    0,
  );
  return { ...adjusted, total };
}

/**
 * Deterministic-first assessment orchestration. Expected answers exist only in
 * this server-side call frame; persisted objective results and provider input
 * structurally omit them.
 */
export async function runAssessmentEvaluation(
  input: AssessmentEvaluationInput,
  deps: {
    persistence: AssessmentEvaluationPersistence;
    callProvider: AssessmentProviderCall;
  },
): Promise<AssessmentEvaluationOutcome> {
  const claim = await deps.persistence.claim({
    evaluationKey: input.evaluationKey,
    submissionId: input.submissionId,
    purpose: input.purpose,
    hashes: input.hashes,
  });
  if (claim.kind === "completed") {
    return { kind: "already-completed", resultId: claim.resultId };
  }
  if (claim.kind === "busy") {
    return { kind: "already-claimed", resultId: claim.resultId };
  }

  const objective = evaluateObjectiveSet(input.answerSpecs, input.fields);
  let deterministicDimensions = { ...(input.deterministicDimensions ?? {}) };
  const functionality = functionalityFrom(
    objective,
    input.rubric.find((dimension) => dimension.key === "functionality")?.max ?? 10,
  );
  if (functionality && deterministicDimensions.functionality === undefined) {
    deterministicDimensions.functionality = functionality;
  }
  deterministicDimensions = applyObjectiveConsistencyRules({
    objective,
    dimensions: deterministicDimensions,
    rules: input.objectiveConsistencyRules ?? [],
  });
  const preflightFailure = localPreflightFailure(input);

  try {
    await deps.persistence.persistDeterministic({
      evaluationKey: input.evaluationKey,
      claimToken: claim.claimToken,
      objective,
      deterministicDimensions,
      hashes: input.hashes,
    });

    if (preflightFailure) {
      await deps.persistence.requireRepair({
        evaluationKey: input.evaluationKey,
        claimToken: claim.claimToken,
        ...preflightFailure,
      });
      return { kind: "repair-required", objective };
    }

    const attachments = input.providerAttachments ?? [];
    let provider: AssessmentProviderResponse | null = null;
    if (hasConfiguredProviderWork(input)) {
      // Deterministically-owned rubric dimensions never enter the provider
      // contract. This keeps the server authoritative and makes the response
      // schema/citation set exactly match the dimensions the model may judge.
      const subjectiveRubric = input.rubric.filter(
        (dimension) => deterministicDimensions[dimension.key] === undefined,
      );
      if (!input.anchors) {
        throw new AssessmentEvaluationError(
          "anchor-binding-missing",
          "Subjective assessment work requires frozen authored anchors",
        );
      }
      const context = buildAssessmentGradingContext({
        assessmentTitle: input.assessmentTitle,
        rubric: subjectiveRubric,
        fields: input.fields,
        judgmentFieldIds: input.judgmentFieldIds,
        deterministicStatuses: Object.fromEntries(
          Object.entries(objective.items).map(([itemId, item]) => [itemId, item.status]),
        ),
        trustedAggregateSummaries: input.trustedAggregateSummaries,
        citationsPerDimension: input.citationsPerDimension ?? 1,
        approvedFlags: input.approvedFlags ?? [],
        screenedTextEvidence: input.screenedTextEvidence,
        trustedEvidenceIds: attachments.map((attachment) => attachment.id),
        anchors: input.anchors,
      });
      await deps.persistence.markProviderPending?.({
        evaluationKey: input.evaluationKey,
        claimToken: claim.claimToken,
      });
      provider = await deps.callProvider({
        system: context.system,
        user: context.user,
        rubric: subjectiveRubric,
        allowedCitationIds: context.allowedCitationIds,
        attachments,
        anchors: input.anchors,
      });
      validateProviderAnchorDisclosure({ response: provider, anchors: input.anchors });
      validateProviderEvidence(
        provider,
        context.allowedCitationIds,
        subjectiveRubric.map((dimension) => dimension.key),
        input.citationsPerDimension ?? 1,
      );
      validateProviderFlags(provider, input.approvedFlags ?? []);
      validateProviderAnchors({
        response: provider,
        anchors: input.anchors,
        requiredDimensionKeys: subjectiveRubric.map((dimension) => dimension.key),
      });
    }

    const composed = composeArtifactGrade({
      deterministic: deterministicDimensions,
      subjective: provider?.rubricScores ?? {},
      dimensions: input.rubric.map((dimension) => ({
        key: dimension.key,
        max: dimension.max,
      })),
    });
    const baseGrade: PersistedAssessmentGrade | null =
      input.purpose === "graded"
        ? {
            ...composed,
            confidence: provider?.confidence ?? 1,
            feedbackMd:
              provider?.feedbackMd ??
              "Deterministic checks were evaluated. No judgment-model call was required.",
            flags: provider?.flags ?? [],
          }
        : null;
    const grade = baseGrade ? applyGradePolicy(baseGrade, input) : null;

    await deps.persistence.complete({
      evaluationKey: input.evaluationKey,
      claimToken: claim.claimToken,
      purpose: input.purpose,
      objective,
      provider: provider ? persistableProviderResponse(provider) : null,
      grade,
      hashes: input.hashes,
    });
    return {
      kind: "completed",
      objective,
      grade,
      providerCalled: provider !== null,
    };
  } catch (error) {
    const failure = safeFailure(error);
    await deps.persistence
      .fail({
        evaluationKey: input.evaluationKey,
        claimToken: claim.claimToken,
        errorCode: failure.code,
      })
      .catch(() => undefined);
    throw failure;
  }
}
