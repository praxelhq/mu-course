import { z } from "zod";
import { prisma } from "@/lib/db";

const inputSchema = z.object({ token: z.string().min(24).max(128) }).strict();

export async function POST(request: Request): Promise<Response> {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "This confirmation link is not valid." }, { status: 400 });
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: parsed.data.token }, select: { id: true, active: true } });
  if (!subscriber) return Response.json({ error: "This confirmation link is not valid." }, { status: 404 });
  if (!subscriber.active) {
    await prisma.$transaction([
      prisma.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { active: true, consentedAt: new Date(), unsubscribedAt: null, reactivationRequestedAt: null } }),
      prisma.productEvent.create({ data: { event: "newsletter_signup" } }),
    ]);
  }
  return Response.json({ subscribed: true });
}
