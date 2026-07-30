// Sessions 3–5 release reconciler.
//
// The loader owns only the stable IDs declared below. It verifies every local
// byte before upload, creates immutable contracts in child-before-publish
// order, creates only missing locked gates, and never touches learner rows.
//
//   pnpm setup:sessions3-5 -- --dry-run
//   pnpm setup:sessions3-5 -- --sessions=3
//   pnpm setup:sessions3-5 -- --sessions=3,4,5 --force-lock-gates
//   pnpm setup:sessions3-5 -- --sessions=3,4,5 --report-json

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseAssessmentPolicies } from "../lib/assessment-policies";
import {
  S4_APP_INSPECTION_POLICY_V1,
  parseS4AppInspectionPolicy,
} from "../lib/assessments/s4-app-policy";
import {
  assertApprovedAssessmentProcessor,
  parseAssessmentRuntimeConfig,
} from "../lib/assessments/runtime-config";
import {
  buildWorkflowEvaluatorAnswerKey,
  parseWorkflowEvaluatorAnswerKey,
  SESSION_5_WORKFLOW_PACKS,
} from "../lib/assessments/workflow-fixture-evaluation";
import { headObject, putObject, readObjectVersion, s3Configured } from "../lib/s3";
import { parseSubmissionSchema } from "../lib/submission-schema";
import {
  S3_DATA_ANCHORS,
  S3_VISUAL_ANCHORS,
  S4_APP_ANCHORS,
  S4_PRODUCT_PROMPT_ANCHORS,
  S5_FLOWCHART_ANCHORS,
  S5_WORKFLOW_ANCHORS,
} from "./course-data/sessions3-5-anchor-packs";
import {
  canonicalJson,
  canonicalJsonHash,
  loadPrivateCourseDataPackage,
  loadQuizImportPackage,
  type VerifiedPrivateCourseData,
  type VerifiedQuizImportPackage,
} from "./load/private-course-data";

type FieldKind = "link" | "text" | "writeup" | "file" | "files" | "number" | "singleChoice" | "multiChoice";

export type ReleaseField = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  [key: string]: unknown;
};

export type ReleaseObject = {
  key: string;
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  source: string;
  evaluatorOnly: boolean;
};

export type AssignmentTypeRelease = {
  id: string;
  slug: string;
  title: string;
  description: string;
  teamBased: boolean;
  galleryEligible: boolean;
  aiGraded: boolean;
  submissionSchema: { fields: ReleaseField[]; [key: string]: unknown };
  rubric: Record<string, unknown>;
  legacyFingerprints?: string[];
};

export type AssignmentRelease = {
  id: string;
  assignmentTypeSlug: string;
  title: string;
  brief: string;
  sessionNo: 3 | 4 | 5;
  weightBucket: string | null;
  assessmentVersionId: string;
  legacyTitles?: string[];
};

export type MaterialRelease = {
  id: string;
  sessionNo: 3 | 4 | 5;
  title: string;
  kind: string;
  s3Key: string;
  sizeBytes: number;
  version: number;
  instructorOnly: boolean;
};

export type PageRelease = {
  id: string;
  sessionNo: 3 | 4 | 5;
  title: string;
  summaryMd: string;
  orderedMaterialIds: string[];
  linkedAssignmentIds: string[];
  linkedQuizIds: string[];
  legacyTitles: string[];
  staleMaterialIds: string[];
  staleAssignmentIds: string[];
  staleQuizIds: string[];
};

export type AssessmentVersionRelease = {
  id: string;
  assignmentId: string;
  version: number;
  ownerKind: "individual" | "team";
  purpose: "graded" | "formative";
  publicSchema: Record<string, unknown>;
  rubric: Record<string, unknown>;
  materialManifest: Record<string, unknown>;
  scoringPolicy: Record<string, unknown>;
  portfolioPolicy: Record<string, unknown>;
  publicationPolicy: Record<string, unknown>;
  exportPolicy: Record<string, unknown>;
  previewPolicy: Record<string, unknown>;
  datasetReleaseId: string | null;
  retentionClassKey: string;
  improvementAllowed: boolean;
  improvementWindowDays: number;
  checksumSha256: string;
  evaluator: {
    id: string;
    config: Record<string, unknown>;
    answerKey: unknown | null;
    anchors: unknown | null;
    normalization: unknown | null;
    checksumSha256: string;
  };
};

export type QuizRelease = {
  id: string;
  sessionNo: 4 | 5;
  title: string;
  questions: unknown[];
  contractMode: "versioned";
  contractVersion: number;
  classification: "summative";
  countsTowardBestOf: false;
  classificationFinalizedAt: null;
  classifiedBy: null;
  feedbackReleaseAt: null;
  answerMode: "stable_id";
  contentHash: string;
  publishedAt: null;
};

export type Sessions3To5Release = {
  releaseId: string;
  objects: ReleaseObject[];
  retentionPolicies: Array<{
    id: string;
    classKey: string;
    objectClass: string;
    expiresAfterDays: number | null;
    deletionAuthority: string;
    legalHoldBehavior: string;
    s3CleanupRequired: boolean;
    databaseCleanupPolicy: string;
  }>;
  datasetRelease: {
    id: string;
    slug: string;
    version: number;
    title: string;
    lineage: Record<string, unknown>;
    sourceDate: Date;
    audience: string;
    processingRules: Record<string, unknown>;
    approvedAiProcessors: string[];
    manifest: Record<string, unknown>;
    checksumSha256: string;
    retentionClassKey: string;
    files: Array<{
      id: string;
      role: string;
      s3Key: string;
      sha256: string;
      sizeBytes: number;
      mimeType: string;
    }>;
  };
  assignmentTypes: AssignmentTypeRelease[];
  assignments: AssignmentRelease[];
  materials: MaterialRelease[];
  pages: PageRelease[];
  assessmentVersions: AssessmentVersionRelease[];
  quizzes: QuizRelease[];
};

const RUBRIC_4DIM = {
  scale: 10,
  dimensions: [
    { key: "functionality", label: "Functionality", max: 10 },
    { key: "craft", label: "Craft", max: 10 },
    { key: "relevance", label: "Relevance", max: 10 },
    { key: "verification-evidence", label: "Verification evidence", max: 10 },
  ],
};

const field = (
  key: string,
  label: string,
  kind: FieldKind,
  required = true,
  extra: Record<string, unknown> = {},
): ReleaseField => ({ key, label, kind, required, ...extra });

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeFor(path: string): string {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".jsonl")) return "application/x-ndjson";
  if (path.endsWith(".csv")) return "text/csv";
  if (path.endsWith(".ipynb")) return "application/x-ipynb+json";
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function jsonObjectFromBytes(bytes: Uint8Array, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function finiteValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function s3AdapterAnswerKey(
  adapter: Record<string, unknown>,
  datasetVersion: string,
): Record<string, unknown> {
  if (adapter.dataset_version !== datasetVersion) {
    throw new Error("Session 3 evaluator adapter is bound to a different dataset version.");
  }
  const items = objectValue(adapter.items, "Session 3 evaluator adapter items");
  const item = (id: string) => objectValue(items[id], `Session 3 evaluator item ${id}`);
  const privateKey = (id: string) => objectValue(item(id).private_key, `${id}.private_key`);
  const specs: Record<string, unknown> = {
    "S3-DATA-01": {
      kind: "number",
      mode: "exact",
      expected: finiteValue(privateKey("S3-DATA-01").expected, "S3-DATA-01.expected"),
      integer: true,
    },
    "S3-DATA-02": {
      kind: "number",
      mode: "exact",
      expected: finiteValue(privateKey("S3-DATA-02").expected, "S3-DATA-02.expected"),
      integer: true,
    },
    "S3-DATA-03": {
      kind: "number",
      mode: "tolerance",
      expected: finiteValue(privateKey("S3-DATA-03").expected_numeric, "S3-DATA-03.expected_numeric"),
      tolerance: 0.05,
      unit: "percentage-points",
      acceptedUnits: { "percentage-points": 1, percentage: 1, percent: 1 },
    },
    "S3-DATA-04": {
      kind: "number",
      mode: "tolerance",
      expected: finiteValue(privateKey("S3-DATA-04").expected_numeric, "S3-DATA-04.expected_numeric"),
      tolerance: 0.5,
      unit: "USD",
      acceptedUnits: { USD: 1 },
    },
    "S3-DATA-05.category": {
      kind: "string",
      weight: 0.5,
      expected: (() => {
        const value = privateKey("S3-DATA-05").categoryLabel;
        if (typeof value !== "string" || !value) throw new Error("S3-DATA-05.categoryLabel is missing.");
        return value;
      })(),
      trim: true,
      caseInsensitive: false,
    },
    "S3-DATA-05.totalMrrUsd": {
      kind: "number",
      weight: 0.5,
      mode: "tolerance",
      expected: finiteValue(privateKey("S3-DATA-05").expected_numeric, "S3-DATA-05.expected_numeric"),
      tolerance: 0.5,
      unit: "USD",
      acceptedUnits: { USD: 1 },
    },
    "S3-DATA-06": {
      kind: "number",
      mode: "tolerance",
      expected: finiteValue(privateKey("S3-DATA-06").expected_numeric, "S3-DATA-06.expected_numeric"),
      tolerance: 0.5,
      unit: "USD",
      acceptedUnits: { USD: 1 },
    },
  };
  // Keep the verified adapter intact for audit/reproduction, while the explicit
  // specs give the generic runtime the exact public field bindings it consumes.
  return { ...adapter, specs };
}

function categoryOptionsFromFactPack(factPack: Record<string, unknown>): Array<{ value: string; label: string }> {
  const summaries = objectValue(factPack.group_summaries, "Session 3 fact-pack group summaries");
  if (!Array.isArray(summaries.category)) {
    throw new Error("Session 3 fact pack has no category option set.");
  }
  const values = summaries.category.map((raw, index) => {
    const row = objectValue(raw, `Session 3 category summary ${index}`);
    if (typeof row.value !== "string" || !row.value.trim()) {
      throw new Error(`Session 3 category summary ${index} has no value.`);
    }
    return row.value;
  });
  if (new Set(values).size !== values.length || values.length === 0) {
    throw new Error("Session 3 category option set is empty or duplicated.");
  }
  return values.map((value) => ({ value, label: value }));
}

function trackedObject(args: {
  lmsRoot: string;
  path: string;
  namespace: string;
  version: string;
  evaluatorOnly?: boolean;
  bytes?: Uint8Array;
}): ReleaseObject {
  const bytes = args.bytes ?? readFileSync(join(args.lmsRoot, args.path));
  const digest = sha256(bytes);
  return {
    key: `${args.namespace}/${args.version}/${digest}/${basename(args.path)}`,
    bytes,
    sha256: digest,
    sizeBytes: bytes.byteLength,
    mimeType: mimeFor(args.path),
    source: args.path,
    evaluatorOnly: args.evaluatorOnly ?? false,
  };
}

function generatedObject(args: {
  source: string;
  filename: string;
  namespace: string;
  version: string;
  value: unknown;
  evaluatorOnly?: boolean;
}): ReleaseObject {
  const bytes = new TextEncoder().encode(`${canonicalJson(args.value)}\n`);
  const digest = sha256(bytes);
  return {
    key: `${args.namespace}/${args.version}/${digest}/${args.filename}`,
    bytes,
    sha256: digest,
    sizeBytes: bytes.byteLength,
    mimeType: "application/json",
    source: args.source,
    evaluatorOnly: args.evaluatorOnly ?? false,
  };
}

function materialFromObject(args: {
  id: string;
  sessionNo: 3 | 4 | 5;
  title: string;
  kind: string;
  object: ReleaseObject;
  instructorOnly?: boolean;
}): MaterialRelease {
  return {
    id: args.id,
    sessionNo: args.sessionNo,
    title: args.title,
    kind: args.kind,
    s3Key: args.object.key,
    sizeBytes: args.object.sizeBytes,
    version: 1,
    instructorOnly: args.instructorOnly ?? false,
  };
}

function assessmentVersion(
  input: Omit<AssessmentVersionRelease, "checksumSha256" | "evaluator"> & {
    evaluator: Omit<AssessmentVersionRelease["evaluator"], "checksumSha256">;
  },
): AssessmentVersionRelease {
  const policies = parseAssessmentPolicies({
    purpose: input.purpose,
    scoringPolicy: input.scoringPolicy,
    portfolioPolicy: input.portfolioPolicy,
    publicationPolicy: input.publicationPolicy,
    exportPolicy: input.exportPolicy,
  });
  if (!policies) {
    throw new Error(`Assessment policy contract is invalid for ${input.id}.`);
  }
  const evaluatorChecksum = canonicalJsonHash({
    config: input.evaluator.config,
    answerKey: input.evaluator.answerKey,
    anchors: input.evaluator.anchors,
    normalization: input.evaluator.normalization,
  });
  const immutable = {
    assignmentId: input.assignmentId,
    version: input.version,
    ownerKind: input.ownerKind,
    purpose: input.purpose,
    publicSchema: input.publicSchema,
    rubric: input.rubric,
    materialManifest: input.materialManifest,
    scoringPolicy: input.scoringPolicy,
    portfolioPolicy: input.portfolioPolicy,
    publicationPolicy: input.publicationPolicy,
    exportPolicy: input.exportPolicy,
    previewPolicy: input.previewPolicy,
    datasetReleaseId: input.datasetReleaseId,
    retentionClassKey: input.retentionClassKey,
    improvementAllowed: input.improvementAllowed,
    improvementWindowDays: input.improvementWindowDays,
    evaluatorChecksum,
  };
  return {
    ...input,
    checksumSha256: canonicalJsonHash(immutable),
    evaluator: { ...input.evaluator, checksumSha256: evaluatorChecksum },
  };
}

export function buildSessions3To5Release(args: {
  lmsRoot: string;
  privateData: VerifiedPrivateCourseData;
  quizPackage: VerifiedQuizImportPackage;
  readFileBytes?: (relativePath: string) => Uint8Array;
}): Sessions3To5Release {
  const readReleaseFile = (relativePath: string): Uint8Array =>
    args.readFileBytes?.(relativePath) ?? readFileSync(join(args.lmsRoot, relativePath));
  const objects: ReleaseObject[] = args.privateData.files.map((file) => ({
    key: file.s3Key,
    bytes: file.bytes,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    source: `private:${file.role}`,
    evaluatorOnly: file.evaluatorOnly,
  }));
  const materials: MaterialRelease[] = [];

  const addTrackedMaterial = (input: {
    id: string;
    sessionNo: 3 | 4 | 5;
    title: string;
    kind: string;
    path: string;
    instructorOnly?: boolean;
  }) => {
    const object = trackedObject({
      lmsRoot: args.lmsRoot,
      path: input.path,
      namespace: `course/releases/session-0${input.sessionNo}`,
      version: "authored-v1",
      evaluatorOnly: input.instructorOnly,
      bytes: readReleaseFile(input.path),
    });
    objects.push(object);
    materials.push(materialFromObject({ ...input, object }));
    return object;
  };

  const privateLineage = args.privateData.lineage;
  const privateSizeProof = args.privateData.sizeProof;
  const publicDatasetManifest = {
    manifestVersion: args.privateData.manifestVersion,
    datasetVersion: args.privateData.datasetVersion,
    manifestChecksumSha256: args.privateData.manifestChecksumSha256,
    lineage: {
      sourceTitle: stringValue(privateLineage.source_title, "lineage.source_title"),
      sourceSheetTab: stringValue(privateLineage.source_sheet_tab, "lineage.source_sheet_tab"),
      sourceSheetGid: finiteValue(privateLineage.source_sheet_gid, "lineage.source_sheet_gid"),
      sourceSnapshotDate: stringValue(
        privateLineage.source_snapshot_date,
        "lineage.source_snapshot_date",
      ),
      sourceSliceSha256: stringValue(
        privateLineage.source_slice_sha256,
        "lineage.source_slice_sha256",
      ),
      sourceRowPointerField: stringValue(
        privateLineage.source_row_pointer_field,
        "lineage.source_row_pointer_field",
      ),
    },
    generation: args.privateData.generation,
    sizeProof: {
      artifact: stringValue(privateSizeProof.artifact, "size_proof.artifact"),
      tokenCount: finiteValue(privateSizeProof.token_count, "size_proof.token_count"),
      tokenizer: stringValue(privateSizeProof.tokenizer, "size_proof.tokenizer"),
      tokenizerLibrary: stringValue(
        privateSizeProof.tokenizer_library,
        "size_proof.tokenizer_library",
      ),
      tokenizerLibraryVersion: stringValue(
        privateSizeProof.tokenizer_library_version,
        "size_proof.tokenizer_library_version",
      ),
      thresholdTokens: finiteValue(
        privateSizeProof.threshold_tokens,
        "size_proof.threshold_tokens",
      ),
      exceedsThreshold: booleanValue(
        privateSizeProof.exceeds_threshold,
        "size_proof.exceeds_threshold",
      ),
      uncompressedBytes: finiteValue(
        privateSizeProof.uncompressed_bytes,
        "size_proof.uncompressed_bytes",
      ),
      uncompressedSha256: stringValue(
        privateSizeProof.uncompressed_sha256,
        "size_proof.uncompressed_sha256",
      ),
      interpretation: stringValue(
        privateSizeProof.interpretation,
        "size_proof.interpretation",
      ),
    },
    usageNotice: args.privateData.usageNotice,
    files: args.privateData.files
      .filter((file) => !file.evaluatorOnly)
      .map((file) => ({
        role: file.role,
        filename: file.filename,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
      })),
  };
  const publicManifestObject = generatedObject({
    source: "private:learner-safe-manifest",
    filename: "trustmrr_s3_manifest_v1.json",
    namespace: "course/releases/session-03",
    version: args.privateData.datasetVersion,
    value: publicDatasetManifest,
  });
  objects.push(publicManifestObject);
  materials.push(materialFromObject({
    id: "mat_s3_scale_manifest_v1",
    sessionNo: 3,
    title: "trustmrr_s3_manifest_v1.json",
    kind: "scale-pack",
    object: publicManifestObject,
  }));

  const privateMaterialByRole: Record<string, { id: string; title: string; kind: string }> = {
    learner_csv: {
      id: "mat_s3_learner_csv_v1",
      title: "trustmrr_s3_learner_v1.csv",
      kind: "dataset",
    },
    representative_sample: {
      id: "mat_s3_learner_sample_v1",
      title: "trustmrr_s3_representative_sample_v1.csv",
      kind: "schema-pack",
    },
    schema: {
      id: "mat_s3_scale_schema_v1",
      title: "trustmrr_s3_schema_v1.json",
      kind: "schema-pack",
    },
    peer_comparisons_sample: {
      id: "mat_s3_scale_sample_v1",
      title: "trustmrr_s3_peer_comparisons_sample_v1.jsonl",
      kind: "schema-pack",
    },
    peer_comparisons: {
      id: "mat_s3_scale_data_v1",
      title: "trustmrr_s3_peer_comparisons_v1.jsonl.gz",
      kind: "dataset",
    },
    fact_pack: {
      id: "mat_s3_fact_pack_v1",
      title: "Session 3 private fact pack",
      kind: "evaluator-key",
    },
    evaluator_adapter: {
      id: "mat_s3_answer_pack_v1",
      title: "Session 3 evaluator adapter",
      kind: "evaluator-key",
    },
  };
  for (const file of args.privateData.files) {
    const definition = privateMaterialByRole[file.role];
    if (!definition) continue;
    materials.push({
      ...definition,
      sessionNo: 3,
      s3Key: file.s3Key,
      sizeBytes: file.sizeBytes,
      version: 1,
      instructorOnly: file.evaluatorOnly,
    });
  }

  addTrackedMaterial({
    id: "mat_s3_lab_v1",
    sessionNo: 3,
    title: "Session 3 learner lab",
    kind: "lab-sheet",
    path: "course/session-03/learner-lab.md",
  });
  addTrackedMaterial({
    id: "mat_s3_dictionary_v1",
    sessionNo: 3,
    title: "TrustMRR learner slice · data dictionary",
    kind: "reference",
    path: "course/session-03/data-dictionary.md",
  });
  addTrackedMaterial({
    id: "mat_s3_public_memo_v1",
    sessionNo: 3,
    title: "Public-safe portfolio data memo template",
    kind: "template",
    path: "course/session-03/public-safe-portfolio-data-memo-template.md",
  });
  addTrackedMaterial({
    id: "mat_s3_formula_v1",
    sessionNo: 3,
    title: "Spreadsheet pathway",
    kind: "reference",
    path: "course/session-03/spreadsheet-pathway.md",
  });
  addTrackedMaterial({
    id: "mat_s3_colab_starter_v1",
    sessionNo: 3,
    title: "Colab starter · make your own copy",
    kind: "notebook",
    path: "output/session-03/session-03-colab-starter.ipynb",
  });
  addTrackedMaterial({
    id: "mat_s3_visuals_a11y_v1",
    sessionNo: 3,
    title: "Visualization check · accessible artifacts",
    kind: "assessment-support",
    path: "course/session-03/visualization-quiz-accessible-artifacts.md",
  });
  addTrackedMaterial({
    id: "mat_s3_offline_v1",
    sessionNo: 3,
    title: "Session 3 instructor offline pack",
    kind: "fallback",
    path: "course/session-03/accessibility-and-fallbacks.md",
    instructorOnly: true,
  });
  addTrackedMaterial({
    id: "mat_s3_scoring_rubric_v1",
    sessionNo: 3,
    title: "Session 3 transparent scoring rubric",
    kind: "grading-rubric",
    path: "course/session-03/grading-and-anchors.md",
  });
  const s5FixtureEvaluatorBundleValue = jsonObjectFromBytes(
    readReleaseFile("course/session-05/fixtures/evaluator-bundle.v1.json"),
    "Session 5 fixture evaluator bundle",
  );
  const s5FixtureEvaluatorBundle = generatedObject({
    source: "course/session-05/fixtures/evaluator-bundle.v1.json",
    filename: "workflow-fixture-evaluator.v1.json",
    namespace: "course/releases/session-05",
    version: "evaluator-v1",
    value: s5FixtureEvaluatorBundleValue,
    evaluatorOnly: true,
  });
  objects.push(s5FixtureEvaluatorBundle);
  materials.push(
    materialFromObject({
      id: "mat_s5_fixture_evaluator_v1",
      sessionNo: 5,
      title: "Session 5 deterministic fixture evaluator",
      kind: "evaluator-key",
      object: s5FixtureEvaluatorBundle,
      instructorOnly: true,
    }),
  );
  const s5FixtureAnswerKey = buildWorkflowEvaluatorAnswerKey({
    bundle: s5FixtureEvaluatorBundleValue,
    s3Key: s5FixtureEvaluatorBundle.key,
  });
  const s5ExpectedResultPaths: Record<string, string> = {
    "S5-WP-GTM-01": "course/session-05/fixtures/expected-results.json",
    "S5-WP-OPS-02": "course/session-05/fixtures/operations/expected-results.json",
    "S5-WP-REV-03": "course/session-05/fixtures/revenue/expected-results.json",
  };
  for (const pack of s5FixtureAnswerKey.bundle.packs) {
    const sourcePath = s5ExpectedResultPaths[pack.packId];
    if (!sourcePath || sha256(readReleaseFile(sourcePath)) !== pack.expectedResultsSha256) {
      throw new Error(`Session 5 evaluator bundle is stale for ${pack.packId}.`);
    }
  }

  addTrackedMaterial({
    id: "mat_s4_student_handout_v1",
    sessionNo: 4,
    title: "Session 4 student build handout",
    kind: "lab-sheet",
    path: "course/session-04/08-student-handout.md",
  });
  addTrackedMaterial({
    id: "mat_s4_functional_contract_v1",
    sessionNo: 4,
    title: "SignalShelf functional contract",
    kind: "reference",
    path: "course/session-04/04-functional-clone-contract.md",
  });
  addTrackedMaterial({
    id: "mat_s4_acceptance_tests_v1",
    sessionNo: 4,
    title: "Golden scope acceptance tests",
    kind: "reference",
    path: "course/session-04/05-golden-scope-acceptance-tests.md",
  });
  addTrackedMaterial({
    id: "mat_s4_v2_guide_v1",
    sessionNo: 4,
    title: "Publish, verify and Version 2 guide",
    kind: "reference",
    path: "course/session-04/07-publish-verify-credit-plan.md",
  });
  addTrackedMaterial({
    id: "mat_s4_strong_prompt_reveal_v1",
    sessionNo: 4,
    title: "Instructor golden prompt reveal",
    kind: "instructor-reveal",
    path: "course/session-04/06-lovable-prompt-plan-script.md",
    instructorOnly: true,
  });
  addTrackedMaterial({
    id: "mat_s4_fallback_plan_v1",
    sessionNo: 4,
    title: "Session 4 instructor fallback plan",
    kind: "fallback",
    path: "course/session-04/13-instructor-fallback-plan.md",
    instructorOnly: true,
  });
  addTrackedMaterial({
    id: "mat_s4_grader_anchors_v1",
    sessionNo: 4,
    title: "Session 4 transparent scoring rubric",
    kind: "grading-rubric",
    path: "course/session-04/10-rubric-grader-anchors.md",
  });

  const s5PublicMaterials = [
    ["mat_s5_build_brief_v1", "Session 5 student build brief", "lab-sheet", "course/session-05/student-build-brief.md"],
    ["mat_s5_pack_gtm_v1", "Workflow pack · GTM lead routing", "workflow-pack", "course/session-05/workflow-packs/01-gtm-lead-routing.md"],
    ["mat_s5_pack_operations_v1", "Workflow pack · Operations exception handling", "workflow-pack", "course/session-05/workflow-packs/02-operations-exception-handling.md"],
    ["mat_s5_pack_revenue_v1", "Workflow pack · Revenue reconciliation", "workflow-pack", "course/session-05/workflow-packs/03-revenue-reconciliation.md"],
    ["mat_s5_initial_flowchart_v1", "Initial flowchart template", "template", "course/session-05/templates/initial-flowchart-template.md"],
    ["mat_s5_revised_flowchart_v1", "Revised flowchart template", "template", "course/session-05/templates/revised-flowchart-template.md"],
    ["mat_s5_make_checklist_v1", "Make blueprint and sharing checklist", "reference", "course/session-05/make-blueprint-and-sharing-checklist.md"],
    ["mat_s5_safety_checklist_v1", "Workflow safety checklist", "reference", "course/session-05/safety-checklist.md"],
    ["mat_s5_sample_log_v1", "Redacted run-log example", "sample-output", "course/session-05/samples/redacted-run-log.jsonl"],
    ["mat_s5_sample_output_v1", "Redacted sample-output example", "sample-output", "course/session-05/samples/redacted-sample-output.json"],
  ] as const;
  for (const [id, title, kind, path] of s5PublicMaterials) {
    addTrackedMaterial({ id, sessionNo: 5, title, kind, path });
  }
  const s5FormativeRubric = addTrackedMaterial({
    id: "mat_s5_formative_rubric_v1",
    sessionNo: 5,
    title: "Session 5 formative feedback rubric",
    kind: "grading-rubric",
    path: "course/session-05/assessment/ai-flowchart-feedback-rubric.md",
  });
  addTrackedMaterial({
    id: "mat_s5_final_anchors_v1",
    sessionNo: 5,
    title: "Session 5 transparent scoring rubric",
    kind: "grading-rubric",
    path: "course/session-05/assessment/final-grading-rubric-anchors.md",
  });

  const s3Visual = args.quizPackage.formativeAssessments.find(
    (assessment) => assessment.id === "assess_s3_visuals_v1",
  );
  if (!s3Visual) throw new Error("Validated package is missing assess_s3_visuals_v1.");
  const factPack = args.privateData.files.find((file) => file.role === "fact_pack");
  const evaluatorAdapter = args.privateData.files.find((file) => file.role === "evaluator_adapter");
  if (!factPack || !evaluatorAdapter) {
    throw new Error("Validated private package is missing the Session 3 evaluator release.");
  }
  const factPackJson = jsonObjectFromBytes(factPack.bytes, "Session 3 fact pack");
  const adapterJson = jsonObjectFromBytes(evaluatorAdapter.bytes, "Session 3 evaluator adapter");
  const s3AnswerKey = s3AdapterAnswerKey(adapterJson, args.privateData.datasetVersion);
  const categoryOptions = categoryOptionsFromFactPack(factPackJson);

  const s3Fields: ReleaseField[] = [
    field("datasetVersionId", "Dataset version", "text", true, { readOnlyAfterFirstFinalSubmit: true }),
    field("datasetSha256", "Dataset SHA-256", "text", true, { pattern: "^[0-9a-f]{64}$" }),
    field("S3-DATA-01", "S3-DATA-01", "number", true, { integer: true }),
    field("S3-DATA-02", "S3-DATA-02", "number", true, { integer: true }),
    field("S3-DATA-03", "S3-DATA-03", "number", true, { unit: "percentage", decimals: 1 }),
    field("S3-DATA-04", "S3-DATA-04", "number", true, { unit: "USD", decimals: 0 }),
    field("S3-DATA-05.category", "S3-DATA-05 category", "singleChoice", true, { options: categoryOptions }),
    field("S3-DATA-05.totalMrrUsd", "S3-DATA-05 total MRR", "number", true, { unit: "USD", decimals: 0 }),
    field("S3-DATA-06", "S3-DATA-06", "number", true, { unit: "USD", decimals: 0 }),
    field("S3-DATA-07", "S3-DATA-07", "writeup", true, { minWords: 120, maxWords: 180 }),
    field("S3-DATA-08", "S3-DATA-08", "writeup", true, { minWords: 120, maxWords: 180 }),
    field("S3-DATA-09", "S3-DATA-09", "writeup", true, { minWords: 180, maxWords: 250 }),
    field("S3-DATA-10.verifiedItemId", "Verified item", "singleChoice", true, {
      options: ["S3-DATA-03", "S3-DATA-04", "S3-DATA-05", "S3-DATA-06"],
    }),
    field("S3-DATA-10.methodA", "Method A", "text"),
    field("S3-DATA-10.workingA", "Working A", "writeup"),
    field("S3-DATA-10.resultA", "Result A", "text"),
    field("S3-DATA-10.unitA", "Unit A", "text"),
    field("S3-DATA-10.methodB", "Method B", "text"),
    field("S3-DATA-10.workingB", "Working B", "writeup"),
    field("S3-DATA-10.resultB", "Result B", "text"),
    field("S3-DATA-10.unitB", "Unit B", "text"),
    field("S3-DATA-10.absoluteGap", "Absolute gap", "number"),
    field("S3-DATA-10.independenceRationale", "Independence rationale", "writeup"),
    field("S3-DATA-10.gapExplanation", "Gap explanation", "writeup"),
    field("S3-SCALE-01", "Scale decision", "writeup", true, { minWords: 60, maxWords: 100 }),
    field("S3-SCALE-02.prompt", "Method request", "writeup"),
    field("S3-SCALE-02.working", "Formula or code", "writeup", true, { maxChars: 20_000 }),
    field("S3-SCALE-02.correction", "Pre-run correction", "text"),
    field("S3-SCALE-03.output", "Aggregate output", "file", true, {
      acceptedMimeTypes: ["text/csv", "text/plain", "application/json"],
      maxBytes: 2_000_000,
      fileRole: "S3-SCALE-03.output",
    }),
    field("S3-SCALE-03.variant", "Method variant", "singleChoice", true, { options: ["formula", "python"] }),
    field("S3-SCALE-03.validCount", "Valid count", "number", true, { integer: true, min: 0 }),
    field("S3-SCALE-03.excludedCount", "Excluded count", "number", true, { integer: true, min: 0 }),
    field("S3-SCALE-03.assertion", "Passed assertion", "text"),
    field("verificationDeclaration", "Verification declaration", "singleChoice", true, {
      options: ["I can rerun the submitted method against the stated dataset version, and I have named any unresolved mismatch or limitation."],
    }),
  ];

  const s4PlanFields = [
    field("selectedProduct", "Selected product and category", "text"),
    field("benchmarkSourceLinks", "Current public revenue source and official feature sources", "writeup"),
    field("selectionRationale", "Why this is valuable and feasible in one hour (80–120 words)", "writeup"),
    field("industryCompanyApplication", "Industry or anchor-company application using public or fictional data", "writeup"),
    field("featureContract", "Core, mocked and out-of-scope feature contract", "writeup"),
    field("firstPrompt", "Your first Lovable prompt", "writeup"),
    field("nonAffiliationConfirmation", "Type I CONFIRM: original brand/assets and non-affiliation disclosure", "text"),
  ];
  const s4AppFields = [
    field("appUrl", "Public app URL", "link"),
    field("githubUrl", "GitHub repository URL (required for Version 2)", "link", false, {
      requiredFromVersion: 2,
      httpsOnly: true,
      allowedHosts: ["github.com"],
      pathKind: "github-repository",
      helpText: "Version 2 requires the HTTPS root URL exported or synced to GitHub (https://github.com/owner/repository).",
    }),
    field("approvedPlanSummary", "What you changed in the generated plan before approval", "writeup"),
    field("acceptanceTestLog", "Acceptance-test log with evidence references", "writeup"),
    field("evidenceFiles", "Mobile, analytics and accessibility evidence", "files", true, {
      acceptedMimeTypes: ["image/png", "image/jpeg", "application/pdf", "text/plain"],
      maxBytes: 25_000_000,
      fileRole: "evidenceFiles",
    }),
    field("knownLimitations", "Known limitations and every mocked boundary", "writeup"),
    field("changeNote", "V2 change note and V1 to V2 regression result", "writeup", false, { requiredFromVersion: 2 }),
    field("galleryCaption", "One-sentence user, job and result caption", "text"),
    field("galleryConsent", "Type YES to allow section gallery display, or NO", "text"),
    field("nonAffiliationConfirmation", "Type I CONFIRM: dummy data, mock labels, original brand, disclosure", "text"),
  ];
  const s5InitialFields = [
    field("workflowPack", "Workflow pack", "singleChoice", true, {
      options: SESSION_5_WORKFLOW_PACKS,
    }),
    field("problemFrame", "Problem, result, owner and non-goal", "writeup"),
    field("initialFlowchartFile", "Initial flowchart (PDF or PNG)", "file", false, {
      acceptedMimeTypes: ["application/pdf", "image/png"], maxBytes: 10_000_000, fileRole: "initialFlowchartFile",
      helpText: "PDF must contain selectable text; use PNG for an image-only flowchart.",
    }),
    field("flowchartTextEquivalent", "Text/state-table equivalent", "writeup", false),
    field("riskyActions", "Externally visible or irreversible actions", "writeup"),
    field("dataSafetyAttestation", "Synthetic-data and scheduling-off attestation", "text"),
  ];
  const s5RevisedFields = [
    field("workflowPack", "Workflow pack", "singleChoice", true, {
      options: SESSION_5_WORKFLOW_PACKS,
    }),
    field("revisedFlowchartFile", "Revised flowchart (PDF or PNG)", "file", false, {
      acceptedMimeTypes: ["application/pdf", "image/png"], maxBytes: 10_000_000, fileRole: "revisedFlowchartFile",
      helpText: "PDF must contain selectable text; use PNG for an image-only flowchart.",
    }),
    field("revisedFlowchartText", "Text/state-table equivalent", "writeup", false),
    field("feedbackDisposition", "Accepted, adapted and rejected feedback with reasons", "writeup"),
    field("controlAssertions", "Idempotency, validation, retry, approval, loop and observability assertions", "writeup"),
    field("buildPlan", "Flowchart-node to Make-module mapping", "writeup"),
  ];
  const s5WorkflowFields = [
    field("workflowPack", "Workflow pack", "singleChoice", true, {
      options: SESSION_5_WORKFLOW_PACKS,
    }),
    field("workflowTitle", "Workflow title", "text"),
    field("revisedFlowchartFile", "Revised flowchart", "file", false, {
      acceptedMimeTypes: ["application/pdf", "image/png"], maxBytes: 10_000_000, fileRole: "revisedFlowchartFile",
      helpText: "PDF must contain selectable text; use PNG for an image-only flowchart.",
    }),
    field("revisedFlowchartText", "Revised flowchart text/state-table equivalent", "writeup", false),
    field("blueprintFile", "Make blueprint JSON (below 2 MB)", "file", true, {
      acceptedMimeTypes: ["application/json", "text/json"], maxBytes: 2_000_000, maxBytesExclusive: true, fileRole: "blueprintFile",
    }),
    field("runLogFile", "Redacted five-fixture run log", "file", true, {
      acceptedMimeTypes: ["application/json", "application/x-ndjson", "text/plain", "text/csv"], maxBytes: 2_000_000, fileRole: "runLogFile",
    }),
    field("sampleOutputFile", "Redacted sample output", "file", true, {
      acceptedMimeTypes: ["application/json", "application/x-ndjson", "text/plain", "text/csv"], maxBytes: 2_000_000, fileRole: "sampleOutputFile",
    }),
    field("workflowPngFile", "Gallery workflow PNG", "file", true, {
      acceptedMimeTypes: ["image/png"], maxBytes: 10_000_000, fileRole: "workflowPngFile",
    }),
    field("scenarioShareUrl", "Safe public Make scenario URL (optional)", "link", false),
    field("gallerySummary", "One-sentence result for the gallery", "text"),
    field("galleryConsent", "Type YES to allow section gallery display, or NO", "text"),
    field("usefulness", "Current process, frequency, owner and credible value case", "writeup"),
    field("verificationNote", "Expected vs actual results and what you repaired", "writeup"),
    field("limitationChange", "Known limitation and next production change", "writeup"),
    field("ownershipEvidence", "Your design/build decision and evidence", "writeup"),
    field("accessibilityDescription", "Text description of the workflow PNG", "writeup"),
    field("privacyAttestation", "Privacy and safe-action attestation", "text"),
  ];

  const assignmentTypes: AssignmentTypeRelease[] = [
    {
      id: "atype_data_memo",
      slug: "data-memo",
      title: "Verified data memo",
      description: "Session 3 private, checksum-bound mixed data assessment.",
      teamBased: false,
      galleryEligible: false,
      aiGraded: true,
      submissionSchema: { fields: s3Fields, groups: ["dataset", "small-data", "verification", "scale"] },
      rubric: RUBRIC_4DIM,
      legacyFingerprints: ["Session 3 SHIP form"],
    },
    {
      id: "atype_s3_visuals",
      slug: "data-visual-judgment",
      title: "Visualization scenario check",
      description: "Formative stable-ID selection and rationale assessment.",
      teamBased: false,
      galleryEligible: false,
      aiGraded: true,
      submissionSchema: { fields: s3Visual.publicSchema.fields as ReleaseField[] },
      rubric: {
        scale: 18,
        purpose: "formative",
        dimensions: [
          { key: "functionality", label: "Defensible selections", max: 6 },
          { key: "rationale-quality", label: "Rationale quality", max: 12 },
        ],
      },
    },
    {
      id: "atype_app_plan",
      slug: "app-plan",
      title: "Product and first-prompt checkpoint",
      description: "Session 4 formative product/feature contract checkpoint.",
      teamBased: false,
      galleryEligible: false,
      aiGraded: true,
      submissionSchema: { fields: s4PlanFields },
      rubric: {
        scale: 12,
        dimensions: [
          { key: "user-value", label: "User and value", max: 2 },
          { key: "scope-state-interactions", label: "Scope, state and interactions", max: 3 },
          { key: "truth-boundaries", label: "Real, mock and out-of-scope truth", max: 2 },
          { key: "failure-access", label: "Failure and access", max: 2 },
          { key: "acceptance-verification", label: "Acceptance and verification", max: 3 },
        ],
      },
    },
    {
      id: "atype_app",
      slug: "app",
      title: "Lovable app · Version 1 / Version 2",
      description: "Session 4 immutable Lovable V1 with one ten-calendar-day improvement V2.",
      teamBased: false,
      galleryEligible: true,
      aiGraded: true,
      submissionSchema: { fields: s4AppFields },
      rubric: RUBRIC_4DIM,
      legacyFingerprints: ["Session 4 individual artifact"],
    },
    {
      id: "atype_workflow_design_review",
      slug: "workflow-design-review",
      title: "Workflow design review",
      description: "Session 5 formative first-flowchart review with no weighted grade.",
      teamBased: false,
      galleryEligible: false,
      aiGraded: true,
      submissionSchema: { fields: s5InitialFields, anyOf: [["initialFlowchartFile", "flowchartTextEquivalent"]] },
      rubric: { purpose: "formative", source: "assessment/ai-flowchart-feedback-rubric.md" },
    },
    {
      id: "atype_workflow_revised_design",
      slug: "workflow-revised-design",
      title: "Revised workflow design",
      description: "Session 5 post-feedback design milestone.",
      teamBased: false,
      galleryEligible: false,
      aiGraded: false,
      submissionSchema: { fields: s5RevisedFields, anyOf: [["revisedFlowchartFile", "revisedFlowchartText"]] },
      rubric: { purpose: "formative-milestone" },
    },
    {
      id: "atype_workflow",
      slug: "workflow",
      title: "Revenue-supporting Make workflow",
      description: "Session 5 individually owned, versioned workflow evidence.",
      teamBased: false,
      galleryEligible: true,
      aiGraded: true,
      submissionSchema: { fields: s5WorkflowFields, anyOf: [["revisedFlowchartFile", "revisedFlowchartText"]] },
      rubric: RUBRIC_4DIM,
      legacyFingerprints: ["Session 5 team artifact"],
    },
  ];

  const datasetReleaseId = `dataset_${args.privateData.datasetVersion.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const s3LearnerMaterialIds = [
    "mat_s3_lab_v1",
    "mat_s3_dictionary_v1",
    "mat_s3_public_memo_v1",
    "mat_s3_learner_csv_v1",
    "mat_s3_formula_v1",
    "mat_s3_colab_starter_v1",
    "mat_s3_learner_sample_v1",
    "mat_s3_scale_manifest_v1",
    "mat_s3_scale_schema_v1",
    "mat_s3_scale_sample_v1",
    "mat_s3_scale_data_v1",
    "mat_s3_visuals_a11y_v1",
    "mat_s3_scoring_rubric_v1",
  ];
  const s4LearnerMaterialIds = [
    "mat_s4_student_handout_v1",
    "mat_s4_functional_contract_v1",
    "mat_s4_acceptance_tests_v1",
    "mat_s4_v2_guide_v1",
    "mat_s4_grader_anchors_v1",
  ];
  const s5LearnerMaterialIds = [
    ...s5PublicMaterials.map(([id]) => id),
    "mat_s5_formative_rubric_v1",
    "mat_s5_final_anchors_v1",
  ];

  const assessmentVersions: AssessmentVersionRelease[] = [
    assessmentVersion({
      id: "assess_s3_data_v1",
      assignmentId: "asg_s3_datamemo",
      version: 1,
      ownerKind: "individual",
      purpose: "graded",
      publicSchema: { version: 1, fields: s3Fields, datasetBound: true },
      rubric: RUBRIC_4DIM,
      materialManifest: { version: 1, materialIds: s3LearnerMaterialIds, datasetReleaseId },
      scoringPolicy: { component: "artifact-quality", approvedAiProcessors: ["anthropic"] },
      portfolioPolicy: {
        include: true,
        slot: "data-memo",
        requiredPublicLink: { label: "Session 3 public-safe data memo" },
      },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: ["verificationDeclaration"], evidenceRoles: ["S3-SCALE-03.output"] },
      },
      previewPolicy: { learner: "no-answer-values", evaluator: "server-only" },
      datasetReleaseId,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s3_data_v1",
        config: {
          mode: "s3-deterministic-first-v1",
          providerMode: "auto",
          adapter: { s3Key: evaluatorAdapter.s3Key, sha256: evaluatorAdapter.sha256 },
          factPack: { s3Key: factPack.s3Key, sha256: factPack.sha256 },
          approvedProcessor: "anthropic",
          approvedFlags: [
            "dataset_version_mismatch",
            "objective_internal_inconsistency",
            "numeric_claim_unverified",
            "working_not_reproducible",
            "same_method_twice",
            "raw_row_exposure",
            "causality_overclaim",
            "population_overclaim",
            "prompt_injection",
            "possible_duplicate",
            "low_confidence",
            "manual_review_requested",
          ],
          citationsPerDimension: 1,
          judgmentFieldIds: [
            "S3-DATA-07",
            "S3-DATA-08",
            "S3-DATA-09",
            "S3-DATA-10.independenceRationale",
            "S3-DATA-10.gapExplanation",
            "S3-SCALE-01",
            "S3-SCALE-02.prompt",
            "S3-SCALE-02.correction",
            "S3-SCALE-03.assertion",
          ],
          providerContext: "judgment responses and aggregate summaries only; never TrustMRR rows",
          objectiveConsistencyRules: [
            {
              id: "s3-country-missing-rate",
              kind: "percentage_from_count",
              countField: "S3-DATA-02",
              denominatorField: "S3-DATA-01",
              percentageField: "S3-DATA-03",
              tolerancePercentagePoints: 0.05,
              dimension: "functionality",
              cap: 8,
            },
          ],
        },
        answerKey: s3AnswerKey,
        anchors: S3_DATA_ANCHORS,
        normalization: { units: "versioned", rounding: "per-item", nulls: "missing-is-not-zero" },
      },
    }),
    assessmentVersion({
      id: "assess_s3_visuals_v1",
      assignmentId: "asg_s3_visuals",
      version: 1,
      ownerKind: "individual",
      purpose: "formative",
      publicSchema: s3Visual.publicSchema,
      rubric: assignmentTypes.find((type) => type.slug === "data-visual-judgment")!.rubric,
      materialManifest: { version: 1, materialIds: ["mat_s3_visuals_a11y_v1"] },
      scoringPolicy: { component: "none", approvedAiProcessors: ["anthropic"] },
      portfolioPolicy: { include: false, slot: "data-visual-judgment" },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: s3Visual.publicSchema.fields.map((field) => String(field.key)), evidenceRoles: [] },
      },
      previewPolicy: { learner: "attempt-receipt-before-release" },
      datasetReleaseId,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s3_visuals_v1",
        config: {
          mode: "stable-selection-plus-rationale",
          providerMode: "auto",
          publicChecksumSha256: s3Visual.publicChecksumSha256,
          approvedProcessor: "anthropic",
          approvedFlags: ["possible-injection", "unsupported-rationale"],
          citationsPerDimension: 6,
          judgmentFieldIds: s3Visual.judgmentFieldIds,
        },
        answerKey: s3Visual.evaluatorAnswerKey,
        anchors: S3_VISUAL_ANCHORS,
        normalization: { selectedOption: "stable-option-id" },
      },
    }),
    assessmentVersion({
      id: "assess_s4_product_prompt_v1",
      assignmentId: "asg_s4_product_prompt",
      version: 1,
      ownerKind: "individual",
      purpose: "formative",
      publicSchema: { version: 1, fields: s4PlanFields },
      rubric: assignmentTypes.find((type) => type.slug === "app-plan")!.rubric,
      materialManifest: { version: 1, materialIds: s4LearnerMaterialIds.slice(0, 3) },
      scoringPolicy: { component: "none", approvedAiProcessors: ["anthropic"] },
      portfolioPolicy: { include: false, slot: "app-plan" },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: ["selectedProduct", "selectionRationale"], evidenceRoles: [] },
      },
      previewPolicy: { learner: "feedback-without-grader-internals" },
      datasetReleaseId: null,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s4_product_prompt_v1",
        config: {
          mode: "s4-checkpoint-v1",
          providerMode: "auto",
          variableDimensionMaxima: true,
          recomputeTotalServerSide: true,
          approvedProcessor: "anthropic",
          approvedFlags: ["possible-injection", "benchmark-copying", "real-private-data", "unprovisioned-external-action"],
          citationsPerDimension: 1,
          judgmentFieldIds: ["selectedProduct", "benchmarkSourceLinks", "selectionRationale", "industryCompanyApplication", "featureContract", "firstPrompt"],
        },
        answerKey: null,
        anchors: S4_PRODUCT_PROMPT_ANCHORS,
        normalization: { declaredMaxima: true, totalMax: 12 },
      },
    }),
    assessmentVersion({
      id: "assess_s4_app_v1",
      assignmentId: "asg_s4_app",
      version: 1,
      ownerKind: "individual",
      purpose: "graded",
      publicSchema: { version: 1, fields: s4AppFields, maxVersions: 2 },
      rubric: RUBRIC_4DIM,
      materialManifest: { version: 1, materialIds: s4LearnerMaterialIds },
      scoringPolicy: { component: "artifact-quality", approvedAiProcessors: ["anthropic"] },
      portfolioPolicy: { include: true, slot: "app" },
      publicationPolicy: {
        wall: "app",
        consentField: "galleryConsent",
        captionField: "galleryCaption",
        publicTextFields: ["galleryCaption"],
        previewRole: "appScreenshot",
        actions: [{
          label: "View app",
          field: "appUrl",
          kind: "external-url",
          allowedHosts: ["*.lovable.app"],
          requireReviewedFingerprint: true,
          urlKind: "generic",
        }],
      },
      exportPolicy: {
        praxy: { enabled: true, fieldKeys: ["appUrl", "galleryCaption"] },
        dpdp: {
          fieldKeys: ["appUrl", "approvedPlanSummary", "acceptanceTestLog", "knownLimitations", "changeNote", "galleryCaption"],
          evidenceRoles: ["evidenceFiles"],
        },
      },
      previewPolicy: { source: "safe-screenshot", latest: "publishable" },
      datasetReleaseId: null,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: true,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s4_app_v1",
        config: {
          policyId: "s4-artifact-v1",
          appInspectionPolicy: S4_APP_INSPECTION_POLICY_V1,
          providerMode: "auto",
          recomputeTotalServerSide: true,
          approvedProcessor: "anthropic",
          approvedFlags: Object.values(S4_APP_INSPECTION_POLICY_V1.flags),
          citationsPerDimension: 2,
          judgmentFieldIds: ["approvedPlanSummary", "acceptanceTestLog", "knownLimitations", "changeNote"],
        },
        answerKey: null,
        anchors: S4_APP_ANCHORS,
        normalization: { dimensionMin: 0, dimensionMax: 10, totalMax: 40 },
      },
    }),
    assessmentVersion({
      id: "assess_s5_flowchart_v1",
      assignmentId: "asg_s5_flowchart",
      version: 1,
      ownerKind: "individual",
      purpose: "formative",
      publicSchema: { version: 1, fields: s5InitialFields, anyOf: [["initialFlowchartFile", "flowchartTextEquivalent"]] },
      rubric: {
        purpose: "formative",
        sourceSha256: s5FormativeRubric.sha256,
        dimensions: Array.from({ length: 12 }, (_, index) => ({
          key: `F${String(index + 1).padStart(2, "0")}`,
          label: `Workflow design control ${index + 1}`,
          max: 2,
        })),
      },
      materialManifest: { version: 1, materialIds: s5LearnerMaterialIds.slice(0, 5) },
      scoringPolicy: { component: "none", approvedAiProcessors: ["anthropic"] },
      portfolioPolicy: { include: false, slot: "workflow-design" },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: ["problemFrame", "riskyActions"], evidenceRoles: [] },
      },
      previewPolicy: { learner: "cited-advice-without-confidence-or-prompts" },
      datasetReleaseId: null,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s5_flowchart_v1",
        config: {
          mode: "formative-workflow-control-v1",
          providerMode: "auto",
          visualEvidence: true,
          gradeCreated: false,
          approvedProcessor: "anthropic",
          approvedFlags: ["low-confidence", "prompt-injection", "unreadable-artifact", "unsafe-external-action", "sensitive-data"],
          citationsPerDimension: 1,
          judgmentFieldIds: ["problemFrame", "riskyActions", "flowchartTextEquivalent"],
        },
        answerKey: null,
        anchors: S5_FLOWCHART_ANCHORS,
        normalization: null,
      },
    }),
    assessmentVersion({
      id: "assess_s5_revised_flowchart_v1",
      assignmentId: "asg_s5_revised_flowchart",
      version: 1,
      ownerKind: "individual",
      purpose: "formative",
      publicSchema: { version: 1, fields: s5RevisedFields, anyOf: [["revisedFlowchartFile", "revisedFlowchartText"]] },
      rubric: { purpose: "milestone" },
      materialManifest: { version: 1, materialIds: ["mat_s5_revised_flowchart_v1"] },
      scoringPolicy: { component: "none" },
      portfolioPolicy: { include: false, slot: "workflow-revised-design" },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: ["feedbackDisposition", "controlAssertions", "buildPlan"], evidenceRoles: [] },
      },
      previewPolicy: { learner: "own-version-only" },
      datasetReleaseId: null,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s5_revised_flowchart_v1",
        config: {
          mode: "milestone-no-provider",
          providerMode: "none",
          approvedFlags: [],
          citationsPerDimension: 1,
        },
        answerKey: null,
        anchors: null,
        normalization: null,
      },
    }),
    assessmentVersion({
      id: "assess_s5_workflow_v1",
      assignmentId: "asg_s5_workflow",
      version: 1,
      ownerKind: "individual",
      purpose: "graded",
      publicSchema: {
        version: 1,
        fields: s5WorkflowFields,
        anyOf: [["revisedFlowchartFile", "revisedFlowchartText"]],
      },
      rubric: RUBRIC_4DIM,
      materialManifest: { version: 1, materialIds: s5LearnerMaterialIds },
      scoringPolicy: {
        component: "workflow",
        approvedAiProcessors: ["anthropic"],
        dimensions: {
          usefulness: ["relevance"],
          execution: "functionality",
          ownership: "verification-evidence",
        },
      },
      portfolioPolicy: { include: true, slot: "workflow" },
      publicationPolicy: {
        wall: "workflow",
        consentField: "galleryConsent",
        captionField: "gallerySummary",
        publicTextFields: ["workflowTitle", "gallerySummary"],
        previewRole: "workflowPngFile",
        actions: [
          {
            label: "Clone in Make",
            field: "scenarioShareUrl",
            kind: "external-url",
            allowedHosts: ["*.make.com"],
            requireReviewedFingerprint: true,
            urlKind: "make-scenario",
          },
          { label: "View sample output", role: "sampleOutputFile", kind: "roster-file" },
        ],
      },
      exportPolicy: {
        praxy: { enabled: true, fieldKeys: ["workflowTitle", "gallerySummary", "scenarioShareUrl"] },
        dpdp: {
          fieldKeys: ["workflowTitle", "gallerySummary", "usefulness", "verificationNote", "limitationChange", "ownershipEvidence"],
          evidenceRoles: ["workflowPngFile", "sampleOutputFile"],
        },
      },
      previewPolicy: { source: "workflowPngFile", textAlternative: "accessibilityDescription" },
      datasetReleaseId: null,
      retentionClassKey: "course-private-assessment",
      improvementAllowed: false,
      improvementWindowDays: 10,
      evaluator: {
        id: "evalcfg_s5_workflow_v1",
        config: {
          mode: "composite-workflow-v1",
          providerMode: "auto",
          approvedProcessor: "anthropic",
          approvedFlags: ["low-confidence", "prompt-injection", "unreadable-artifact", "unsafe-external-action", "sensitive-data", "fixture-failure"],
          citationsPerDimension: 2,
          judgmentFieldIds: ["usefulness", "verificationNote", "limitationChange", "ownershipEvidence", "accessibilityDescription", "revisedFlowchartText"],
          fixtureEvaluation: {
            contractVersion: "s5-workflow-evaluation-v1",
            packField: "workflowPack",
            runLogRole: "runLogFile",
            categories: ["normal", "duplicate", "malformed", "timeout", "approval"],
            deterministicDimension: "functionality",
          },
          workflowAuthority: {
            usefulnessMax: 30,
            executionMax: 20,
            ownershipMax: 10,
            usefulnessRubricKeys: ["relevance"],
            ownershipRubricKey: "verification-evidence",
          },
          imageEvidence: ["revisedFlowchartFile", "workflowPngFile"],
        },
        answerKey: s5FixtureAnswerKey,
        anchors: S5_WORKFLOW_ANCHORS,
        normalization: { dimensionMin: 0, dimensionMax: 10, totalMax: 40 },
      },
    }),
  ];

  const assignments: AssignmentRelease[] = [
    { id: "asg_s3_datamemo", assignmentTypeSlug: "data-memo", title: "S3 · Verified data memo", brief: "Answer the checksum-bound data questions, show two-method verification, and submit the scaled analysis evidence.", sessionNo: 3, weightBucket: "artifact-quality", assessmentVersionId: "assess_s3_data_v1", legacyTitles: ["S3 · Verified data memo"] },
    { id: "asg_s3_visuals", assignmentTypeSlug: "data-visual-judgment", title: "S3 · Visualization scenario check", brief: "Choose a defensible visual and explain why for each scenario. This is formative.", sessionNo: 3, weightBucket: null, assessmentVersionId: "assess_s3_visuals_v1" },
    { id: "asg_s4_product_prompt", assignmentTypeSlug: "app-plan", title: "S4 · Product and first prompt", brief: "Freeze the original-brand feature contract and first prompt before the build gate opens.", sessionNo: 4, weightBucket: null, assessmentVersionId: "assess_s4_product_prompt_v1" },
    { id: "asg_s4_app", assignmentTypeSlug: "app", title: "S4 · Lovable app", brief: "Submit an immutable V1 and, if used, the one permitted V2 with verification evidence.", sessionNo: 4, weightBucket: "artifact-quality", assessmentVersionId: "assess_s4_app_v1", legacyTitles: ["S4 · Lovable app"] },
    { id: "asg_s5_flowchart", assignmentTypeSlug: "workflow-design-review", title: "S5 · First workflow design", brief: "Submit the problem frame and first flowchart before opening Make. Feedback is formative.", sessionNo: 5, weightBucket: null, assessmentVersionId: "assess_s5_flowchart_v1" },
    { id: "asg_s5_revised_flowchart", assignmentTypeSlug: "workflow-revised-design", title: "S5 · Revised workflow design", brief: "Disposition the feedback and submit the repaired flowchart and control assertions.", sessionNo: 5, weightBucket: null, assessmentVersionId: "assess_s5_revised_flowchart_v1" },
    { id: "asg_s5_workflow", assignmentTypeSlug: "workflow", title: "S5 · Revenue-supporting Make workflow", brief: "Submit private blueprint and five-case evidence plus the safe PNG, sample output and optional official Make scenario link.", sessionNo: 5, weightBucket: "artifact-quality", assessmentVersionId: "assess_s5_workflow_v1", legacyTitles: ["S5 · Company automation"] },
  ];

  const pages: PageRelease[] = [
    {
      id: "spage_3",
      sessionNo: 3,
      title: "Working with data, using AI",
      summaryMd: "Get defensible answers from a real startup dataset, move computation to Sheets or Colab when context runs out, and ship a verified data memo with a two-method check. After class, publish the separate public-safe method memo within 24 hours.",
      orderedMaterialIds: s3LearnerMaterialIds,
      linkedAssignmentIds: ["asg_s3_datamemo", "asg_s3_visuals"],
      linkedQuizIds: [],
      legacyTitles: ["Working with data using AI"],
      staleMaterialIds: ["mat_s3_tokens", "mat_s3_context", "mat_s3_codeint", "mat_s3_sql", "mat_s3_tokenizer", "mat_s3_lmarena", "mat_s3_moxie", "mat_s3_stocks12", "mat_s3_sp500", "mat_s3_schema_stocks", "mat_s3_stocks_sample", "mat_s3_moxie_fy", "mat_s3_allstocks", "mat_s3_schema_moxie", "mat_s3_moxie_sample", "mat_s3_labsheet"],
      staleAssignmentIds: [],
      staleQuizIds: ["quiz_s3"],
    },
    {
      id: "spage_4",
      sessionNo: 4,
      title: "A proven pattern to a working app",
      summaryMd: "Freeze an original-brand product contract, ship a verified SignalShelf V1 in Lovable, and use one ten-calendar-day improvement window for V2.",
      orderedMaterialIds: s4LearnerMaterialIds,
      linkedAssignmentIds: ["asg_s4_product_prompt", "asg_s4_app"],
      linkedQuizIds: [],
      legacyTitles: ["Build an app with Lovable"],
      staleMaterialIds: ["mat_s4_vibe", "mat_s4_lovable"],
      staleAssignmentIds: [],
      staleQuizIds: [],
    },
    {
      id: "spage_5",
      sessionNo: 5,
      title: "Revenue systems with Make",
      summaryMd: "Design, revise, build and prove a revenue-supporting Make workflow across normal, duplicate, malformed, timeout and approval-required cases.",
      orderedMaterialIds: [...s5LearnerMaterialIds],
      linkedAssignmentIds: ["asg_s5_flowchart", "asg_s5_revised_flowchart", "asg_s5_workflow"],
      linkedQuizIds: [],
      legacyTitles: ["Automation with Make.com"],
      staleMaterialIds: ["mat_s5_make5min", "mat_s5_maketut"],
      staleAssignmentIds: [],
      staleQuizIds: [],
    },
  ];

  const quizzes: QuizRelease[] = args.quizPackage.quizzes.map((quiz) => ({
    id: quiz.id,
    sessionNo: quiz.sessionNo,
    title: quiz.title,
    questions: quiz.questions,
    contractMode: "versioned",
    contractVersion: 1,
    // The enum is non-null in Prisma. An unset finalizer is the authoritative
    // "unclassified" state; summative is only a placeholder and cannot count
    // or publish until an instructor finalizes classification.
    classification: "summative",
    countsTowardBestOf: false,
    classificationFinalizedAt: null,
    classifiedBy: null,
    feedbackReleaseAt: null,
    answerMode: "stable_id",
    contentHash: quiz.contentHash,
    publishedAt: null,
  }));

  const retentionPolicies = [
    {
      id: "retention_course_private_dataset",
      classKey: "course-private-dataset",
      objectClass: "roster-gated dataset and evaluator release",
      expiresAfterDays: null,
      deletionAuthority: "course release operator after legal/academic hold review",
      legalHoldBehavior: "retain bytes and database lineage while a hold is active",
      s3CleanupRequired: true,
      databaseCleanupPolicy: "preserve immutable release metadata and verified deletion receipts",
    },
    {
      id: "retention_course_private_assessment",
      classKey: "course-private-assessment",
      objectClass: "assessment contract, evaluator config and learner evidence",
      expiresAfterDays: null,
      deletionAuthority: "course data controller under the per-object retention matrix",
      legalHoldBehavior: "retain assessment/submission/audit records while a hold is active",
      s3CleanupRequired: true,
      databaseCleanupPolicy: "assessment versions remain append-only; evidence follows its receipt policy",
    },
  ];
  const datasetRelease = {
    id: datasetReleaseId,
    slug: "trustmrr-session-03",
    version: 1,
    title: "TrustMRR Session 3 private release v1",
    lineage: args.privateData.lineage,
    sourceDate: new Date("2026-07-30T00:00:00.000Z"),
    audience: "roster-gated learners; evaluator roles remain server-only",
    processingRules: {
      authorization: "project-specific user authorization recorded 2026-07-30",
      publicDistribution: false,
      aiUse: "approved no-training/no-retention processing for this course only",
      evaluatorRoles: ["fact_pack", "evaluator_adapter"],
    },
    approvedAiProcessors: ["anthropic"],
    manifest: publicDatasetManifest,
    checksumSha256: args.privateData.manifestChecksumSha256,
    retentionClassKey: "course-private-dataset",
    files: args.privateData.files.map((file) => ({
      id: `drelfile_${file.role}_v1`,
      role: file.role,
      s3Key: file.s3Key,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    })),
  };

  // Object keys are content-addressed. Duplicate keys with different metadata
  // would make a rerun ambiguous, so reject that at build time.
  const objectByKey = new Map<string, ReleaseObject>();
  for (const object of objects) {
    const existing = objectByKey.get(object.key);
    if (existing && (existing.sha256 !== object.sha256 || existing.sizeBytes !== object.sizeBytes)) {
      throw new Error(`Conflicting release objects share ${object.key}.`);
    }
    objectByKey.set(object.key, object);
  }

  const releaseWithoutId = {
    retentionPolicies,
    datasetRelease: {
      ...datasetRelease,
      sourceDate: datasetRelease.sourceDate.toISOString(),
    },
    assignmentTypes,
    assignments,
    materials,
    pages,
    assessmentVersions,
    quizzes,
    objects: [...objectByKey.values()].map((object) => ({
      key: object.key,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      mimeType: object.mimeType,
      source: object.source,
      evaluatorOnly: object.evaluatorOnly,
    })),
    quizPackage: {
      packageVersion: args.quizPackage.packageVersion,
      manifestChecksumSha256: args.quizPackage.manifestChecksumSha256,
    },
  };

  const release: Sessions3To5Release = {
    releaseId: canonicalJsonHash(releaseWithoutId),
    objects: [...objectByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    retentionPolicies,
    datasetRelease,
    assignmentTypes,
    assignments,
    materials,
    pages,
    assessmentVersions,
    quizzes,
  };
  validateReleaseContracts(release);
  return release;
}

export type ReleaseObjectStore = {
  stat(key: string): Promise<{ sizeBytes: number; sha256: string } | null>;
  put(object: ReleaseObject): Promise<void>;
};

export type ReleaseReport = {
  releaseId: string;
  dryRun: boolean;
  sessions: Array<3 | 4 | 5>;
  objects: { created: string[]; unchanged: string[] };
  database: {
    created: string[];
    updated: string[];
    unchanged: string[];
    preserved: string[];
  };
  warnings: string[];
};

export type ReleaseDatabase = Pick<
  PrismaClient,
  | "section"
  | "retentionPolicy"
  | "assignmentType"
  | "assignment"
  | "submission"
  | "material"
  | "sessionPage"
  | "gate"
  | "datasetRelease"
  | "datasetReleaseFile"
  | "assessmentVersion"
  | "assessmentEvaluatorConfig"
  | "quiz"
  | "$transaction"
>;

const PRISMA_RELEASE_ACTOR = "loader:sessions3-5:v1";

function valueForCompare(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(valueForCompare);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, valueForCompare(item)]),
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(valueForCompare(left)) === canonicalJson(valueForCompare(right));
}

function assertSame(label: string, actual: unknown, expected: unknown, published = false): void {
  if (!sameValue(actual, expected)) {
    throw new Error(`${published ? "Published content/hash drift" : "Owned content drift"}: ${label}.`);
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parsedSchema(label: string, value: unknown) {
  const parsed = parseSubmissionSchema(value);
  if (!parsed) throw new Error(`${label} does not satisfy the runtime submission-schema contract.`);
  return parsed;
}

function expectPolicyField(fieldKeys: Set<string>, key: unknown, label: string): void {
  if (typeof key !== "string" || !fieldKeys.has(key)) {
    throw new Error(`${label} references a field that is absent from the public schema: ${String(key)}.`);
  }
}

function validateFileContracts(version: AssessmentVersionRelease): void {
  const schema = parsedSchema(`AssessmentVersion ${version.id}.publicSchema`, version.publicSchema);
  const files = new Map(
    schema.fields
      .filter((field) => field.kind === "file" || field.kind === "files")
      .map((field) => [field.key, field]),
  );
  for (const raw of version.publicSchema.fields as ReleaseField[]) {
    if ("file" in raw || "number" in raw) {
      throw new Error(`AssessmentVersion ${version.id} field ${raw.key} uses a nested constraint contract.`);
    }
  }
  for (const file of files.values()) {
    if (!file.acceptedMimeTypes || !file.maxBytes || !file.fileRole) {
      throw new Error(`AssessmentVersion ${version.id} file field ${file.key} lacks MIME, byte, or role constraints.`);
    }
  }
  const expected: Record<string, { mime: string[]; maxBytes: number; exclusive?: boolean }> = {
    "S3-SCALE-03.output": { mime: ["text/csv", "text/plain", "application/json"], maxBytes: 2_000_000 },
    initialFlowchartFile: { mime: ["application/pdf", "image/png"], maxBytes: 10_000_000 },
    revisedFlowchartFile: { mime: ["application/pdf", "image/png"], maxBytes: 10_000_000 },
    blueprintFile: { mime: ["application/json", "text/json"], maxBytes: 2_000_000, exclusive: true },
    runLogFile: { mime: ["application/json", "application/x-ndjson", "text/plain", "text/csv"], maxBytes: 2_000_000 },
    sampleOutputFile: { mime: ["application/json", "application/x-ndjson", "text/plain", "text/csv"], maxBytes: 2_000_000 },
    workflowPngFile: { mime: ["image/png"], maxBytes: 10_000_000 },
  };
  for (const [key, contract] of Object.entries(expected)) {
    const file = files.get(key);
    if (!file) continue;
    if (
      !sameValue(file.acceptedMimeTypes, contract.mime) ||
      file.maxBytes !== contract.maxBytes ||
      Boolean(file.maxBytesExclusive) !== Boolean(contract.exclusive) ||
      file.fileRole !== key
    ) {
      throw new Error(`AssessmentVersion ${version.id} file field ${key} drifts from its authored contract.`);
    }
  }
}

export function validateReleaseContracts(release: Sessions3To5Release): void {
  for (const type of release.assignmentTypes) {
    parsedSchema(`AssignmentType ${type.slug}.submissionSchema`, type.submissionSchema);
  }
  for (const version of release.assessmentVersions) {
    const policies = parseAssessmentPolicies({
      purpose: version.purpose,
      scoringPolicy: version.scoringPolicy,
      portfolioPolicy: version.portfolioPolicy,
      publicationPolicy: version.publicationPolicy,
      exportPolicy: version.exportPolicy,
    });
    if (!policies) {
      throw new Error(`Assessment policy contract is invalid for ${version.id}.`);
    }
    const schema = parsedSchema(`AssessmentVersion ${version.id}.publicSchema`, version.publicSchema);
    const fieldKeys = new Set(schema.fields.map((field) => field.key));
    const fileRoles = new Set(
      schema.fields
        .filter((field) => field.kind === "file" || field.kind === "files")
        .map((field) => field.fileRole ?? field.key),
    );
    validateFileContracts(version);

    for (const surface of [policies.exportPolicy.praxy, policies.exportPolicy.dpdp]) {
      for (const key of surface.fieldKeys) expectPolicyField(fieldKeys, key, `${version.id}.exportPolicy`);
    }
    for (const role of policies.exportPolicy.dpdp.evidenceRoles) {
      if (!fileRoles.has(role)) {
        throw new Error(`${version.id}.exportPolicy references an absent evidence role: ${role}.`);
      }
    }
    if (policies.publicationPolicy) {
      const publication = version.publicationPolicy;
      expectPolicyField(fieldKeys, publication.consentField, `${version.id}.publicationPolicy.consentField`);
      expectPolicyField(fieldKeys, publication.captionField, `${version.id}.publicationPolicy.captionField`);
      for (const key of publication.publicTextFields as unknown[]) {
        expectPolicyField(fieldKeys, key, `${version.id}.publicationPolicy.publicTextFields`);
      }
      const previewRole = publication.previewRole;
      if (previewRole !== "appScreenshot" && (typeof previewRole !== "string" || !fileRoles.has(previewRole))) {
        throw new Error(`${version.id}.publicationPolicy references an absent preview role: ${String(previewRole)}.`);
      }
      for (const rawAction of publication.actions as unknown[]) {
        const action = objectValue(rawAction, `${version.id}.publicationPolicy action`);
        if ("field" in action) expectPolicyField(fieldKeys, action.field, `${version.id}.publicationPolicy action`);
        if ("role" in action && (typeof action.role !== "string" || !fileRoles.has(action.role))) {
          throw new Error(`${version.id}.publicationPolicy action references an absent file role.`);
        }
      }
    }

    const runtime = (() => {
      try {
        return parseAssessmentRuntimeConfig({
          rubric: version.rubric,
          evaluatorConfig: version.evaluator.config,
          answerKey: version.evaluator.answerKey,
          anchors: version.evaluator.anchors,
        });
      } catch (error) {
        if (error instanceof Error) {
          error.message = `AssessmentVersion ${version.id}: ${error.message}`;
        }
        throw error;
      }
    })();
    const inspectionPolicy = parseS4AppInspectionPolicy(
      version.evaluator.config.appInspectionPolicy,
    );
    if (version.id === "assess_s4_app_v1" && !inspectionPolicy) {
      throw new Error(`${version.id} must bind the exact executable S4 app-inspection policy.`);
    }
    if (version.id !== "assess_s4_app_v1" && "appInspectionPolicy" in version.evaluator.config) {
      throw new Error(`${version.id} cannot bind the Session 4 app-inspection policy.`);
    }
    if (version.id.startsWith("assess_s5_")) {
      const workflowPack = schema.fields.find((field) => field.key === "workflowPack");
      if (
        !workflowPack ||
        workflowPack.kind !== "singleChoice" ||
        workflowPack.required !== true ||
        !sameValue(workflowPack.options, SESSION_5_WORKFLOW_PACKS)
      ) {
        throw new Error(`${version.id} must require one stable Session 5 workflow-pack ID.`);
      }
    }
    if (version.id === "assess_s5_workflow_v1") {
      const fixtureKey = parseWorkflowEvaluatorAnswerKey(version.evaluator.answerKey);
      const fixtureObject = release.objects.find(
        (object) => object.key === fixtureKey.bundleObject.s3Key,
      );
      const fixtureMaterial = release.materials.find(
        (material) => material.s3Key === fixtureKey.bundleObject.s3Key,
      );
      if (
        !fixtureObject?.evaluatorOnly ||
        fixtureObject.sha256 !== fixtureKey.bundleObject.sha256 ||
        fixtureObject.sizeBytes !== fixtureKey.bundleObject.sizeBytes ||
        fixtureMaterial?.instructorOnly !== true
      ) {
        throw new Error(`${version.id} must bind one evaluator-only content-addressed fixture bundle.`);
      }
      const expectedFixtureConfig = {
        contractVersion: "s5-workflow-evaluation-v1",
        packField: "workflowPack",
        runLogRole: "runLogFile",
        categories: ["normal", "duplicate", "malformed", "timeout", "approval"],
        deterministicDimension: "functionality",
      };
      const expectedAuthority = {
        usefulnessMax: 30,
        executionMax: 20,
        ownershipMax: 10,
        usefulnessRubricKeys: ["relevance"],
        ownershipRubricKey: "verification-evidence",
      };
      if (
        !sameValue(version.evaluator.config.fixtureEvaluation, expectedFixtureConfig) ||
        !sameValue(version.evaluator.config.workflowAuthority, expectedAuthority) ||
        policies.scoringPolicy.component !== "workflow" ||
        !sameValue(policies.scoringPolicy.dimensions, {
          usefulness: ["relevance"],
          execution: "functionality",
          ownership: "verification-evidence",
        })
      ) {
        throw new Error(`${version.id} drifts from the authored deterministic 30/20/10 authority.`);
      }
    } else if ("fixtureEvaluation" in version.evaluator.config) {
      throw new Error(`${version.id} cannot bind the Session 5 final fixture evaluator.`);
    }
    for (const key of Object.keys(runtime.answerSpecs)) {
      expectPolicyField(fieldKeys, key, `${version.id}.answerKey`);
    }
    const configuredJudgmentIds = Array.isArray(version.evaluator.config.judgmentFieldIds)
      ? version.evaluator.config.judgmentFieldIds
      : [];
    for (const key of configuredJudgmentIds) {
      expectPolicyField(fieldKeys, key, `${version.id}.evaluator.judgmentFieldIds`);
    }
    const approvedProcessors = policies.scoringPolicy.approvedAiProcessors ?? [];
    const providerWorkRequired = runtime.providerMode === "auto" && runtime.judgmentFieldIds.length > 0;
    assertApprovedAssessmentProcessor({
      configuredProcessor: runtime.approvedProcessor,
      approvedProcessors,
      providerWorkRequired,
    });
    if (runtime.providerMode === "none" && approvedProcessors.length > 0) {
      throw new Error(`${version.id} is no-provider but still authorizes an AI processor.`);
    }

    const expectedCounts: Record<string, { objective: number; judgment: number }> = {
      assess_s3_data_v1: { objective: 7, judgment: 9 },
      assess_s3_visuals_v1: { objective: 6, judgment: 6 },
      assess_s4_product_prompt_v1: { objective: 0, judgment: 6 },
      assess_s4_app_v1: { objective: 0, judgment: 4 },
      assess_s5_flowchart_v1: { objective: 0, judgment: 3 },
      assess_s5_revised_flowchart_v1: { objective: 0, judgment: 0 },
      assess_s5_workflow_v1: { objective: 0, judgment: 6 },
    };
    const count = expectedCounts[version.id];
    if (
      !count ||
      Object.keys(runtime.answerSpecs).length !== count.objective ||
      runtime.judgmentFieldIds.length !== count.judgment
    ) {
      throw new Error(`Assessment evaluator field-count drift: ${version.id}.`);
    }
    const recomputed = assessmentVersion({
      ...version,
      evaluator: {
        id: version.evaluator.id,
        config: version.evaluator.config,
        answerKey: version.evaluator.answerKey,
        anchors: version.evaluator.anchors,
        normalization: version.evaluator.normalization,
      },
    });
    if (recomputed.checksumSha256 !== version.checksumSha256) {
      throw new Error(`Assessment version checksum drift: ${version.id}.`);
    }
    if (recomputed.evaluator.checksumSha256 !== version.evaluator.checksumSha256) {
      throw new Error(`Assessment evaluator checksum drift: ${version.id}.`);
    }
  }
}

/** Backwards-compatible name retained for existing loader callers/tests. */
export const validateReleasePolicies = validateReleaseContracts;

function selectedRelease(release: Sessions3To5Release, sessions: ReadonlySet<number>) {
  const materials = release.materials.filter((item) => sessions.has(item.sessionNo));
  const materialKeys = new Set(materials.map((item) => item.s3Key));
  return {
    materials,
    pages: release.pages.filter((item) => sessions.has(item.sessionNo)),
    assignments: release.assignments.filter((item) => sessions.has(item.sessionNo)),
    assignmentTypes: release.assignmentTypes.filter((type) =>
      release.assignments.some(
        (assignment) => sessions.has(assignment.sessionNo) && assignment.assignmentTypeSlug === type.slug,
      ),
    ),
    assessmentVersions: release.assessmentVersions.filter((version) =>
      release.assignments.some(
        (assignment) => sessions.has(assignment.sessionNo) && assignment.id === version.assignmentId,
      ),
    ),
    quizzes: release.quizzes.filter((quiz) => sessions.has(quiz.sessionNo)),
    objects: release.objects.filter((object) => materialKeys.has(object.key)),
  };
}

async function verifyQuizPersistenceContract(db: ReleaseDatabase): Promise<void> {
  try {
    await db.quiz.findMany({
      take: 0,
      select: {
        contractMode: true,
        contractVersion: true,
        classification: true,
        countsTowardBestOf: true,
        classificationFinalizedAt: true,
        classifiedBy: true,
        feedbackReleaseAt: true,
        answerMode: true,
        contentHash: true,
        publishedAt: true,
      },
    });
  } catch (error) {
    throw new Error(
      "S4/S5 quiz loading requires the migrated versioned stable-ID Quiz schema; apply the forward migration and regenerate Prisma before retrying.",
      { cause: error },
    );
  }
}

async function ensureObjects(args: {
  objects: ReleaseObject[];
  store: ReleaseObjectStore;
  dryRun: boolean;
  report: ReleaseReport;
}): Promise<void> {
  for (const object of args.objects) {
    const existing = await args.store.stat(object.key);
    if (existing) {
      if (existing.sizeBytes !== object.sizeBytes || existing.sha256 !== object.sha256) {
        throw new Error(`Content-addressed object drift: ${object.key}.`);
      }
      args.report.objects.unchanged.push(object.key);
      continue;
    }
    args.report.objects.created.push(object.key);
    if (!args.dryRun) await args.store.put(object);
  }
}

function reportCreate(report: ReleaseReport, kind: string, id: string): void {
  report.database.created.push(`${kind}:${id}`);
}

function reportUpdate(report: ReleaseReport, kind: string, id: string): void {
  report.database.updated.push(`${kind}:${id}`);
}

function reportUnchanged(report: ReleaseReport, kind: string, id: string): void {
  report.database.unchanged.push(`${kind}:${id}`);
}

function reportPreserved(report: ReleaseReport, kind: string, id: string): void {
  report.database.preserved.push(`${kind}:${id}`);
}

async function assertNoUnboundOwnedSubmissions(
  tx: Prisma.TransactionClient,
  assignmentIds: string[],
): Promise<void> {
  const blocked = await tx.submission.findMany({
    where: {
      assignmentId: { in: assignmentIds },
      assessmentVersionId: null,
    },
    select: { id: true, assignmentId: true, status: true },
  });
  const blockedIds = [...new Set(blocked.map((submission) => submission.assignmentId))].sort();
  if (blockedIds.length > 0) {
    throw new Error(
      `Cannot migrate ${blockedIds.length} owned assignment${blockedIds.length === 1 ? "" : "s"} to versioned contracts: ` +
      `${blocked.length} unbound legacy submission${blocked.length === 1 ? "" : "s"} exist for ${blockedIds.join(", ")}. ` +
      "Archive or migrate each historical contract explicitly before retrying; an in-place cutover would reinterpret saved fields and grades.",
    );
  }
}

async function ensureRetentionPolicies(
  tx: Prisma.TransactionClient,
  release: Sessions3To5Release,
  report: ReleaseReport,
  dryRun: boolean,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const policy of release.retentionPolicies) {
    const existing = await tx.retentionPolicy.findUnique({ where: { classKey: policy.classKey } });
    const expected = {
      id: policy.id,
      classKey: policy.classKey,
      objectClass: policy.objectClass,
      expiresAfterDays: policy.expiresAfterDays,
      deletionAuthority: policy.deletionAuthority,
      legalHoldBehavior: policy.legalHoldBehavior,
      s3CleanupRequired: policy.s3CleanupRequired,
      databaseCleanupPolicy: policy.databaseCleanupPolicy,
    };
    if (existing) {
      assertSame(`RetentionPolicy ${policy.classKey}`, {
        id: existing.id,
        classKey: existing.classKey,
        objectClass: existing.objectClass,
        expiresAfterDays: existing.expiresAfterDays,
        deletionAuthority: existing.deletionAuthority,
        legalHoldBehavior: existing.legalHoldBehavior,
        s3CleanupRequired: existing.s3CleanupRequired,
        databaseCleanupPolicy: existing.databaseCleanupPolicy,
      }, expected);
      ids.set(policy.classKey, existing.id);
      reportUnchanged(report, "RetentionPolicy", existing.id);
      continue;
    }
    ids.set(policy.classKey, policy.id);
    reportCreate(report, "RetentionPolicy", policy.id);
    if (!dryRun) await tx.retentionPolicy.create({ data: expected });
  }
  return ids;
}

async function ensureAssignmentTypes(args: {
  tx: Prisma.TransactionClient;
  types: AssignmentTypeRelease[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const type of args.types) {
    const existing = await args.tx.assignmentType.findUnique({ where: { slug: type.slug } });
    const expected = {
      id: type.id,
      slug: type.slug,
      title: type.title,
      description: type.description,
      teamBased: type.teamBased,
      galleryEligible: type.galleryEligible,
      aiGraded: type.aiGraded,
      submissionSchema: type.submissionSchema,
      rubric: type.rubric,
    };
    if (!existing) {
      ids.set(type.slug, type.id);
      reportCreate(args.report, "AssignmentType", type.id);
      if (!args.dryRun) {
        await args.tx.assignmentType.create({
          data: {
            ...expected,
            submissionSchema: jsonInput(expected.submissionSchema),
            rubric: jsonInput(expected.rubric),
          },
        });
      }
      continue;
    }
    if (existing.id !== type.id) {
      throw new Error(`Owned content drift: AssignmentType ${type.slug} has unexpected stable ID ${existing.id}.`);
    }
    ids.set(type.slug, existing.id);
    const actual = {
      id: existing.id,
      slug: existing.slug,
      title: existing.title,
      description: existing.description,
      teamBased: existing.teamBased,
      galleryEligible: existing.galleryEligible,
      aiGraded: existing.aiGraded,
      submissionSchema: existing.submissionSchema,
      rubric: existing.rubric,
    };
    if (sameValue(actual, expected)) {
      reportUnchanged(args.report, "AssignmentType", existing.id);
      continue;
    }
    const recognizedLegacy = type.legacyFingerprints?.some((fragment) =>
      existing.description.includes(fragment),
    );
    if (!recognizedLegacy) {
      throw new Error(`Owned content drift: AssignmentType ${type.slug} is neither the known legacy row nor this release.`);
    }
    reportUpdate(args.report, "AssignmentType", existing.id);
    if (!args.dryRun) {
      await args.tx.assignmentType.update({
        where: { id: existing.id },
        data: {
          title: type.title,
          description: type.description,
          teamBased: type.teamBased,
          galleryEligible: type.galleryEligible,
          aiGraded: type.aiGraded,
          submissionSchema: jsonInput(type.submissionSchema),
          rubric: jsonInput(type.rubric),
        },
      });
    }
  }
  return ids;
}

async function ensureAssignments(args: {
  tx: Prisma.TransactionClient;
  assignments: AssignmentRelease[];
  typeIds: Map<string, string>;
  sectionIds: string[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  for (const assignment of args.assignments) {
    const assignmentTypeId = args.typeIds.get(assignment.assignmentTypeSlug);
    if (!assignmentTypeId) throw new Error(`Missing assignment type ${assignment.assignmentTypeSlug}.`);
    const existing = await args.tx.assignment.findUnique({ where: { id: assignment.id } });
    const expected = {
      assignmentTypeId,
      title: assignment.title,
      brief: assignment.brief,
      sessionNo: assignment.sessionNo,
      weightBucket: assignment.weightBucket,
      sectionIds: [...args.sectionIds].sort(),
      contractMode: "versioned" as const,
    };
    if (!existing) {
      reportCreate(args.report, "Assignment", assignment.id);
      if (!args.dryRun) {
        await args.tx.assignment.create({
          data: { id: assignment.id, ...expected },
        });
      }
      continue;
    }
    const actual = {
      assignmentTypeId: existing.assignmentTypeId,
      title: existing.title,
      brief: existing.brief,
      sessionNo: existing.sessionNo,
      weightBucket: existing.weightBucket,
      sectionIds: [...existing.sectionIds].sort(),
      contractMode: existing.contractMode,
    };
    if (sameValue(actual, expected)) {
      reportUnchanged(args.report, "Assignment", existing.id);
      continue;
    }
    const recognizedLegacy = existing.contractMode === "legacy" &&
      (assignment.legacyTitles?.includes(existing.title) ?? false);
    if (!recognizedLegacy) {
      throw new Error(`Owned content drift: Assignment ${assignment.id} is neither the known legacy row nor this release.`);
    }
    reportUpdate(args.report, "Assignment", existing.id);
    if (!args.dryRun) {
      await args.tx.assignment.update({ where: { id: existing.id }, data: expected });
    }
  }
}

async function ensureMaterials(args: {
  tx: Prisma.TransactionClient;
  materials: MaterialRelease[];
  sectionIds: string[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  for (const material of args.materials) {
    const existing = await args.tx.material.findUnique({ where: { id: material.id } });
    const expectedContent = {
      sessionNo: material.sessionNo,
      title: material.title,
      kind: material.kind,
      s3Key: material.s3Key,
      externalUrl: null,
      version: material.version,
      sizeBytes: material.sizeBytes,
      instructorOnly: material.instructorOnly,
    };
    if (!existing) {
      reportCreate(args.report, "Material", material.id);
      if (!args.dryRun) {
        await args.tx.material.create({
          data: { id: material.id, ...expectedContent, sectionIds: args.sectionIds },
        });
      }
      continue;
    }
    assertSame(`Material ${material.id}`, {
      sessionNo: existing.sessionNo,
      title: existing.title,
      kind: existing.kind,
      s3Key: existing.s3Key,
      externalUrl: existing.externalUrl,
      version: existing.version,
      sizeBytes: existing.sizeBytes,
      instructorOnly: existing.instructorOnly,
    }, expectedContent);
    if (sameValue([...existing.sectionIds].sort(), [...args.sectionIds].sort())) {
      reportUnchanged(args.report, "Material", material.id);
    } else {
      reportUpdate(args.report, "Material.sections", material.id);
      if (!args.dryRun) {
        await args.tx.material.update({ where: { id: material.id }, data: { sectionIds: args.sectionIds } });
      }
    }
  }
}

function mergeOwnedLinks(existing: string[], desired: string[], stale: string[]): string[] {
  const desiredSet = new Set(desired);
  const staleSet = new Set(stale);
  const preserved = existing.filter((id) => !desiredSet.has(id) && !staleSet.has(id));
  return [...desired, ...preserved];
}

async function ensurePages(args: {
  tx: Prisma.TransactionClient;
  pages: PageRelease[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<Map<number, string>> {
  const pageIds = new Map<number, string>();
  for (const page of args.pages) {
    const existing = await args.tx.sessionPage.findUnique({ where: { sessionNo: page.sessionNo } });
    if (!existing) {
      pageIds.set(page.sessionNo, page.id);
      reportCreate(args.report, "SessionPage", page.id);
      if (!args.dryRun) {
        await args.tx.sessionPage.create({
          data: {
            id: page.id,
            sessionNo: page.sessionNo,
            title: page.title,
            summaryMd: page.summaryMd,
            orderedMaterialIds: page.orderedMaterialIds,
            linkedAssignmentIds: page.linkedAssignmentIds,
            linkedQuizIds: page.linkedQuizIds,
          },
        });
      }
      continue;
    }
    pageIds.set(page.sessionNo, existing.id);
    const legacy = page.legacyTitles.includes(existing.title);
    const authored = existing.title === page.title && existing.summaryMd === page.summaryMd;
    const contentData = legacy
      ? { title: page.title, summaryMd: page.summaryMd }
      : { title: existing.title, summaryMd: existing.summaryMd };
    if (!legacy && !authored) reportPreserved(args.report, "SessionPage.authored-content", existing.id);
    const next = {
      ...contentData,
      orderedMaterialIds: mergeOwnedLinks(
        existing.orderedMaterialIds,
        page.orderedMaterialIds,
        page.staleMaterialIds,
      ),
      linkedAssignmentIds: mergeOwnedLinks(
        existing.linkedAssignmentIds,
        page.linkedAssignmentIds,
        page.staleAssignmentIds,
      ),
      linkedQuizIds: mergeOwnedLinks(existing.linkedQuizIds, page.linkedQuizIds, page.staleQuizIds),
    };
    const current = {
      title: existing.title,
      summaryMd: existing.summaryMd,
      orderedMaterialIds: existing.orderedMaterialIds,
      linkedAssignmentIds: existing.linkedAssignmentIds,
      linkedQuizIds: existing.linkedQuizIds,
    };
    if (sameValue(current, next)) {
      reportUnchanged(args.report, "SessionPage", existing.id);
      continue;
    }
    reportUpdate(args.report, "SessionPage", existing.id);
    if (!args.dryRun) await args.tx.sessionPage.update({ where: { id: existing.id }, data: next });
  }
  return pageIds;
}

async function ensureDatasetRelease(args: {
  tx: Prisma.TransactionClient;
  release: Sessions3To5Release["datasetRelease"];
  retentionPolicyId: string;
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  let existing = await args.tx.datasetRelease.findUnique({
    where: { slug_version: { slug: args.release.slug, version: args.release.version } },
  });
  const expected = {
    id: args.release.id,
    slug: args.release.slug,
    version: args.release.version,
    title: args.release.title,
    lineage: args.release.lineage,
    sourceDate: args.release.sourceDate,
    audience: args.release.audience,
    processingRules: args.release.processingRules,
    approvedAiProcessors: args.release.approvedAiProcessors,
    manifest: args.release.manifest,
    checksumSha256: args.release.checksumSha256,
    retentionPolicyId: args.retentionPolicyId,
    supersedesId: null,
    createdBy: PRISMA_RELEASE_ACTOR,
  };
  if (!existing) {
    reportCreate(args.report, "DatasetRelease", args.release.id);
    if (!args.dryRun) {
      existing = await args.tx.datasetRelease.create({
        data: {
          ...expected,
          lineage: jsonInput(expected.lineage),
          processingRules: jsonInput(expected.processingRules),
          manifest: jsonInput(expected.manifest),
          publishedAt: null,
        },
      });
    }
  } else {
    if (existing.id !== args.release.id) {
      throw new Error(`Owned content drift: DatasetRelease ${args.release.slug}@${args.release.version} has unexpected stable ID.`);
    }
    assertSame(`DatasetRelease ${existing.id}`, {
      id: existing.id,
      slug: existing.slug,
      version: existing.version,
      title: existing.title,
      lineage: existing.lineage,
      sourceDate: existing.sourceDate,
      audience: existing.audience,
      processingRules: existing.processingRules,
      approvedAiProcessors: existing.approvedAiProcessors,
      manifest: existing.manifest,
      checksumSha256: existing.checksumSha256,
      retentionPolicyId: existing.retentionPolicyId,
      supersedesId: existing.supersedesId,
      createdBy: existing.createdBy,
    }, expected, existing.publishedAt !== null);
    reportUnchanged(args.report, "DatasetRelease", existing.id);
  }

  const currentFiles = await args.tx.datasetReleaseFile.findMany({
    where: { datasetReleaseId: args.release.id },
  });
  const currentById = new Map(currentFiles.map((file) => [file.id, file]));
  const expectedIds = new Set(args.release.files.map((file) => file.id));
  for (const file of currentFiles) {
    if (!expectedIds.has(file.id)) {
      throw new Error(`Owned content drift: DatasetRelease ${args.release.id} has unexpected file ${file.id}.`);
    }
  }
  for (const file of args.release.files) {
    const current = currentById.get(file.id);
    const expectedFile = {
      id: file.id,
      datasetReleaseId: args.release.id,
      role: file.role,
      s3Key: file.s3Key,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    };
    if (current) {
      assertSame(`DatasetReleaseFile ${file.id}`, {
        id: current.id,
        datasetReleaseId: current.datasetReleaseId,
        role: current.role,
        s3Key: current.s3Key,
        sha256: current.sha256,
        sizeBytes: current.sizeBytes,
        mimeType: current.mimeType,
      }, expectedFile, existing?.publishedAt !== null);
      reportUnchanged(args.report, "DatasetReleaseFile", file.id);
      continue;
    }
    if (existing?.publishedAt) {
      throw new Error(`Published content/hash drift: DatasetRelease ${args.release.id} is missing file ${file.id}.`);
    }
    reportCreate(args.report, "DatasetReleaseFile", file.id);
    if (!args.dryRun) await args.tx.datasetReleaseFile.create({ data: expectedFile });
  }

  if (!existing?.publishedAt) {
    reportUpdate(args.report, "DatasetRelease.publish", args.release.id);
    if (!args.dryRun) {
      await args.tx.datasetRelease.update({
        where: { id: args.release.id },
        data: { publishedAt: new Date() },
      });
    }
  }
}

function expectedAssessmentParent(
  version: AssessmentVersionRelease,
  retentionPolicyId: string,
) {
  return {
    id: version.id,
    assignmentId: version.assignmentId,
    version: version.version,
    ownerKind: version.ownerKind,
    purpose: version.purpose,
    publicSchema: version.publicSchema,
    rubric: version.rubric,
    materialManifest: version.materialManifest,
    checksumSha256: version.checksumSha256,
    scoringPolicy: version.scoringPolicy,
    portfolioPolicy: version.portfolioPolicy,
    publicationPolicy: version.publicationPolicy,
    exportPolicy: version.exportPolicy,
    previewPolicy: version.previewPolicy,
    datasetReleaseId: version.datasetReleaseId,
    retentionPolicyId,
    improvementAllowed: version.improvementAllowed,
    improvementWindowDays: version.improvementWindowDays,
    supersedesId: null,
    createdBy: PRISMA_RELEASE_ACTOR,
  };
}

async function ensureAssessmentVersions(args: {
  tx: Prisma.TransactionClient;
  versions: AssessmentVersionRelease[];
  retentionPolicyIds: Map<string, string>;
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  for (const version of args.versions) {
    const retentionPolicyId = args.retentionPolicyIds.get(version.retentionClassKey);
    if (!retentionPolicyId) throw new Error(`Missing retention policy ${version.retentionClassKey}.`);
    let existing = await args.tx.assessmentVersion.findUnique({ where: { id: version.id } });
    const byNaturalKey = await args.tx.assessmentVersion.findUnique({
      where: { assignmentId_version: { assignmentId: version.assignmentId, version: version.version } },
    });
    if (byNaturalKey && byNaturalKey.id !== version.id) {
      throw new Error(`Owned content drift: AssessmentVersion ${version.assignmentId}@${version.version} has unexpected stable ID.`);
    }
    const expected = expectedAssessmentParent(version, retentionPolicyId);
    if (!existing) {
      reportCreate(args.report, "AssessmentVersion", version.id);
      if (!args.dryRun) {
        existing = await args.tx.assessmentVersion.create({
          data: {
            ...expected,
            publicSchema: jsonInput(expected.publicSchema),
            rubric: jsonInput(expected.rubric),
            materialManifest: jsonInput(expected.materialManifest),
            scoringPolicy: jsonInput(expected.scoringPolicy),
            portfolioPolicy: jsonInput(expected.portfolioPolicy),
            publicationPolicy: jsonInput(expected.publicationPolicy),
            exportPolicy: jsonInput(expected.exportPolicy),
            previewPolicy: jsonInput(expected.previewPolicy),
            publishedAt: null,
          },
        });
      }
    } else {
      assertSame(`AssessmentVersion ${version.id}`, {
        id: existing.id,
        assignmentId: existing.assignmentId,
        version: existing.version,
        ownerKind: existing.ownerKind,
        purpose: existing.purpose,
        publicSchema: existing.publicSchema,
        rubric: existing.rubric,
        materialManifest: existing.materialManifest,
        checksumSha256: existing.checksumSha256,
        scoringPolicy: existing.scoringPolicy,
        portfolioPolicy: existing.portfolioPolicy,
        publicationPolicy: existing.publicationPolicy,
        exportPolicy: existing.exportPolicy,
        previewPolicy: existing.previewPolicy,
        datasetReleaseId: existing.datasetReleaseId,
        retentionPolicyId: existing.retentionPolicyId,
        improvementAllowed: existing.improvementAllowed,
        improvementWindowDays: existing.improvementWindowDays,
        supersedesId: existing.supersedesId,
        createdBy: existing.createdBy,
      }, expected, existing.publishedAt !== null);
      reportUnchanged(args.report, "AssessmentVersion", version.id);
    }

    const evaluator = await args.tx.assessmentEvaluatorConfig.findUnique({
      where: { assessmentVersionId: version.id },
    });
    const expectedEvaluator = {
      id: version.evaluator.id,
      assessmentVersionId: version.id,
      config: version.evaluator.config,
      answerKey: version.evaluator.answerKey,
      anchors: version.evaluator.anchors,
      normalization: version.evaluator.normalization,
      checksumSha256: version.evaluator.checksumSha256,
    };
    if (!evaluator) {
      if (existing?.publishedAt) {
        throw new Error(`Published content/hash drift: AssessmentVersion ${version.id} is missing evaluator config.`);
      }
      reportCreate(args.report, "AssessmentEvaluatorConfig", version.evaluator.id);
      if (!args.dryRun) {
        await args.tx.assessmentEvaluatorConfig.create({
          data: {
            ...expectedEvaluator,
            config: jsonInput(expectedEvaluator.config),
            answerKey: expectedEvaluator.answerKey === null
              ? Prisma.JsonNull
              : jsonInput(expectedEvaluator.answerKey),
            anchors: expectedEvaluator.anchors === null
              ? Prisma.JsonNull
              : jsonInput(expectedEvaluator.anchors),
            normalization: expectedEvaluator.normalization === null
              ? Prisma.JsonNull
              : jsonInput(expectedEvaluator.normalization),
          },
        });
      }
    } else {
      assertSame(`AssessmentEvaluatorConfig ${version.evaluator.id}`, {
        id: evaluator.id,
        assessmentVersionId: evaluator.assessmentVersionId,
        config: evaluator.config,
        answerKey: evaluator.answerKey,
        anchors: evaluator.anchors,
        normalization: evaluator.normalization,
        checksumSha256: evaluator.checksumSha256,
      }, expectedEvaluator, existing?.publishedAt !== null);
      reportUnchanged(args.report, "AssessmentEvaluatorConfig", evaluator.id);
    }

    if (!existing?.publishedAt) {
      reportUpdate(args.report, "AssessmentVersion.publish", version.id);
      if (!args.dryRun) {
        await args.tx.assessmentVersion.update({
          where: { id: version.id },
          data: { publishedAt: new Date() },
        });
      }
    }
  }
}

async function pointAssignmentsAtVersions(args: {
  tx: Prisma.TransactionClient;
  assignments: AssignmentRelease[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  for (const assignment of args.assignments) {
    const current = await args.tx.assignment.findUnique({
      where: { id: assignment.id },
      select: { activeAssessmentVersionId: true },
    });
    if (!current) {
      if (args.dryRun) {
        reportUpdate(args.report, "Assignment.active-version", assignment.id);
        continue;
      }
      throw new Error(`Assignment disappeared during release: ${assignment.id}.`);
    }
    if (current.activeAssessmentVersionId === assignment.assessmentVersionId) {
      reportUnchanged(args.report, "Assignment.active-version", assignment.id);
      continue;
    }
    if (current.activeAssessmentVersionId) {
      const active = await args.tx.assessmentVersion.findUnique({
        where: { id: current.activeAssessmentVersionId },
        select: { assignmentId: true, version: true, publishedAt: true },
      });
      if (
        active?.assignmentId === assignment.id &&
        active.publishedAt &&
        active.version > 1
      ) {
        reportPreserved(args.report, "Assignment.newer-active-version", assignment.id);
        continue;
      }
      throw new Error(`Owned content drift: Assignment ${assignment.id} points at an unexpected assessment version.`);
    }
    reportUpdate(args.report, "Assignment.active-version", assignment.id);
    if (!args.dryRun) {
      await args.tx.assignment.update({
        where: { id: assignment.id },
        data: { activeAssessmentVersionId: assignment.assessmentVersionId },
      });
    }
  }
}

async function ensureQuizzes(args: {
  tx: Prisma.TransactionClient;
  quizzes: QuizRelease[];
  sectionIds: string[];
  report: ReleaseReport;
  dryRun: boolean;
}): Promise<void> {
  for (const quiz of args.quizzes) {
    const existing = await args.tx.quiz.findUnique({ where: { id: quiz.id } });
    const expectedContract = {
      id: quiz.id,
      sessionNo: quiz.sessionNo,
      title: quiz.title,
      questions: quiz.questions,
      sectionIds: [...args.sectionIds].sort(),
      isDiagnostic: false,
      contractMode: quiz.contractMode,
      contractVersion: quiz.contractVersion,
      answerMode: quiz.answerMode,
      contentHash: quiz.contentHash,
    };
    if (!existing) {
      reportCreate(args.report, "Quiz.dormant", quiz.id);
      if (!args.dryRun) {
        await args.tx.quiz.create({
          data: {
            ...expectedContract,
            questions: jsonInput(quiz.questions),
            classification: quiz.classification,
            countsTowardBestOf: false,
            classificationFinalizedAt: null,
            classifiedBy: null,
            feedbackReleaseAt: null,
            publishedAt: null,
          },
        });
      }
      continue;
    }
    assertSame(`Quiz ${quiz.id}`, {
      id: existing.id,
      sessionNo: existing.sessionNo,
      title: existing.title,
      questions: existing.questions,
      sectionIds: [...existing.sectionIds].sort(),
      isDiagnostic: existing.isDiagnostic,
      contractMode: existing.contractMode,
      contractVersion: existing.contractVersion,
      answerMode: existing.answerMode,
      contentHash: existing.contentHash,
    }, expectedContract, existing.publishedAt !== null);
    // Classification and publication are instructor-owned after initial load.
    // A rerun asserts content identity but never resets or arms them.
    reportPreserved(args.report, "Quiz.classification-publication", quiz.id);
  }
}

async function ensureLockedGates(args: {
  tx: Prisma.TransactionClient;
  sectionIds: string[];
  pageIds: Map<number, string>;
  selected: ReturnType<typeof selectedRelease>;
  report: ReleaseReport;
  dryRun: boolean;
  forceLock: boolean;
}): Promise<void> {
  const targets = [
    ...args.selected.pages.map((page) => ({
      targetType: "session" as const,
      targetId: args.pageIds.get(page.sessionNo) ?? page.id,
    })),
    ...args.selected.materials.map((material) => ({ targetType: "material" as const, targetId: material.id })),
    ...args.selected.assignments.map((assignment) => ({ targetType: "assignment" as const, targetId: assignment.id })),
    ...args.selected.quizzes.map((quiz) => ({ targetType: "quiz" as const, targetId: quiz.id })),
  ];
  const existing = await args.tx.gate.findMany({
    where: {
      sectionId: { in: args.sectionIds },
      OR: targets.map((target) => ({
        targetType: target.targetType,
        targetId: target.targetId,
      })),
    },
    select: { targetType: true, targetId: true, sectionId: true, state: true, opensAt: true },
  });
  if (args.forceLock) {
    const exceptions = await args.tx.gateException.findMany({
      where: {
        sectionId: { in: args.sectionIds },
        OR: targets.map((target) => ({
          targetType: target.targetType,
          targetId: target.targetId,
        })),
      },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        userId: true,
        expiresAt: true,
      },
    });
    const now = new Date();
    const liveExceptions = exceptions.filter(
      (exception) => exception.expiresAt === null || exception.expiresAt > now,
    );
    if (liveExceptions.length > 0) {
      const affected = liveExceptions
        .map((exception) => `${exception.targetType}:${exception.targetId}:${exception.userId}`)
        .join(", ");
      throw new Error(
        `Force-lock blocked by ${liveExceptions.length} live gate exception(s): ${affected}`,
      );
    }
  }
  const existingKeys = new Set(
    existing.map((gate) => `${gate.targetType}:${gate.targetId}:${gate.sectionId}`),
  );
  const missing = args.sectionIds.flatMap((sectionId) =>
    targets.flatMap((target) => {
      const key = `${target.targetType}:${target.targetId}:${sectionId}`;
      return existingKeys.has(key)
        ? []
        : [{ ...target, sectionId, state: "locked" as const, changedBy: PRISMA_RELEASE_ACTOR }];
    }),
  );
  for (const gate of existing) {
    const gateKey = `${gate.targetType}:${gate.targetId}:${gate.sectionId}`;
    if (args.forceLock && (gate.state !== "locked" || gate.opensAt !== null)) {
      reportUpdate(args.report, "Gate.locked", gateKey);
      if (!args.dryRun) {
        await args.tx.gate.update({
          where: {
            targetType_targetId_sectionId: {
              targetType: gate.targetType,
              targetId: gate.targetId,
              sectionId: gate.sectionId,
            },
          },
          data: {
            state: "locked",
            opensAt: null,
            openedAt: null,
            closedAt: null,
            changedBy: PRISMA_RELEASE_ACTOR,
          },
        });
      }
    } else {
      reportPreserved(args.report, "Gate", gateKey);
    }
  }
  for (const gate of missing) {
    reportCreate(args.report, "Gate.locked", `${gate.targetType}:${gate.targetId}:${gate.sectionId}`);
  }
  if (!args.dryRun && missing.length > 0) {
    await args.tx.gate.createMany({ data: missing, skipDuplicates: true });
  }
}

export async function reconcileSessions3To5(args: {
  db: ReleaseDatabase;
  objectStore: ReleaseObjectStore;
  release: Sessions3To5Release;
  sessions?: Array<3 | 4 | 5>;
  dryRun?: boolean;
  forceLockGates?: boolean;
}): Promise<ReleaseReport> {
  const sessions = [...new Set(args.sessions ?? [3, 4, 5])].sort() as Array<3 | 4 | 5>;
  if (sessions.length === 0 || sessions.some((session) => ![3, 4, 5].includes(session))) {
    throw new Error("Sessions must be a non-empty subset of 3,4,5.");
  }
  validateReleasePolicies(args.release);
  const selected = selectedRelease(args.release, new Set(sessions));
  const dryRun = args.dryRun ?? false;
  const report: ReleaseReport = {
    releaseId: args.release.releaseId,
    dryRun,
    sessions,
    objects: { created: [], unchanged: [] },
    database: { created: [], updated: [], unchanged: [], preserved: [] },
    warnings: [],
  };

  // Stable-ID engine/schema, cutover, and policy preflights happen before the
  // first object upload or database mutation. The cutover guard is repeated in
  // the write transaction below so a concurrent legacy submission cannot race
  // the read-only check and be reinterpreted by the new contract.
  if (selected.quizzes.length > 0) await verifyQuizPersistenceContract(args.db);
  await args.db.$transaction(async (tx) => {
    await assertNoUnboundOwnedSubmissions(tx, selected.assignments.map((assignment) => assignment.id));
  });
  await ensureObjects({ objects: selected.objects, store: args.objectStore, dryRun, report });

  await args.db.$transaction(async (tx) => {
    const sectionIds = (await tx.section.findMany({ select: { id: true } }))
      .map((section) => section.id)
      .sort();
    if (sectionIds.length === 0) throw new Error("No course sections exist; run production bootstrap first.");
    await assertNoUnboundOwnedSubmissions(tx, selected.assignments.map((assignment) => assignment.id));
    const retentionPolicyIds = await ensureRetentionPolicies(tx, args.release, report, dryRun);
    const typeIds = await ensureAssignmentTypes({
      tx,
      types: selected.assignmentTypes,
      report,
      dryRun,
    });
    await ensureAssignments({
      tx,
      assignments: selected.assignments,
      typeIds,
      sectionIds,
      report,
      dryRun,
    });
    await ensureMaterials({ tx, materials: selected.materials, sectionIds, report, dryRun });
    const pageIds = await ensurePages({ tx, pages: selected.pages, report, dryRun });
    if (sessions.includes(3)) {
      const retentionPolicyId = retentionPolicyIds.get(args.release.datasetRelease.retentionClassKey);
      if (!retentionPolicyId) throw new Error("Missing dataset retention policy.");
      await ensureDatasetRelease({
        tx,
        release: args.release.datasetRelease,
        retentionPolicyId,
        report,
        dryRun,
      });
    }
    await ensureAssessmentVersions({
      tx,
      versions: selected.assessmentVersions,
      retentionPolicyIds,
      report,
      dryRun,
    });
    await pointAssignmentsAtVersions({ tx, assignments: selected.assignments, report, dryRun });
    await ensureQuizzes({ tx, quizzes: selected.quizzes, sectionIds, report, dryRun });
    await ensureLockedGates({
      tx,
      sectionIds,
      pageIds,
      selected,
      report,
      dryRun,
      forceLock: args.forceLockGates ?? false,
    });
  });

  for (const group of [
    report.objects.created,
    report.objects.unchanged,
    report.database.created,
    report.database.updated,
    report.database.unchanged,
    report.database.preserved,
  ]) {
    group.sort();
  }
  return report;
}

function isS3Missing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

export const s3ReleaseObjectStore: ReleaseObjectStore = {
  async stat(key) {
    try {
      const metadata = await headObject(key);
      const bytes = await readObjectVersion(key, metadata.versionId, metadata.contentLength);
      return { sizeBytes: metadata.contentLength, sha256: sha256(bytes) };
    } catch (error) {
      if (isS3Missing(error)) return null;
      throw error;
    }
  },
  async put(object) {
    const receipt = await putObject(object.key, object.bytes, object.mimeType);
    const stored = await readObjectVersion(object.key, receipt.versionId, object.sizeBytes);
    if (sha256(stored) !== object.sha256) {
      throw new Error(`Uploaded object checksum mismatch: ${object.key}.`);
    }
  },
};

function parseSessions(value: string | undefined): Array<3 | 4 | 5> {
  if (!value) return [3, 4, 5];
  const parsed = value.split(",").map((part) => Number(part.trim()));
  if (parsed.length === 0 || parsed.some((session) => ![3, 4, 5].includes(session))) {
    throw new Error("--sessions must be a comma-separated subset of 3,4,5.");
  }
  return [...new Set(parsed)] as Array<3 | 4 | 5>;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const reportJson = argv.includes("--report-json");
  const forceLockGates = argv.includes("--force-lock-gates");
  const sessionsArg = argv.find((arg) => arg.startsWith("--sessions="))?.split("=", 2)[1];
  const privateDirArg = argv.find((arg) => arg.startsWith("--private-dir="))?.split("=", 2)[1];
  const lmsRoot = dirname(fileURLToPath(import.meta.url));
  const resolvedLmsRoot = join(lmsRoot, "..");
  const privateDirectory = privateDirArg ?? join(
    resolvedLmsRoot,
    "private/course-data/session-03/generated/v1",
  );
  const release = buildSessions3To5Release({
    lmsRoot: resolvedLmsRoot,
    privateData: loadPrivateCourseDataPackage({ directory: privateDirectory }),
    quizPackage: loadQuizImportPackage({ lmsRoot: resolvedLmsRoot }),
  });
  const db = new PrismaClient();
  try {
    let objectStore = s3ReleaseObjectStore;
    if (dryRun && !s3Configured()) {
      objectStore = {
        stat: async () => null,
        put: async () => {
          throw new Error("Dry-run object store must never write.");
        },
      };
    }
    const report = await reconcileSessions3To5({
      db,
      objectStore,
      release,
      sessions: parseSessions(sessionsArg),
      dryRun,
      forceLockGates,
    });
    if (dryRun && !s3Configured()) {
      report.warnings.push("S3 is not configured; object entries are reported as would-upload without a remote HEAD check.");
    }
    if (reportJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `[sessions3-5] ${dryRun ? "dry-run" : "reconcile"} ${report.releaseId}: ` +
          `${report.objects.created.length} objects to create, ` +
          `${report.database.created.length} DB rows to create, ` +
          `${report.database.updated.length} owned updates, ` +
          `${report.database.preserved.length} instructor-owned rows preserved`,
      );
      for (const warning of report.warnings) console.warn(`[sessions3-5] ${warning}`);
    }
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/sessions3-5-setup.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
