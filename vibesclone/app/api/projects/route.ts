import { randomUUID } from "node:crypto";
import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { projectInputSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { enqueueAnalysis } from "@/lib/queue";
import { validatePublicUrl } from "@/lib/extraction/url-policy";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const projects = await prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, sourceUrl: true, niche: true, usp: true, buildTarget: true, status: true, updatedAt: true } });
    return Response.json({ projects });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "Could not load projects." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const input = projectInputSchema.parse(await request.json());
    const sourceUrl = await validatePublicUrl(input.sourceUrl);
    if (input.uiReferenceUrl) await validatePublicUrl(input.uiReferenceUrl);
    const name = `${input.niche.slice(0, 72)} · ${sourceUrl.hostname}`;
    const runId = randomUUID();
    const project = await prisma.project.create({
      data: {
        userId: user.id, name, sourceUrl: sourceUrl.toString(), uiReferenceUrl: input.uiReferenceUrl || null,
        niche: input.niche, usp: input.usp, buildTarget: input.buildTarget, status: "analyzing",
        jobs: { create: { id: runId, kind: "analyze", status: "queued", idempotencyKey: `analysis:${runId}`, requestedModel: process.env.OPENROUTER_MODEL ?? "qwen/qwen3.7-plus" } },
      },
    });
    try {
      await enqueueAnalysis(project.id, runId);
    } catch {
      await prisma.$transaction([
        prisma.project.update({ where: { id: project.id }, data: { status: "failed" } }),
        prisma.providerRun.update({ where: { id: runId }, data: { status: "failed", sanitizedError: "The analysis queue is temporarily unavailable." } }),
      ]);
    }
    return Response.json({ projectId: project.id }, { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const message = error instanceof Error ? error.message : "Invalid project input.";
    return Response.json({ error: message }, { status: 400 });
  }
}
