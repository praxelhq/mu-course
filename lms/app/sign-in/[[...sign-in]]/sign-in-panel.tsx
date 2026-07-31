"use client";

import Link from "next/link";
import { Show, SignIn, SignOutButton } from "@clerk/nextjs";

export function SignInPanel() {
  return (
    <>
      <Show when="signed-out"><SignIn /></Show>
      <Show when="signed-in">
        <section style={{ width: "min(100%, 26rem)", border: "1px solid var(--sand)", padding: "2rem", textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>You are already signed in.</h2>
          <p style={{ color: "var(--charcoal)" }}>Continue to the LMS, or sign out before choosing a different Google account.</p>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
            <Link href="/" style={{ background: "var(--pine)", color: "var(--cream)", padding: "0.75rem", textDecoration: "none" }}>Continue to LMS</Link>
            <SignOutButton redirectUrl="/sign-in">
              <button type="button" style={{ border: "1px solid var(--pine)", color: "var(--pine)", background: "transparent", padding: "0.75rem", cursor: "pointer" }}>Sign out and use another account</button>
            </SignOutButton>
          </div>
        </section>
      </Show>
    </>
  );
}
