import { randomUUID } from "node:crypto";
import { Prisma, SubmissionStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { structuredCall, gradingModel, type StructuredCaller } from "@/lib/ai/client";
import { extractSubmissionFiles, type ExtractDeps } from "@/lib/ai/extract";
import {
  assembleGradingContext,
  applyPolicyFlags,
  gradeResponseSchemaFor,
  reviewThresholdFrom,
  type GradeResponse,
  type LinkCheckResult,
} from "@/lib/ai/grading";
import {
  assessmentProviderResponseSchemaFor,
  type AssessmentProviderData,
} from "@/lib/ai/assessment-grading";
import {
  assertApprovedAssessmentProcessor,
  parseAssessmentRuntimeConfig,
  AssessmentRuntimeConfigError,
} from "@/lib/assessments/runtime-config";
import { assertAssessmentEvaluatorChecksum } from "@/lib/assessments/assessment-anchors";
import {
  applyS4AppGradingDecision,
  buildS4AppGradingDecision,
  parseS4AppInspectionPolicy,
  sha256Json,
  s4InspectionEvidenceSummary,
  type S4AcceptanceStatus,
  type S4AppGradingDecision,
  type S4AppInspectionArtifact,
} from "@/lib/assessments/s4-app-policy";
import {
  runAssessmentEvaluation,
  type AssessmentEvaluationPersistence,
  type AssessmentProviderResponse,
  type PersistedAssessmentGrade,
} from "@/lib/assessments/run-evaluation";
import { buildProviderAuditMetadata } from "@/lib/assessments/provider-audit-metadata";
import {
  claimAssessmentResult,
  STALE_ASSESSMENT_CLAIM_STATUSES,
  type AssessmentClaimStore,
  type AssessmentClaimRecord,
} from "@/lib/assessments/claim-result";
import {
  prepareWorkflowEvidenceForProvider,
  readCommittedEvidenceVersion,
  type CommittedEvidenceReceipt,
  type PreparedWorkflowEvidence,
} from "@/lib/evidence/prepare-provider-evidence";
import { authorizeGradingEvidence } from "@/lib/evidence/grading-authorization";
import {
  buildRedactedRepairFeedback,
  scanSensitiveText,
  type SensitiveFinding,
} from "@/lib/evidence/sensitive-data";
import type { OcrEvidence } from "@/lib/evidence/workflow-preflight";
import { findNearDuplicates } from "@/lib/ai/near-dup";
import type { Embedder } from "@/lib/ai/embeddings";
import { parseSubmissionSchema } from "@/lib/submission-schema";
import { approvedAiProcessorsForAssessmentRelease } from "@/lib/assessment-policies";
import {
  completeWorkflowFixtureEvaluation,
  evaluateSession5WorkflowFixtures,
  workflowFixtureRuntimeConfig,
  workflowFunctionalityDimension,
  WorkflowFixtureEvaluationError,
  type WorkflowFixtureEvaluation,
} from "@/lib/assessments/workflow-fixture-evaluation";
import { probeUrl, type LookupFn } from "@/lib/net/safe-fetch";
import { syncGalleryItem } from "@/lib/galleries";
import { rangedRead } from "@/lib/s3";
import { enqueueScreenshotCapture } from "@/lib/queue";
import {
  inspectS4App as inspectS4AppDefault,
  type S4AppInspectionDeps,
  type S4AppInspectionInput,
} from "./s4-app-inspection";

// The grade.submission consumer. All external effects are injectable so
// tests drive the exact production code path with a mocked model/S3/network.
//
// Failure policy (docs/DECISIONS.md): on model double-failure the handler
// throws → pg-boss retries with exponential backoff (retryLimit 4) → final
// failure dead-letters to 'grade.submission.dead'. The submission's status
// deliberately STAYS 'grading' — the dead-letter row carries it, and an admin
// re-enqueues from POST /api/admin/regrade (U16 surfaces the dead letters).

// ---------------------------------------------------------------------------
// Cost estimation (USD per token, current published prices)
// ---------------------------------------------------------------------------

const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};
const DEFAULT_PRICE = { input: 3, output: 15 };

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const price = PRICES_PER_MTOK[model] ?? DEFAULT_PRICE;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface GradeJobDeps {
  prisma?: PrismaClient;
  /** Model seam — defaults to the real Anthropic structuredCall. */
  model?: StructuredCaller;
  /** S3 seam for file extraction. */
  s3?: ExtractDeps;
  /** Network seams forwarded to safeFetch for link liveness. */
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  /** Version-bound S4 live-app inspection seam; defaults to the pinned renderer. */
  inspectS4App?: (
    input: S4AppInspectionInput,
    deps: S4AppInspectionDeps,
  ) => Promise<S4AppInspectionArtifact>;
  /** Embedding seam for near-dup (null disables; undefined = env-driven). */
  embed?: Embedder | null;
  /** U11 seam: screenshot enqueue after grading an app-type submission. */
  enqueueScreenshot?: (submissionId: string) => Promise<string | null>;
  /** Exact immutable evidence read. Production must bind S3 key + VersionId. */
  readEvidence?: (receipt: CommittedEvidenceReceipt) => Promise<Uint8Array>;
  /** Local OCR/decode seam. Absence fails closed for image/PDF evidence. */
  ocrEvidence?: OcrEvidence;
  /** Provider identity checked against the bound assessment release. */
  assessmentProviderId?: string;
  now?: () => Date;
  claimToken?: () => string;
}

type VersionedSubmission = {
  id: string;
  assignmentId: string;
  userId: string;
  version: number;
  attempt: number;
  ownerKind: "individual" | "team" | null;
  ownerId: string | null;
  fields: Prisma.JsonValue;
  contentHash: string;
  assessmentVersionId: string | null;
  assignment: {
    title: string;
    contractMode: "legacy" | "versioned";
  };
  assessmentVersion: {
      id: string;
      purpose: "graded" | "formative";
      publicSchema: Prisma.JsonValue;
      rubric: Prisma.JsonValue;
      scoringPolicy: Prisma.JsonValue;
      checksumSha256: string;
      evaluatorConfig: {
        config: Prisma.JsonValue;
        answerKey: Prisma.JsonValue | null;
        anchors: Prisma.JsonValue | null;
        normalization: Prisma.JsonValue | null;
        checksumSha256: string;
      } | null;
      datasetRelease: {
        checksumSha256: string;
        approvedAiProcessors: string[];
      } | null;
    } | null;
  evidence: Array<{
    id: string;
    fieldKey: string;
    fileRole: string;
    s3Key: string;
    s3VersionId: string;
    sha256: string;
    byteCount: number;
    inspectedMimeType: string;
    scanState: string;
  }>;
};

type PreparedVersionedEvidence = PreparedWorkflowEvidence & {
  authorizedEvidenceIds: string[];
};

function assessmentEvaluationKey(submission: VersionedSubmission): string {
  return [
    "assessment",
    submission.id,
    submission.assessmentVersionId,
    `v${submission.version}`,
    `a${submission.attempt}`,
  ].join(":");
}

function approvedProcessorsFor(submission: VersionedSubmission): string[] {
  const version = submission.assessmentVersion;
  if (!version) return [];
  return approvedAiProcessorsForAssessmentRelease({
    scoringPolicy: version.scoringPolicy,
    datasetApprovedAiProcessors: version.datasetRelease?.approvedAiProcessors,
  });
}

function toClaimRecord(value: {
  id: string;
  evaluationKey: string;
  status: string;
  claimToken: string | null;
  claimedAt: Date | null;
}): AssessmentClaimRecord {
  return value as AssessmentClaimRecord;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractHttpUrls(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(
    (value.match(/https?:\/\/[^\s<>"'`]+/gi) ?? []).map((url) =>
      url.replace(/[),.;!?]+$/, ""),
    ),
  )];
}

const S4_SOURCE_CONTEXT_FIELDS = [
  "selectedProduct",
  "benchmarkSourceLinks",
  "selectionRationale",
  "industryCompanyApplication",
  "featureContract",
  "firstPrompt",
  "nonAffiliationConfirmation",
] as const;

function completeS4SourceContext(fields: Record<string, unknown>): boolean {
  return S4_SOURCE_CONTEXT_FIELDS.every(
    (key) => typeof fields[key] === "string" && fields[key].trim().length > 0,
  );
}

type S4ContextScreening = {
  evidence: { id: string; text: string }[];
  findings: SensitiveFinding[];
  repairFeedback: string | null;
};

function hashOnlySourceLinks(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"'`]+/gi, (raw) => {
    const url = raw.replace(/[),.;!?]+$/, "");
    try {
      const parsed = new URL(url);
      return `[public source host=${parsed.hostname.toLowerCase()} urlSha256=${sha256Json(parsed.toString())}]`;
    } catch {
      return `[invalid public source urlSha256=${sha256Json(url)}]`;
    }
  });
}

function decodedUrlForSafetyScan(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return decodeURIComponent(value).slice(0, 100_000);
  } catch {
    return value.slice(0, 100_000);
  }
}

export function prepareS4ContextScreening(args: {
  sourceFields: Record<string, unknown>;
  currentFields: Record<string, unknown>;
  currentJudgmentFieldIds: readonly string[];
  appUrlField: string;
  repositoryField: string;
}): S4ContextScreening {
  const evidence: { id: string; text: string }[] = [];
  const findings: SensitiveFinding[] = [];
  for (const key of S4_SOURCE_CONTEXT_FIELDS) {
    const value = args.sourceFields[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const id = `s4-source-context:${key}`;
    findings.push(
      ...scanSensitiveText(
        key === "benchmarkSourceLinks"
          ? (decodedUrlForSafetyScan(value) ?? value)
          : value,
        id,
      ),
    );
    evidence.push({
      id,
      text: key === "benchmarkSourceLinks" ? hashOnlySourceLinks(value) : value,
    });
  }
  for (const key of new Set(args.currentJudgmentFieldIds)) {
    const value = args.currentFields[key];
    if (typeof value === "string" && value.trim()) {
      findings.push(...scanSensitiveText(value, `s4-current:${key}`));
    }
  }
  for (const key of [args.appUrlField, args.repositoryField]) {
    const decoded = decodedUrlForSafetyScan(args.currentFields[key]);
    if (decoded) findings.push(...scanSensitiveText(decoded, `s4-current:${key}`));
  }
  return {
    evidence: findings.length === 0 ? evidence : [],
    findings,
    repairFeedback: findings.length > 0 ? buildRedactedRepairFeedback(findings) : null,
  };
}

function previousS4Inspection(
  value: unknown,
  expected: {
    assessmentVersionId: string;
    policySha256: string;
    currentSubmissionVersion: number;
  },
): {
  artifactSha256: string;
  acceptance: Record<string, S4AcceptanceStatus>;
} | null {
  const deterministic = jsonRecord(value);
  const artifact = jsonRecord(deterministic.appInspection);
  const binding = jsonRecord(artifact.binding);
  const acceptance = jsonRecord(artifact.acceptance);
  const statuses = jsonRecord(acceptance.statuses);
  const { artifactSha256, ...artifactPayload } = artifact;
  if (
    artifact.schemaVersion !== 1 ||
    artifact.policyId !== "s4-artifact-inspection-v1" ||
    artifact.policySha256 !== expected.policySha256 ||
    typeof artifactSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifactSha256) ||
    sha256Json(artifactPayload) !== artifactSha256 ||
    binding.assessmentVersionId !== expected.assessmentVersionId ||
    typeof binding.submissionVersion !== "number" ||
    binding.submissionVersion >= expected.currentSubmissionVersion
  ) {
    return null;
  }
  const normalized: Record<string, S4AcceptanceStatus> = {};
  for (const [id, status] of Object.entries(statuses)) {
    if (
      /^AT-(?:0[1-9]|1[0-8])$/.test(id) &&
      (status === "PASS" || status === "FAIL" || status === "PARTIAL" || status === "NOT RUN")
    ) {
      normalized[id] = status;
    }
  }
  return { artifactSha256, acceptance: normalized };
}

function assertS4DecisionFlagsApproved(
  decision: S4AppGradingDecision,
  approvedFlags: readonly string[],
): void {
  const approved = new Set(approvedFlags);
  if (decision.flags.some((flag) => !approved.has(flag))) {
    throw new AssessmentRuntimeConfigError(
      "s4-policy-flag-unapproved",
      "The frozen S4 inspection policy emitted a flag outside the evaluator allowlist",
    );
  }
}

export async function prepareVersionedEvidence(
  submission: VersionedSubmission,
  deps: GradeJobDeps,
): Promise<PreparedVersionedEvidence | null> {
  const authorization = authorizeGradingEvidence({
    publicSchema: submission.assessmentVersion?.publicSchema,
    submissionVersion: submission.version,
    fields: submission.fields,
    evidence: submission.evidence,
  });
  if (!authorization.ok) {
    return {
      safeForProvider: false,
      findings: [],
      quarantinedEvidenceIds: authorization.quarantinedEvidenceIds,
      repairFeedback: authorization.repairFeedback,
      blueprintSummary: null,
      blueprintFailureCode: null,
      attachments: [],
      textEvidence: [],
      authorizedEvidenceIds: [],
    };
  }
  if (authorization.receipts.length === 0) return null;
  const prepared = await prepareWorkflowEvidenceForProvider({
    receipts: authorization.receipts,
    readExact: deps.readEvidence,
    ocr: deps.ocrEvidence,
  });
  return {
    ...prepared,
    authorizedEvidenceIds: authorization.authorizedEvidenceIds,
  };
}

async function handleVersionedAssessmentSubmission(
  submission: VersionedSubmission,
  deps: GradeJobDeps,
  db: PrismaClient,
): Promise<void> {
  const version = submission.assessmentVersion;
  if (
    !version ||
    !submission.assessmentVersionId ||
    !submission.ownerKind ||
    !submission.ownerId ||
    !version.evaluatorConfig
  ) {
    throw new AssessmentRuntimeConfigError(
      "version-binding-missing",
      "Versioned grading requires the submission-bound assessment and evaluator",
    );
  }

  assertAssessmentEvaluatorChecksum({
    config: version.evaluatorConfig.config,
    answerKey: version.evaluatorConfig.answerKey,
    anchors: version.evaluatorConfig.anchors,
    normalization: version.evaluatorConfig.normalization,
    expectedSha256: version.evaluatorConfig.checksumSha256,
  });
  const runtime = parseAssessmentRuntimeConfig({
    rubric: version.rubric,
    evaluatorConfig: version.evaluatorConfig.config,
    answerKey: version.evaluatorConfig.answerKey,
    anchors: version.evaluatorConfig.anchors,
  });
  const preparedEvidence = await prepareVersionedEvidence(submission, deps);
  const evaluatorConfig = jsonRecord(version.evaluatorConfig.config);
  const rawS4Policy = evaluatorConfig.appInspectionPolicy;
  const s4Policy = rawS4Policy === undefined
    ? null
    : parseS4AppInspectionPolicy(rawS4Policy);
  if (rawS4Policy !== undefined && !s4Policy) {
    throw new AssessmentRuntimeConfigError(
      "s4-inspection-policy-invalid",
      "The submission-bound S4 app-inspection policy is malformed",
    );
  }
  const providerEnabled = runtime.providerMode === "auto";
  const evaluationKey = assessmentEvaluationKey(submission);
  const hashes = {
    assessment: version.checksumSha256,
    dataset: version.datasetRelease?.checksumSha256 ?? null,
    evaluator: version.evaluatorConfig.checksumSha256,
  };
  const now = deps.now ?? (() => new Date());
  const newClaimToken = deps.claimToken ?? randomUUID;
  let resultId: string | null = null;
  let appInspection: S4AppInspectionArtifact | null = null;
  let appInspectionDecision: S4AppGradingDecision | null = null;
  let appInspectionSummary: { id: string; text: string } | null = null;
  let appContextScreening: S4ContextScreening = {
    evidence: [],
    findings: [],
    repairFeedback: null,
  };
  let appSourceContextMissing = false;
  const workflowConfig = workflowFixtureRuntimeConfig(version.evaluatorConfig.config);
  let workflowEvaluation: WorkflowFixtureEvaluation | null = null;
  let workflowFixturePreflightFailure: {
    errorCode: string;
    feedback: string;
    quarantinedEvidenceIds: string[];
  } | null = null;

  if (s4Policy) {
    const fields = jsonRecord(submission.fields);
    const sourceSubmission = await db.submission.findFirst({
      where: {
        assessmentVersionId: s4Policy.sourceContext.assessmentVersionId,
        ownerKind: submission.ownerKind,
        ownerId: submission.ownerId,
        status: {
          in: [
            SubmissionStatus.submitted,
            SubmissionStatus.grading,
            SubmissionStatus.graded,
            SubmissionStatus.finalised,
          ],
        },
      },
      orderBy: [{ version: "desc" }, { attempt: "desc" }],
      select: {
        id: true,
        assessmentVersionId: true,
        contentHash: true,
        fields: true,
      },
    });
    const sourceFields = jsonRecord(sourceSubmission?.fields);
    appSourceContextMissing =
      sourceSubmission === null ||
      sourceSubmission.assessmentVersionId !== s4Policy.sourceContext.assessmentVersionId ||
      !completeS4SourceContext(sourceFields);
    const previousResult = submission.version >= 2
      ? await db.assessmentResult.findFirst({
          where: {
            assessmentVersionId: version.id,
            ownerKind: submission.ownerKind,
            ownerId: submission.ownerId,
            version: { lt: submission.version },
            status: "completed",
          },
          orderBy: [{ version: "desc" }, { attempt: "desc" }],
          select: { deterministicResult: true },
        })
      : null;
    const previous = previousS4Inspection(previousResult?.deterministicResult, {
      assessmentVersionId: version.id,
      policySha256: sha256Json(s4Policy),
      currentSubmissionVersion: submission.version,
    });
    appContextScreening = prepareS4ContextScreening({
      sourceFields,
      currentFields: fields,
      currentJudgmentFieldIds: runtime.judgmentFieldIds,
      appUrlField: s4Policy.appUrlField,
      repositoryField: s4Policy.repository.field,
    });
    const cleanEvidenceIds = new Set(
      preparedEvidence?.safeForProvider ? preparedEvidence.authorizedEvidenceIds : [],
    );
    const screenshotReceipt = [...submission.evidence]
      .filter(
        (receipt) =>
          cleanEvidenceIds.has(receipt.id) &&
          receipt.scanState === "clean" &&
          /^image\/(?:png|jpeg|webp)$/i.test(receipt.inspectedMimeType),
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    const inspect = deps.inspectS4App ?? inspectS4AppDefault;
    appInspection = await inspect(
      {
        submissionId: submission.id,
        assessmentVersionId: version.id,
        assessmentSha256: hashes.assessment,
        evaluatorSha256: hashes.evaluator,
        submissionVersion: submission.version,
        attempt: submission.attempt,
        appUrl:
          typeof fields[s4Policy.appUrlField] === "string"
            ? String(fields[s4Policy.appUrlField])
            : "",
        githubUrl:
          typeof fields[s4Policy.repository.field] === "string"
            ? String(fields[s4Policy.repository.field])
            : null,
        acceptanceTestLog: fields.acceptanceTestLog,
        cleanEvidenceCount: cleanEvidenceIds.size,
        screenshotReceiptSha256: screenshotReceipt?.sha256 ?? null,
        sourceUrls: extractHttpUrls(sourceFields[s4Policy.sourceContext.sourceUrlField]),
        sourceContext: sourceSubmission
          ? {
              submissionId: sourceSubmission.id,
              assessmentVersionId: sourceSubmission.assessmentVersionId!,
              contentHash: sourceSubmission.contentHash ?? sha256Json(sourceFields),
            }
          : null,
        previousArtifactSha256: previous?.artifactSha256 ?? null,
      },
      {
        policy: s4Policy,
        now,
        fetchImpl: deps.fetchImpl,
        lookup: deps.lookup,
      },
    );
    appInspectionDecision = buildS4AppGradingDecision({
      artifact: appInspection,
      fields: { ...sourceFields, ...fields },
      unsafeEvidence:
        (preparedEvidence !== null && !preparedEvidence.safeForProvider) ||
        appContextScreening.findings.length > 0,
      previousAcceptance: previous?.acceptance ?? {},
    });
    assertS4DecisionFlagsApproved(appInspectionDecision, runtime.approvedFlags);
    appInspectionSummary = s4InspectionEvidenceSummary(
      appInspection,
      appInspectionDecision,
    );
  }

  if (workflowConfig && preparedEvidence?.safeForProvider) {
    const authorized = new Set(preparedEvidence.authorizedEvidenceIds);
    const runLogReceipts = submission.evidence.filter(
      (receipt) =>
        authorized.has(receipt.id) &&
        receipt.fieldKey === workflowConfig.runLogRole &&
        receipt.fileRole === workflowConfig.runLogRole &&
        receipt.scanState === "clean",
    );
    if (runLogReceipts.length !== 1) {
      workflowFixturePreflightFailure = {
        errorCode: "workflow-run-log-missing",
        feedback:
          "Select and commit exactly one clean run log for the five authored workflow fixtures.",
        quarantinedEvidenceIds: [],
      };
    } else {
      const receipt = runLogReceipts[0]!;
      let runLogBytes: Uint8Array;
      try {
        runLogBytes = await (deps.readEvidence ?? readCommittedEvidenceVersion)(receipt);
      } catch {
        throw new AssessmentRuntimeConfigError(
          "workflow-run-log-read-failed",
          "The immutable workflow run-log object could not be read for deterministic evaluation",
        );
      }
      try {
        workflowEvaluation = evaluateSession5WorkflowFixtures({
          packId: jsonRecord(submission.fields)[workflowConfig.packField],
          runLogBytes,
          answerKey: version.evaluatorConfig.answerKey,
          binding: {
            submissionId: submission.id,
            assessmentVersionId: version.id,
            ownerKind: submission.ownerKind,
            ownerId: submission.ownerId,
            version: submission.version,
            attempt: submission.attempt,
            contentHash: submission.contentHash,
            assessmentSha256: hashes.assessment,
            evaluatorSha256: hashes.evaluator,
            runLogEvidenceId: receipt.id,
            runLogS3VersionId: receipt.s3VersionId,
            runLogSha256: receipt.sha256.toLowerCase(),
            runLogByteCount: receipt.byteCount,
          },
        });
      } catch (error) {
        if (
          error instanceof WorkflowFixtureEvaluationError &&
          error.disposition === "repair"
        ) {
          workflowFixturePreflightFailure = {
            errorCode: error.code,
            feedback: error.message,
            quarantinedEvidenceIds: [],
          };
        } else {
          throw error;
        }
      }
    }
  } else if (workflowConfig && preparedEvidence === null) {
    workflowFixturePreflightFailure = {
      errorCode: "workflow-run-log-missing",
      feedback:
        "Select and commit exactly one clean run log for the five authored workflow fixtures.",
      quarantinedEvidenceIds: [],
    };
  }

  const claimStore: AssessmentClaimStore = {
    async create(input) {
      const created = await db.assessmentResult.create({
        data: {
          evaluationKey: input.evaluationKey,
          submissionId: submission.id,
          assessmentVersionId: version.id,
          ownerKind: submission.ownerKind!,
          ownerId: submission.ownerId!,
          version: submission.version,
          attempt: submission.attempt,
          purpose: version.purpose,
          status: "claimed",
          claimToken: input.claimToken,
          claimedAt: input.claimedAt,
          assessmentHash: hashes.assessment,
          datasetHash: hashes.dataset,
          evaluatorHash: hashes.evaluator,
        },
        select: {
          id: true,
          evaluationKey: true,
          status: true,
          claimToken: true,
          claimedAt: true,
        },
      });
      return toClaimRecord(created);
    },
    async find(key) {
      const found = await db.assessmentResult.findUnique({
        where: { evaluationKey: key },
        select: {
          id: true,
          evaluationKey: true,
          status: true,
          claimToken: true,
          claimedAt: true,
        },
      });
      return found ? toClaimRecord(found) : null;
    },
    async reclaim(input) {
      const changed = await db.assessmentResult.updateMany({
        where: {
          evaluationKey: input.evaluationKey,
          claimToken: input.expectedClaimToken,
          OR: [
            { status: { in: ["pending", "failed"] } },
            {
              status: { in: [...STALE_ASSESSMENT_CLAIM_STATUSES] },
              claimedAt: { lt: input.staleBefore },
            },
          ],
        },
        // Retain any checksum-bound deterministic snapshot until the new
        // claimant successfully persists its recomputed replacement.
        data: {
          status: "claimed",
          claimToken: input.claimToken,
          claimedAt: input.claimedAt,
          errorCode: null,
        },
      });
      if (changed.count !== 1) return null;
      const reclaimed = await db.assessmentResult.findUniqueOrThrow({
        where: { evaluationKey: input.evaluationKey },
        select: {
          id: true,
          evaluationKey: true,
          status: true,
          claimToken: true,
          claimedAt: true,
        },
      });
      return toClaimRecord(reclaimed);
    },
    isUniqueConflict(error) {
      return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    },
  };

  const persistence: AssessmentEvaluationPersistence = {
    async claim() {
      const outcome = await claimAssessmentResult(
        {
          evaluationKey,
          claimToken: newClaimToken(),
          now: now(),
          staleAfterMs: 15 * 60_000,
        },
        claimStore,
      );
      resultId = outcome.resultId;
      if (outcome.kind === "claimed") {
        return { kind: "claimed", claimToken: outcome.claimToken };
      }
      if (outcome.kind === "completed") {
        return { kind: "completed", resultId: outcome.resultId };
      }
      return { kind: "busy", resultId: outcome.resultId };
    },
    async persistDeterministic(input) {
      const changed = await db.assessmentResult.updateMany({
        where: {
          evaluationKey: input.evaluationKey,
          claimToken: input.claimToken,
          status: "claimed",
        },
        data: {
          status: "deterministic_complete",
          deterministicResult: {
            objective: input.objective,
            dimensions: input.deterministicDimensions,
            ...(workflowEvaluation ? { workflowEvaluation } : {}),
            ...(appInspection
              ? {
                  appInspection,
                  appInspectionDecision,
                }
              : {}),
          } as unknown as Prisma.InputJsonValue,
          assessmentHash: input.hashes.assessment,
          datasetHash: input.hashes.dataset,
          evaluatorHash: input.hashes.evaluator,
        },
      });
      if (changed.count !== 1) throw new Error("Assessment result claim was lost");
    },
    async markProviderPending(input) {
      const changed = await db.assessmentResult.updateMany({
        where: {
          evaluationKey: input.evaluationKey,
          claimToken: input.claimToken,
          status: "deterministic_complete",
        },
        data: { status: "provider_pending" },
      });
      if (changed.count !== 1) throw new Error("Assessment provider claim was lost");
    },
    async requireRepair(input) {
      if (!resultId) throw new Error("Assessment result id is unavailable");
      await db.$transaction(async (tx) => {
        const changed = await tx.assessmentResult.updateMany({
          where: {
            id: resultId!,
            claimToken: input.claimToken,
            status: "deterministic_complete",
          },
          data: {
            status: "repair_required",
            structuredFeedback: {
              feedbackMd: input.feedback,
              quarantinedEvidenceIds: input.quarantinedEvidenceIds,
            } as unknown as Prisma.InputJsonValue,
            errorCode: input.errorCode,
            scoreable: false,
            publishable: false,
            completedAt: now(),
          },
        });
        if (changed.count !== 1) throw new Error("Assessment repair claim was lost");
        if (input.quarantinedEvidenceIds.length > 0) {
          await tx.submissionEvidence.updateMany({
            where: {
              id: { in: input.quarantinedEvidenceIds },
              submissionId: submission.id,
              scanState: { not: "deleted" },
            },
            data: {
              scanState: "quarantined",
              quarantineReasonCode: input.errorCode,
            },
          });
        }
        await tx.gradeHold.create({
          data: {
            submissionId: submission.id,
            assessmentResultId: resultId!,
            kind: "repair",
            code: input.errorCode,
            reason: input.feedback,
            evidence: {
              quarantinedEvidenceIds: input.quarantinedEvidenceIds,
            } as unknown as Prisma.InputJsonValue,
            createdBy: "system:grading-worker",
          },
        });
        await tx.submission.update({
          where: { id: submission.id },
          data: { status: "graded" },
        });
        await tx.notification.create({
          data: {
            userId: submission.userId,
            kind: "submission-repair-required",
            title: `Your ${submission.assignment.title} evidence needs repair`,
            body: input.feedback,
          },
        });
      });
    },
    async complete(input) {
      if (!resultId) throw new Error("Assessment result id is unavailable");
      const completedWorkflowEvaluation = workflowEvaluation
        ? input.grade && input.provider
          ? completeWorkflowFixtureEvaluation({
              evaluation: workflowEvaluation,
              rubricScores: input.grade.rubricScores,
              citations: input.provider.citations,
              confidence: input.grade.confidence,
              flags: input.grade.flags,
            })
          : (() => {
              throw new AssessmentRuntimeConfigError(
                "workflow-provider-result-missing",
                "The final workflow receipt requires provider-cited usefulness and ownership evidence",
              );
            })()
        : null;
      const thresholdConfig = await db.configKV.findUnique({ where: { key: "grading_defaults" } });
      const threshold = reviewThresholdFrom(thresholdConfig?.value);
      await db.$transaction(async (tx) => {
        const changed = await tx.assessmentResult.updateMany({
          where: {
            id: resultId!,
            claimToken: input.claimToken,
            status: { in: ["deterministic_complete", "provider_pending"] },
          },
          data: {
            status: "completed",
            providerResult: input.provider
              ? ({
                  rubricScores: input.provider.rubricScores,
                  feedbackMd: input.provider.feedbackMd,
                  confidence: input.provider.confidence,
                  flags: input.provider.flags,
                  usage: input.provider.usage,
                  model: input.provider.model,
                } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            structuredFeedback: input.grade
              ? ({
                  rubricScores: input.grade.rubricScores,
                  total: input.grade.total,
                  feedbackMd: input.grade.feedbackMd,
                  confidence: input.grade.confidence,
                  flags: input.grade.flags,
                  conflicts: input.grade.conflicts,
                  ...(completedWorkflowEvaluation
                    ? { workflowEvaluation: completedWorkflowEvaluation }
                    : {}),
                } as unknown as Prisma.InputJsonValue)
              : input.provider
                ? ({ feedbackMd: input.provider.feedbackMd } as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            citations: input.provider
              ? (input.provider.citations as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            assessmentHash: input.hashes.assessment,
            datasetHash: input.hashes.dataset,
            evaluatorHash: input.hashes.evaluator,
            // Completion is still provisional. Only the audited instructor
            // finalisation transition may make a graded result scoreable.
            scoreable: false,
            publishable: false,
            errorCode: null,
            completedAt: now(),
          },
        });
        if (changed.count !== 1) throw new Error("Assessment completion claim was lost");

        let gradeId: string | null = null;
        if (input.grade) {
          const grade = await tx.grade.create({
            data: {
              submissionId: submission.id,
              rubricScores: input.grade.rubricScores as unknown as Prisma.InputJsonValue,
              total: input.grade.total,
              confidence: input.grade.confidence,
              feedbackMd: input.grade.feedbackMd,
              flags: input.grade.flags,
              gradedBy: "ai",
              provisional: true,
              promptLog: input.provider
                ? (buildProviderAuditMetadata({
                    hashes: input.hashes,
                    model: input.provider.model,
                    usage: input.provider.usage,
                    citations: input.provider.citations,
                  }) as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
            select: { id: true },
          });
          gradeId = grade.id;
          const holds: Prisma.GradeHoldCreateManyInput[] = [];
          if (input.grade.confidence < threshold) {
            holds.push({
              submissionId: submission.id,
              gradeId,
              assessmentResultId: resultId!,
              kind: "low_confidence",
              code: "low-confidence",
              reason: `Confidence ${input.grade.confidence} is below the configured review threshold.`,
              createdBy: "system:grading-worker",
            });
          }
          for (const flag of input.grade.flags) {
            holds.push({
              submissionId: submission.id,
              gradeId,
              assessmentResultId: resultId!,
              kind: "flag",
              code: flag,
              reason: `Policy flag requires instructor review: ${flag}.`,
              createdBy: "system:grading-worker",
            });
          }
          if (holds.length > 0) await tx.gradeHold.createMany({ data: holds });
        }

        if (input.provider) {
          const model = input.provider.model || gradingModel();
          await tx.costLog.create({
            data: {
              feature: "assessment-grading",
              provider: runtime.approvedProcessor ?? "unknown",
              model,
              tokensIn: input.provider.usage.inputTokens,
              tokensOut: input.provider.usage.outputTokens,
              costUsd: estimateCostUsd(model, input.provider.usage),
              refType: "submission",
              refId: submission.id,
            },
          });
        }
        await tx.submission.update({
          where: { id: submission.id },
          data: { status: "graded" },
        });
        await tx.notification.create({
          data: {
            userId: submission.userId,
            kind: input.purpose === "graded" ? "grade-ready" : "feedback-ready",
            title:
              input.purpose === "graded"
                ? `Your ${submission.assignment.title} provisional grade is ready`
                : `Your ${submission.assignment.title} feedback is ready`,
            body:
              input.purpose === "graded"
                ? "Feedback and a provisional grade are ready for instructor finalisation."
                : "Formative feedback is ready. It does not create a weighted grade.",
          },
        });
        void gradeId;
      });
    },
    async fail(input) {
      await db.assessmentResult.updateMany({
        where: { evaluationKey: input.evaluationKey, claimToken: input.claimToken },
        data: {
          status: "failed",
          errorCode: input.errorCode,
          retryCount: { increment: 1 },
        },
      });
    },
  };

  const providerWorkRequired =
    providerEnabled &&
    (runtime.judgmentFieldIds.length > 0 ||
      (preparedEvidence?.attachments.length ?? 0) > 0 ||
      (preparedEvidence?.textEvidence.length ?? 0) > 0 ||
      appContextScreening.evidence.length > 0 ||
      appInspectionSummary !== null);

  const s4RepairFeedback = [
    preparedEvidence?.repairFeedback,
    appContextScreening.repairFeedback,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const preflightFailure =
    appInspectionDecision?.stopAutomatedGrading
      ? {
          errorCode: "privacy-security-hold",
          feedback:
            s4RepairFeedback ||
            "Evidence failed the local privacy/security check. Upload a clean replacement.",
          quarantinedEvidenceIds: preparedEvidence?.quarantinedEvidenceIds ?? [],
        }
      : preparedEvidence && !preparedEvidence.safeForProvider
        ? {
            errorCode: "unsafe-evidence",
            feedback:
              preparedEvidence.repairFeedback ??
              "Evidence could not be safely inspected. Upload a clean replacement.",
            quarantinedEvidenceIds: preparedEvidence.quarantinedEvidenceIds,
          }
        : appSourceContextMissing
          ? {
              errorCode: "source-context-missing",
              feedback:
                "The required Session 4 product-and-first-prompt checkpoint could not be bound to this app submission. Resubmit after the checkpoint is restored.",
              quarantinedEvidenceIds: [],
            }
          : workflowFixturePreflightFailure ?? undefined;
  const screenedTextEvidence = [
    ...(providerEnabled && preparedEvidence?.safeForProvider
      ? preparedEvidence.textEvidence
      : []),
    ...(providerEnabled ? appContextScreening.evidence : []),
    ...(providerEnabled && appInspectionSummary ? [appInspectionSummary] : []),
  ];

  await runAssessmentEvaluation(
    {
      evaluationKey,
      submissionId: submission.id,
      assessmentTitle: submission.assignment.title,
      purpose: version.purpose,
      fields: (submission.fields ?? {}) as Record<string, unknown>,
      answerSpecs: runtime.answerSpecs,
      judgmentFieldIds: providerEnabled ? runtime.judgmentFieldIds : [],
      trustedAggregateSummaries: runtime.trustedAggregateSummaries,
      screenedTextEvidence,
      providerAttachments: providerEnabled && preparedEvidence?.safeForProvider
        ? preparedEvidence.attachments
        : [],
      preflightFailure,
      rubric: runtime.rubric,
      approvedFlags: runtime.approvedFlags,
      citationsPerDimension: runtime.citationsPerDimension,
      objectiveConsistencyRules: runtime.objectiveConsistencyRules,
      anchors: runtime.anchors,
      gradePolicy:
        appInspectionDecision || workflowEvaluation
          ? (grade: PersistedAssessmentGrade) => {
              const inspected = appInspectionDecision
                ? applyS4AppGradingDecision(grade, appInspectionDecision)
                : grade;
              return workflowEvaluation
                ? {
                    ...inspected,
                    flags: [
                      ...new Set([...inspected.flags, ...workflowEvaluation.flags]),
                    ],
                  }
                : inspected;
            }
          : undefined,
      deterministicDimensions: workflowEvaluation
        ? { functionality: workflowFunctionalityDimension(workflowEvaluation) }
        : undefined,
      hashes,
    },
    {
      persistence,
      callProvider: async (request): Promise<AssessmentProviderResponse> => {
        const providerId = (deps.assessmentProviderId ?? "anthropic").toLowerCase();
        assertApprovedAssessmentProcessor({
          configuredProcessor: runtime.approvedProcessor,
          approvedProcessors: approvedProcessorsFor(submission),
          providerWorkRequired,
        });
        if (runtime.approvedProcessor !== providerId) {
          throw new AssessmentRuntimeConfigError(
            "processor-route-mismatch",
            `The configured processor does not match the active provider route`,
          );
        }
        const call = deps.model ?? (structuredCall as StructuredCaller);
        const response = await call<AssessmentProviderData>({
          system: request.system,
          user: request.user,
          schema: assessmentProviderResponseSchemaFor(request.rubric, {
            approvedFlags: runtime.approvedFlags,
            citationsPerDimension: runtime.citationsPerDimension,
            anchors: request.anchors,
          }),
          maxTokens: 2_048,
          temperature: 0,
          images: request.attachments.flatMap((attachment) =>
            attachment.kind === "image"
              ? [{ mediaType: attachment.mediaType, dataBase64: attachment.dataBase64 }]
              : [],
          ),
          pdfsBase64: request.attachments.flatMap((attachment) =>
            attachment.kind === "pdf" ? [attachment.dataBase64] : [],
          ),
        });
        return {
          ...response.data,
          usage: response.usage,
          model: response.model || gradingModel(),
          raw: response.raw,
        };
      },
    },
  );
}

async function checkLink(
  field: string,
  url: string,
  deps: GradeJobDeps,
): Promise<LinkCheckResult> {
  const opts = {
    timeoutMs: 8_000,
    fetchImpl: deps.fetchImpl,
    lookup: deps.lookup,
  };
  try {
    // Some hosts reject HEAD (405/403) — confirm with GET before failing.
    const res = await probeUrl(url, opts, (r) => !r.ok && r.status !== 404);
    return { field, url, ok: res.ok, status: res.status };
  } catch (err) {
    return {
      field,
      url,
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Grade one submission end-to-end. Throws only on model failure (so pg-boss
 * retries); every other problem degrades into flags on the grade.
 */
export async function handleGradeSubmission(
  submissionId: string,
  deps: GradeJobDeps = {},
): Promise<void> {
  const db = deps.prisma ?? defaultPrisma;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          assignmentType: true,
        },
      },
      assessmentVersion: {
        include: { evaluatorConfig: true, datasetRelease: true },
      },
      evidence: true,
    },
  });
  if (!submission) {
    console.warn(`[grading] submission ${submissionId} not found — skipping`);
    return;
  }
  // Status guard: fresh jobs arrive as 'submitted'; 'grading' is accepted so a
  // dead-lettered/stuck job can be re-run. Anything else is skipped.
  if (
    submission.status !== SubmissionStatus.submitted &&
    submission.status !== SubmissionStatus.grading
  ) {
    console.warn(
      `[grading] submission ${submissionId} is '${submission.status}' — skipping`,
    );
    return;
  }

  await db.submission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.grading },
  });

  if (submission.assignment.contractMode === "versioned") {
    if (!submission.contentHash) {
      throw new AssessmentRuntimeConfigError(
        "version-binding-missing",
        "Versioned grading requires an immutable submission content hash",
      );
    }
    await handleVersionedAssessmentSubmission(
      { ...submission, contentHash: submission.contentHash },
      deps,
      db,
    );
    return;
  }

  const type = submission.assignment.assignmentType;
  const schema = parseSubmissionSchema(type.submissionSchema);
  const fields = (submission.fields ?? {}) as Record<string, unknown>;

  // 1–3 run concurrently (independent):
  //   1. Near-duplicate detection (hash + embeddings; never throws).
  //   2. File extraction (gracefully degrades when S3 is unconfigured).
  //   3. Link liveness for every link-kind field value (via safeFetch —
  //      SSRF-guarded), each link probed concurrently; results keep the
  //      schema's field order.
  const linkFields = (schema?.fields ?? []).flatMap((def) => {
    if (def.kind !== "link") return [];
    const value = fields[def.key];
    if (typeof value !== "string" || value.trim() === "") return [];
    return [{ field: def.key, url: value }];
  });
  const [nearDup, extraction, linkChecks]: [
    Awaited<ReturnType<typeof findNearDuplicates>>,
    Awaited<ReturnType<typeof extractSubmissionFiles>>,
    LinkCheckResult[],
  ] = await Promise.all([
    findNearDuplicates(
      {
        id: submission.id,
        assignmentId: submission.assignmentId,
        userId: submission.userId,
        contentHash: submission.contentHash,
        fields,
      },
      { prisma: db, embed: deps.embed },
    ),
    extractSubmissionFiles(submission.files, deps.s3 ?? {}),
    Promise.all(linkFields.map((l) => checkLink(l.field, l.url, deps))),
  ]);
  const { extracted, failures: extractionFailures } = extraction;

  // 4. Assemble the anonymized, injection-hardened context.
  const context = assembleGradingContext({
    assignment: { title: submission.assignment.title, brief: submission.assignment.brief },
    type: { slug: type.slug, title: type.title, rubric: type.rubric },
    schema,
    fields,
    files: submission.files,
    extracted,
    linkChecks,
  });

  // 5. Vision: when the rubric scores a visual dimension (e.g. a presentation's
  // "Visual appeal"), attach the submitted PDF as a document block so Claude
  // grades from the actual slides — not just the extracted text. Best-effort:
  // a fetch failure falls back to text-only grading (extract already has text).
  const wantsVision = context.dimensions.some((d) => /visual/i.test(d.key));
  let pdfsBase64: string[] | undefined;
  let visionUser = context.user;
  if (wantsVision) {
    const read = deps.s3?.rangedRead ?? rangedRead;
    const pdfKeys = submission.files.filter((k) => /\.pdf$/i.test(k)).slice(0, 1);
    const encoded: string[] = [];
    for (const key of pdfKeys) {
      try {
        encoded.push(Buffer.from(await read(key, 16 * 1024 * 1024)).toString("base64"));
      } catch {
        // leave it — text-only grade, and applyPolicyFlags won't see a file here
      }
    }
    if (encoded.length > 0) {
      pdfsBase64 = encoded;
      visionUser +=
        "\n\nThe submission PDF is attached as a document. Assess the visual dimension(s) " +
        "(layout, hierarchy, imagery, overall design) from the actual pages, not from the text alone.";
    }
  }

  // 6. Model call (throws → pg-boss retry → dead letter; status stays 'grading').
  const call = deps.model ?? (structuredCall as StructuredCaller);
  const responseSchema = gradeResponseSchemaFor(context.dimensions.map((d) => d.key));
  const result = await call<GradeResponse>({
    system: context.system,
    user: visionUser,
    schema: responseSchema,
    maxTokens: 2048,
    temperature: 0,
    pdfsBase64,
  });

  // 6. Deterministic policy on top of the model grade.
  const finalGrade = applyPolicyFlags({
    grade: result.data,
    linkChecks,
    extractionFailures,
    nearDup: nearDup.nearDup,
  });

  const model = result.model || gradingModel();
  const costUsd = estimateCostUsd(model, result.usage);

  // 7. Persist everything in one transaction.
  await db.$transaction(async (tx) => {
    await tx.grade.create({
      data: {
        submissionId: submission.id,
        rubricScores: finalGrade.rubricScores as unknown as Prisma.InputJsonValue,
        total: finalGrade.total,
        confidence: finalGrade.confidence,
        feedbackMd: finalGrade.feedbackMd,
        flags: finalGrade.flags,
        gradedBy: "ai",
        provisional: true,
        promptLog: buildProviderAuditMetadata({
          model,
          usage: result.usage,
        }) as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.submission.update({
      where: { id: submission.id },
      data: { status: SubmissionStatus.graded },
    });
    await tx.notification.create({
      data: {
        userId: submission.userId,
        kind: "grade-ready",
        title: `Your ${type.title} grade is ready`,
        body: "Feedback and a provisional AI grade are ready — provisional until your instructor finalises it. Open it from your dashboard.",
      },
    });
    await tx.costLog.create({
      data: {
        feature: "grading",
        provider: "anthropic",
        model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsd,
        refType: "submission",
        refId: submission.id,
      },
    });
  });

  // 8. Gallery sync + screenshot capture, post-transaction and
  // best-effort: a gallery hiccup must never fail (or retry) a grading job.
  try {
    const item = await syncGalleryItem(submission.id, { prisma: db });
    if (item && item.submissionId === submission.id && type.slug === "app") {
      await (deps.enqueueScreenshot ?? enqueueScreenshotCapture)(submission.id);
    }
  } catch (err) {
    console.error(
      `[grading] gallery sync failed for ${submission.id} (grade persisted):`,
      err instanceof Error ? err.message : err,
    );
  }
}
