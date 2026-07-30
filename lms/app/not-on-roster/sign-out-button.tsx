"use client";

import { AccountSignOutButton } from "@/components/account-sign-out-button";

// Escape hatch for the roster gate. Without this a student who signs in with
// the wrong account is stuck: they are authenticated, every protected route
// bounces them here, and /sign-in sees a live session and bounces them back —
// a loop with no way out. Signing out fully clears the session and returns
// them to the sign-in page so they can try their roster address.

export function SignOutAndRetry() {
  return (
    <div style={{ marginTop: "2rem", alignSelf: "flex-start" }}>
      <AccountSignOutButton
        label="Sign out & try another email"
        prominent
      />
    </div>
  );
}
