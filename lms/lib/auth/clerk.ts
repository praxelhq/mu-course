// The ONLY module that touches the Clerk SDK on the server (KTD16). Everything
// else — session resolution, the proxy, the webhook — goes through these
// wrappers so tests and seed-demo can substitute fakes, and so the whole app
// degrades gracefully when Clerk keys are absent (local dev uses the
// test-login cookie instead; see lib/auth/test-login.ts).
//
// Clerk imports are dynamic so simply importing lib/auth never pulls the SDK
// into a context (vitest, worker) where it can't initialise.

/**
 * Explicit env detection: Clerk is "on" only when both keys are configured.
 * When they're absent, getSessionUser falls back to test-login only and the
 * proxy passes requests through (dev without Clerk keys still boots).
 */
export function hasClerkKeys(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

/** Current Clerk session, or null when signed out / Clerk not configured. */
export async function getClerkSession(): Promise<{ clerkUserId: string } | null> {
  if (!hasClerkKeys()) return null;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ? { clerkUserId: userId } : null;
}

/**
 * Primary email of a Clerk user (Backend API call — used only as a fallback
 * when a users row has no clerkUserId link yet).
 */
export async function getClerkUserEmail(clerkUserId: string): Promise<string | null> {
  if (!hasClerkKeys()) return null;
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

/**
 * Merge metadata onto a Clerk user. Role/section truth flows roster-row →
 * Clerk publicMetadata (KTD21); privateMetadata.flaggedForDeletion marks
 * off-roster accounts for manual admin deletion.
 */
export async function updateClerkUserMetadata(
  clerkUserId: string,
  patch: {
    publicMetadata?: Record<string, unknown>;
    privateMetadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!hasClerkKeys()) return;
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, patch);
}
