"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PHASE, type PhaseId } from "@/lib/phases";
import type { RoomView } from "@/lib/engine/room";

type State = { section: string; phase: PhaseId; phaseEndsAt: string | null; serverNow: string; view: RoomView };

/// Read from fifteen metres, at the back of a lecture hall, in half light.
export function Wall() {
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const section = (params.get("section") ?? "A").toUpperCase();
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/instructor/state?key=${encodeURIComponent(key)}&section=${section}`, { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch { /* the wall simply holds its last frame */ }
  }, [key, section]);

  useEffect(() => {
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => { await refresh(); if (!cancelled) t = setTimeout(loop, 2000); };
    t = setTimeout(loop, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (!state) {
    return <Frame section={section} title="Waiting for the room" clock={null}><div /></Frame>;
  }

  const v = state.view;
  const remaining = state.phaseEndsAt ? Math.max(0, Math.round((new Date(state.phaseEndsAt).getTime() - now) / 1000)) : null;
  const clock = remaining === null ? null : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const phase = PHASE.get(state.phase)!;

  return (
    <Frame section={section} title={phase.title} clock={clock}>
      {state.phase === "arrival" || state.phase === "offer" ? (
        <Join section={section} joined={v.joined} />
      ) : state.phase === "fault" ? (
        <Verdicts v={v} />
      ) : state.phase === "vote" || state.phase === "pitch" ? (
        <Ballot v={v} />
      ) : (
        <Mix v={v} />
      )}
    </Frame>
  );
}

function Frame({ section, title, clock, children }: { section: string; title: string; clock: string | null; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--deep)", color: "var(--on-deep)", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 28, padding: "26px 44px", borderBottom: "1px solid var(--deep-3)" }}>
        <span className="display" style={{ fontSize: 22, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>Bharat Bites</span>
        <span style={{ fontSize: 20, color: "var(--on-deep-3)" }}>Section {section}</span>
        <span className="display" style={{ fontSize: 26, fontWeight: 600, marginLeft: "auto" }}>{title}</span>
        {clock && <span className="display num" style={{ fontSize: 54, fontWeight: 700, letterSpacing: "-.03em", color: "var(--gold)", lineHeight: 1 }}>{clock}</span>}
      </header>
      <div style={{ flexGrow: 1, minHeight: 0, padding: "36px 44px" }}>{children}</div>
    </main>
  );
}

function Join({ section, joined }: { section: string; joined: number }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <p style={{ fontSize: 26, color: "var(--on-deep-3)", marginBottom: 20 }}>Open the link and type this word</p>
        <p className="display" style={{ fontSize: "clamp(70px, 13vw, 160px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: "var(--gold)" }}>
          bharat-{section.toLowerCase()}
        </p>
        <p style={{ fontSize: 30, color: "var(--on-deep-2)", marginTop: 28 }}>{joined} in the room</p>
      </div>
    </div>
  );
}

function Verdicts({ v }: { v: RoomView }) {
  const items = [
    { k: "continue", label: "Keep it running", n: v.rulings.continue, tone: "var(--on-deep-3)" },
    { k: "pause", label: "Pause and repair", n: v.rulings.pause, tone: "var(--gold)" },
    { k: "stop", label: "Shut it down", n: v.rulings.stop, tone: "var(--on-deep-3)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 34 }}>
      <p className="serif" style={{ fontSize: "clamp(34px, 4.4vw, 56px)", lineHeight: 1.05, color: "var(--on-deep)" }}>
        Same failure, different rooms. Run it, hold it, or kill it?
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, flexGrow: 1 }}>
        {items.map((i) => (
          <div key={i.k} style={{ background: "var(--deep-2)", borderRadius: 20, padding: 34, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <span className="display num" style={{ fontSize: "clamp(64px, 9vw, 132px)", fontWeight: 800, lineHeight: .82, letterSpacing: "-.05em", color: i.tone }}>{i.n}</span>
            <span style={{ fontSize: 24, color: "var(--on-deep-2)", marginTop: 18 }}>{i.label}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 24, color: "var(--on-deep-3)" }}>
        {v.brain.leaked > 0
          ? `${v.brain.leaked} of you built a company brain that would tell a store manager what a colleague earns.`
          : "Nobody in this room taught their brain something it should never repeat."}
      </p>
    </div>
  );
}

function Ballot({ v }: { v: RoomView }) {
  const top = Math.max(1, ...v.pitches.map((p) => p.votes));
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 26 }}>
      <p className="serif" style={{ fontSize: "clamp(32px, 4vw, 50px)", lineHeight: 1.05 }}>Which plan would you actually fund?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1 }}>
        {v.pitches.map((p) => (
          <div key={p.handle} style={{ display: "grid", gridTemplateColumns: "260px 1fr 90px", gap: 22, alignItems: "center" }}>
            <span className="display" style={{ fontSize: 26, fontWeight: 700, color: "var(--gold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.handle}</span>
            <div style={{ height: 44, background: "var(--deep-2)", borderRadius: 10, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(p.votes / top) * 100}%`, background: "var(--on-deep)", borderRadius: 10 }} />
              <span style={{ position: "absolute", left: 16, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 17, color: p.votes / top > 0.3 ? "var(--deep)" : "var(--on-deep-2)", maxWidth: "92%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.headline}
              </span>
            </div>
            <span className="display num" style={{ fontSize: 38, fontWeight: 700, textAlign: "right" }}>{p.votes}</span>
          </div>
        ))}
        {v.pitches.length === 0 && <p style={{ fontSize: 26, color: "var(--on-deep-3)" }}>Nobody is on the ballot yet. Add four from the console.</p>}
      </div>
      <p style={{ fontSize: 22, color: "var(--on-deep-3)" }}>{v.votesCast} of {v.joined} have voted · nobody can fund their own</p>
    </div>
  );
}

function Mix({ v }: { v: RoomView }) {
  const total = Math.max(1, v.mix.hire + v.mix.build + v.mix.redesign);
  const bars = [
    { label: "Hired a person", n: v.mix.hire, c: "var(--human)" },
    { label: "Built a system", n: v.mix.build, c: "var(--ai)" },
    { label: "Changed how the work happens", n: v.mix.redesign, c: "var(--flow)" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 40, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <p className="serif" style={{ fontSize: "clamp(30px, 3.6vw, 46px)", lineHeight: 1.06 }}>What this room reached for.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {bars.map((b) => (
            <div key={b.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 22, color: "var(--on-deep-2)" }}>{b.label}</span>
                <span className="display num" style={{ fontSize: 26, fontWeight: 700 }}>{b.n}</span>
              </div>
              <div style={{ height: 26, background: "var(--deep-2)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(b.n / total) * 100}%`, background: b.c, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 21, lineHeight: 1.5, color: "var(--on-deep-3)", marginTop: "auto" }}>
          Median plan: ₹{v.spend.median}L a year. The room ranges from ₹{v.spend.min}L to ₹{v.spend.max}L.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Big n={v.gates.named} of={v.gates.named + v.gates.unnamed} label="changes with a named human behind them" tone={v.gates.unnamed > 0 ? "var(--gold)" : "var(--flow)"} />
        <Big n={v.brain.leaked} of={v.brain.tested} label="company brains that would repeat something private" tone={v.brain.leaked > 0 ? "var(--alert)" : "var(--flow)"} />
        <Big n={v.locked} of={v.joined} label="plans locked and signed" tone="var(--on-deep)" />
      </div>
    </div>
  );
}

function Big({ n, of, label, tone }: { n: number; of: number; label: string; tone: string }) {
  return (
    <div style={{ background: "var(--deep-2)", borderRadius: 20, padding: 26, flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span className="display num" style={{ fontSize: "clamp(48px, 6vw, 82px)", fontWeight: 800, lineHeight: .85, letterSpacing: "-.04em", color: tone }}>{n}</span>
        <span className="num" style={{ fontSize: 26, color: "var(--on-deep-3)" }}>of {of}</span>
      </div>
      <p style={{ fontSize: 20, lineHeight: 1.35, color: "var(--on-deep-2)", marginTop: 14 }}>{label}</p>
    </div>
  );
}
