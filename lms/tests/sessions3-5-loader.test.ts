import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAssessmentPolicies } from "../lib/assessment-policies";
import {
  S4_APP_INSPECTION_POLICY_V1,
  parseS4AppInspectionPolicy,
} from "../lib/assessments/s4-app-policy";
import {
  assertApprovedAssessmentProcessor,
  parseAssessmentRuntimeConfig,
} from "../lib/assessments/runtime-config";
import { assertAssessmentEvaluatorChecksum } from "../lib/assessments/assessment-anchors";
import { evaluateObjectiveSet } from "../lib/assessments/evaluate-objective";
import {
  parseWorkflowEvaluatorAnswerKey,
  SESSION_5_WORKFLOW_PACKS,
} from "../lib/assessments/workflow-fixture-evaluation";
import { parseStableQuestions } from "../lib/quizzes/versioned";
import { parseSubmissionSchema } from "../lib/submission-schema";
import { __setS3TestOverrides } from "../lib/s3";
import {
  canonicalJsonHash,
  loadPrivateCourseDataPackage,
  verifyPrivateCourseDataPackage,
  type VerifiedQuizImportPackage,
} from "../scripts/load/private-course-data";
import {
  buildSessions3To5Release,
  reconcileSessions3To5,
  s3ReleaseObjectStore,
  validateReleaseContracts,
  type ReleaseDatabase,
  type Sessions3To5Release,
} from "../scripts/sessions3-5-setup";
import { ensureMissingSessionPages } from "../scripts/prod-bootstrap";
import { createMissingSession2Gates } from "../scripts/session2-setup";

const LMS_ROOT = fileURLToPath(new URL("..", import.meta.url));

afterEach(() => __setS3TestOverrides(null));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function quizPackageFixture(): VerifiedQuizImportPackage {
  const fields: Record<string, unknown>[] = [];
  const specs: Record<string, unknown> = {};
  const judgmentFieldIds: string[] = [];
  for (let index = 1; index <= 6; index += 1) {
    const itemId = `S3-VIZ-${String(index).padStart(2, "0")}`;
    const selectionKey = `${itemId}.selection`;
    const rationaleKey = `${itemId}.rationale`;
    fields.push({
      key: selectionKey,
      label: `${itemId} fixture selection`,
      kind: "singleChoice",
      required: true,
      options: [
        { value: `${itemId}-A`, label: "Fixture option A" },
        { value: `${itemId}-B`, label: "Fixture option B" },
      ],
    });
    fields.push({
      key: rationaleKey,
      label: `${itemId} fixture rationale`,
      kind: "writeup",
      required: true,
      minWords: 1,
      maxWords: 80,
    });
    specs[selectionKey] = { kind: "string", expected: `${itemId}-A`, trim: true };
    judgmentFieldIds.push(rationaleKey);
  }
  const publicSchema = { version: 1 as const, fields };
  const evaluatorAnswerKey = { specs };
  const stableQuestion = (prefix: "S4" | "S5") => [{
    itemVersionId: `${prefix}-FIXTURE-Q1@1`,
    q: `${prefix} public-CI fixture question`,
    options: [
      { optionId: `${prefix}-FIXTURE-A`, text: "Fixture option A" },
      { optionId: `${prefix}-FIXTURE-B`, text: "Fixture option B" },
    ],
    correctOptionId: `${prefix}-FIXTURE-A`,
  }];
  const s4Questions = stableQuestion("S4");
  const s5Questions = stableQuestion("S5");
  return {
    packageVersion: "public-ci-fixture-v1",
    manifestChecksumSha256: "c".repeat(64),
    formativeAssessments: [{
      id: "assess_s3_visuals_v1",
      versionId: "assess_s3_visuals_v1",
      sessionNo: 3,
      title: "Session 3 public-CI fixture",
      publicSchema,
      evaluatorAnswerKey,
      judgmentFieldIds,
      publicChecksumSha256: canonicalJsonHash(publicSchema),
      evaluatorChecksumSha256: canonicalJsonHash(evaluatorAnswerKey),
    }],
    quizzes: [
      {
        id: "quiz_s4_product-build-judgment",
        versionId: "quiz_s4_product-build-judgment@fixture-v1",
        sessionNo: 4,
        title: "Session 4 public-CI fixture",
        timeLimitSeconds: 60,
        questions: s4Questions,
        contentHash: canonicalJsonHash(s4Questions),
        sourcePath: "tests:synthetic-s4-quiz",
        sourceSha256: "4".repeat(64),
      },
      {
        id: "quiz_s5_workflow-control",
        versionId: "quiz_s5_workflow-control@fixture-v1",
        sessionNo: 5,
        title: "Session 5 public-CI fixture",
        timeLimitSeconds: 60,
        questions: s5Questions,
        contentHash: canonicalJsonHash(s5Questions),
        sourcePath: "tests:synthetic-s5-quiz",
        sourceSha256: "5".repeat(64),
      },
    ],
  };
}

function evaluatorFileFixture() {
  const encoder = new TextEncoder();
  const expectedFiles = new Map<string, Uint8Array>([
    ["course/session-05/fixtures/expected-results.json", encoder.encode('{"fixture":"gtm"}\n')],
    ["course/session-05/fixtures/operations/expected-results.json", encoder.encode('{"fixture":"operations"}\n')],
    ["course/session-05/fixtures/revenue/expected-results.json", encoder.encode('{"fixture":"revenue"}\n')],
  ]);
  const definitions = [
    ["S5-WP-GTM-01", "gtm", "course/session-05/fixtures/expected-results.json"],
    ["S5-WP-OPS-02", "operations", "course/session-05/fixtures/operations/expected-results.json"],
    ["S5-WP-REV-03", "revenue", "course/session-05/fixtures/revenue/expected-results.json"],
  ] as const;
  const categories = ["normal", "duplicate", "malformed", "timeout", "approval"] as const;
  const bundle = {
    contractVersion: "s5-workflow-fixture-bundle-v1",
    bundleId: "S5-WORKFLOW-EVALUATOR-v1",
    authority: {
      usefulnessMax: 30,
      executionMax: 20,
      ownershipMax: 10,
      usefulnessRubricKeys: ["relevance"],
      ownershipRubricKey: "verification-evidence",
    },
    packs: definitions.map(([packId, slug, expectedPath]) => ({
      packId,
      suiteId: `fixture-${slug}`,
      ruleVersion: "public-ci-fixture-v1",
      expectedResultsSha256: sha256(expectedFiles.get(expectedPath)!),
      cases: categories.map((category) => ({
        category,
        fixtureId: `${slug}-${category}`,
        checks: [{ id: `${slug}-${category}-present`, path: "fixture", operator: "present" }],
      })),
    })),
  };
  const overrides = new Map<string, Uint8Array>([
    ...expectedFiles,
    [
      "course/session-05/fixtures/evaluator-bundle.v1.json",
      encoder.encode(`${JSON.stringify(bundle)}\n`),
    ],
    [
      "course/session-04/06-lovable-prompt-plan-script.md",
      encoder.encode("# Public-CI-only synthetic instructor reveal\n"),
    ],
  ]);
  return (relativePath: string): Uint8Array =>
    overrides.get(relativePath) ?? readFileSync(join(LMS_ROOT, relativePath));
}

function privatePackageFixture() {
  const evaluatorItems = {
    "S3-DATA-01": { contract: { evaluation: "deterministic" }, private_key: { expected: 1 } },
    "S3-DATA-02": { contract: { evaluation: "deterministic" }, private_key: { expected: 2 } },
    "S3-DATA-03": { contract: { evaluation: "deterministic" }, private_key: { expected_numeric: 3.24, display_numeric: 3.2 } },
    "S3-DATA-04": { contract: { evaluation: "deterministic" }, private_key: { expected_numeric: 4.4, display_numeric: 4 } },
    "S3-DATA-05": { contract: { evaluation: "deterministic" }, private_key: { categoryLabel: "Analytics", expected_numeric: 5.4, display_numeric: 5 } },
    "S3-DATA-06": { contract: { evaluation: "deterministic" }, private_key: { expected_numeric: 6.4, display_numeric: 6 } },
    "S3-DATA-07": { contract: { evaluation: "rubric_bound_provisional_ai" } },
    "S3-DATA-08": { contract: { evaluation: "rubric_bound_provisional_ai" } },
    "S3-DATA-09": { contract: { evaluation: "rubric_bound_provisional_ai" } },
    "S3-DATA-10": { contract: { evaluation: "deterministic_checks_plus_provisional_ai" } },
    "S3-SCALE-03F": { contract: { evaluation: "deterministic_file_comparison_plus_static_checks" } },
    "S3-SCALE-03P": { contract: { evaluation: "deterministic_file_comparison_plus_static_checks" } },
  };
  const contents: Record<string, string> = {
    "trustmrr_s3_learner_v1.csv": "startup_id,revenue_30d_usd,category\nfixture,100,Analytics\n",
    "trustmrr_s3_representative_sample_v1.csv": "startup_id\nfixture\n",
    "trustmrr_s3_schema_v1.json": '{"fields":["startup_id"]}\n',
    "trustmrr_s3_peer_comparisons_sample_v1.jsonl": '{"startup_id":"fixture"}\n',
    "trustmrr_s3_peer_comparisons_v1.jsonl.gz": "test-gzip-bytes",
    "trustmrr_s3_fact_pack_v1.json": `${JSON.stringify({ group_summaries: { category: [{ value: "Analytics" }, { value: "Developer Tools" }] } })}\n`,
    "trustmrr_s3_evaluator_adapter_v1.json": `${JSON.stringify({ dataset_version: "trustmrr-s3-test-v1", items: evaluatorItems })}\n`,
  };
  const roles = {
    learner_csv: "trustmrr_s3_learner_v1.csv",
    representative_sample: "trustmrr_s3_representative_sample_v1.csv",
    schema: "trustmrr_s3_schema_v1.json",
    peer_comparisons_sample: "trustmrr_s3_peer_comparisons_sample_v1.jsonl",
    peer_comparisons: "trustmrr_s3_peer_comparisons_v1.jsonl.gz",
    fact_pack: "trustmrr_s3_fact_pack_v1.json",
    evaluator_adapter: "trustmrr_s3_evaluator_adapter_v1.json",
  } as const;
  const files = new Map<string, Uint8Array>();
  const artifacts = Object.fromEntries(
    Object.entries(roles).map(([role, filename]) => {
      const bytes = new TextEncoder().encode(contents[filename]);
      files.set(filename, bytes);
      return [
        role,
        {
          filename,
          sha256: sha256(bytes),
          bytes: bytes.byteLength,
          audience: role === "fact_pack" || role === "evaluator_adapter"
            ? "instructors/evaluators only"
            : "roster-gated learners and instructors",
        },
      ];
    }),
  );

  return {
    manifest: {
      manifest_version: "1.1",
      dataset_version: "trustmrr-s3-test-v1",
      generation: { deterministic: true, generator_version: "test" },
      lineage: {
        source_snapshot_date: "2026-07-30",
        source_title: "Private test fixture",
        source_sheet_tab: "TrustMRR Startups",
        source_sheet_gid: 849064270,
        source_slice_sha256: "a".repeat(64),
        source_row_pointer_field: "source_row_number",
        source_rows_represented: 999,
      },
      size_proof: {
        artifact: "trustmrr_s3_peer_comparisons_v1.jsonl.gz",
        token_count: 1_500_000,
        tokenizer: "fixture-tokenizer",
        tokenizer_library: "fixture-library",
        tokenizer_library_version: "1.0.0",
        threshold_tokens: 1_000_000,
        exceeds_threshold: true,
        uncompressed_bytes: 2_000_000,
        uncompressed_sha256: "b".repeat(64),
        interpretation: "Fixture exceeds the named teaching threshold.",
        jsonl_row_count: 12345,
        scalar_cell_count: 67890,
      },
      usage_notice: {
        allowed: ["roster-gated course use"],
        prohibited: ["public distribution"],
      },
      artifacts,
    },
    files,
  };
}

const sampleAnalysisFixture = () => ({
  schemaVersion: "mu-s3-sample-analysis/2.0",
  frozenAt: "2026-07-30",
  sampleSheetUrl: "https://docs.google.com/spreadsheets/d/12Gl5MxibqaVOhLowNZotoapufn7UmQen34OVX0J-lKA/edit",
  fullSheetUrl: "https://docs.google.com/spreadsheets/d/1w2sQHU6z8E_OEQVBskfoxmS1wn_7XERH43UBGJPMMOk/edit",
  answerSummary: "Fixture answer summary for the ten-question analysis.",
} as const);

function buildFixtureRelease(): Sessions3To5Release {
  return buildSessions3To5Release({
    lmsRoot: LMS_ROOT,
    privateData: verifyPrivateCourseDataPackage(privatePackageFixture()),
    quizPackage: quizPackageFixture(),
    sampleAnalysis: sampleAnalysisFixture(),
    readFileBytes: evaluatorFileFixture(),
  });
}

type MemoryRow = Record<string, unknown>;
type MemoryTables = Record<string, MemoryRow[]>;

function memoryReleaseDatabase() {
  const tables: MemoryTables = {
    section: [{ id: "sec_A", code: "A" }],
    retentionPolicy: [],
    assignmentType: [],
    assignment: [],
    material: [
      { id: "mat_s3_moxie", sessionNo: 3, title: "Legacy S3", kind: "dataset" },
      { id: "mat_s4_vibe", sessionNo: 4, title: "Legacy S4", kind: "link" },
      { id: "mat_s5_make5min", sessionNo: 5, title: "Legacy S5", kind: "link" },
    ],
    sessionPage: [3, 4, 5].map((sessionNo) => ({
      id: `spage_${sessionNo}`,
      sessionNo,
      title: `Instructor-authored S${sessionNo}`,
      summaryMd: `Keep this S${sessionNo} summary`,
      orderedMaterialIds: [
        sessionNo === 3 ? "mat_s3_moxie" : sessionNo === 4 ? "mat_s4_vibe" : "mat_s5_make5min",
        `custom_mat_s${sessionNo}`,
      ],
      linkedAssignmentIds: sessionNo === 3
        ? ["asg_s3_datamemo", `custom_asg_s${sessionNo}`]
        : [`custom_asg_s${sessionNo}`],
      linkedQuizIds: [sessionNo === 3 ? "quiz_s3" : `custom_quiz_s${sessionNo}`],
    })),
    gate: [3, 4, 5].map((sessionNo) => ({
      targetType: "session",
      targetId: `spage_${sessionNo}`,
      sectionId: "sec_A",
      state: "open",
      changedBy: "instructor",
    })),
    gateException: [],
    datasetRelease: [],
    datasetReleaseFile: [],
    assessmentVersion: [],
    assessmentEvaluatorConfig: [],
    quiz: [{ id: "quiz_s3", sessionNo: 3, title: "Legacy quiz", publishedAt: new Date() }],
    submission: [],
    grade: [],
    appeal: [],
    publicationDecision: [],
  };

  const normalize = (value: unknown): unknown => {
    if (value && typeof value === "object" && value.constructor.name === "JsonNull") return null;
    if (Array.isArray(value)) return value.map(normalize);
    if (value instanceof Date) return value;
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, normalize(child)]),
    );
  };
  const matches = (row: MemoryRow, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, wanted]) => {
      if (key === "OR") {
        return Array.isArray(wanted) && wanted.some((candidate) => matches(row, candidate as Record<string, unknown>));
      }
      if (wanted && typeof wanted === "object" && !Array.isArray(wanted)) {
        const nested = wanted as Record<string, unknown>;
        if (Array.isArray(nested.in)) return nested.in.includes(row[key]);
        // Prisma compound unique selectors name the wrapper but store the inner fields.
        return Object.entries(nested).every(([nestedKey, nestedValue]) => row[nestedKey] === nestedValue);
      }
      return row[key] === wanted;
    });
  const select = (row: MemoryRow, projection?: Record<string, boolean>) => {
    if (!projection) return row;
    return Object.fromEntries(Object.keys(projection).filter((key) => projection[key]).map((key) => [key, row[key]]));
  };
  const defaults = (model: string, data: MemoryRow): MemoryRow => ({
    ...(model === "assignment" ? { activeAssessmentVersionId: null } : {}),
    ...(model === "assessmentVersion" || model === "datasetRelease" ? { publishedAt: null } : {}),
    ...normalize(data) as MemoryRow,
  });
  const delegate = (model: string) => ({
    findUnique: async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const row = tables[model].find((candidate) => matches(candidate, args.where));
      return row ? select(row, args.select) : null;
    },
    findMany: async (args: { where?: Record<string, unknown>; select?: Record<string, boolean>; take?: number } = {}) => {
      if (args.take === 0) return [];
      return tables[model]
        .filter((row) => !args.where || matches(row, args.where))
        .map((row) => select(row, args.select));
    },
    create: async (args: { data: MemoryRow }) => {
      const row = defaults(model, args.data);
      tables[model].push(row);
      return row;
    },
    update: async (args: { where: Record<string, unknown>; data: MemoryRow }) => {
      const row = tables[model].find((candidate) => matches(candidate, args.where));
      if (!row) throw new Error(`Missing in-memory ${model} update target.`);
      Object.assign(row, normalize(args.data));
      return row;
    },
    createMany: async (args: { data: MemoryRow[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const raw of args.data) {
        const row = defaults(model, raw);
        const duplicate = model === "gate" && tables.gate.some((candidate) =>
          candidate.targetType === row.targetType &&
          candidate.targetId === row.targetId &&
          candidate.sectionId === row.sectionId,
        );
        if (!duplicate) {
          tables[model].push(row);
          count += 1;
        }
      }
      return { count };
    },
  });
  const db = Object.fromEntries(Object.keys(tables).map((model) => [model, delegate(model)])) as Record<string, unknown>;
  db.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(db);
  return { db: db as unknown as ReleaseDatabase, tables };
}

describe("private Session 3 release verification", () => {
  it("verifies every required byte/checksum before returning a release", () => {
    const fixture = privatePackageFixture();
    const verified = verifyPrivateCourseDataPackage(fixture);

    expect(verified.datasetVersion).toBe("trustmrr-s3-test-v1");
    expect(verified.files).toHaveLength(7);
    expect(verified.files.filter((file) => file.evaluatorOnly).map((file) => file.role).sort()).toEqual([
      "evaluator_adapter",
      "fact_pack",
    ]);
    for (const file of verified.files) {
      expect(file.s3Key).toContain(`/${file.sha256}/`);
    }
  });

  it("fails before reconciliation when a private artifact drifts", () => {
    const fixture = privatePackageFixture();
    fixture.files.set(
      "trustmrr_s3_fact_pack_v1.json",
      new TextEncoder().encode('{"private":"tampered"}\n'),
    );

    expect(() => verifyPrivateCourseDataPackage(fixture)).toThrow(/checksum|byte/i);
  });
});

describe("Sessions 3–5 authored release", () => {
  it("publishes only allowlisted lineage plus the scale proof in the learner manifest", () => {
    const release = buildFixtureRelease();
    const material = release.materials.find(
      (candidate) => candidate.id === "mat_s3_scale_manifest_v1",
    );
    const object = release.objects.find((candidate) => candidate.key === material?.s3Key);
    expect(object).toBeTruthy();
    const manifest = JSON.parse(new TextDecoder().decode(object!.bytes)) as {
      lineage: Record<string, unknown>;
      sizeProof: Record<string, unknown>;
    };

    expect(Object.keys(manifest.lineage).sort()).toEqual([
      "sourceRowPointerField",
      "sourceSheetGid",
      "sourceSheetTab",
      "sourceSliceSha256",
      "sourceSnapshotDate",
      "sourceTitle",
    ]);
    expect(manifest.sizeProof).toMatchObject({
      tokenCount: 1_500_000,
      thresholdTokens: 1_000_000,
      exceedsThreshold: true,
      uncompressedBytes: 2_000_000,
    });
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("source_rows_represented");
    expect(serialized).not.toContain("jsonl_row_count");
    expect(serialized).not.toContain("scalar_cell_count");
    expect(serialized).not.toContain("999");
  });

  it("refuses to force-lock while a selected target has a live learner exception", async () => {
    const release = buildFixtureRelease();
    const memory = memoryReleaseDatabase();
    const objects = new Map<string, { sizeBytes: number; sha256: string }>();
    const objectStore = {
      stat: vi.fn(async (key: string) => objects.get(key) ?? null),
      put: vi.fn(async (object: Sessions3To5Release["objects"][number]) => {
        objects.set(object.key, { sizeBytes: object.sizeBytes, sha256: object.sha256 });
      }),
    };

    await reconcileSessions3To5({ db: memory.db, objectStore, release });
    memory.tables.gateException.push({
      id: "exception-live",
      targetType: "session",
      targetId: "spage_3",
      sectionId: "sec_A",
      userId: "student-one",
      expiresAt: null,
    });

    await expect(
      reconcileSessions3To5({
        db: memory.db,
        objectStore,
        release,
        forceLockGates: true,
      }),
    ).rejects.toThrow(/live gate exception.*session:spage_3:student-one/i);
  });

  it("builds stable versioned contracts and keeps hidden material out of learner pages", () => {
    const release = buildFixtureRelease();

    const s3 = release.assessmentVersions.find((version) => version.id === "assess_s3_sample_analysis_v2");
    expect(s3?.portfolioPolicy).toEqual({ include: false, slot: "data-analysis" });
    expect(s3?.materialManifest).toMatchObject({
      materialIds: ["mat_s3_sample_sheet_v2", "mat_s3_full_sheet_v2"],
      gradedMaterialId: "mat_s3_sample_sheet_v2",
      practiceMaterialId: "mat_s3_full_sheet_v2",
    });
    const sampleSheet = release.materials.find(
      (material) => material.id === "mat_s3_sample_sheet_v2",
    );
    expect(sampleSheet).toMatchObject({
      title: "TrustMRR · 1,000-row dataset",
      kind: "link",
      externalUrl: expect.stringContaining("12Gl5MxibqaVOhLowNZotoapufn7UmQen34OVX0J-lKA"),
      instructorOnly: false,
    });
    expect(release.pages.find((page) => page.sessionNo === 3)?.orderedMaterialIds).toEqual([
      "mat_s3_sample_sheet_v2",
      "mat_s3_full_sheet_v2",
    ]);

    const s4 = release.assessmentVersions.find((version) => version.id === "assess_s4_app_v2");
    expect(s4?.improvementAllowed).toBe(true);
    expect(s4?.improvementWindowDays).toBe(10);

    const appAssignment = release.assignments.find((assignment) => assignment.id === "asg_s4_app");
    expect(appAssignment?.dueAt).toEqual(new Date("2026-08-25T18:29:00Z"));
    const workflowAssignment = release.assignments.find((assignment) => assignment.id === "asg_s5_workflow");
    expect(workflowAssignment?.dueAt).toEqual(new Date("2026-08-30T18:29:00Z"));

    const s4Type = release.assignmentTypes.find((type) => type.slug === "app");
    expect(s4Type?.allowSelfReplace).toBe(true);
    expect(s4Type?.submissionSchema.fields.map((field) => field.key)).toEqual([
      "appUrl",
      "idea",
      "audience",
      "userFlows",
      "githubUrl",
      "approvedPlanSummary",
      "acceptanceTestLog",
      "evidenceFiles",
      "knownLimitations",
      "changeNote",
      "galleryCaption",
      "galleryConsent",
      "nonAffiliationConfirmation",
    ]);
    expect(s4Type?.submissionSchema.fields.find((field) => field.key === "githubUrl")).toMatchObject({
      required: false,
      requiredFromVersion: 2,
      httpsOnly: true,
      allowedHosts: ["github.com"],
      pathKind: "github-repository",
    });
    expect(
      parseS4AppInspectionPolicy(s4?.evaluator.config.appInspectionPolicy),
    ).toEqual(S4_APP_INSPECTION_POLICY_V1);
    expect(s4?.evaluator.config.approvedFlags).toEqual([
      "possible-injection",
      "link-dead",
      "low-confidence",
      "mock-ambiguity",
      "privacy-security-hold",
      "source-unreachable",
      "v2-regression",
      "static-shell",
      "app-uninspectable",
      "acceptance-evidence-missing",
      "creator-public-journey-missing",
      "brand-affiliation-review",
    ]);

    const s5Type = release.assignmentTypes.find((type) => type.slug === "workflow");
    expect(s5Type?.teamBased).toBe(true);
    expect(s5Type?.allowSelfReplace).toBe(true);
    expect(s5Type?.description).toMatch(/team-owned/i);
    expect(s5Type?.submissionSchema.fields.map((field) => field.key)).toContain("blueprintFile");
    expect(s5Type?.submissionSchema.fields.map((field) => field.key)).toContain("workflowPngFile");
    expect(s5Type?.submissionSchema.fields.map((field) => field.key)).toContain("recordingUrl");
    expect(s5Type?.submissionSchema.fields.find((field) => field.key === "recordingUrl")).toMatchObject({
      kind: "link",
      required: true,
    });
    expect(s5Type?.submissionSchema.fields.find((field) => field.key === "workflowPack")).toMatchObject({
      kind: "singleChoice",
      required: true,
      options: SESSION_5_WORKFLOW_PACKS,
    });
    const s5 = release.assessmentVersions.find(
      (version) => version.id === "assess_s5_workflow_v2",
    );
    expect(s5?.ownerKind).toBe("team");
    const fixtureKey = parseWorkflowEvaluatorAnswerKey(s5?.evaluator.answerKey);
    expect(fixtureKey.bundle.packs.map((pack) => pack.packId)).toEqual(
      SESSION_5_WORKFLOW_PACKS.map((pack) => pack.value),
    );
    const fixtureObject = release.objects.find(
      (object) => object.key === fixtureKey.bundleObject.s3Key,
    );
    expect(fixtureObject).toMatchObject({
      evaluatorOnly: true,
      sha256: fixtureKey.bundleObject.sha256,
      sizeBytes: fixtureKey.bundleObject.sizeBytes,
    });
    expect(release.materials.find((material) => material.s3Key === fixtureObject?.key)).toMatchObject({
      instructorOnly: true,
    });

    expect(release.quizzes.map((quiz) => quiz.id)).toEqual([
      "quiz_s4_product-build-judgment",
      "quiz_s5_workflow-control",
    ]);
    for (const quiz of release.quizzes) {
      expect(quiz.contractMode).toBe("versioned");
      expect(quiz.answerMode).toBe("stable_id");
      expect(quiz.countsTowardBestOf).toBe(false);
      expect(quiz.classificationFinalizedAt).toBeNull();
      expect(quiz.publishedAt).toBeNull();
      expect(parseStableQuestions(quiz.questions)).not.toBeNull();
    }

    const studentPagePayload = JSON.stringify(
      release.pages.map((page) => ({
        ...page,
        materials: release.materials.filter(
          (material) => page.orderedMaterialIds.includes(material.id) && !material.instructorOnly,
        ),
      })),
    );
    expect(studentPagePayload).not.toMatch(/fact_pack|evaluator_adapter|answer_pack|INSTRUCTOR_ONLY/);
    expect(release.pages.find((page) => page.sessionNo === 3)?.linkedQuizIds).not.toContain("quiz_s3");
    expect(release.pages.find((page) => page.sessionNo === 4)?.linkedQuizIds).toEqual([]);
    expect(release.pages.find((page) => page.sessionNo === 5)?.linkedQuizIds).toEqual([]);
  });

  it("parses every stored schema/policy and freezes runtime-authorized evaluator contracts", () => {
    const release = buildFixtureRelease();
    expect(() => validateReleaseContracts(release)).not.toThrow();

    for (const type of release.assignmentTypes) {
      expect(parseSubmissionSchema(type.submissionSchema), type.slug).not.toBeNull();
    }
    for (const version of release.assessmentVersions) {
      expect(
        assertAssessmentEvaluatorChecksum({
          config: version.evaluator.config,
          answerKey: version.evaluator.answerKey,
          anchors: version.evaluator.anchors,
          normalization: version.evaluator.normalization,
          expectedSha256: version.evaluator.checksumSha256,
        }),
        version.id,
      ).toBe(version.evaluator.checksumSha256);
      const schema = parseSubmissionSchema(version.publicSchema);
      expect(schema, version.id).not.toBeNull();
      const policies = parseAssessmentPolicies(version);
      expect(policies, version.id).not.toBeNull();
      const runtime = parseAssessmentRuntimeConfig({
        rubric: version.rubric,
        evaluatorConfig: version.evaluator.config,
        answerKey: version.evaluator.answerKey,
        anchors: version.evaluator.anchors,
      });
      if (runtime.providerMode === "auto" && runtime.judgmentFieldIds.length > 0) {
        expect(runtime.anchors?.contentSha256, version.id).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(version.evaluator.anchors), version.id).not.toContain("s3Key");
        expect(runtime.approvedProcessor, version.id).toBe("anthropic");
        expect(runtime.approvedFlags.length, version.id).toBeGreaterThan(0);
        expect(new Set(runtime.approvedFlags).size, version.id).toBe(runtime.approvedFlags.length);
        expect(runtime.citationsPerDimension, version.id).toBeGreaterThan(0);
        expect(() => assertApprovedAssessmentProcessor({
          configuredProcessor: runtime.approvedProcessor,
          approvedProcessors: policies!.scoringPolicy.approvedAiProcessors ?? [],
          providerWorkRequired: true,
        }), version.id).not.toThrow();
      }
      if (runtime.providerMode === "none") {
        expect(runtime.anchors, version.id).toBeNull();
      }
    }

    const revised = release.assessmentVersions.find(
      (version) => version.id === "assess_s5_revised_flowchart_v1",
    )!;
    const revisedRuntime = parseAssessmentRuntimeConfig({
      rubric: revised.rubric,
      evaluatorConfig: revised.evaluator.config,
      answerKey: revised.evaluator.answerKey,
      anchors: revised.evaluator.anchors,
    });
    expect(revisedRuntime).toMatchObject({
      providerMode: "none",
      approvedProcessor: null,
      judgmentFieldIds: [],
    });
  });

  it("renders six stable S3 visual pairs without leaking keys and scores their selections deterministically", () => {
    const release = buildFixtureRelease();
    const version = release.assessmentVersions.find(
      (candidate) => candidate.id === "assess_s3_visuals_v1",
    )!;
    const schema = parseSubmissionSchema(version.publicSchema)!;
    expect(schema.fields.filter((field) => field.key.endsWith(".selection"))).toHaveLength(6);
    expect(schema.fields.filter((field) => field.key.endsWith(".rationale"))).toHaveLength(6);
    expect(JSON.stringify(version.publicSchema)).not.toContain("correct_option_id");

    const runtime = parseAssessmentRuntimeConfig({
      rubric: version.rubric,
      evaluatorConfig: version.evaluator.config,
      answerKey: version.evaluator.answerKey,
      anchors: version.evaluator.anchors,
    });
    expect(Object.keys(runtime.answerSpecs)).toHaveLength(6);
    expect(runtime.judgmentFieldIds).toHaveLength(6);
    const knownSelections = Object.fromEntries(
      Object.entries(runtime.answerSpecs).map(([key, spec]) => [
        key,
        spec.kind === "string" ? spec.expected : "",
      ]),
    );
    expect(evaluateObjectiveSet(runtime.answerSpecs, knownSelections).correctCount).toBe(6);
  });

  it("binds the ten sample-analysis questions to AI judgment without a full-dataset submission", () => {
    const release = buildFixtureRelease();
    const version = release.assessmentVersions.find(
      (candidate) => candidate.id === "assess_s3_sample_analysis_v2",
    )!;
    const runtime = parseAssessmentRuntimeConfig({
      rubric: version.rubric,
      evaluatorConfig: version.evaluator.config,
      answerKey: version.evaluator.answerKey,
      anchors: version.evaluator.anchors,
    });
    expect(Object.keys(runtime.answerSpecs)).toHaveLength(0);
    expect(runtime.judgmentFieldIds).toEqual([
      "S3-ANALYSIS-01", "S3-ANALYSIS-02", "S3-ANALYSIS-03", "S3-ANALYSIS-04", "S3-ANALYSIS-05",
      "S3-ANALYSIS-06", "S3-ANALYSIS-07", "S3-ANALYSIS-08", "S3-ANALYSIS-09", "S3-ANALYSIS-10",
    ]);
    expect(runtime.trustedAggregateSummaries).toEqual([
      expect.objectContaining({ id: "trustmrr-1000-answer-key-v2" }),
    ]);
    expect(release.assignments.find((assignment) => assignment.id === "asg_s3_sample_analysis_v2")).toBeTruthy();
    expect(release.assignments.find((assignment) => assignment.id === "asg_s3_datamemo")).toBeUndefined();
  });

  it("rejects malformed release policy before touching object storage or the database", async () => {
    const release = buildFixtureRelease();
    release.assessmentVersions[0].scoringPolicy = { component: "artifact-quality", unknown: true };
    const stat = vi.fn();
    const transaction = vi.fn();

    await expect(reconcileSessions3To5({
      db: { $transaction: transaction } as unknown as ReleaseDatabase,
      objectStore: { stat, put: vi.fn() },
      release,
      sessions: [3],
    })).rejects.toThrow(/policy contract/i);
    expect(stat).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a same-length existing S3 object whose exact version hash drifts", async () => {
    const release = buildFixtureRelease();
    const memory = memoryReleaseDatabase();
    const before = JSON.stringify(memory.tables);
    const byKey = new Map(release.objects.map((object) => [object.key, object]));
    __setS3TestOverrides({
      configured: true,
      head: async (key) => {
        const object = byKey.get(key)!;
        return {
          contentLength: object.sizeBytes,
          contentType: object.mimeType,
          etag: "fixture-etag",
          versionId: "fixture-existing-version",
        };
      },
      readVersion: async (key, _versionId, expectedBytes) => {
        const bytes = Uint8Array.from(byKey.get(key)!.bytes);
        bytes[0] = (bytes[0] ?? 0) ^ 0xff;
        expect(bytes.byteLength).toBe(expectedBytes);
        return bytes;
      },
    });

    await expect(reconcileSessions3To5({
      db: memory.db,
      objectStore: s3ReleaseObjectStore,
      release,
      sessions: [4],
    })).rejects.toThrow(/content-addressed object drift/i);
    expect(JSON.stringify(memory.tables)).toBe(before);
  });

  it("verifies the exact uploaded S3 version before any database mutation", async () => {
    const release = buildFixtureRelease();
    const memory = memoryReleaseDatabase();
    const before = JSON.stringify(memory.tables);
    const byKey = new Map(release.objects.map((object) => [object.key, object]));
    __setS3TestOverrides({
      configured: true,
      head: async () => {
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      },
      write: async () => ({ versionId: "fixture-upload-version", etag: "fixture-etag" }),
      readVersion: async (key, versionId, expectedBytes) => {
        expect(versionId).toBe("fixture-upload-version");
        const bytes = Uint8Array.from(byKey.get(key)!.bytes);
        bytes[0] = (bytes[0] ?? 0) ^ 0xff;
        expect(bytes.byteLength).toBe(expectedBytes);
        return bytes;
      },
    });

    await expect(reconcileSessions3To5({
      db: memory.db,
      objectStore: s3ReleaseObjectStore,
      release,
      sessions: [4],
    })).rejects.toThrow(/uploaded object checksum mismatch/i);
    expect(JSON.stringify(memory.tables)).toBe(before);
  });

  it("is idempotent and preserves authored pages, stale rows, learner records, gates, and instructor quiz choices", async () => {
    const release = buildFixtureRelease();
    const memory = memoryReleaseDatabase();
    memory.tables.submission = [{ id: "sub_existing", fields: { learner: "unchanged" } }];
    memory.tables.grade = [{ id: "grade_existing", score: 31 }];
    memory.tables.appeal = [{ id: "appeal_existing", status: "open" }];
    memory.tables.publicationDecision = [{ id: "pub_existing", featured: true }];
    const learnerFingerprint = JSON.stringify({
      submission: memory.tables.submission,
      grade: memory.tables.grade,
      appeal: memory.tables.appeal,
      publicationDecision: memory.tables.publicationDecision,
    });
    const objects = new Map<string, { sizeBytes: number; sha256: string }>();
    const objectStore = {
      stat: vi.fn(async (key: string) => objects.get(key) ?? null),
      put: vi.fn(async (object: Sessions3To5Release["objects"][number]) => {
        objects.set(object.key, { sizeBytes: object.sizeBytes, sha256: object.sha256 });
      }),
    };

    const first = await reconcileSessions3To5({ db: memory.db, objectStore, release });
    expect(first.database.created.length).toBeGreaterThan(0);
    expect(objectStore.put).toHaveBeenCalled();

    const classified = memory.tables.quiz.find((row) => row.id === "quiz_s4_product-build-judgment")!;
    Object.assign(classified, {
      classification: "retention",
      classificationFinalizedAt: new Date("2026-08-01T00:00:00.000Z"),
      classifiedBy: "instructor",
      countsTowardBestOf: false,
      publishedAt: new Date("2026-08-01T00:01:00.000Z"),
    });
    const quizGate = memory.tables.gate.find((row) =>
      row.targetType === "quiz" && row.targetId === "quiz_s4_product-build-judgment",
    )!;
    quizGate.state = "open";
    const putCount = objectStore.put.mock.calls.length;

    const second = await reconcileSessions3To5({ db: memory.db, objectStore, release });
    expect(second.database.created).toEqual([]);
    expect(second.database.updated).toEqual([]);
    expect(objectStore.put).toHaveBeenCalledTimes(putCount);
    expect(classified).toMatchObject({
      classification: "retention",
      classifiedBy: "instructor",
      countsTowardBestOf: false,
    });
    expect(quizGate.state).toBe("open");

    await reconcileSessions3To5({
      db: memory.db,
      objectStore,
      release,
      forceLockGates: true,
    });
    expect(quizGate.state).toBe("locked");
    quizGate.opensAt = new Date("2026-07-01T00:00:00.000Z");
    await reconcileSessions3To5({
      db: memory.db,
      objectStore,
      release,
      forceLockGates: true,
    });
    expect(quizGate.opensAt).toBeNull();
    expect(JSON.stringify({
      submission: memory.tables.submission,
      grade: memory.tables.grade,
      appeal: memory.tables.appeal,
      publicationDecision: memory.tables.publicationDecision,
    })).toBe(learnerFingerprint);

    for (const sessionNo of [3, 4, 5]) {
      const page = memory.tables.sessionPage.find((row) => row.sessionNo === sessionNo)!;
      expect(page.title).toBe(`Instructor-authored S${sessionNo}`);
      expect(page.summaryMd).toBe(`Keep this S${sessionNo} summary`);
      expect(page.orderedMaterialIds).toContain(`custom_mat_s${sessionNo}`);
      expect(page.linkedAssignmentIds).toContain(`custom_asg_s${sessionNo}`);
    }
    const s3Page = memory.tables.sessionPage.find((row) => row.sessionNo === 3)!;
    expect(s3Page.orderedMaterialIds).not.toContain("mat_s3_moxie");
    expect(s3Page.linkedAssignmentIds).not.toContain("asg_s3_datamemo");
    expect(s3Page.linkedQuizIds).not.toContain("quiz_s3");
    expect(memory.tables.material.some((row) => row.id === "mat_s3_moxie")).toBe(true);
    expect(memory.tables.quiz.some((row) => row.id === "quiz_s3")).toBe(true);
  });

  it("aborts a legacy cutover when any unbound submission would lose its historical contract", async () => {
    const release = buildFixtureRelease();
    const memory = memoryReleaseDatabase();
    const draft = {
      id: "sub_unbound_draft",
      assignmentId: "asg_s4_app",
      status: "draft",
      assessmentVersionId: null,
      fields: { appUrl: "https://example.invalid" },
    };
    const completed = {
      id: "sub_legacy_completed",
      assignmentId: "asg_s4_app",
      status: "submitted",
      assessmentVersionId: null,
      fields: { legacy: true },
    };
    memory.tables.submission.push(draft, completed);
    const objects = new Map<string, { sizeBytes: number; sha256: string }>();
    const put = vi.fn(async (object: Sessions3To5Release["objects"][number]) => {
      objects.set(object.key, { sizeBytes: object.sizeBytes, sha256: object.sha256 });
    });
    const objectStore = {
      stat: async (key: string) => objects.get(key) ?? null,
      put,
    };

    await expect(reconcileSessions3To5({
      db: memory.db,
      objectStore,
      release,
      sessions: [4],
    })).rejects.toThrow(/Cannot migrate 1 owned assignment.*2 unbound legacy submissions.*asg_s4_app/i);
    expect(put).not.toHaveBeenCalled();
    expect(memory.tables.retentionPolicy).toEqual([]);
    expect(memory.tables.assignmentType).toEqual([]);

    draft.status = "submitted";
    await expect(reconcileSessions3To5({
      db: memory.db,
      objectStore,
      release,
      sessions: [4],
    })).rejects.toThrow(/2 unbound legacy submissions/i);
    expect(memory.tables.submission).toEqual([draft, completed]);

    memory.tables.submission.length = 0;
    await expect(reconcileSessions3To5({
      db: memory.db,
      objectStore,
      release,
      sessions: [4],
    })).resolves.toMatchObject({ sessions: [4] });
  });

  it("dry-runs without writes and fails instead of mutating published contract drift", async () => {
    const release = buildFixtureRelease();
    const dryMemory = memoryReleaseDatabase();
    const before = JSON.stringify(dryMemory.tables);
    const put = vi.fn();
    const report = await reconcileSessions3To5({
      db: dryMemory.db,
      objectStore: { stat: async () => null, put },
      release,
      dryRun: true,
    });
    expect(report.dryRun).toBe(true);
    expect(report.objects.created.length).toBeGreaterThan(0);
    expect(put).not.toHaveBeenCalled();
    expect(JSON.stringify(dryMemory.tables)).toBe(before);

    const liveMemory = memoryReleaseDatabase();
    const objects = new Map<string, { sizeBytes: number; sha256: string }>();
    const objectStore = {
      stat: async (key: string) => objects.get(key) ?? null,
      put: async (object: Sessions3To5Release["objects"][number]) => {
        objects.set(object.key, { sizeBytes: object.sizeBytes, sha256: object.sha256 });
      },
    };
    await reconcileSessions3To5({ db: liveMemory.db, objectStore, release });
    const published = liveMemory.tables.assessmentVersion.find((row) => row.id === "assess_s4_app_v2")!;
    published.rubric = { tampered: true };
    await expect(reconcileSessions3To5({
      db: liveMemory.db,
      objectStore,
      release,
      sessions: [4],
    })).rejects.toThrow(/Published content\/hash drift/);
    expect(published.rubric).toEqual({ tampered: true });
  });
});

describe("bootstrap and Session 2 order safety", () => {
  it("production bootstrap creates shell pages without overwriting authored Sessions 3–5", async () => {
    const pages = new Map<number, MemoryRow>([3, 4, 5].map((sessionNo) => [sessionNo, {
      id: `spage_${sessionNo}`,
      sessionNo,
      title: `Authored ${sessionNo}`,
      summaryMd: `Authored summary ${sessionNo}`,
      orderedMaterialIds: [`mat_s${sessionNo}`],
    }]));
    const db = {
      sessionPage: {
        upsert: vi.fn(async ({ where, create, update }: {
          where: { sessionNo: number };
          create: MemoryRow;
          update: MemoryRow;
        }) => {
          const existing = pages.get(where.sessionNo);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          pages.set(where.sessionNo, create);
          return create;
        }),
      },
    };
    await ensureMissingSessionPages(db as never);
    await ensureMissingSessionPages(db as never);
    for (const sessionNo of [3, 4, 5]) {
      expect(pages.get(sessionNo)).toMatchObject({
        title: `Authored ${sessionNo}`,
        summaryMd: `Authored summary ${sessionNo}`,
        orderedMaterialIds: [`mat_s${sessionNo}`],
      });
    }
  });

  it("Session 2 setup creates only missing S2 gates and never relocks later sessions", async () => {
    const gates: MemoryRow[] = [3, 4, 5].map((sessionNo) => ({
      targetType: "session",
      targetId: `spage_${sessionNo}`,
      sectionId: "sec_A",
      state: sessionNo === 3 ? "open" : "closed",
      changedBy: "instructor",
    }));
    const db = {
      gate: {
        createMany: vi.fn(async ({ data }: { data: MemoryRow[] }) => {
          let count = 0;
          for (const row of data) {
            const duplicate = gates.some((existing) =>
              existing.targetType === row.targetType &&
              existing.targetId === row.targetId &&
              existing.sectionId === row.sectionId,
            );
            if (!duplicate) {
              gates.push(row);
              count += 1;
            }
          }
          return { count };
        }),
      },
    };
    const laterBefore = JSON.stringify(gates);
    const args = { db: db as never, sectionIds: ["sec_A"], pageId: "spage_2", actorId: "admin" };
    expect(await createMissingSession2Gates(args)).toBe(5);
    expect(await createMissingSession2Gates(args)).toBe(0);
    expect(JSON.stringify(gates.slice(0, 3))).toBe(laterBefore);
    expect(gates.slice(3).every((gate) =>
      gate.targetId === "spage_2" || String(gate.targetId).startsWith("asg_s2_"),
    )).toBe(true);
  });
});

describe.runIf(process.env.U8_DISPOSABLE_DATABASE === "1")(
  "Sessions 3–5 loader (explicit disposable Postgres)",
  () => {
    it("reconciles twice and is order-independent with the narrowed Session 2 gate setup", async () => {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      try {
        await prisma.section.create({ data: { id: "sec_A", code: "A", name: "Section A" } });
        await prisma.sessionPage.createMany({
          data: [2, 3, 4, 5].map((sessionNo) => ({
            id: `spage_${sessionNo}`,
            sessionNo,
            title: sessionNo >= 3 ? `Instructor-authored S${sessionNo}` : "Session 2",
            summaryMd: sessionNo >= 3 ? `Keep this S${sessionNo} summary` : "S2 shell",
            orderedMaterialIds: [],
            linkedAssignmentIds: [],
            linkedQuizIds: [],
          })),
        });
        await prisma.gate.createMany({
          data: [
            { targetType: "session", targetId: "spage_3", sectionId: "sec_A", state: "open", changedBy: "instructor" },
            { targetType: "session", targetId: "spage_4", sectionId: "sec_A", state: "closed", changedBy: "instructor" },
            { targetType: "session", targetId: "spage_5", sectionId: "sec_A", state: "locked", changedBy: "instructor" },
          ],
        });
        await createMissingSession2Gates({
          db: prisma,
          sectionIds: ["sec_A"],
          pageId: "spage_2",
          actorId: "admin",
          openedAt: new Date("2026-07-30T00:00:00.000Z"),
        });

        const release = buildSessions3To5Release({
          lmsRoot: LMS_ROOT,
          privateData: loadPrivateCourseDataPackage({
            directory: `${LMS_ROOT}/private/course-data/session-03/generated/v1`,
          }),
          quizPackage: quizPackageFixture(),
          sampleAnalysis: sampleAnalysisFixture(),
          readFileBytes: evaluatorFileFixture(),
        });
        const objects = new Map<string, { sizeBytes: number; sha256: string }>();
        const objectStore = {
          stat: async (key: string) => objects.get(key) ?? null,
          put: async (object: Sessions3To5Release["objects"][number]) => {
            objects.set(object.key, { sizeBytes: object.sizeBytes, sha256: object.sha256 });
          },
        };
        const first = await reconcileSessions3To5({ db: prisma, objectStore, release });
        const second = await reconcileSessions3To5({ db: prisma, objectStore, release });
        expect(first.database.created.length).toBeGreaterThan(0);
        expect(second.database.created).toEqual([]);
        expect(second.database.updated).toEqual([]);

        const laterFingerprint = async () => JSON.stringify({
          pages: await prisma.sessionPage.findMany({
            where: { sessionNo: { in: [3, 4, 5] } },
            orderBy: { sessionNo: "asc" },
          }),
          gates: await prisma.gate.findMany({
            where: { targetType: "session", targetId: { in: ["spage_3", "spage_4", "spage_5"] } },
            orderBy: { targetId: "asc" },
          }),
        });
        const beforeS2Rerun = await laterFingerprint();
        expect(await createMissingSession2Gates({
          db: prisma,
          sectionIds: ["sec_A"],
          pageId: "spage_2",
          actorId: "admin",
        })).toBe(0);
        expect(await laterFingerprint()).toBe(beforeS2Rerun);
        const fingerprint = JSON.parse(beforeS2Rerun) as {
          gates: Array<{ sectionId: string; state: string }>;
        };
        expect(
          fingerprint.gates
            .filter((gate) => gate.sectionId === "sec_A")
            .map((gate) => gate.state),
        ).toEqual([
          "open",
          "closed",
          "locked",
        ]);
        expect(
          fingerprint.gates
            .filter((gate) => gate.sectionId !== "sec_A")
            .every((gate) => gate.state === "locked"),
        ).toBe(true);
      } finally {
        await prisma.$disconnect();
      }
    }, 120_000);
  },
);
