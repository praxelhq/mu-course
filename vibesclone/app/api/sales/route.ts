import { z } from "zod";
import { prisma } from "@/lib/db";

const inquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(180),
  teamSize: z.enum(["2-10", "11-50", "51-200", "200+"]),
  message: z.string().trim().min(10).max(1200),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = inquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the inquiry details and try again." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const recent = await prisma.salesInquiry.count({ where: { email, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  if (recent >= 3) return Response.json({ error: "We already have your inquiry and will reply shortly." }, { status: 429 });
  await prisma.salesInquiry.create({ data: { email, name: parsed.data.name, teamSize: parsed.data.teamSize, message: parsed.data.message } });
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SALES_NOTIFICATION_EMAIL;
  if (!apiKey || !to) return Response.json({ received: true });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "VibesClone Sales <sales@send.vibesclone.com>",
      to: [to],
      reply_to: email,
      subject: `VibesClone sales inquiry · ${parsed.data.teamSize} people`,
      text: `Name: ${parsed.data.name}\nEmail: ${email}\nTeam size: ${parsed.data.teamSize}\n\n${parsed.data.message}`,
    }),
  });
  if (!response.ok) return Response.json({ error: "Your inquiry was saved, but the notification is delayed." }, { status: 502 });
  return Response.json({ received: true });
}
