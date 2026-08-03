import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { availableLicenseCount, hasProjectEntitlement } from "@/lib/billing";
import { promptSetSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ownedProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    include: { understandings: { orderBy: { version: "desc" }, take: 1 }, promptSets: { orderBy: { createdAt: "desc" }, take: 1 }, jobs: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const [project, entitled, availableLicenses] = await Promise.all([ownedProject(id, user.id), hasProjectEntitlement(user.id, id), availableLicenseCount(user.id)]);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const promptSet = project.promptSets[0];
    const parsed = promptSet ? promptSetSchema.safeParse(promptSet.content) : null;
    const safeProject = !entitled && promptSet
      ? { ...project, promptSets: parsed?.success ? [{ ...promptSet, completedOrders: (promptSet.completedOrders ?? []).filter((order) => order === parsed.data.base.order), content: { base: parsed.data.base, followUps: [] } }] : [] }
      : project;
    const lockedPromptCount = !entitled && parsed?.success ? parsed.data.followUps.length : 0;
    return Response.json({ project: safeProject, entitled, availableLicenses, lockedPromptCount });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "Could not load the project." }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const found = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!found) return Response.json({ error: "Project not found." }, { status: 404 });
    await prisma.project.update({ where: { id }, data: { status: "deleting" } });
    await prisma.project.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "Could not delete the project." }, { status: 500 });
  }
}
