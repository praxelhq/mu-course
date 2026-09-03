import type { PrismaClient } from "@prisma/client";
import { prisma as prismaDefault } from "@/lib/db";
import { structuredCall, type StructuredCaller } from "@/lib/ai/client";
import {
  DIGEST_SYSTEM,
  buildDigestUser,
  digestModel,
  digestSchema,
  shouldDigest,
} from "@/lib/ai/prerequisite-digest";
import { estimateCostUsd } from "./grade-submission";

// Turns one uploaded artifact's raw extracted text into the short prose the
// interviewer actually reads. Best-effort by design: a failure here leaves
// `digest` null and the prompt falls back to the raw text, so a bad model call
// can never block a student from starting their interview.

export type DigestJobData = { userId: string; kind: string };

export interface DigestJobDeps {
  prisma?: PrismaClient;
  model?: StructuredCaller;
}

export async function handleDigestPrerequisite(
  data: DigestJobData,
  deps: DigestJobDeps = {},
): Promise<{ digested: boolean; reason?: string }> {
  const prisma = deps.prisma ?? prismaDefault;

  if (!shouldDigest(data.kind)) return { digested: false, reason: "kind not digested" };

  const row = await prisma.interviewPrerequisite.findUnique({
    where: { userId_kind: { userId: data.userId, kind: data.kind } },
  });
  if (!row) return { digested: false, reason: "prerequisite no longer exists" };
  if (!row.extractedText) return { digested: false, reason: "nothing was extracted" };

  const call = deps.model ?? (structuredCall as StructuredCaller);
  const model = digestModel();
  const result = await call({
    system: DIGEST_SYSTEM,
    user: buildDigestUser(row.extractedText),
    schema: digestSchema(),
    maxTokens: 1_500,
    temperature: 0,
    model,
  });

  // Re-read guard: the student may have re-uploaded while this ran. Binding the
  // update to the row id AND the text we summarised means a stale digest never
  // overwrites a newer artifact.
  const updated = await prisma.interviewPrerequisite.updateMany({
    where: { id: row.id, extractedText: row.extractedText },
    data: { digest: result.data.digest, digestedAt: new Date() },
  });
  if (updated.count === 0) return { digested: false, reason: "artifact changed mid-flight" };

  await prisma.costLog
    .create({
      data: {
        feature: "interview_prerequisite_digest",
        provider: "anthropic",
        model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsd: estimateCostUsd(model, result.usage),
        refType: "interview_prerequisite",
        refId: row.id,
      },
    })
    .catch((err: unknown) => {
      // Cost accounting must never fail the job that produced the value.
      console.error("[prerequisite-digest] cost log failed:", err);
    });

  return { digested: true };
}
