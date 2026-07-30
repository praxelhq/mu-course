import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { canGenerate } from "@/lib/domain";
import { prisma } from "@/lib/db";
import { enqueueGeneration } from "@/lib/queue";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const gate = canGenerate({ status: project.status, approvedVersion: project.approvedVersion, currentUnderstanding: project.currentUnderstanding });
    if (!gate.ok) return Response.json({ error: gate.reason }, { status: 403 });
    const existing = await prisma.promptSet.findFirst({ where: { projectId: id, understandingVersion: project.approvedVersion! }, orderBy: { createdAt: "desc" } });
    if (existing) return Response.json({ promptSetId: existing.id, reused: true });
    const runId = randomUUID();
    const idempotencyKey = `generation:${id}:${project.approvedVersion}:${project.buildTarget}:${project.updatedAt.getTime()}`;
    await prisma.$transaction([
      prisma.providerRun.create({ data: { id: runId, projectId: id, kind: "generate", status: "queued", idempotencyKey, requestedModel: process.env.OPENROUTER_MODEL ?? "qwen/qwen3.7-plus" } }),
      prisma.project.update({ where: { id }, data: { status: "generating" } }),
    ]);
    try {
      await enqueueGeneration(id, runId);
    } catch {
      await prisma.$transaction([
        prisma.project.update({ where: { id }, data: { status: "approved" } }),
        prisma.providerRun.update({ where: { id: runId }, data: { status: "failed", sanitizedError: "The prompt queue is temporarily unavailable.", completedAt: new Date() } }),
      ]);
      return Response.json({ error: "The prompt queue is temporarily unavailable. Try again." }, { status: 503 });
    }
    return Response.json({ runId }, { status: 202 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Generation is already queued." }, { status: 409 });
    return Response.json({ error: "Generation could not be queued." }, { status: 500 });
  }
}
