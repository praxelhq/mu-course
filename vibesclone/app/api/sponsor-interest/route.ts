import { z } from "zod";
import { prisma } from "@/lib/db";
import { allowRequest } from "@/lib/request-rate-limit";

const sponsorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(180),
  company: z.string().trim().min(2).max(120),
  websiteUrl: z.url().max(2048),
  audienceFit: z.string().trim().min(10).max(1200),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(request, "sponsor-interest", 40, 60 * 60 * 1000)) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const parsed = sponsorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the details and try again." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const recent = await prisma.salesInquiry.count({ where: { email, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  if (recent >= 3) return Response.json({ error: "We already have your note and will reply shortly." }, { status: 429 });
  const message = `Company: ${parsed.data.company}\nWebsite: ${parsed.data.websiteUrl}\n\n${parsed.data.audienceFit}`;
  await prisma.salesInquiry.create({ data: { email, name: parsed.data.name, teamSize: "sponsor", message } });
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SALES_NOTIFICATION_EMAIL;
  if (!apiKey || !to) return Response.json({ received: true });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "VibesClone <sales@send.vibesclone.com>", to: [to], reply_to: email, subject: `VibesClone sponsor interest · ${parsed.data.company}`, text: `Name: ${parsed.data.name}\nEmail: ${email}\n${message}` }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return Response.json({ received: true, notification: "delayed" }, { status: 202 });
  return Response.json({ received: true });
}
