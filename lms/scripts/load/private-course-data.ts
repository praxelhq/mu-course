import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  parseStableQuestions,
  stableQuestionsContentHash,
  type StableStoredQuestion,
} from "../../lib/quizzes/versioned";
import { sha256CanonicalJson } from "../../lib/canonical-json";

export { canonicalJson } from "../../lib/canonical-json";

const SHA256_RE = /^[0-9a-f]{64}$/;

export const REQUIRED_PRIVATE_ROLES = [
  "learner_csv",
  "representative_sample",
  "schema",
  "peer_comparisons_sample",
  "peer_comparisons",
  "fact_pack",
  "evaluator_adapter",
] as const;

const EVALUATOR_ONLY_ROLES = new Set(["fact_pack", "evaluator_adapter"]);

export type VerifiedPrivateFile = {
  role: string;
  filename: string;
  bytes: Uint8Array;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  audience: string;
  evaluatorOnly: boolean;
  s3Key: string;
};

export type VerifiedPrivateCourseData = {
  datasetVersion: string;
  manifestVersion: string;
  manifestChecksumSha256: string;
  lineage: Record<string, unknown>;
  generation: Record<string, unknown>;
  sizeProof: Record<string, unknown>;
  usageNotice: Record<string, unknown>;
  files: VerifiedPrivateFile[];
};

export type VerifiedQuiz = {
  id: string;
  versionId: string;
  sessionNo: 4 | 5;
  title: string;
  timeLimitSeconds: number;
  questions: StableStoredQuestion[];
  contentHash: string;
  sourcePath: string;
  sourceSha256: string;
};

export type VerifiedQuizImportPackage = {
  packageVersion: string;
  manifestChecksumSha256: string;
  formativeAssessments: Array<{
    id: string;
    versionId: string;
    sessionNo: 3;
    title: string;
    publicSchema: { version: 1; fields: JsonObject[] };
    evaluatorAnswerKey: { specs: JsonObject };
    judgmentFieldIds: string[];
    publicChecksumSha256: string;
    evaluatorChecksumSha256: string;
  }>;
  quizzes: VerifiedQuiz[];
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requiredPositiveInt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalJsonHash(value: unknown): string {
  return sha256CanonicalJson(value);
}

function mimeTypeFor(filename: string): string {
  if (filename.endsWith(".csv")) return "text/csv";
  if (filename.endsWith(".jsonl.gz")) return "application/gzip";
  if (filename.endsWith(".jsonl")) return "application/x-ndjson";
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".md")) return "text/markdown";
  if (filename.endsWith(".ipynb")) return "application/x-ipynb+json";
  if (filename.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function contentAddressedKey(args: {
  namespace: string;
  version: string;
  sha256: string;
  filename: string;
}): string {
  if (!SHA256_RE.test(args.sha256)) throw new Error(`Invalid SHA-256 for ${args.filename}.`);
  if (basename(args.filename) !== args.filename) {
    throw new Error(`Release artifact filename must not contain a path: ${args.filename}`);
  }
  return `${args.namespace}/${args.version}/${args.sha256}/${args.filename}`;
}

/**
 * Verify every private artifact before the caller uploads bytes or opens a DB
 * transaction. The returned report carries metadata and bytes, never decoded
 * learner rows or evaluator values.
 */
export function verifyPrivateCourseDataPackage(input: {
  manifest: unknown;
  files: ReadonlyMap<string, Uint8Array>;
}): VerifiedPrivateCourseData {
  if (!isObject(input.manifest)) throw new Error("Private data manifest must be a JSON object.");
  const manifestVersion = requiredString(input.manifest.manifest_version, "manifest_version");
  const datasetVersion = requiredString(input.manifest.dataset_version, "dataset_version");
  const artifacts = input.manifest.artifacts;
  if (!isObject(artifacts)) throw new Error("Private data manifest artifacts must be an object.");
  if (!isObject(input.manifest.lineage)) throw new Error("Private data manifest lineage is required.");
  if (!isObject(input.manifest.generation) || input.manifest.generation.deterministic !== true) {
    throw new Error("Private data manifest must declare deterministic generation.");
  }
  if (!isObject(input.manifest.usage_notice)) {
    throw new Error("Private data manifest usage_notice is required.");
  }
  if (!isObject(input.manifest.size_proof)) {
    throw new Error("Private data manifest size_proof is required.");
  }

  for (const role of REQUIRED_PRIVATE_ROLES) {
    if (!isObject(artifacts[role])) throw new Error(`Private data manifest is missing role ${role}.`);
  }
  const allowedRoles = new Set<string>(REQUIRED_PRIVATE_ROLES);
  for (const role of Object.keys(artifacts)) {
    if (!allowedRoles.has(role)) {
      throw new Error(`Private data manifest contains an unclassified role: ${role}.`);
    }
  }

  const filenames = new Set<string>();
  const verifiedFiles = Object.entries(artifacts).map(([role, raw]) => {
    if (!isObject(raw)) throw new Error(`Private data artifact ${role} must be an object.`);
    const filename = requiredString(raw.filename, `${role}.filename`);
    if (basename(filename) !== filename || filenames.has(filename)) {
      throw new Error(`Private data artifact filename is unsafe or duplicated: ${filename}`);
    }
    filenames.add(filename);
    const expectedSha = requiredString(raw.sha256, `${role}.sha256`);
    if (!SHA256_RE.test(expectedSha)) throw new Error(`${role}.sha256 must be lowercase SHA-256.`);
    const expectedBytes = requiredPositiveInt(raw.bytes, `${role}.bytes`);
    const audience = requiredString(raw.audience, `${role}.audience`);
    const bytes = input.files.get(filename);
    if (!bytes) throw new Error(`Private data artifact is missing: ${filename}`);
    if (bytes.byteLength !== expectedBytes) {
      throw new Error(`Private data byte count mismatch for ${filename}.`);
    }
    const actualSha = sha256(bytes);
    if (actualSha !== expectedSha) {
      throw new Error(`Private data checksum mismatch for ${filename}.`);
    }
    return {
      role,
      filename,
      bytes,
      sizeBytes: expectedBytes,
      sha256: expectedSha,
      mimeType: mimeTypeFor(filename),
      audience,
      evaluatorOnly: EVALUATOR_ONLY_ROLES.has(role),
      s3Key: contentAddressedKey({
        namespace: "course/releases/session-03",
        version: datasetVersion,
        sha256: expectedSha,
        filename,
      }),
    } satisfies VerifiedPrivateFile;
  });

  return {
    datasetVersion,
    manifestVersion,
    manifestChecksumSha256: canonicalJsonHash(input.manifest),
    lineage: input.manifest.lineage,
    generation: input.manifest.generation,
    sizeProof: input.manifest.size_proof,
    usageNotice: input.manifest.usage_notice,
    files: verifiedFiles.sort((left, right) => left.role.localeCompare(right.role)),
  };
}

export function loadPrivateCourseDataPackage(args: {
  directory: string;
}): VerifiedPrivateCourseData {
  const manifestPath = join(args.directory, "trustmrr_s3_manifest_v1.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (!isObject(manifest) || !isObject(manifest.artifacts)) {
    throw new Error(`Invalid private data manifest: ${manifestPath}`);
  }
  const files = new Map<string, Uint8Array>();
  for (const [role, raw] of Object.entries(manifest.artifacts)) {
    if (!isObject(raw)) throw new Error(`Invalid private data artifact entry ${role}.`);
    const filename = requiredString(raw.filename, `${role}.filename`);
    if (basename(filename) !== filename) {
      throw new Error(`Private data artifact filename must not contain a path: ${filename}`);
    }
    files.set(filename, readFileSync(join(args.directory, filename)));
  }
  return verifyPrivateCourseDataPackage({ manifest, files });
}

function verifyPackageFile(args: {
  lmsRoot: string;
  entry: JsonObject;
}): { path: string; bytes: Uint8Array; sha256: string } {
  const path = requiredString(args.entry.path, "quiz package file path");
  const expectedSha = requiredString(args.entry.sha256, `${path}.sha256`);
  const expectedBytes = requiredPositiveInt(args.entry.bytes, `${path}.bytes`);
  const prefix = "lms/";
  if (!path.startsWith(prefix) || path.includes("..")) {
    throw new Error(`Quiz package path must stay under lms/: ${path}`);
  }
  const bytes = readFileSync(join(args.lmsRoot, path.slice(prefix.length)));
  if (bytes.byteLength !== expectedBytes) throw new Error(`Quiz package byte count mismatch: ${path}`);
  const actualSha = sha256(bytes);
  if (actualSha !== expectedSha) throw new Error(`Quiz package checksum mismatch: ${path}`);
  return { path, bytes, sha256: expectedSha };
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error(`Quiz package JSON is invalid: ${label}`);
  }
}

function normalizeQuiz(args: {
  learner: unknown;
  evaluatorAssessment: unknown;
  sourcePath: string;
  sourceSha256: string;
}): VerifiedQuiz {
  if (!isObject(args.learner) || args.learner.import_schema_version !== "mu-lms-assessment-import/1.0") {
    throw new Error(`Unsupported quiz import schema in ${args.sourcePath}.`);
  }
  if (args.learner.audience !== "learner" || !isObject(args.learner.assessment)) {
    throw new Error(`Quiz learner package has an unsafe audience: ${args.sourcePath}.`);
  }
  if (!Array.isArray(args.learner.items) || !isObject(args.evaluatorAssessment)) {
    throw new Error(`Quiz package items/key are missing: ${args.sourcePath}.`);
  }
  const assessment = args.learner.assessment;
  const id = requiredString(assessment.assessment_id, "assessment_id");
  if (args.evaluatorAssessment.assessment_id !== id) {
    throw new Error(`Quiz evaluator key does not match ${id}.`);
  }
  const versionId = requiredString(assessment.assessment_version_id, `${id}.assessment_version_id`);
  if (args.evaluatorAssessment.assessment_version_id !== versionId) {
    throw new Error(`Quiz evaluator version does not match ${id}.`);
  }
  const sessionNo = assessment.session_no;
  if (sessionNo !== 4 && sessionNo !== 5) throw new Error(`Unsupported versioned quiz session: ${sessionNo}`);
  if (!Array.isArray(args.evaluatorAssessment.items)) throw new Error(`Quiz evaluator items are missing: ${id}`);
  const keyByItem = new Map<string, JsonObject>();
  for (const value of args.evaluatorAssessment.items) {
    if (!isObject(value)) throw new Error(`Malformed evaluator item in ${id}.`);
    const itemVersionId = requiredString(value.item_version_id, `${id}.key.item_version_id`);
    if (keyByItem.has(itemVersionId)) throw new Error(`Duplicate evaluator item ${itemVersionId}.`);
    keyByItem.set(itemVersionId, value);
  }

  const normalized: StableStoredQuestion[] = args.learner.items.map((value) => {
    if (!isObject(value) || !Array.isArray(value.options)) {
      throw new Error(`Malformed learner quiz item in ${id}.`);
    }
    const itemVersionId = requiredString(value.item_version_id, `${id}.item_version_id`);
    const key = keyByItem.get(itemVersionId);
    if (!key) throw new Error(`Missing evaluator key for ${itemVersionId}.`);
    keyByItem.delete(itemVersionId);
    return {
      itemVersionId,
      q: requiredString(value.prompt, `${itemVersionId}.prompt`),
      options: value.options.map((optionValue) => {
        if (!isObject(optionValue)) throw new Error(`Malformed option in ${itemVersionId}.`);
        return {
          optionId: requiredString(optionValue.option_id, `${itemVersionId}.option_id`),
          text: requiredString(optionValue.text, `${itemVersionId}.option.text`),
        };
      }),
      correctOptionId: requiredString(key.correct_option_id, `${itemVersionId}.correct_option_id`),
      ...(typeof key.feedback === "string" && key.feedback.trim() !== ""
        ? { rationale: key.feedback }
        : {}),
    };
  });
  if (keyByItem.size !== 0) throw new Error(`Evaluator key contains extra items for ${id}.`);
  const questions = parseStableQuestions(normalized);
  if (!questions) throw new Error(`Quiz ${id} does not satisfy the stable-ID engine contract.`);

  return {
    id,
    versionId,
    sessionNo,
    title: requiredString(assessment.title, `${id}.title`),
    timeLimitSeconds: requiredPositiveInt(assessment.time_limit_seconds, `${id}.time_limit_seconds`),
    questions,
    contentHash: stableQuestionsContentHash(questions),
    sourcePath: args.sourcePath,
    sourceSha256: args.sourceSha256,
  };
}

function normalizeS3Visualization(args: {
  learner: JsonObject;
  evaluatorAssessment: JsonObject;
}): {
  publicSchema: { version: 1; fields: JsonObject[] };
  evaluatorAnswerKey: { specs: JsonObject };
  judgmentFieldIds: string[];
} {
  if (!Array.isArray(args.learner.items) || !Array.isArray(args.evaluatorAssessment.items)) {
    throw new Error("Session 3 visualization items/key are missing.");
  }
  const keyByVersionId = new Map<string, JsonObject>();
  for (const raw of args.evaluatorAssessment.items) {
    if (!isObject(raw)) throw new Error("Malformed Session 3 visualization evaluator item.");
    const versionId = requiredString(raw.item_version_id, "S3 visualization key item_version_id");
    if (keyByVersionId.has(versionId)) {
      throw new Error(`Duplicate Session 3 visualization key item ${versionId}.`);
    }
    keyByVersionId.set(versionId, raw);
  }

  const fields: JsonObject[] = [];
  const specs: JsonObject = {};
  const judgmentFieldIds: string[] = [];
  for (const raw of args.learner.items) {
    if (!isObject(raw) || !Array.isArray(raw.options)) {
      throw new Error("Malformed Session 3 visualization learner item.");
    }
    const itemId = requiredString(raw.item_id, "S3 visualization item_id");
    const versionId = requiredString(raw.item_version_id, `${itemId}.item_version_id`);
    const prompt = requiredString(raw.prompt, `${itemId}.prompt`);
    const response = raw.response;
    const artifact = raw.accessible_artifact;
    if (!isObject(response) || !isObject(artifact)) {
      throw new Error(`Session 3 visualization item ${itemId} is missing its response/accessibility contract.`);
    }
    if (response.rationale_min_words !== 40 || response.rationale_max_words !== 80) {
      throw new Error(`Session 3 visualization item ${itemId} must retain the 40–80 word rationale contract.`);
    }
    const textAlternative = requiredString(
      artifact.text_alternative,
      `${itemId}.accessible_artifact.text_alternative`,
    );
    const selectionKey = `${itemId}.selection`;
    const rationaleKey = `${itemId}.rationale`;
    const options = raw.options.map((option) => {
      if (!isObject(option)) throw new Error(`Malformed option in ${itemId}.`);
      return {
        value: requiredString(option.option_id, `${itemId}.option_id`),
        label: requiredString(option.text, `${itemId}.option.text`),
      };
    });
    fields.push({
      key: selectionKey,
      label: `${requiredString(raw.title, `${itemId}.title`)} — choose a visual`,
      kind: "singleChoice",
      required: true,
      options,
      helpText: `${prompt}\n\nAccessible artifact: ${textAlternative}`,
    });
    fields.push({
      key: rationaleKey,
      label: `${itemId} rationale (40–80 words)`,
      kind: "writeup",
      required: true,
      helpText: "Explain why the selected visual fits the stated comparison and data shape.",
      minWords: 40,
      maxWords: 80,
    });

    const evaluator = keyByVersionId.get(versionId);
    if (!evaluator) throw new Error(`Missing Session 3 visualization key for ${versionId}.`);
    keyByVersionId.delete(versionId);
    const correctOptionId = requiredString(
      evaluator.correct_option_id,
      `${itemId}.correct_option_id`,
    );
    if (!options.some((option) => option.value === correctOptionId)) {
      throw new Error(`Session 3 visualization key for ${itemId} names an unknown option.`);
    }
    specs[selectionKey] = {
      kind: "string",
      expected: correctOptionId,
      trim: true,
      caseInsensitive: false,
    };
    judgmentFieldIds.push(rationaleKey);
  }
  if (fields.length !== 12 || Object.keys(specs).length !== 6 || keyByVersionId.size !== 0) {
    throw new Error("Session 3 visualization package must contain exactly six paired scenarios.");
  }
  return { publicSchema: { version: 1, fields }, evaluatorAnswerKey: { specs }, judgmentFieldIds };
}

/** Verify the generated learner package and combine it with the separate key. */
export function loadQuizImportPackage(args: {
  lmsRoot: string;
}): VerifiedQuizImportPackage {
  const manifestPath = join(args.lmsRoot, "output/quizzes/import-package-manifest.v1.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parseJsonBytes(manifestBytes, manifestPath);
  if (!isObject(manifest) || manifest.validation_status !== "pass" || !Array.isArray(manifest.files)) {
    throw new Error("Quiz import package has not passed validation.");
  }
  const verified = new Map<string, { bytes: Uint8Array; sha256: string }>();
  for (const rawEntry of manifest.files) {
    if (!isObject(rawEntry)) throw new Error("Quiz import manifest contains a malformed file entry.");
    if (
      rawEntry.audience !== "learner_or_validation" ||
      typeof rawEntry.path !== "string" ||
      !rawEntry.path.startsWith("lms/output/quizzes/") ||
      /instructor|key/i.test(rawEntry.path)
    ) {
      throw new Error("Learner quiz manifest crosses the learner/evaluator boundary.");
    }
    const file = verifyPackageFile({ lmsRoot: args.lmsRoot, entry: rawEntry });
    verified.set(file.path, { bytes: file.bytes, sha256: file.sha256 });
  }

  const instructorManifestPath = join(
    args.lmsRoot,
    "output/instructor/quizzes/import-package-manifest.v1.json",
  );
  const instructorManifestBytes = readFileSync(instructorManifestPath);
  const instructorManifest = parseJsonBytes(instructorManifestBytes, instructorManifestPath);
  if (
    !isObject(instructorManifest) ||
    instructorManifest.validation_status !== "pass" ||
    !Array.isArray(instructorManifest.files)
  ) {
    throw new Error("Instructor quiz package has not passed validation.");
  }
  const instructorVerified = new Map<string, { bytes: Uint8Array; sha256: string }>();
  for (const rawEntry of instructorManifest.files) {
    if (
      !isObject(rawEntry) ||
      rawEntry.audience !== "instructor_only" ||
      typeof rawEntry.path !== "string" ||
      !rawEntry.path.startsWith("lms/output/instructor/quizzes/")
    ) {
      throw new Error("Instructor quiz manifest contains an unsafe file entry.");
    }
    const file = verifyPackageFile({ lmsRoot: args.lmsRoot, entry: rawEntry });
    instructorVerified.set(file.path, { bytes: file.bytes, sha256: file.sha256 });
  }

  const keyPath = "lms/output/instructor/quizzes/INSTRUCTOR_ONLY_quiz-keys.v1.json";
  const keyFile = instructorVerified.get(keyPath);
  if (!keyFile) throw new Error("Quiz import package is missing the instructor-only key file.");
  const keyPackage = parseJsonBytes(keyFile.bytes, keyPath);
  if (!isObject(keyPackage) || keyPackage.do_not_publish !== true || !Array.isArray(keyPackage.assessments)) {
    throw new Error("Quiz evaluator package is not marked instructor-only.");
  }
  const evaluatorById = new Map<string, unknown>();
  for (const assessment of keyPackage.assessments) {
    if (!isObject(assessment)) throw new Error("Malformed quiz evaluator assessment.");
    const id = requiredString(assessment.assessment_id, "evaluator assessment_id");
    evaluatorById.set(id, assessment);
  }

  const quizPaths = [
    "lms/output/quizzes/s4-product-build-judgment.v1.json",
    "lms/output/quizzes/s5-workflow-control.v1.json",
  ];
  const quizzes = quizPaths.map((path) => {
    const learnerFile = verified.get(path);
    if (!learnerFile) throw new Error(`Quiz import package is missing ${path}.`);
    const learner = parseJsonBytes(learnerFile.bytes, path);
    if (!isObject(learner) || !isObject(learner.assessment)) {
      throw new Error(`Malformed learner quiz package: ${path}`);
    }
    const id = requiredString(learner.assessment.assessment_id, `${path}.assessment_id`);
    const evaluatorAssessment = evaluatorById.get(id);
    if (!evaluatorAssessment) throw new Error(`Quiz import package has no evaluator key for ${id}.`);
    return normalizeQuiz({
      learner,
      evaluatorAssessment,
      sourcePath: path,
      sourceSha256: learnerFile.sha256,
    });
  });

  const s3Path = "lms/output/quizzes/s3-visualization-scenarios.v1.json";
  const s3File = verified.get(s3Path);
  if (!s3File) throw new Error(`Quiz import package is missing ${s3Path}.`);
  const s3Public = parseJsonBytes(s3File.bytes, s3Path);
  if (!isObject(s3Public) || !isObject(s3Public.assessment)) {
    throw new Error(`Malformed learner assessment package: ${s3Path}`);
  }
  const s3Id = requiredString(s3Public.assessment.assessment_id, `${s3Path}.assessment_id`);
  const s3Key = evaluatorById.get(s3Id);
  if (!isObject(s3Key)) throw new Error(`Quiz import package has no evaluator key for ${s3Id}.`);
  if (s3Public.audience !== "learner" || s3Key.assessment_id !== s3Id) {
    throw new Error("Session 3 visualization package crosses its learner/evaluator boundary.");
  }
  const normalizedS3 = normalizeS3Visualization({ learner: s3Public, evaluatorAssessment: s3Key });

  return {
    packageVersion: `${requiredString(manifest.package_version, "quiz package_version")}+${requiredString(instructorManifest.package_version, "instructor quiz package_version")}`,
    manifestChecksumSha256: canonicalJsonHash({
      learner: sha256(manifestBytes),
      instructor: sha256(instructorManifestBytes),
    }),
    formativeAssessments: [{
      id: s3Id,
      versionId: requiredString(s3Public.assessment.assessment_version_id, `${s3Id}.version`),
      sessionNo: 3,
      title: requiredString(s3Public.assessment.title, `${s3Id}.title`),
      publicSchema: normalizedS3.publicSchema,
      evaluatorAnswerKey: normalizedS3.evaluatorAnswerKey,
      judgmentFieldIds: normalizedS3.judgmentFieldIds,
      publicChecksumSha256: canonicalJsonHash(normalizedS3.publicSchema),
      evaluatorChecksumSha256: canonicalJsonHash(normalizedS3.evaluatorAnswerKey),
    }],
    quizzes,
  };
}
