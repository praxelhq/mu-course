import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { redeemAvailableLicense } from "@/lib/billing";
import { prisma } from "@/lib/db";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true } });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.status !== "complete") return Response.json({ error: "Generate the free base prompt first." }, { status: 409 });
    const redeemed = await prisma.$transaction((tx) => redeemAvailableLicense(tx, user.id, id), { isolationLevel: "Serializable" });
    if (!redeemed) return Response.json({ error: "No unused project licenses are available." }, { status: 409 });
    return Response.json({ unlocked: true });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "The project license could not be applied." }, { status: 500 });
  }
}
