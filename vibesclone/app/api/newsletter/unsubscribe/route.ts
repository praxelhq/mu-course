import { z } from "zod";
import { prisma } from "@/lib/db";

const inputSchema = z.object({ token: z.string().min(24).max(128) }).strict();

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: parsed.data.token }, select: { id: true } });
  if (!subscriber) return Response.json({ error: "This unsubscribe link is not valid." }, { status: 404 });
  await prisma.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { active: false, unsubscribedAt: new Date(), reactivationRequestedAt: null } });
  return Response.json({ unsubscribed: true });
}
