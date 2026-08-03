import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueAnalysis } from "@/lib/queue";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
    if (!project || !(["review", "failed"] as string[]).includes(project.status)) return Response.json({ error: "This project cannot be rethought right now." }, { status: 409 });
    const runId = randomUUID();
    const idempotencyKey = `rethink:${id}:${project.currentUnderstanding ?? 0}:${project.updatedAt.getTime()}`;
    await prisma.$transaction([
      prisma.providerRun.create({ data: { id: runId, projectId: id, kind: "rethink", status: "queued", idempotencyKey, requestedModel: process.env.OPENROUTER_MODEL ?? "qwen/qwen3.7-plus" } }),
      prisma.project.update({ where: { id }, data: { status: "analyzing", approvedVersion: null } }),
    ]);
    try {
      await enqueueAnalysis(id, runId);
    } catch {
      await prisma.$transaction([
        prisma.project.update({ where: { id }, data: { status: project.status } }),
        prisma.providerRun.update({ where: { id: runId }, data: { status: "failed", sanitizedError: "The analysis queue is temporarily unavailable.", completedAt: new Date() } }),
      ]);
      return Response.json({ error: "The analysis queue is temporarily unavailable. Try again." }, { status: 503 });
    }
    return Response.json({ runId }, { status: 202 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "A rethink is already queued." }, { status: 409 });
    return authErrorResponse(error) ?? Response.json({ error: "Rethink could not be queued." }, { status: 500 });
  }
}
