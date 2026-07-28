import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  cosineSimilarity,
  embedText,
  geminiEmbeddingsConfigured,
  type Embedder,
} from "./embeddings";

// U9 — near-duplicate detection for grading:
//   1. exact contentHash match against OTHER students' submissions on the
//      same assignment (a student's own resubmissions never count)
//   2. Gemini embedding cosine similarity over the concatenated text fields
//      vs other submissions' stored embeddings (Submission.embedding)
// Without GEMINI_API_KEY the check is hash-only and never throws.

export const NEAR_DUP_THRESHOLD = 0.92;

export interface NearDupResult {
  nearDup: boolean;
  reasons: string[];
}

export interface NearDupDeps {
  prisma?: PrismaClient | Prisma.TransactionClient;
  /**
   * DI seam: pass a function to force an embedder, `null` to disable the
   * embedding path entirely, or omit to use Gemini when configured.
   */
  embed?: Embedder | null;
  threshold?: number;
}

export interface NearDupSubmission {
  id: string;
  assignmentId: string;
  userId: string;
  contentHash: string | null;
  fields: unknown;
}

/** Concatenated text-field values, the embedding input. */
export function textForEmbedding(fields: unknown): string {
  if (typeof fields !== "object" || fields === null) return "";
  return Object.values(fields as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string")
    .join("\n")
    .trim();
}

export async function findNearDuplicates(
  submission: NearDupSubmission,
  deps: NearDupDeps = {},
): Promise<NearDupResult> {
  const db = deps.prisma ?? defaultPrisma;
  const threshold = deps.threshold ?? NEAR_DUP_THRESHOLD;
  const reasons: string[] = [];

  // 1. Exact content hash match (other students only, same assignment).
  if (submission.contentHash) {
    const hashMatch = await db.submission.findFirst({
      where: {
        assignmentId: submission.assignmentId,
        contentHash: submission.contentHash,
        id: { not: submission.id },
        userId: { not: submission.userId },
      },
      select: { id: true, userId: true },
    });
    if (hashMatch) {
      reasons.push(`exact content hash match with submission ${hashMatch.id}`);
    }
  }

  // 2. Embedding similarity (best-effort; disabled without a key or embedder).
  const embed: Embedder | null =
    deps.embed !== undefined
      ? deps.embed
      : geminiEmbeddingsConfigured()
        ? (text) => embedText(text)
        : null;

  if (embed) {
    try {
      const text = textForEmbedding(submission.fields);
      if (text.length > 0) {
        const vector = await embed(text);
        // Persist for future comparisons against THIS submission.
        await db.submission.update({
          where: { id: submission.id },
          data: { embedding: vector },
        });
        const others = await db.submission.findMany({
          where: {
            assignmentId: submission.assignmentId,
            id: { not: submission.id },
            userId: { not: submission.userId },
            NOT: { embedding: { isEmpty: true } },
          },
          select: { id: true, embedding: true },
        });
        for (const other of others) {
          const sim = cosineSimilarity(vector, other.embedding);
          if (sim >= threshold) {
            reasons.push(
              `embedding similarity ${sim.toFixed(3)} with submission ${other.id}`,
            );
          }
        }
      }
    } catch (err) {
      // Embedding trouble never blocks grading — fall back to hash-only.
      console.warn(
        `[near-dup] embedding check skipped for ${submission.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { nearDup: reasons.length > 0, reasons };
}
