import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
    if (!project?.currentUnderstanding || !(["approved", "complete", "failed"] as string[]).includes(project.status)) {
      return Response.json({ error: "This project cannot be edited from its current stage." }, { status: 409 });
    }
    await prisma.project.update({ where: { id }, data: { status: "review", approvedVersion: null } });
    return Response.json({ status: "review" });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "The understanding could not be reopened." }, { status: 500 });
  }
}
