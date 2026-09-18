import { z } from "zod";

export const RUBRIC = "studio-2026-09-19-v1";
export const wordCount = (text: string) =>
  text.trim().split(/\s+/u).filter(Boolean).length;
export function allowedEmail(email: string): boolean {
  const domains = (process.env.SHIPYARD_EMAIL_DOMAINS || "mastersunion.org")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  return (
    z.email().safeParse(email).success &&
    domains.includes(email.toLowerCase().split("@")[1])
  );
}
export const webUrl = z
  .url()
  .max(2048)
  .refine(
    (s) => ["https:", "http:"].includes(new URL(s).protocol),
    "Use an http or https URL",
  );
const featureSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().min(15).max(1500),
  mlp: z.boolean(),
});
export const ideaSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(150),
  description: z.string().max(5000),
  landingUrl: z.string().max(2048),
  customer: z.string().max(3000),
  problem: z.string().max(3000),
  alternative: z.string().max(3000),
  value: z.string().max(3000),
  pricing: z.string().max(3000),
  acquisition: z.string().max(3000),
  assumptions: z.string().max(5000),
  job: z.string().max(5000),
  features: z.array(featureSchema).max(40),
  sketches: z.array(z.string()).max(10),
  designs: z.array(z.string()).max(10),
  references: z.array(z.string()).max(3).default([]),
  liveUrl: z.string().max(2048),
  notes: z.string().max(5000),
  buildPlan: z.string().max(16000),
});
export const documentSchema = z
  .object({
    activeIdeaId: z.string(),
    ideas: z.array(ideaSchema).min(1).max(12),
  })
  .refine(
    (d) => d.ideas.some((i) => i.id === d.activeIdeaId),
    "Choose an existing idea",
  )
  .refine(
    (d) => new Set(d.ideas.map((i) => i.id)).size === d.ideas.length,
    "Idea IDs must be unique",
  );
export type StudioDocument = z.infer<typeof documentSchema>;
export type StudioIdea = z.infer<typeof ideaSchema>;
export function emptyIdea(id: string): StudioIdea {
  return {
    id,
    title: "",
    description: "",
    landingUrl: "",
    customer: "",
    problem: "",
    alternative: "",
    value: "",
    pricing: "",
    acquisition: "",
    assumptions: "",
    job: "",
    features: [],
    sketches: [],
    designs: [],
    references: [],
    liveUrl: "",
    notes: "",
    buildPlan: "",
  };
}
export function emptyDocument(): StudioDocument {
  return { activeIdeaId: "first", ideas: [emptyIdea("first")] };
}
const cp1 = z.object({
  title: z.string().trim().min(3).max(150),
  description: z
    .string()
    .trim()
    .min(20)
    .max(5000)
    .refine((s) => wordCount(s) < 200, "Keep the idea under 200 words"),
  landingUrl: webUrl,
});
const cp2 = z.object({
  job: z.string().trim().min(30).max(5000),
  features: z
    .array(featureSchema)
    .min(1)
    .max(40)
    .refine((f) => f.some((x) => x.mlp), "Select at least one MLP feature"),
  sketches: z.array(z.string().min(1)).min(1).max(3),
  designs: z.array(z.string().min(1)).min(1).max(3),
});
const cp3 = z.object({
  liveUrl: webUrl,
  notes: z.string().max(5000).default(""),
});
export function checkpointFields(cp: number) {
  if (cp === 1) return cp1;
  if (cp === 2) return cp2;
  if (cp === 3) return cp3;
  throw new Error("Unknown checkpoint");
}
export type GateRow = { checkpoint: number; version: number; status: string };
export function latestSubmission<T extends GateRow>(
  cp: number,
  rows: T[],
): T | undefined {
  return rows
    .filter((r) => r.checkpoint === cp)
    .sort((a, b) => b.version - a.version)[0];
}
export function gateOpen(cp: number, rows: GateRow[]): boolean {
  return Array.from({ length: cp - 1 }, (_, i) => i + 1).every(
    (n) => latestSubmission(n, rows)?.status === "passed",
  );
}
export const criterionIds = (cp: number) =>
  cp === 1
    ? ["build", "monetise", "digital"]
    : ["job", "features", "scope", "designs"];
export const reviewSchema = z.object({
  decision: z.enum(["pass", "revise", "evidence_needed"]),
  summary: z.string().max(4000),
  criteria: z
    .array(
      z.object({
        id: z.string(),
        met: z.boolean(),
        reason: z.string().max(2000),
        change: z.string().max(2000),
      }),
    )
    .max(10),
  nextSteps: z.array(z.string().max(2000)).max(6),
  sourceIds: z.array(z.string()).max(12),
});
export type StudioReview = z.infer<typeof reviewSchema>;
export function canPass(cp: number, review: StudioReview) {
  return (
    review.decision === "pass" &&
    criterionIds(cp).every(
      (id) =>
        review.criteria.filter((c) => c.id === id).length === 1 &&
        review.criteria.find((c) => c.id === id)?.met,
    )
  );
}
export const coachSchema = z.object({
  answer: z.string().max(12000),
  suggestions: z
    .array(
      z.object({
        field: z.enum([
          "description",
          "customer",
          "problem",
          "alternative",
          "value",
          "pricing",
          "acquisition",
          "assumptions",
          "job",
          "buildPlan",
        ]),
        value: z.string().max(16000),
        why: z.string().max(1500),
      }),
    )
    .max(5),
  sourceIds: z.array(z.string()).max(12),
});

export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("source-setting"),
    source: z.enum(["market", "reddit", "x", "instagram"]),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(100),
  }),
  z.object({
    action: z.literal("save"),
    version: z.number().int().nonnegative(),
    document: documentSchema,
    reason: z.string().trim().max(200).default("Saved workspace"),
  }),
  z.object({ action: z.literal("invite"), email: z.email() }),
  z.object({ action: z.literal("join"), token: z.string().min(20).max(200) }),
  z.object({ action: z.literal("revoke"), invitationId: z.string() }),
  z.object({
    action: z.literal("member"),
    memberId: z.string(),
    operation: z.enum(["remove", "owner"]),
  }),
  z.object({
    action: z.literal("submit"),
    checkpoint: z.number().int().min(1).max(3),
    version: z.number().int().nonnegative(),
    requestId: z.uuid(),
  }),
  z.object({
    action: z.literal("coach"),
    message: z.string().trim().min(3).max(5000),
    requestId: z.uuid(),
  }),
  z.object({
    action: z.literal("research"),
    query: z.string().trim().min(3).max(300),
    source: z.enum(["market", "reddit", "x", "instagram"]),
    target: z.string().max(2048).default(""),
    requestId: z.uuid(),
  }),
  z.object({ action: z.literal("cancel"), jobId: z.string() }),
  z.object({
    action: z.literal("appeal"),
    submissionId: z.string(),
    reason: z.string().trim().min(20).max(5000),
  }),
  z.object({ action: z.literal("retry-email"), appealId: z.string() }),
  z.object({
    action: z.literal("decide"),
    appealId: z.string(),
    decision: z.enum(["approved", "returned"]),
    note: z.string().trim().min(10).max(5000),
  }),
  z.object({
    action: z.literal("upload"),
    name: z.string().min(1).max(150),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
    kind: z.enum(["sketch", "design", "reference"]),
  }),
  z.object({ action: z.literal("confirm-upload"), fileId: z.string() }),
]);
