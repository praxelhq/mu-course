"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

// Escape hatch for the roster gate. Without this a student who signs in with
// the wrong account is stuck: they are authenticated, every protected route
// bounces them here, and /sign-in sees a live session and bounces them back —
// a loop with no way out. Signing out fully clears the session and returns
// them to the sign-in page so they can try their roster address.

export function SignOutAndRetry() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ redirectUrl: "/sign-in" });
      }}
      style={{
        marginTop: "2rem",
        padding: "0.75rem 1.25rem",
        border: "1px solid var(--sand)",
        borderRadius: 0,
        background: "var(--pine)",
        color: "var(--parchment)",
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.75rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: busy ? "wait" : "pointer",
        alignSelf: "flex-start",
      }}
    >
      {busy ? "Signing out…" : "Sign out & try another email"}
    </button>
  );
}
