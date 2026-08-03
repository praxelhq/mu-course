import { z } from "zod";
import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { hasProjectEntitlement } from "@/lib/billing";
import { promptSetSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";

const bodySchema = z.object({ promptSetId: z.string(), order: z.number().int(), completed: z.boolean() });

// Locked and nonexistent orders share this response so the progress surface is not an oracle for paid steps.
const stepNotFound = () => Response.json({ error: "Step not found." }, { status: 404 });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "Provide a step order and completed flag." }, { status: 400 });

    const project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: { promptSets: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const promptSet = project?.promptSets[0];
    if (!project || !promptSet) return Response.json({ error: "Project not found." }, { status: 404 });

    if (promptSet.id !== body.data.promptSetId) return stepNotFound();
    const parsed = promptSetSchema.safeParse(promptSet.content);
    if (!parsed.success) return stepNotFound();

    const entitled = await hasProjectEntitlement(user.id, id);
    const accessibleOrders = entitled ? [parsed.data.base.order, ...parsed.data.followUps.map((item) => item.order)] : [parsed.data.base.order];
    if (!accessibleOrders.includes(body.data.order)) return stepNotFound();

    const next = new Set(promptSet.completedOrders);
    if (body.data.completed) next.add(body.data.order);
    else next.delete(body.data.order);
    const completedOrders = [...next].sort((a, b) => a - b);

    const updated = await prisma.promptSet.update({ where: { id: promptSet.id }, data: { completedOrders }, select: { completedOrders: true } });
    return Response.json({ completedOrders: updated.completedOrders });
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}
