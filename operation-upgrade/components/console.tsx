"use client";

import { useCallback, useEffect, useState } from "react";
import { PHASES, PHASE, nextPhase, needsTheRoom, type PhaseId } from "@/lib/phases";
import type { RoomView } from "@/lib/engine/room";
import { Button, Card, Eyebrow, Pill } from "@/components/ui";

type State = {
  section: string; phase: PhaseId; pacing: "guided" | "open";
  spread: Record<string, number>;
  phaseEndsAt: string | null; view: RoomView;
  roster: { handle: string; seat: number; locked: boolean; pitching: boolean; stage: string; headline: string }[];
};

const KEY_STORE = "bharatbites:facilitator";

export function Console() {
  const [key, setKey] = useState("");
  const [section, setSection] = useState("A");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY_STORE);
    if (saved) setKey(saved);
  }, []);

  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      const res = await fetch(`/api/instructor/state?key=${encodeURIComponent(key)}&section=${section}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Could not load the room."); return; }
      setState(body);
      setError("");
      window.localStorage.setItem(KEY_STORE, key);
    } catch {
      setError("Lost the connection to the room.");
    }
  }, [key, section]);

  useEffect(() => {
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => { await refresh(); if (!cancelled) t = setTimeout(loop, 2500); };
    t = setTimeout(loop, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [refresh]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch("/api/instructor/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, section, action, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "That did not work.");
      else await refresh();
    } finally { setBusy(false); }
  }

  if (!state) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 32 }}>
        <Card style={{ maxWidth: 420, width: "100%" }}>
          <Eyebrow>Facilitator</Eyebrow>
          <h1 className="display" style={{ fontSize: 24, fontWeight: 700, margin: "10px 0 6px" }}>Open the console</h1>
          <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 16 }}>The key is in the environment, not on the wall.</p>
          <input className="field" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Facilitator key" />
          <div style={{ marginTop: 12 }}><Button wide onClick={() => void refresh()}>Open</Button></div>
          {error && <p style={{ marginTop: 12, fontSize: 14, color: "var(--alert)" }}>{error}</p>}
        </Card>
      </main>
    );
  }

  const here = PHASE.get(state.phase)!;
  const upcoming = nextPhase(state.phase);
  const up = upcoming ? PHASE.get(upcoming) : null;
  const v = state.view;

  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      <header style={{ background: "var(--deep)", color: "var(--on-deep)", padding: "14px clamp(16px, 3vw, 28px)", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <span className="display" style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Facilitator console</span>
        <div style={{ display: "flex", gap: 4 }}>
          {["A", "B", "C", "D", "E", "F", "G", "H"].map((s) => (
            <button key={s} onClick={() => setSection(s)} style={{
              width: 30, height: 30, borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: s === section ? "var(--gold)" : "var(--deep-2)", color: s === section ? "var(--deep)" : "var(--on-deep-3)",
            }}>{s}</button>
          ))}
        </div>
        <a href={`/wall?key=${encodeURIComponent(key)}&section=${section}`} target="_blank" rel="noopener noreferrer"
           style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--on-deep-2)" }}>Open the wall display ↗</a>
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px clamp(16px, 3vw, 28px) 60px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flexGrow: 1, minWidth: 260 }}>
                <Eyebrow>Now running · stage {here.n} of 13</Eyebrow>
                <h1 className="display" style={{ fontSize: 26, fontWeight: 700, margin: "8px 0 8px", letterSpacing: "-.015em" }}>{here.title}</h1>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-3)" }}>{here.facilitator}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 250 }}>
                <Button wide disabled={busy || !up} onClick={() => void act("advance")}>
                  {!up ? "The session is finished"
                    : state.pacing === "open" ? `Call the room to ${up.short}`
                    : needsTheRoom(up.id) ? `Bring everyone to ${up.short}`
                    : `Open ${up.short} to the room`}
                </Button>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button tone="quiet" onClick={() => void act("back")}>Back</Button>
                  <Button tone="quiet" onClick={() => void act("timer", { minutes: here.minutes })}>{here.minutes} min clock</Button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 250 }}>
                <Eyebrow>How the room moves</Eyebrow>
                <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                  {(["guided", "open"] as const).map((mode) => (
                    <button key={mode} onClick={() => void act("pacing", { pacing: mode })} className="lift" style={{
                      flexGrow: 1, borderRadius: "var(--r-md)", padding: "11px 14px", textAlign: "left", minHeight: 62,
                      background: state.pacing === mode ? "var(--ink)" : "var(--paper-sunk)",
                      color: state.pacing === mode ? "var(--paper)" : "var(--ink-3)",
                    }}>
                      <span className="display" style={{ fontSize: 14.5, fontWeight: 700, display: "block" }}>
                        {mode === "guided" ? "You set a ceiling" : "Fully self-paced"}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: 1.4, opacity: .78, display: "block", marginTop: 3 }}>
                        {mode === "guided" ? "They move freely up to where you are" : "They run the whole thing at their own speed"}
                      </span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-4)", marginTop: 9 }}>
                  Either way the pitches, the ballot and the close still pull everyone together — those are the only four that need it.
                </p>
              </div>

              <div style={{ flexGrow: 1, minWidth: 280 }}>
                <Eyebrow tone="var(--ink-4)">Where the room actually is</Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 9 }}>
                  {PHASES.filter((p) => p.n >= 1 && p.n <= 9).map((p) => {
                    const n = state.spread[p.id] ?? 0;
                    const pct = v.joined ? (n / v.joined) * 100 : 0;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12.5, color: n > 0 ? "var(--ink-2)" : "var(--ink-5)", width: 96, flexShrink: 0 }}>{p.short}</span>
                        <div style={{ flexGrow: 1, height: 16, background: "var(--paper-sunk)", borderRadius: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: p.id === state.phase ? "var(--human)" : "var(--ink-5)", borderRadius: 5 }} />
                        </div>
                        <span className="num" style={{ fontSize: 12.5, width: 26, textAlign: "right", color: n > 0 ? "var(--ink-2)" : "var(--ink-5)", flexShrink: 0 }}>{n}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-4)", marginTop: 9 }}>
                  {v.joined === 0
                    ? "Nobody has joined yet."
                    : `Call the room together when the tail has caught up — not when the front runners are bored.`}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 3, marginTop: 18, overflowX: "auto" }} className="scroll">
              {PHASES.slice(1, 14).map((p) => (
                <button key={p.id} onClick={() => void act("goto", { phase: p.id })} style={{
                  flexGrow: 1, minWidth: 62, padding: "8px 4px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                  background: p.id === state.phase ? "var(--human)" : "var(--paper-sunk)",
                  color: p.id === state.phase ? "#fff6ec" : "var(--ink-4)",
                }}>{p.short}</button>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="display" style={{ fontSize: 16, fontWeight: 700 }}>The room</h2>
              <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{v.locked} of {v.joined} locked · {v.pitches.length} on the ballot</span>
            </div>
            <div className="scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
              {state.roster.map((p) => (
                <div key={p.handle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.handle}</span>
                  {p.locked
                    ? <Pill fg="var(--flow-ink)" bg="var(--flow-soft)">Locked</Pill>
                    : <Pill fg="var(--ink-4)" bg="var(--paper-sunk)">{PHASE.get(p.stage as PhaseId)?.short ?? "Working"}</Pill>}
                  <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.headline || "—"}</span>
                  <button onClick={() => void act(p.pitching ? "unpitch" : "pitch", { handle: p.handle })} style={{
                    fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, flexShrink: 0, minHeight: 34,
                    background: p.pitching ? "var(--human)" : "var(--paper-sunk)", color: p.pitching ? "#fff6ec" : "var(--ink-3)",
                  }}>{p.pitching ? "On the ballot" : "Add to ballot"}</button>
                  {p.locked && <button onClick={() => void act("unlock", { handle: p.handle })} style={{ fontSize: 12, color: "var(--ink-4)", flexShrink: 0 }}>Unlock</button>}
                </div>
              ))}
              {state.roster.length === 0 && <p style={{ padding: 24, fontSize: 14.5, color: "var(--ink-4)" }}>Nobody has joined yet. The code is on the wall.</p>}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Stat label="In the room" a={v.joined} b={null} />
          <Stat label="Plans locked" a={v.locked} b={v.joined} />
          <Stat label="Changes with a named person" a={v.gates.named} b={v.gates.named + v.gates.unnamed} tone={v.gates.unnamed > 0 ? "var(--alert)" : "var(--flow)"} />
          <Stat label="Brains that leaked something" a={v.brain.leaked} b={v.brain.tested} tone={v.brain.leaked > 0 ? "var(--alert)" : "var(--flow)"} />
          {v.gates.onOnePerson && (
            <Card style={{ background: "var(--gold-soft)", boxShadow: "none" }}>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--gold-ink)" }}>
                <strong>{v.gates.onOnePerson.name}</strong> has been named on {v.gates.onOnePerson.count} systems across this section. That is your debrief line.
              </p>
            </Card>
          )}
          <Button tone="quiet" wide onClick={() => { if (window.confirm(`Wipe section ${section} and start again? Everything students have written is deleted.`)) void act("reset"); }}>
            Reset section {section}
          </Button>
          {error && <p style={{ fontSize: 13.5, color: "var(--alert)" }}>{error}</p>}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, a, b, tone }: { label: string; a: number; b: number | null; tone?: string }) {
  return (
    <Card style={{ padding: "14px 18px", boxShadow: "var(--lift-1)" }}>
      <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="display num" style={{ fontSize: 26, fontWeight: 700, color: tone ?? "var(--ink)", letterSpacing: "-.02em" }}>{a}</span>
        {b !== null && <span style={{ fontSize: 13, color: "var(--ink-4)" }}>of {b}</span>}
      </div>
    </Card>
  );
}
