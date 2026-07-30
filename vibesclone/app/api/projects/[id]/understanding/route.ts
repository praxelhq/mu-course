import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { understandingSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id }, include: { understandings: { orderBy: { version: "desc" }, take: 1 } } });
    if (!project?.understandings[0]) return Response.json({ error: "Understanding not found." }, { status: 404 });
    const content = understandingSchema.parse(await request.json());
    const nextVersion = (project.currentUnderstanding ?? 0) + 1;
    const created = await prisma.$transaction(async (tx) => {
      const version = await tx.understandingVersion.create({ data: { projectId: id, version: nextVersion, content, evidence: project.understandings[0].evidence as Prisma.InputJsonValue } });
      await tx.project.update({ where: { id }, data: { currentUnderstanding: nextVersion, approvedVersion: null, status: "review" } });
      return version;
    });
    return Response.json({ version: created.version });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: "The understanding could not be saved." }, { status: 400 });
  }
}
