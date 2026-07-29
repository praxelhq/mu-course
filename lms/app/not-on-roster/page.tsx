import type { Metadata } from "next";
import Link from "next/link";
import { hasClerkKeys } from "@/lib/auth/clerk";
import { SignOutAndRetry } from "./sign-out-button";

// Rendered per-request, not prerendered: the sign-out control uses a Clerk
// hook, and at build time there is no <ClerkProvider> to hang it on.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Not on roster · The Forge",
};

// Landing page for authenticated Google accounts that aren't on the course
// roster. The proxy redirects here after flagging the Clerk account.
export default function NotOnRosterPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4rem 2rem",
        maxWidth: "32rem",
        margin: "0 auto",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ochre)",
          marginBottom: "1rem",
        }}
      >
        The Forge
      </p>
      <h1 style={{ fontSize: "2.25rem", lineHeight: 1.15, margin: "0 0 1.5rem" }}>
        Not on the roster
      </h1>
      <hr style={{ margin: "0 0 1.5rem" }} />
      <p
        style={{
          fontSize: "1.125rem",
          lineHeight: 1.6,
          color: "var(--charcoal)",
          margin: 0,
        }}
      >
        This account isn&apos;t on the course roster yet.
      </p>
      <p
        style={{
          fontSize: "1rem",
          lineHeight: 1.6,
          color: "var(--charcoal)",
          margin: "1rem 0 0",
        }}
      >
        If you signed in with a personal address, sign out and use the email
        your instructor has on file. If you used the right one, tell your
        instructor — they can add you in a moment.
      </p>
      {/* Clerk-optional: without keys there is no provider (and no session to
          clear), so fall back to a plain link rather than crashing. */}
      {hasClerkKeys() ? (
        <SignOutAndRetry />
      ) : (
        <Link href="/sign-in" style={{ marginTop: "2rem", color: "var(--pine)" }}>
          Back to sign in
        </Link>
      )}
    </main>
  );
}
