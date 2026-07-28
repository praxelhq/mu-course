import { SubmissionStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { structuredCall, gradingModel, type StructuredCaller } from "@/lib/ai/client";
import { extractSubmissionFiles, type ExtractDeps } from "@/lib/ai/extract";
import {
  assembleGradingContext,
  applyPolicyFlags,
  gradeResponseSchemaFor,
  type GradeResponse,
  type LinkCheckResult,
} from "@/lib/ai/grading";
import { findNearDuplicates } from "@/lib/ai/near-dup";
import type { Embedder } from "@/lib/ai/embeddings";
import { parseSubmissionSchema } from "@/lib/submission-schema";
import { probeUrl, type LookupFn } from "@/lib/net/safe-fetch";
import { syncGalleryItem } from "@/lib/galleries";
import { rangedRead } from "@/lib/s3";
import { enqueueScreenshotCapture } from "@/lib/queue";

// The grade.submission consumer. All external effects are injectable so
// tests drive the exact production code path with a mocked model/S3/network.
//
// Failure policy (docs/DECISIONS.md): on model double-failure the handler
// throws → pg-boss retries with exponential backoff (retryLimit 4) → final
// failure dead-letters to 'grade.submission.dead'. The submission's status
// deliberately STAYS 'grading' — the dead-letter row carries it, and an admin
// re-enqueues from POST /api/admin/regrade (U16 surfaces the dead letters).

// ---------------------------------------------------------------------------
// Cost estimation (USD per token, current published prices)
// ---------------------------------------------------------------------------

const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-6": { input: 5, output: 25 },
};
const DEFAULT_PRICE = { input: 3, output: 15 };

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const price = PRICES_PER_MTOK[model] ?? DEFAULT_PRICE;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface GradeJobDeps {
  prisma?: PrismaClient;
  /** Model seam — defaults to the real Anthropic structuredCall. */
  model?: StructuredCaller;
  /** S3 seam for file extraction. */
  s3?: ExtractDeps;
  /** Network seams forwarded to safeFetch for link liveness. */
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  /** Embedding seam for near-dup (null disables; undefined = env-driven). */
  embed?: Embedder | null;
  /** U11 seam: screenshot enqueue after grading an app-type submission. */
  enqueueScreenshot?: (submissionId: string) => Promise<string | null>;
}

async function checkLink(
  field: string,
  url: string,
  deps: GradeJobDeps,
): Promise<LinkCheckResult> {
  const opts = {
    timeoutMs: 8_000,
    fetchImpl: deps.fetchImpl,
    lookup: deps.lookup,
  };
  try {
    // Some hosts reject HEAD (405/403) — confirm with GET before failing.
    const res = await probeUrl(url, opts, (r) => !r.ok && r.status !== 404);
    return { field, url, ok: res.ok, status: res.status };
  } catch (err) {
    return {
      field,
      url,
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Grade one submission end-to-end. Throws only on model failure (so pg-boss
 * retries); every other problem degrades into flags on the grade.
 */
export async function handleGradeSubmission(
  submissionId: string,
  deps: GradeJobDeps = {},
): Promise<void> {
  const db = deps.prisma ?? defaultPrisma;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { assignmentType: true } } },
  });
  if (!submission) {
    console.warn(`[grading] submission ${submissionId} not found — skipping`);
    return;
  }
  // Status guard: fresh jobs arrive as 'submitted'; 'grading' is accepted so a
  // dead-lettered/stuck job can be re-run. Anything else is skipped.
  if (
    submission.status !== SubmissionStatus.submitted &&
    submission.status !== SubmissionStatus.grading
  ) {
    console.warn(
      `[grading] submission ${submissionId} is '${submission.status}' — skipping`,
    );
    return;
  }

  await db.submission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.grading },
  });

  const type = submission.assignment.assignmentType;
  const schema = parseSubmissionSchema(type.submissionSchema);
  const fields = (submission.fields ?? {}) as Record<string, unknown>;

  // 1–3 run concurrently (independent):
  //   1. Near-duplicate detection (hash + embeddings; never throws).
  //   2. File extraction (gracefully degrades when S3 is unconfigured).
  //   3. Link liveness for every link-kind field value (via safeFetch —
  //      SSRF-guarded), each link probed concurrently; results keep the
  //      schema's field order.
  const linkFields = (schema?.fields ?? []).flatMap((def) => {
    if (def.kind !== "link") return [];
    const value = fields[def.key];
    if (typeof value !== "string" || value.trim() === "") return [];
    return [{ field: def.key, url: value }];
  });
  const [nearDup, extraction, linkChecks]: [
    Awaited<ReturnType<typeof findNearDuplicates>>,
    Awaited<ReturnType<typeof extractSubmissionFiles>>,
    LinkCheckResult[],
  ] = await Promise.all([
    findNearDuplicates(
      {
        id: submission.id,
        assignmentId: submission.assignmentId,
        userId: submission.userId,
        contentHash: submission.contentHash,
        fields,
      },
      { prisma: db, embed: deps.embed },
    ),
    extractSubmissionFiles(submission.files, deps.s3 ?? {}),
    Promise.all(linkFields.map((l) => checkLink(l.field, l.url, deps))),
  ]);
  const { extracted, failures: extractionFailures } = extraction;

  // 4. Assemble the anonymized, injection-hardened context.
  const context = assembleGradingContext({
    assignment: { title: submission.assignment.title, brief: submission.assignment.brief },
    type: { slug: type.slug, title: type.title, rubric: type.rubric },
    schema,
    fields,
    files: submission.files,
    extracted,
    linkChecks,
  });

  // 5. Vision: when the rubric scores a visual dimension (e.g. a presentation's
  // "Visual appeal"), attach the submitted PDF as a document block so Claude
  // grades from the actual slides — not just the extracted text. Best-effort:
  // a fetch failure falls back to text-only grading (extract already has text).
  const wantsVision = context.dimensions.some((d) => /visual/i.test(d.key));
  let pdfsBase64: string[] | undefined;
  let visionUser = context.user;
  if (wantsVision) {
    const read = deps.s3?.rangedRead ?? rangedRead;
    const pdfKeys = submission.files.filter((k) => /\.pdf$/i.test(k)).slice(0, 1);
    const encoded: string[] = [];
    for (const key of pdfKeys) {
      try {
        encoded.push(Buffer.from(await read(key, 16 * 1024 * 1024)).toString("base64"));
      } catch {
        // leave it — text-only grade, and applyPolicyFlags won't see a file here
      }
    }
    if (encoded.length > 0) {
      pdfsBase64 = encoded;
      visionUser +=
        "\n\nThe submission PDF is attached as a document. Assess the visual dimension(s) " +
        "(layout, hierarchy, imagery, overall design) from the actual pages, not from the text alone.";
    }
  }

  // 6. Model call (throws → pg-boss retry → dead letter; status stays 'grading').
  const call = deps.model ?? (structuredCall as StructuredCaller);
  const responseSchema = gradeResponseSchemaFor(context.dimensions.map((d) => d.key));
  const result = await call<GradeResponse>({
    system: context.system,
    user: visionUser,
    schema: responseSchema,
    maxTokens: 2048,
    temperature: 0,
    pdfsBase64,
  });

  // 6. Deterministic policy on top of the model grade.
  const finalGrade = applyPolicyFlags({
    grade: result.data,
    linkChecks,
    extractionFailures,
    nearDup: nearDup.nearDup,
  });

  const model = result.model || gradingModel();
  const costUsd = estimateCostUsd(model, result.usage);

  // 7. Persist everything in one transaction.
  await db.$transaction(async (tx) => {
    await tx.grade.create({
      data: {
        submissionId: submission.id,
        rubricScores: finalGrade.rubricScores as unknown as Prisma.InputJsonValue,
        total: finalGrade.total,
        confidence: finalGrade.confidence,
        feedbackMd: finalGrade.feedbackMd,
        flags: finalGrade.flags,
        gradedBy: "ai",
        provisional: true,
        promptLog: {
          system: context.system,
          user: context.user,
          response: result.raw,
          usage: result.usage,
          model,
          retries: result.retries,
          nearDupReasons: nearDup.reasons,
          extractionFailures,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.submission.update({
      where: { id: submission.id },
      data: { status: SubmissionStatus.graded },
    });
    await tx.notification.create({
      data: {
        userId: submission.userId,
        kind: "grade-ready",
        title: `Your ${type.title} grade is ready`,
        body: "Feedback and a provisional AI grade are ready — provisional until your instructor finalises it. Open it from your dashboard.",
      },
    });
    await tx.costLog.create({
      data: {
        feature: "grading",
        provider: "anthropic",
        model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsd,
        refType: "submission",
        refId: submission.id,
      },
    });
  });

  // 8. Gallery sync + screenshot capture, post-transaction and
  // best-effort: a gallery hiccup must never fail (or retry) a grading job.
  try {
    const item = await syncGalleryItem(submission.id, { prisma: db });
    if (item && item.submissionId === submission.id && type.slug === "app") {
      await (deps.enqueueScreenshot ?? enqueueScreenshotCapture)(submission.id);
    }
  } catch (err) {
    console.error(
      `[grading] gallery sync failed for ${submission.id} (grade persisted):`,
      err instanceof Error ? err.message : err,
    );
  }
}
