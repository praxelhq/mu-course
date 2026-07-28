"use client";

import { useState } from "react";

// Demo-only sign-in control. Rendered on the sign-in page ONLY when Clerk is
// unconfigured (the DEMO_MODE instance). Each button POSTs a seeded user id to
// the test-login backdoor, then navigates in so the freshly-set cookie is
// carried. Never rendered in a real production build (Clerk is configured
// there, so the page shows the real <SignIn/> instead).

type DemoIdentity = { label: string; sub: string; userId: string };

const IDENTITIES: DemoIdentity[] = [
  { label: "Enter as Student", sub: "Section A · user_s001", userId: "user_s001" },
  { label: "Enter as Instructor", sub: "instructor@praxel.in", userId: "user_instructor" },
  { label: "Enter as Admin", sub: "pushpak@praxel.in", userId: "user_admin_pushpak" },
];

export default function DemoLogin() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/test-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        setError(`Login failed (HTTP ${res.status}). The demo may still be seeding — retry in a moment.`);
        setBusy(null);
        return;
      }
      // Full navigation so the HttpOnly cookie is sent with the next request.
      window.location.assign("/");
    } catch {
      setError("Network error. Retry in a moment.");
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: "22rem" }}>
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--charcoal)",
          textAlign: "center",
          margin: "0 0 0.25rem",
        }}
      >
        Demo access — pick a role
      </p>
      {IDENTITIES.map((id) => (
        <button
          key={id.userId}
          type="button"
          disabled={busy !== null}
          onClick={() => enter(id.userId)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "0.15rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--sand)",
            borderRadius: 0,
            background: busy === id.userId ? "var(--sand)" : "var(--pine)",
            color: "var(--parchment)",
            cursor: busy !== null ? "wait" : "pointer",
            textAlign: "left",
            opacity: busy !== null && busy !== id.userId ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {busy === id.userId ? "Entering…" : id.label}
          </span>
          <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.7rem", opacity: 0.85 }}>
            {id.sub}
          </span>
        </button>
      ))}
      {error ? (
        <p style={{ color: "var(--ochre)", fontSize: "0.8rem", textAlign: "center", margin: 0 }}>{error}</p>
      ) : null}
    </div>
  );
}
