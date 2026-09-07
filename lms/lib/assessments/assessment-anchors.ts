import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssessmentRubricDimension } from "@/lib/ai/assessment-grading";
import { scanSensitiveText } from "@/lib/evidence/sensitive-data";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const anchorBandSchema = z
  .object({
    key: z.string().regex(IDENTIFIER),
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    criteria: z.array(z.string().trim().min(1).max(600)).min(1).max(12),
  })
  .strict();

const anchorCapSchema = z
  .object({
    key: z.string().regex(IDENTIFIER),
    max: z.number().int().min(0),
    whenFlags: z.array(z.string().regex(IDENTIFIER)).min(1).max(12),
    rationale: z.string().trim().min(1).max(600),
  })
  .strict();

const safeExampleSchema = z
  .object({
    key: z.string().regex(IDENTIFIER),
    bandKey: z.string().regex(IDENTIFIER),
    source: z.literal("authored-abstract"),
    summary: z.string().trim().min(1).max(800),
  })
  .strict();

const anchorDimensionSchema = z
  .object({
    key: z.string().regex(IDENTIFIER),
    bands: z.array(anchorBandSchema).min(1).max(20),
    caps: z.array(anchorCapSchema).max(20),
    safeExamples: z.array(safeExampleSchema).min(1).max(12),
  })
  .strict();

const anchorContentSchema = z
  .object({
    safeForProcessor: z.literal(true),
    dimensions: z.array(anchorDimensionSchema).min(1).max(64),
  })
  .strict();

const anchorPackSchema = z
  .object({
    contract: z.literal("assessment-anchor-pack/v1"),
    contentSha256: z.string().regex(SHA256),
    content: anchorContentSchema,
  })
  .strict();

export type AssessmentAnchorBand = z.infer<typeof anchorBandSchema>;
export type AssessmentAnchorCap = z.infer<typeof anchorCapSchema>;
export type AssessmentAnchorSafeExample = z.infer<typeof safeExampleSchema>;
export type AssessmentAnchorDimension = z.infer<typeof anchorDimensionSchema>;
export type AssessmentAnchorContent = z.infer<typeof anchorContentSchema>;
export type AssessmentAnchorPack = z.infer<typeof anchorPackSchema>;

export type AnchoredDimensionScore = {
  score: number;
  rationale: string;
  anchorBand?: string;
};

export class AssessmentAnchorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssessmentAnchorError";
    this.code = code;
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, sortJson(object[key])]),
  );
}

export function canonicalAssessmentJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function assessmentJsonSha256(value: unknown): string {
  return createHash("sha256").update(canonicalAssessmentJson(value)).digest("hex");
}

export function createAssessmentAnchorPack(
  content: AssessmentAnchorContent,
): AssessmentAnchorPack {
  return {
    contract: "assessment-anchor-pack/v1",
    contentSha256: assessmentJsonSha256(content),
    content,
  };
}

function assertUnique(values: string[], code: string, label: string): void {
  if (new Set(values).size !== values.length) {
    throw new AssessmentAnchorError(code, `${label} must be unique`);
  }
}

function assertSafeAuthoredText(dimension: AssessmentAnchorDimension): void {
  const blocks = [
    ...dimension.bands.flatMap((band) => band.criteria),
    ...dimension.caps.map((cap) => cap.rationale),
    ...dimension.safeExamples.map((example) => example.summary),
  ];
  for (const [index, text] of blocks.entries()) {
    if (scanSensitiveText(text, `anchor:${dimension.key}:${index}`).length > 0) {
      throw new AssessmentAnchorError(
        "anchor-example-unsafe",
        `Authored anchor text for ${dimension.key} failed local safety checks`,
      );
    }
  }
}

type ProtectedAnswerFragment = {
  kind: "number" | "text";
  normalized: string;
};

function normalizedFragment(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function isProtectedAnswerKey(key: string): boolean {
  const compact = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return (
    compact === "privatekey" ||
    compact === "answer" ||
    compact.startsWith("expected") ||
    compact.startsWith("correctanswer") ||
    compact === "correctoptionid"
  );
}

function protectedAnswerFragments(answerKey: unknown): ProtectedAnswerFragment[] {
  const fragments = new Map<string, ProtectedAnswerFragment>();
  const addText = (value: string) => {
    const normalized = normalizedFragment(value);
    if (normalized.length < 3) return;
    fragments.set(`text:${normalized}`, { kind: "text", normalized });
  };
  const addNumber = (value: number) => {
    if (!Number.isFinite(value)) return;
    const normalized = String(value);
    fragments.set(`number:${normalized}`, { kind: "number", normalized });
  };
  const visit = (value: unknown, protectedBranch: boolean): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, protectedBranch);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const nextProtected = protectedBranch || isProtectedAnswerKey(key);
        if (protectedBranch) addText(key);
        visit(child, nextProtected);
      }
      return;
    }
    if (!protectedBranch) return;
    if (typeof value === "string") addText(value);
    if (typeof value === "number") addNumber(value);
  };
  visit(answerKey, false);
  return [...fragments.values()];
}

function publicFragments(value: unknown): Set<string> {
  const fragments = new Set<string>();
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child);
      return;
    }
    if (entry && typeof entry === "object") {
      for (const child of Object.values(entry as Record<string, unknown>)) visit(child);
      return;
    }
    if (typeof entry === "string" && entry.trim()) {
      fragments.add(`text:${normalizedFragment(entry)}`);
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      fragments.add(`number:${String(entry)}`);
    }
  };
  visit(value);
  return fragments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsProtectedFragment(text: string, fragment: ProtectedAnswerFragment): boolean {
  const normalizedText = normalizedFragment(text);
  const escaped = escapeRegExp(fragment.normalized);
  const pattern = fragment.kind === "number"
    ? `(?:^|[^A-Za-z0-9_.])${escaped}(?=$|[.,](?![0-9])|[^A-Za-z0-9_.])`
    : `(?:^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`;
  return new RegExp(pattern, "iu").test(normalizedText);
}

function assertNoProtectedAnswerMaterial(args: {
  pack: AssessmentAnchorPack;
  answerKey: unknown;
  publicContext: unknown;
}): void {
  if (args.answerKey === null || args.answerKey === undefined) return;
  const publicValues = publicFragments(args.publicContext);
  const protectedValues = protectedAnswerFragments(args.answerKey).filter(
    (fragment) => !publicValues.has(`${fragment.kind}:${fragment.normalized}`),
  );
  if (protectedValues.length === 0) return;
  const renderedAnchorText = args.pack.content.dimensions.flatMap((dimension) => [
    dimension.key,
    ...dimension.bands.flatMap((band) => [band.key, ...band.criteria]),
    ...dimension.caps.flatMap((cap) => [cap.key, ...cap.whenFlags, cap.rationale]),
    ...dimension.safeExamples.flatMap((example) => [
      example.key,
      example.bandKey,
      example.summary,
    ]),
  ]);
  if (
    protectedValues.some((fragment) =>
      renderedAnchorText.some((text) => containsProtectedFragment(text, fragment)),
    )
  ) {
    throw new AssessmentAnchorError(
      "anchor-answer-key-leak",
      "Authored anchor material overlaps a protected evaluator answer",
    );
  }
}

function assertDimensionContract(args: {
  dimension: AssessmentAnchorDimension;
  rubric: AssessmentRubricDimension;
  approvedFlags: ReadonlySet<string>;
}): void {
  const { dimension, rubric, approvedFlags } = args;
  assertUnique(
    dimension.bands.map((band) => band.key),
    "anchor-band-duplicate",
    `Anchor bands for ${dimension.key}`,
  );
  assertUnique(
    dimension.caps.map((cap) => cap.key),
    "anchor-cap-duplicate",
    `Anchor caps for ${dimension.key}`,
  );
  assertUnique(
    dimension.safeExamples.map((example) => example.key),
    "anchor-example-duplicate",
    `Anchor examples for ${dimension.key}`,
  );

  const bands = [...dimension.bands].sort((left, right) => left.min - right.min);
  if (bands.some((band, index) => dimension.bands[index]?.key !== band.key)) {
    throw new AssessmentAnchorError(
      "anchor-band-coverage-invalid",
      `Anchor bands for ${dimension.key} must be stored in ascending score order`,
    );
  }
  let expectedMin = 0;
  for (const band of bands) {
    if (band.min !== expectedMin || band.max < band.min || band.max > rubric.max) {
      throw new AssessmentAnchorError(
        "anchor-band-coverage-invalid",
        `Anchor bands for ${dimension.key} must cover every integer from 0 to ${rubric.max}`,
      );
    }
    expectedMin = band.max + 1;
  }
  if (expectedMin !== rubric.max + 1) {
    throw new AssessmentAnchorError(
      "anchor-band-coverage-invalid",
      `Anchor bands for ${dimension.key} must end at ${rubric.max}`,
    );
  }

  const bandKeys = new Set(bands.map((band) => band.key));
  for (const example of dimension.safeExamples) {
    if (!bandKeys.has(example.bandKey)) {
      throw new AssessmentAnchorError(
        "anchor-example-band-invalid",
        `Anchor example ${example.key} references an unknown band`,
      );
    }
  }
  for (const cap of dimension.caps) {
    if (cap.max > rubric.max || new Set(cap.whenFlags).size !== cap.whenFlags.length) {
      throw new AssessmentAnchorError(
        "anchor-cap-invalid",
        `Anchor cap ${cap.key} is malformed`,
      );
    }
    if (cap.whenFlags.some((flag) => !approvedFlags.has(flag))) {
      throw new AssessmentAnchorError(
        "anchor-cap-flag-invalid",
        `Anchor cap ${cap.key} references a flag outside the frozen evaluator policy`,
      );
    }
  }
  assertSafeAuthoredText(dimension);
}

export function parseAssessmentAnchorPack(args: {
  value: unknown;
  rubric: AssessmentRubricDimension[];
  approvedFlags: string[];
  answerKey?: unknown;
  publicContext?: unknown;
}): AssessmentAnchorPack {
  const parsed = anchorPackSchema.safeParse(args.value);
  if (!parsed.success) {
    throw new AssessmentAnchorError(
      "anchor-pack-invalid",
      "The frozen assessment anchor pack is malformed",
    );
  }
  const pack = parsed.data;
  if (assessmentJsonSha256(pack.content) !== pack.contentSha256) {
    throw new AssessmentAnchorError(
      "anchor-checksum-mismatch",
      "The frozen assessment anchor content does not match its content address",
    );
  }
  const rubricByKey = new Map(args.rubric.map((dimension) => [dimension.key, dimension]));
  const dimensionKeys = pack.content.dimensions.map((dimension) => dimension.key);
  assertUnique(dimensionKeys, "anchor-dimension-duplicate", "Anchor dimensions");
  if (
    dimensionKeys.length !== args.rubric.length ||
    dimensionKeys.some(
      (key, index) => !rubricByKey.has(key) || args.rubric[index]?.key !== key,
    )
  ) {
    throw new AssessmentAnchorError(
      "anchor-dimension-mismatch",
      "The frozen anchor dimensions do not exactly match the bound rubric",
    );
  }
  const approvedFlags = new Set(args.approvedFlags);
  for (const dimension of pack.content.dimensions) {
    assertDimensionContract({
      dimension,
      rubric: rubricByKey.get(dimension.key)!,
      approvedFlags,
    });
  }
  assertNoProtectedAnswerMaterial({
    pack,
    answerKey: args.answerKey,
    publicContext: {
      rubric: args.rubric,
      approvedFlags: args.approvedFlags,
      evaluator: args.publicContext,
    },
  });
  return pack;
}

export function assessmentAnchorDimension(
  pack: AssessmentAnchorPack,
  key: string,
): AssessmentAnchorDimension | null {
  return pack.content.dimensions.find((dimension) => dimension.key === key) ?? null;
}

export function assessmentAnchorBandForScore(
  dimension: AssessmentAnchorDimension,
  score: number,
): AssessmentAnchorBand | null {
  return dimension.bands.find((band) => score >= band.min && score <= band.max) ?? null;
}

export function assertAnchoredProviderScores(args: {
  anchors: AssessmentAnchorPack;
  rubricScores: Record<string, AnchoredDimensionScore>;
  flags: string[];
  requiredDimensionKeys: string[];
}): void {
  const required = new Set(args.requiredDimensionKeys);
  const returned = Object.keys(args.rubricScores);
  const anchored = new Set(
    args.anchors.content.dimensions.map((dimension) => dimension.key),
  );
  if (
    [...required].some((key) => !args.rubricScores[key]) ||
    returned.some((key) => !anchored.has(key))
  ) {
    throw new AssessmentAnchorError(
      "anchor-score-dimension-mismatch",
      "Provider scores do not exactly match the anchored subjective dimensions",
    );
  }
  const flags = new Set(args.flags);
  for (const key of args.requiredDimensionKeys) {
    const dimension = assessmentAnchorDimension(args.anchors, key);
    const score = args.rubricScores[key];
    if (!dimension || !score || !Number.isInteger(score.score)) {
      throw new AssessmentAnchorError(
        "anchor-score-invalid",
        `Provider score for ${key} is not an anchored integer score`,
      );
    }
    const band = assessmentAnchorBandForScore(dimension, score.score);
    if (!band || score.anchorBand !== band.key) {
      throw new AssessmentAnchorError(
        "anchor-band-mismatch",
        `Provider score for ${key} does not match its authored anchor band`,
      );
    }
    for (const cap of dimension.caps) {
      if (cap.whenFlags.some((flag) => flags.has(flag)) && score.score > cap.max) {
        throw new AssessmentAnchorError(
          "anchor-cap-violated",
          `Provider score for ${key} exceeds authored cap ${cap.key}`,
        );
      }
    }
  }
}

export function assertAssessmentEvaluatorChecksum(args: {
  config: unknown;
  answerKey: unknown;
  anchors: unknown;
  normalization: unknown;
  expectedSha256: string | null;
}): string {
  const actual = assessmentJsonSha256({
    config: args.config,
    answerKey: args.answerKey,
    anchors: args.anchors,
    normalization: args.normalization,
  });
  if (args.expectedSha256 !== null && actual !== args.expectedSha256) {
    throw new AssessmentAnchorError(
      "evaluator-checksum-mismatch",
      "The frozen evaluator JSON does not match its immutable checksum",
    );
  }
  return actual;
}
