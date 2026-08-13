import { z } from "zod";

export const newsletterInputSchema = z.object({
  email: z.email().max(180),
  source: z.union([z.literal("blueprints"), z.literal("stats"), z.string().regex(/^blueprint:[a-z0-9-]{1,60}$/)]),
  website: z.string().max(0).optional(),
}).strict();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
