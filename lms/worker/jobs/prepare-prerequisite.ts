import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { structuredCall, type StructuredCaller } from "@/lib/ai/client";
import { extractSubmissionFiles } from "@/lib/ai/extract";
import { PREREQUISITE_TEXT_CAP } from "@/lib/interview/prerequisites";
import {
  digestSystem,
  buildDigestUser,
  digestModel,
  digestSchema,
  shouldDigest,
} from "@/lib/ai/prerequisite-digest";
import { estimateCostUsd } from "./grade-submission";

// Prepares one uploaded artifact for the interviewer. Two steps, both
// best-effort:
//
//   1. EXTRACT — only when the web tier got nothing. It cannot read PDFs: the
//      standalone build drops pdf-parse's native canvas binary (see
//      next.config.ts), so a sector map arrives with null text. This process
//      installs the full dependency tree, so it can. Text and JSON already
//      extract fine at upload and are untouched here.
//   2. DIGEST — turn a Make blueprint's raw JSON into prose the interviewer
//      can actually question the student about.
//
// Nothing here can block an interview. Every failure leaves the row as it was,
// and the prompt falls back to raw text, then to asking the student directly.

export type PreparePrerequisiteJobData = { userId: string; kind: string };

export interface PreparePrerequisiteDeps {
  prisma?: PrismaClient;
  model?: StructuredCaller;
  extract?: typeof extractSubmissionFiles;
}

export async function handlePreparePrerequisite(
  data: PreparePrerequisiteJobData,
  deps: PreparePrerequisiteDeps = {},
): Promise<{ extracted: boolean; digested: boolean; reason?: string }> {
  const prisma = deps.prisma ?? defaultPrisma;
  const done = (reason: string, extracted = false) => ({ extracted, digested: false, reason });

  const row = await prisma.interviewPrerequisite.findUnique({
    where: { userId_kind: { userId: data.userId, kind: data.kind } },
  });
  if (!row) return done("prerequisite no longer exists");

  let text = row.extractedText;
  let extracted = false;

  if (!text) {
    const extract = deps.extract ?? extractSubmissionFiles;
    try {
      const result = await extract([row.s3Key]);
      const joined = result.extracted
        .map((file) => file.text ?? "")
        .join("\n")
        .trim();
      text = joined ? joined.slice(0, PREREQUISITE_TEXT_CAP) : null;
      if (!text) {
        return done(`nothing extractable: ${result.failures[0] ?? "no text in the file"}`);
      }
      // Bound to the row's current empty state, so a student who re-uploaded
      // mid-flight is not overwritten with text from the previous file.
      const wrote = await prisma.interviewPrerequisite.updateMany({
        where: { id: row.id, extractedText: null },
        data: { extractedText: text },
      });
      if (wrote.count === 0) return done("artifact changed mid-flight");
      extracted = true;
      console.log(
        `[prerequisite] recovered ${text.length} chars from ${data.kind} for ${data.userId}`,
      );
    } catch (err) {
      return done(`extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!shouldDigest(data.kind)) return { extracted, digested: false, reason: "kind not digested" };

  const call = deps.model ?? (structuredCall as StructuredCaller);
  const model = digestModel();
  const result = await call({
    system: digestSystem(data.kind),
    user: buildDigestUser(text),
    schema: digestSchema(),
    maxTokens: 1_500,
    temperature: 0,
    model,
  });

  const updated = await prisma.interviewPrerequisite.updateMany({
    where: { id: row.id, extractedText: text },
    data: { digest: result.data.digest, digestedAt: new Date() },
  });
  if (updated.count === 0) return { extracted, digested: false, reason: "artifact changed mid-flight" };

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
      console.error("[prerequisite] cost log failed:", err);
    });

  return { extracted, digested: true };
}
