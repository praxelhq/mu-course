"use client";

import { useCallback, useEffect, useState } from "react";
import type { Identity } from "@/lib/store";
import type { PhaseId } from "@/lib/phases";
import { Card, Eyebrow, TONE } from "@/components/ui";
import { Briefing, Page } from "./shell";

type Candidate = { handle: string; headline: string; shape: { hire: number; build: number; redesign: number } };

export function Ballot({ identity, phase }: { identity: Identity; phase: PhaseId }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/ballot?section=${identity.sectionCode}&handle=${encodeURIComponent(identity.handle)}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) { setCandidates(body.candidates ?? []); setVotedFor(body.votedFor ?? null); setOpen(Boolean(body.open)); }
    } catch { /* the ballot simply holds its last state */ }
  }, [identity]);

  useEffect(() => {
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => { await refresh(); if (!cancelled) t = setTimeout(loop, 3000); };
    t = setTimeout(loop, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [refresh]);

  async function cast(target: string) {
    setError("");
    const previous = votedFor;
    setVotedFor(target);
    try {
      const res = await fetch("/api/vote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionCode: identity.sectionCode, handle: identity.handle, secret: identity.secret, votedFor: target }),
      });
      const body = await res.json();
      if (!res.ok) { setVotedFor(previous); setError(body.error ?? "That vote did not land. Try again."); }
    } catch {
      setVotedFor(previous);
      setError("That vote did not land. Try again.");
    }
  }

  const voting = phase === "vote" && open;

  return (
    <>
      <Briefing speakerId="cutesh">
        {voting
          ? "“One vote each. Not the cleverest plan — the one you would actually put the company's money behind on Monday morning. You cannot fund your own.”"
          : "“Four of you are taking the floor. Seventy-five seconds each. Listen for the one you would fund, because I am going to ask you in a minute.”"}
      </Briefing>

      <Page>
        <Eyebrow>{voting ? "The ballot is open" : "Listen first"}</Eyebrow>
        <h1 className="serif" style={{ fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, letterSpacing: "-.015em", margin: "10px 0 8px" }}>
          {voting ? "Which plan would you actually fund?" : "Four plans, seventy-five seconds each."}
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: 620, marginBottom: 22 }}>
          {voting
            ? "Pick one. You can change your mind while the ballot is open, and the running count is on the wall, not here."
            : "The colours under each one show what they reached for: people, systems, or changes to the way the work happens."}
        </p>

        {candidates.length === 0 && (
          <Card><p style={{ fontSize: 15, color: "var(--ink-4)" }}>Nobody is on the ballot yet. Look up.</p></Card>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {candidates.map((c) => {
            const mine = c.handle === identity.handle;
            const chosen = votedFor === c.handle;
            const total = Math.max(1, c.shape.hire + c.shape.build + c.shape.redesign);
            return (
              <Card
                key={c.handle}
                className={voting && !mine ? "lift" : ""}
                onClick={voting && !mine ? () => void cast(c.handle) : undefined}
                style={{
                  cursor: voting && !mine ? "pointer" : "default",
                  border: `2px solid ${chosen ? "var(--human)" : "transparent"}`,
                  opacity: mine ? 0.72 : 1,
                }}
              >
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, flexWrap: "wrap" }}>
                      <span className="display" style={{ fontSize: 17, fontWeight: 700 }}>{c.handle}</span>
                      {mine && <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>your plan — you cannot fund yourself</span>}
                      {chosen && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--human)" }}>You funded this</span>}
                    </div>
                    <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-2)" }}>{c.headline || "—"}</p>
                    <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", marginTop: 12, maxWidth: 240, background: "var(--paper-sunk)" }}>
                      {(["hire", "build", "redesign"] as const).map((k) => (
                        <div key={k} style={{ width: `${(c.shape[k] / total) * 100}%`, background: TONE[k].fg }} />
                      ))}
                    </div>
                  </div>
                  {voting && !mine && (
                    <div style={{
                      flexShrink: 0, borderRadius: "var(--r-md)", padding: "11px 18px", minHeight: 44,
                      display: "grid", placeItems: "center", fontSize: 14.5, fontWeight: 700,
                      background: chosen ? "var(--human)" : "var(--paper-sunk)", color: chosen ? "#fff6ec" : "var(--ink-3)",
                    }}>
                      {chosen ? "Funded" : "Fund this"}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {error && <p role="alert" style={{ marginTop: 14, fontSize: 14.5, color: "var(--alert)" }}>{error}</p>}
      </Page>
    </>
  );
}
