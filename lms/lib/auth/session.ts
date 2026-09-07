import type { Role } from "@prisma/client";

// Core session resolution, dependency-injected so vitest can drive it without
// Next request scope, Clerk, or a live DB. lib/auth/index.ts wires the real
// deps (Prisma + Clerk wrappers + cookie readers).

export type SessionUser = {
  userId: string;
  email: string;
  role: Role;
  sectionId: string | null;
  teamId: string | null;
};

export type SessionUserRow = {
  id: string;
  email: string;
  role: Role;
  sectionId: string | null;
  teamId: string | null;
  flaggedForDeletion: boolean;
};

export type SessionDeps = {
  testLoginEnabled: boolean;
  /** users.id from the forge_test_user cookie, if present. */
  getTestUserId: () => Promise<string | null>;
  /** Current Clerk session (null when signed out or Clerk unconfigured). */
  getClerkSession: () => Promise<{ clerkUserId: string } | null>;
  /** Fallback email lookup for a Clerk user not yet linked to a users row. */
  getClerkEmail: (clerkUserId: string) => Promise<string | null>;
  db: {
    findUserById: (id: string) => Promise<SessionUserRow | null>;
    findUserByClerkId: (clerkUserId: string) => Promise<SessionUserRow | null>;
    findUserByEmail: (email: string) => Promise<SessionUserRow | null>;
    /** Backfill users.clerkUserId after an email-fallback match. */
    linkClerkId: (userId: string, clerkUserId: string) => Promise<void>;
  };
};

function toSessionUser(row: SessionUserRow): SessionUser {
  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    sectionId: row.sectionId,
    teamId: row.teamId,
  };
}

/**
 * Resolution order:
 *  (a) test-login cookie (only when ENABLE_TEST_LOGIN is active outside prod);
 *  (b) Clerk session → users row by clerkUserId, falling back to the Clerk
 *      user's primary email (and backfilling clerkUserId on a hit).
 * Off-roster Clerk sessions resolve to null — the proxy handles flag+redirect.
 */
export async function resolveSessionUser(deps: SessionDeps): Promise<SessionUser | null> {
  if (deps.testLoginEnabled) {
    const testUserId = await deps.getTestUserId();
    if (testUserId) {
      const row = await deps.db.findUserById(testUserId);
      if (row && !row.flaggedForDeletion) return toSessionUser(row);
      return null;
    }
  }

  const clerk = await deps.getClerkSession();
  if (!clerk) return null;

  const byClerkId = await deps.db.findUserByClerkId(clerk.clerkUserId);
  if (byClerkId) return byClerkId.flaggedForDeletion ? null : toSessionUser(byClerkId);

  const email = await deps.getClerkEmail(clerk.clerkUserId);
  if (!email) return null;
  const byEmail = await deps.db.findUserByEmail(email);
  if (!byEmail || byEmail.flaggedForDeletion) return null;
  await deps.db.linkClerkId(byEmail.id, clerk.clerkUserId);
  return toSessionUser(byEmail);
}
