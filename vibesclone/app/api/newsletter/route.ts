import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { findBlueprint } from "@/lib/blueprints";
import { newsletterInputSchema, normalizeEmail } from "@/lib/newsletter";
import { allowRequest } from "@/lib/request-rate-limit";

export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(request, "newsletter", 80, 60 * 60 * 1000)) return Response.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  const parsed = newsletterInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (parsed.data.source.startsWith("blueprint:") && !findBlueprint(parsed.data.source.slice(10))) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com").replace(/\/$/, "");
  let subscriber: { unsubscribeToken: string } | null;
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email }, select: { id: true, active: true, unsubscribeToken: true, reactivationRequestedAt: true } });
    if (existing?.active) return Response.json({ subscribed: true, confirmation: "existing" });
    if (existing) {
      if (existing.reactivationRequestedAt && existing.reactivationRequestedAt >= new Date(Date.now() - 10 * 60 * 1000)) return Response.json({ subscribed: false, confirmation: "reactivation-pending" });
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return Response.json({ error: "Reactivation email is temporarily unavailable." }, { status: 503 });
      subscriber = await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { source: parsed.data.source, reactivationRequestedAt: new Date() }, select: { unsubscribeToken: true } });
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "VibesClone <hello@send.vibesclone.com>", to: [email], subject: "Confirm your VibesClone digest re-subscription", text: `Someone requested to re-subscribe this address to the VibesClone build digest. Confirm only if it was you:\n\n${baseUrl}/resubscribe?token=${subscriber.unsubscribeToken}` }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
      if (!response?.ok) {
        await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { reactivationRequestedAt: null } }).catch(() => undefined);
        return Response.json({ error: "Reactivation email is temporarily unavailable." }, { status: 503 });
      }
      return Response.json({ subscribed: false, confirmation: "reactivation-sent" });
    }
    [subscriber] = await prisma.$transaction([
      prisma.newsletterSubscriber.create({ data: { email, source: parsed.data.source, unsubscribeToken: randomBytes(24).toString("base64url") }, select: { unsubscribeToken: true } }),
      prisma.productEvent.create({ data: { event: "newsletter_signup", blueprintSlug: parsed.data.source.startsWith("blueprint:") ? parsed.data.source.slice(10) : null } }),
    ]);
  } catch {
    return Response.json({ error: "The digest is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
  if (!subscriber) return Response.json({ error: "The digest is temporarily unavailable. Try again shortly." }, { status: 503 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Response.json({ subscribed: true, confirmation: "not-configured" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "VibesClone <hello@send.vibesclone.com>",
      to: [email],
      subject: "You’re on the VibesClone build list",
      text: `You’re in. We’ll send useful product blueprints and builder lessons—never invented urgency.\n\nUnsubscribe anytime: ${baseUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`,
    }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return Response.json({ subscribed: true, confirmation: "delayed" });
  return Response.json({ subscribed: true, confirmation: "sent" });
}
