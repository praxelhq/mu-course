import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { understandingSchema, type BuildTarget } from "@/lib/contracts";
import { extractProductEvidence } from "@/lib/extraction/firecrawl";
import { fixturePromptSet, fixtureUnderstanding } from "@/lib/fixtures";
import { analyzeEvidence } from "@/lib/prompts/analysis";
import { generatePromptSet } from "@/lib/prompts/generation";
import { ensureDistinctProductName } from "@/lib/domain";

function safeMessage(error: unknown): string {
  if (error instanceof Error && /configured|timeout|timed out|returned|evidence|URL/i.test(error.message)) return error.message.slice(0, 300);
  return "The provider could not complete this run. Please retry.";
}

const MAX_PROVIDER_ATTEMPTS = 3;

export function isFinalProviderAttempt(attemptsBeforeIncrement: number): boolean {
  return attemptsBeforeIncrement + 1 >= MAX_PROVIDER_ATTEMPTS;
}

export async function analyzeProject(data: { projectId: string; runId: string }): Promise<void> {
  const run = await prisma.providerRun.findUnique({ where: { id: data.runId } });
  if (!run || run.status === "complete") return;
  await prisma.providerRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId } });
  try {
    let result;
    let evidence: unknown;
    if (process.env.FIXTURE_MODE === "true") {
      result = { understanding: fixtureUnderstanding({ hostname: new URL(project.sourceUrl).hostname, niche: project.niche, usp: project.usp }), receipt: { requestedModel: "fixture", servedModel: "fixture", inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } };
      evidence = [{ url: project.sourceUrl, title: "Fixture evidence", excerpt: "Deterministic local-development evidence." }];
    } else {
      const [pages, uiPages] = await Promise.all([
        extractProductEvidence(project.sourceUrl),
        project.uiReferenceUrl ? extractProductEvidence(project.uiReferenceUrl) : Promise.resolve(undefined),
      ]);
      result = await analyzeEvidence({ pages, uiPages, niche: project.niche, usp: project.usp });
      evidence = [...pages, ...(uiPages ?? [])].map((page) => ({ url: page.url, title: page.title, excerpt: page.markdown.slice(0, 500) }));
    }
    result = { ...result, understanding: ensureDistinctProductName(result.understanding, project.sourceUrl, project.niche) };
    const nextVersion = (project.currentUnderstanding ?? 0) + 1;
    await prisma.$transaction([
      prisma.understandingVersion.create({ data: { projectId: project.id, version: nextVersion, content: result.understanding, evidence: evidence as Prisma.InputJsonValue } }),
      prisma.project.update({ where: { id: project.id }, data: { status: "review", currentUnderstanding: nextVersion, approvedVersion: null } }),
      prisma.providerRun.update({ where: { id: run.id }, data: { status: "complete", servedModel: result.receipt.servedModel, requestedModel: result.receipt.requestedModel, inputTokens: result.receipt.inputTokens, outputTokens: result.receipt.outputTokens, estimatedCostUsd: result.receipt.estimatedCostUsd, completedAt: new Date() } }),
    ]);
  } catch (error) {
    const finalAttempt = isFinalProviderAttempt(run.attempts);
    const message = safeMessage(error);
    console.warn(`[worker] analysis attempt ${run.attempts + 1}/${MAX_PROVIDER_ATTEMPTS} failed: ${message}`);
    await prisma.$transaction([
      prisma.project.update({ where: { id: project.id }, data: { status: finalAttempt ? "failed" : "analyzing" } }),
      prisma.providerRun.update({ where: { id: run.id }, data: { status: finalAttempt ? "failed" : "queued", sanitizedError: message, completedAt: finalAttempt ? new Date() : null } }),
    ]);
    throw error;
  }
}

export async function generateProjectPrompts(data: { projectId: string; runId: string }): Promise<void> {
  const run = await prisma.providerRun.findUnique({ where: { id: data.runId } });
  if (!run || run.status === "complete") return;
  await prisma.providerRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId }, include: { understandings: true } });
  try {
    if (project.approvedVersion === null || project.approvedVersion !== project.currentUnderstanding) throw new Error("The current understanding is not approved.");
    const approved = project.understandings.find((item) => item.version === project.approvedVersion);
    if (!approved?.approvedAt) throw new Error("The approval snapshot is missing.");
    const understanding = understandingSchema.parse(approved.content);
    const result = process.env.FIXTURE_MODE === "true"
      ? { promptSet: fixturePromptSet(understanding, project.buildTarget as BuildTarget), receipt: { requestedModel: "fixture", servedModel: "fixture", inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } }
      : await generatePromptSet({ understanding, target: project.buildTarget as BuildTarget });
    await prisma.$transaction([
      prisma.promptSet.upsert({
        where: { projectId_understandingVersion_platform_templateVersion: { projectId: project.id, understandingVersion: approved.version, platform: project.buildTarget, templateVersion: "2026-07-31.1" } },
        update: {},
        create: { projectId: project.id, understandingVersion: approved.version, platform: project.buildTarget, templateVersion: "2026-07-31.1", model: result.receipt.servedModel, content: result.promptSet, inputTokens: result.receipt.inputTokens, outputTokens: result.receipt.outputTokens, estimatedCostUsd: result.receipt.estimatedCostUsd },
      }),
      prisma.project.update({ where: { id: project.id }, data: { status: "complete" } }),
      prisma.providerRun.update({ where: { id: run.id }, data: { status: "complete", servedModel: result.receipt.servedModel, requestedModel: result.receipt.requestedModel, inputTokens: result.receipt.inputTokens, outputTokens: result.receipt.outputTokens, estimatedCostUsd: result.receipt.estimatedCostUsd, completedAt: new Date() } }),
    ]);
  } catch (error) {
    const finalAttempt = isFinalProviderAttempt(run.attempts);
    const message = safeMessage(error);
    console.warn(`[worker] generation attempt ${run.attempts + 1}/${MAX_PROVIDER_ATTEMPTS} failed: ${message}`);
    await prisma.$transaction([
      prisma.project.update({ where: { id: project.id }, data: { status: finalAttempt ? "failed" : "generating" } }),
      prisma.providerRun.update({ where: { id: run.id }, data: { status: finalAttempt ? "failed" : "queued", sanitizedError: message, completedAt: finalAttempt ? new Date() : null } }),
    ]);
    throw error;
  }
}
