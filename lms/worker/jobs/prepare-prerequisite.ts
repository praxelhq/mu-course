import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { structuredCall, type StructuredCaller } from "@/lib/ai/client";
import { extractSubmissionFiles } from "@/lib/ai/extract";
import {
  VISION_MAX_BYTES,
  buildVisionUser,
  visionArtifactFor,
  visionModel,
  visionSystem,
  visionTranscriptSchema,
} from "@/lib/ai/prerequisite-vision";
import { rangedRead } from "@/lib/s3";
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
//   1b. LOOK — when there is still no text, because the artifact is a picture.
//      A sector map is a drawing; students export it as PNG or as a scanned
//      PDF, and no text extractor will ever get a word out of it. The model
//      reads the image or the PDF directly and writes down what it shows. This
//      is a transcription, not a summary — the digest below still runs.
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
  read?: typeof rangedRead;
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

  const call = deps.model ?? (structuredCall as StructuredCaller);

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
        // Nothing to read means there may still be something to SEE.
        text = await transcribeByLooking({
          kind: data.kind,
          s3Key: row.s3Key,
          contentType: row.contentType,
          call,
          read: deps.read ?? rangedRead,
          prerequisiteId: row.id,
          prisma,
        });
      }
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

/**
 * Read an artifact that has no extractable text by looking at it. Returns the
 * transcription, or null when the file is not something the model can see
 * (wrong type, or too large to send) — in which case the caller reports
 * "nothing extractable" exactly as it did before this path existed.
 *
 * Best-effort like everything else here: a provider failure logs and returns
 * null rather than failing the job, because no prerequisite may block an
 * interview.
 */
async function transcribeByLooking(input: {
  kind: string;
  s3Key: string;
  contentType: string | null;
  call: StructuredCaller;
  read: typeof rangedRead;
  prerequisiteId: string;
  prisma: PrismaClient;
}): Promise<string | null> {
  let artifact: ReturnType<typeof visionArtifactFor>;
  try {
    const bytes = await input.read(input.s3Key, VISION_MAX_BYTES);
    artifact = visionArtifactFor(input.contentType, bytes);
  } catch (err) {
    console.error(`[prerequisite] could not read ${input.s3Key} to look at it:`, err);
    return null;
  }
  if (!artifact) return null;

  const model = visionModel();
  try {
    const result = await input.call({
      system: visionSystem(input.kind),
      user: buildVisionUser(input.kind),
      schema: visionTranscriptSchema(),
      maxTokens: 4_000,
      temperature: 0,
      model,
      ...(artifact.kind === "image"
        ? { images: [{ mediaType: artifact.mediaType, dataBase64: artifact.dataBase64 }] }
        : { pdfsBase64: [artifact.dataBase64] }),
    });
    await input.prisma.costLog
      .create({
        data: {
          feature: "interview_prerequisite_vision",
          provider: "anthropic",
          model,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costUsd: estimateCostUsd(model, result.usage),
          refType: "interview_prerequisite",
          refId: input.prerequisiteId,
        },
      })
      .catch((err: unknown) => console.error("[prerequisite] vision cost log failed:", err));

    const transcript = result.data.transcript.trim();
    if (!transcript) return null;
    console.log(
      `[prerequisite] read ${transcript.length} chars by looking at ${input.kind} (${artifact.kind})`,
    );
    return transcript.slice(0, PREREQUISITE_TEXT_CAP);
  } catch (err) {
    console.error(`[prerequisite] could not look at ${input.s3Key}:`, err);
    return null;
  }
}
