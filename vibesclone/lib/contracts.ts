import { z } from "zod";

export const buildTargets = ["lovable", "replit", "base44", "claude-code"] as const;
export type BuildTarget = (typeof buildTargets)[number];

export const projectInputSchema = z.object({
  sourceUrl: z.url().max(2048),
  uiReferenceUrl: z.union([z.url().max(2048), z.literal("")]).optional(),
  niche: z.string().trim().min(2).max(160),
  usp: z.string().trim().min(2).max(240),
  buildTarget: z.enum(buildTargets),
});

export const evidenceSchema = z.object({
  url: z.url(),
  title: z.string(),
  excerpt: z.string().max(800),
});

export const featureSchema = z.object({
  name: z.string(),
  disposition: z.enum(["retain", "modify", "remove", "add"]),
  rationale: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceUrls: z.array(z.url()).max(8),
});

export const understandingSchema = z.object({
  productName: z.string(),
  summary: z.string(),
  icp: z.array(z.string()).min(1).max(8),
  coreJobs: z.array(z.string()).min(1).max(12),
  productFlows: z.array(z.object({ name: z.string(), steps: z.array(z.string()).min(2).max(12) })).min(1).max(12),
  features: z.array(featureSchema).min(1).max(40),
  nicheAndUspChanges: z.array(z.string()).min(1).max(12),
  businessModelSignals: z.array(z.string()).max(8),
  evidenceGaps: z.array(z.string()).max(12),
});
export type BuildUnderstanding = z.infer<typeof understandingSchema>;

export const promptItemSchema = z.object({
  order: z.number().int().nonnegative(),
  title: z.string(),
  purpose: z.string(),
  prompt: z.string().min(80),
  completionChecks: z.array(z.string()).min(1).max(12),
  mappedFeatures: z.array(z.string()).min(1),
});

export const promptSetSchema = z.object({
  base: promptItemSchema.extend({ order: z.literal(0) }),
  followUps: z.array(promptItemSchema).min(2).max(12),
});
export type PromptSetContent = z.infer<typeof promptSetSchema>;
