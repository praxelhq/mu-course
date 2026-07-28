import type { Role } from "@prisma/client";

// Core Clerk webhook event handling, dependency-injected for testability.
// Signature verification lives in the route (app/api/webhooks/clerk/route.ts)
// and MUST happen before this function is called.

export type ClerkUserEventData = {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
  public_metadata?: Record<string, unknown>;
};

export type ClerkWebhookEvent = { type: string; data: ClerkUserEventData };

export type ClerkWebhookDeps = {
  findUserByEmail: (
    email: string,
  ) => Promise<{ id: string; role: Role; sectionId: string | null } | null>;
  linkClerkId: (userId: string, clerkUserId: string) => Promise<void>;
  createAuditLog: (entry: {
    action: string;
    targetType: string;
    targetId: string;
    after: Record<string, unknown>;
  }) => Promise<void>;
  updateClerkMetadata: (
    clerkUserId: string,
    patch: {
      publicMetadata?: Record<string, unknown>;
      privateMetadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
};

export function primaryEmail(data: ClerkUserEventData): string | null {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return null;
  const primary = addresses.find((a) => a.id === data.primary_email_address_id);
  return (primary ?? addresses[0]).email_address?.toLowerCase() ?? null;
}

/**
 * user.created / user.updated: link the Clerk account to the existing roster
 * users row by email and push role/section INTO Clerk publicMetadata. Truth
 * flows roster-row → Clerk (KTD21); nothing from the Clerk payload is ever
 * written to local role/section. Unknown emails are flagged for manual
 * deletion (privateMetadata + AuditLog) — never auto-deleted, and no users
 * row is created for them.
 */
export async function handleClerkUserEvent(
  evt: ClerkWebhookEvent,
  deps: ClerkWebhookDeps,
): Promise<{ outcome: "linked" | "flagged" | "ignored" }> {
  if (evt.type !== "user.created" && evt.type !== "user.updated") {
    return { outcome: "ignored" };
  }

  const clerkUserId = evt.data.id;
  const email = primaryEmail(evt.data);

  const row = email ? await deps.findUserByEmail(email) : null;
  if (!row) {
    await deps.createAuditLog({
      action: "auth.off_roster_rejected",
      targetType: "clerk_user",
      targetId: clerkUserId,
      after: { email, flaggedForDeletion: true, source: "webhook", eventType: evt.type },
    });
    try {
      await deps.updateClerkMetadata(clerkUserId, {
        privateMetadata: { flaggedForDeletion: true },
      });
    } catch {
      // Best effort — the AuditLog row records the rejection either way.
    }
    return { outcome: "flagged" };
  }

  await deps.linkClerkId(row.id, clerkUserId);
  await deps.updateClerkMetadata(clerkUserId, {
    publicMetadata: { role: row.role, sectionId: row.sectionId },
  });
  return { outcome: "linked" };
}
