"use client";

import { useState } from "react";
import type { DemoPersona } from "@/lib/shipyard/demo-personas";
import { demoLandingPath } from "@/lib/shipyard/demo-personas";

// One click becomes somebody else. POST /api/test-login validates the id and
// sets the HttpOnly session cookie; `forge_welcomed` is set alongside it
// because it is the Forge's one-time onboarding cookie rather than a session.
// This mirrors e2e/helpers.ts exactly, so the demo and the Playwright suite log
// in the same way.

/**
 * Leave for the persona's landing page, carrying the Forge's one-time welcome
 * cookie so a Course 2 demo does not walk through Course 1's onboarding.
 *
 * Module scope, not the handler: both of these are writes to the document, and
 * the React compiler's immutability rule (correctly) refuses those inside a
 * component. A full navigation rather than a router push — the session just
 * changed, and every cached server component on the client belongs to somebody
 * else now.
 */
function leaveAs(persona: DemoPersona): void {
  document.cookie = "forge_welcomed=1; path=/; SameSite=Lax";
  window.location.assign(demoLandingPath(persona));
}

export function DemoSwitcher({
  personas,
}: {
  personas: (DemoPersona & { present: boolean })[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function become(persona: DemoPersona) {
    if (busy) return;
    setBusy(persona.id);
    setError(null);
    try {
      const res = await fetch("/api/test-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: persona.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error ??
            `Sign-in refused (${res.status}). Is this build running with ENABLE_TEST_LOGIN=1 against a seeded database?`,
        );
        setBusy(null);
        return;
      }
      leaveAs(persona);
    } catch {
      setError("That did not reach the server.");
      setBusy(null);
    }
  }

  return (
    <div className="sy-personas">
      {error && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}
      <ul className="sy-personas__list">
        {personas.map((p) => (
          <li className="sy-persona" key={p.id}>
            <button
              type="button"
              className="sy-persona__btn"
              disabled={!p.present || busy !== null}
              onClick={() => become(p)}
            >
              <span className="sy-persona__top">
                <span className="sy-persona__name">{p.name}</span>
                <span className="sy-persona__role">
                  {p.role === "student" ? `Section ${p.section}` : p.role}
                </span>
              </span>
              <span className="sy-persona__shows">
                {p.present ? p.shows : "Not in this database — re-run pnpm seed."}
              </span>
              <span className="sy-mono sy-persona__id">
                {busy === p.id ? "signing in…" : p.id}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
