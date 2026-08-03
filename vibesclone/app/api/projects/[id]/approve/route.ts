import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
    if (!project?.currentUnderstanding || project.status !== "review") return Response.json({ error: "This understanding is not ready for approval." }, { status: 409 });
    await prisma.$transaction([
      prisma.understandingVersion.update({ where: { projectId_version: { projectId: id, version: project.currentUnderstanding } }, data: { approvedAt: new Date() } }),
      prisma.project.update({ where: { id }, data: { approvedVersion: project.currentUnderstanding, status: "approved" } }),
    ]);
    return Response.json({ approvedVersion: project.currentUnderstanding });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "Approval failed." }, { status: 500 });
  }
}
