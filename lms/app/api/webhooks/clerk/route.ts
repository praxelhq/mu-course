import { Webhook } from "svix";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { updateClerkUserMetadata } from "@/lib/auth/clerk";
import {
  handleClerkUserEvent,
  type ClerkWebhookEvent,
} from "@/lib/auth/webhook";
import {
  enrollTemporarySectionFUser,
  prismaTemporaryEnrollmentDeps,
} from "@/lib/auth/temporary-section-f-enrollment";

// Clerk → LMS user sync (defense-in-depth alongside the proxy roster gate).
// Svix signature verification against CLERK_WEBHOOK_SECRET happens before ANY
// processing: unsigned or bad-signature requests get a 400 with zero reads or
// writes. Runs on the Node runtime (route handlers default to it).

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfiguration: refuse rather than process unverified payloads.
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: ClerkWebhookEvent;
  try {
    evt = new Webhook(secret).verify(payload, headers) as ClerkWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const result = await handleClerkUserEvent(evt, {
    findUserByEmail: (email) =>
      prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, sectionId: true },
      }),
    linkClerkId: async (userId, clerkUserId) => {
      await prisma.user.update({ where: { id: userId }, data: { clerkUserId } });
    },
    createAuditLog: async (entry) => {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          after: entry.after as Prisma.InputJsonValue,
        },
      });
    },
    updateClerkMetadata: updateClerkUserMetadata,
    enrollTemporaryUser: (email, clerkUserId) =>
      enrollTemporarySectionFUser(
        { email, clerkUserId },
        prismaTemporaryEnrollmentDeps(prisma),
      ),
  });

  // Always 200 quickly on verified events so Clerk doesn't retry forever.
  return Response.json({ ok: true, outcome: result.outcome });
}
