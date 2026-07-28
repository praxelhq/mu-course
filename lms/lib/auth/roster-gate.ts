// Pure roster-gate decision logic + the off-roster flagging side effect.
// The decision function is pure so it can be unit-tested without Next/Clerk;
// the proxy and webhook wire it to real lookups.

export type RosterLookup =
  | { id: string } // roster row found (select id only — keep the proxy query cheap)
  | null // authenticated but no roster row
  | "error"; // DB unreachable / query failed

export type RosterGateInput = {
  authenticated: boolean;
  email: string | null;
  rosterLookup: RosterLookup;
};

export type RosterGateDecision =
  | { allow: true }
  | {
      allow: false;
      reason: "unauthenticated" | "not-on-roster" | "db-error";
      /** true → record an AuditLog row and flag the Clerk user for deletion */
      flag: boolean;
    };

export function decideRosterGate(input: RosterGateInput): RosterGateDecision {
  if (!input.authenticated) {
    return { allow: false, reason: "unauthenticated", flag: false };
  }
  if (input.rosterLookup === "error") {
    // Fail closed for protected routes, but don't flag anyone — the lookup
    // failing says nothing about the user.
    return { allow: false, reason: "db-error", flag: false };
  }
  if (input.rosterLookup === null) {
    return { allow: false, reason: "not-on-roster", flag: true };
  }
  return { allow: true };
}

export type FlagOffRosterDeps = {
  clerkUserId: string;
  email: string | null;
  createAuditLog: (entry: {
    action: string;
    targetType: string;
    targetId: string;
    after: Record<string, unknown>;
  }) => Promise<void>;
  /** Best-effort: sets privateMetadata.flaggedForDeletion=true on the Clerk user. */
  flagClerkUser: (clerkUserId: string) => Promise<void>;
};

/**
 * Record the rejection of an off-roster Google account. The AuditLog write is
 * the source of truth; the Clerk metadata flag is best-effort (Clerk being
 * down must not turn a rejection into a 500). Actual deletion of the Clerk
 * user stays a manual admin action — we only flag.
 */
export async function flagOffRosterUser(deps: FlagOffRosterDeps): Promise<void> {
  await deps.createAuditLog({
    action: "auth.off_roster_rejected",
    targetType: "clerk_user",
    targetId: deps.clerkUserId,
    after: { email: deps.email, flaggedForDeletion: true },
  });
  try {
    await deps.flagClerkUser(deps.clerkUserId);
  } catch {
    // Best effort only — the AuditLog row above already records the event.
  }
}
