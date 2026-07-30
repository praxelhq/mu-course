"use client";

import { SignOutButton } from "@clerk/nextjs";

export function AccountSignOutButton({
  label = "Log out / switch account",
  prominent = false,
}: {
  label?: string;
  prominent?: boolean;
}) {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        type="button"
        title="Sign out and return to login"
        style={{
          padding: prominent ? "0.75rem 1.25rem" : "0.35rem 0.625rem",
          border: `1px solid ${prominent ? "var(--pine)" : "var(--sand)"}`,
          borderRadius: 0,
          background: prominent ? "var(--pine)" : "transparent",
          color: prominent ? "var(--parchment)" : "var(--charcoal)",
          fontFamily: "var(--font-geist-mono)",
          fontSize: prominent ? "0.75rem" : "0.625rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    </SignOutButton>
  );
}
