import { z } from "zod";
import {
  parsePublicationPolicy,
  type PublicationPolicy,
} from "./publication-policy";

const forbiddenProjectionKey =
  /(answer.?key|blueprint|confidence|credential|evaluator|grade|prompt|raw.?log|run.?log|score|secret|token|trust.?mrr)/i;

const policyKey = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => !forbiddenProjectionKey.test(value), "private key cannot be exported");

const assessmentProcessorId = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "assessment processor IDs must be normalized lowercase identifiers",
  );

const approvedAiProcessorList = z
  .array(assessmentProcessorId)
  .max(8)
  .refine(
    (processors) => new Set(processors).size === processors.length,
    "assessment processor IDs must be unique",
  );

const approvedAiProcessors = approvedAiProcessorList.optional();

const scoringPolicySchema = z.discriminatedUnion("component", [
  z
    .object({
      component: z.literal("artifact-quality"),
      approvedAiProcessors,
    })
    .strict(),
  z
    .object({
      component: z.literal("value-chain-map"),
      approvedAiProcessors,
    })
    .strict(),
  z
    .object({
      component: z.literal("media"),
      approvedAiProcessors,
    })
    .strict(),
  z
    .object({
      component: z.literal("workflow"),
      approvedAiProcessors,
      dimensions: z
        .object({
          usefulness: z.array(z.string().min(1).max(100)).min(1).max(10),
          execution: z.string().min(1).max(100),
          ownership: z.string().min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      component: z.literal("none"),
      approvedAiProcessors,
    })
    .strict(),
]);

export type ScoringPolicy = z.infer<typeof scoringPolicySchema>;

const requiredPublicLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
  })
  .strict();

const portfolioPolicySchema = z
  .object({
    include: z.boolean(),
    slot: z.string().min(1).max(100),
    requiredPublicLink: requiredPublicLinkSchema.optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.include && policy.requiredPublicLink) {
      context.addIssue({
        code: "custom",
        message: "a public link can be required only for an included portfolio slot",
        path: ["requiredPublicLink"],
      });
    }
  });

export type PortfolioPolicy = z.infer<typeof portfolioPolicySchema>;

const exportSurfaceSchema = z
  .object({
    enabled: z.boolean(),
    fieldKeys: z.array(policyKey).max(30),
  })
  .strict();

const exportPolicySchema = z
  .object({
    praxy: exportSurfaceSchema,
    dpdp: z
      .object({
        fieldKeys: z.array(policyKey).max(50),
        evidenceRoles: z.array(policyKey).max(30),
      })
      .strict(),
  })
  .strict();

export type ExportPolicy = z.infer<typeof exportPolicySchema>;

export type AssessmentPolicies = {
  purpose: "graded" | "formative";
  scoringPolicy: ScoringPolicy;
  portfolioPolicy: PortfolioPolicy;
  publicationPolicy: PublicationPolicy | null;
  exportPolicy: ExportPolicy;
};

export function parseScoringPolicy(value: unknown): ScoringPolicy | null {
  const parsed = scoringPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve the immutable processor allowlist only from a valid scoring policy.
 * Malformed or legacy policy JSON therefore cannot silently authorize a model.
 */
export function approvedAiProcessorsFromScoringPolicy(value: unknown): string[] {
  return parseScoringPolicy(value)?.approvedAiProcessors ?? [];
}

/**
 * Scoring policy is the authorizing source. A bound dataset allowlist can
 * narrow that release authorization, never expand a malformed or absent one.
 */
export function approvedAiProcessorsForAssessmentRelease(args: {
  scoringPolicy: unknown;
  datasetApprovedAiProcessors?: readonly string[] | null;
}): string[] {
  const scoring = approvedAiProcessorsFromScoringPolicy(args.scoringPolicy);
  if (scoring.length === 0) return [];
  if (args.datasetApprovedAiProcessors === undefined || args.datasetApprovedAiProcessors === null) {
    return scoring;
  }
  const parsedDataset = approvedAiProcessorList.safeParse(args.datasetApprovedAiProcessors);
  if (!parsedDataset.success) return [];
  const dataset = new Set(parsedDataset.data);
  return scoring.filter((processor) => dataset.has(processor));
}

export function parsePortfolioPolicy(value: unknown): PortfolioPolicy | null {
  const parsed = portfolioPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseExportPolicy(value: unknown): ExportPolicy | null {
  const parsed = exportPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Single loader/runtime contract. An empty publication object means that the
 * version is deliberately private; any non-empty malformed policy rejects the
 * entire contract instead of falling back to mutable AssignmentType fields.
 */
export function parseAssessmentPolicies(value: {
  purpose: unknown;
  scoringPolicy: unknown;
  portfolioPolicy: unknown;
  publicationPolicy: unknown;
  exportPolicy: unknown;
}): AssessmentPolicies | null {
  if (value.purpose !== "graded" && value.purpose !== "formative") return null;
  const scoringPolicy = parseScoringPolicy(value.scoringPolicy);
  const portfolioPolicy = parsePortfolioPolicy(value.portfolioPolicy);
  const exportPolicy = parseExportPolicy(value.exportPolicy);
  const emptyPublication =
    value.publicationPolicy !== null &&
    typeof value.publicationPolicy === "object" &&
    !Array.isArray(value.publicationPolicy) &&
    Object.keys(value.publicationPolicy).length === 0;
  const publicationPolicy = emptyPublication
    ? null
    : parsePublicationPolicy(value.publicationPolicy);

  if (!scoringPolicy || !portfolioPolicy || !exportPolicy) return null;
  if (!emptyPublication && !publicationPolicy) return null;
  if (value.purpose === "formative" && scoringPolicy.component !== "none") return null;
  if (value.purpose === "formative" && portfolioPolicy.include) return null;
  return {
    purpose: value.purpose,
    scoringPolicy,
    portfolioPolicy,
    publicationPolicy,
    exportPolicy,
  };
}

export function pickAllowedFields(
  fields: unknown,
  allowedKeys: readonly string[],
): Record<string, string | number | boolean | null> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  const source = fields as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of allowedKeys) {
    const value = source[key];
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}
