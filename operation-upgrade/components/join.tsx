"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { COMPANY } from "@/lib/content/cast";
import { loadIdentity, makeSecret, saveIdentity } from "@/lib/store";
import { Button } from "@/components/ui";

export function JoinScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState<string | null>(null);

  useEffect(() => {
    const id = loadIdentity();
    if (id) setReturning(id.handle);
  }, []);

  async function join() {
    setBusy(true);
    setError("");
    const secret = loadIdentity()?.secret ?? makeSecret();
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), handle: handle.trim(), secret }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That did not work. Try again.");
      saveIdentity({ handle: handle.trim(), secret, seat: body.seat, sectionCode: body.sectionCode });
      router.push("/play");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That did not work. Try again.");
      setBusy(false);
    }
  }

  const ready = code.trim().length > 1 && handle.trim().length > 1;

  return (
    <main style={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", alignContent: "center", justifyItems: "center", padding: "clamp(24px, 6vw, 72px)" }}>
      <div style={{ width: "100%", maxWidth: 520 }} className="rise">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "var(--gold)", display: "grid", placeItems: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--deep)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
              <path d="M6 11a6 6 0 0 1 12 0" />
              <path d="M12 5V3" />
            </svg>
          </div>
          <div>
            <div className="display" style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>{COMPANY.name}</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-4)" }}>{COMPANY.outlets} outlets · {COMPANY.cities} cities · {COMPANY.people} people</div>
          </div>
        </div>

        <h1 className="serif" style={{ fontSize: "clamp(38px, 7vw, 56px)", lineHeight: 1.02, letterSpacing: "-.015em", marginBottom: 14 }}>
          Ninety days to change<br />how a company works.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-3)", marginBottom: 32 }}>
          You are about to be hired by a woman who has built something real and can feel it getting slower. Type the code on the wall and the name you want the room to know you by.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 7 }}>The code on the wall</span>
            <input
              className="field"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="bharat-d"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: ".02em" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", display: "block", marginBottom: 7 }}>What the room should call you</span>
            <input
              className="field"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && ready && !busy) void join(); }}
              placeholder="Ananya R"
              maxLength={28}
              style={{ fontSize: 17 }}
            />
            <span style={{ fontSize: 12.5, color: "var(--ink-5)", marginTop: 7, display: "block" }}>
              This appears on the wall next to your plan. A first name and an initial is plenty — please do not use your email.
            </span>
          </label>

          {error && (
            <p role="alert" style={{ background: "var(--alert-soft)", color: "var(--alert-ink)", borderRadius: "var(--r-md)", padding: "12px 14px", fontSize: 14.5 }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 6 }}>
            <Button onClick={() => void join()} disabled={!ready || busy} wide>
              {busy ? "Letting you in…" : returning ? `Carry on as ${returning}` : "Start the ninety days"}
            </Button>
          </div>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-5)", marginTop: 28 }}>
          Bharat Bites is invented for this session. Every person, policy, number and failure in it was written for teaching, and none of it describes a real company. Your work is kept on this laptop and backed up to the classroom server so you do not lose it.
        </p>
      </div>
    </main>
  );
}
